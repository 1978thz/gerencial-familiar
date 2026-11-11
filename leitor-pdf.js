/* Leitura de extratos e faturas em PDF, tudo dentro do aparelho (pdf.js, sem enviar o arquivo a servidor nenhum).
   1) texto(bytes): transforma o PDF em linhas de texto, na ordem em que aparecem na página.
   2) ler(texto, nome): procura nessas linhas os lançamentos (data, descrição, valor).
   Funciona com PDFs gerados pelo banco (com texto). PDF escaneado ou foto não tem texto e não é lido. */
(() => {
const MARCA = "%GF-PDF%\n";
let carregando = null;
function carregarPdfjs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!carregando) carregando = new Promise((ok, falha) => {
    const s = document.createElement("script"); s.src = "vendor/pdf.min.js";
    s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = "vendor/pdf.worker.min.js"; ok(window.pdfjsLib); };
    s.onerror = () => { carregando = null; falha(new Error("não consegui carregar o leitor de PDF")); };
    document.head.appendChild(s);
  });
  return carregando;
}

// Junta os pedaços de texto que estão na mesma altura da página numa linha, da esquerda para a direita.
async function texto(bytes) {
  const lib = await carregarPdfjs();
  const doc = await lib.getDocument({data: new Uint8Array(bytes), isEvalSupported: false}).promise;
  const linhas = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const pg = await doc.getPage(p), c = await pg.getTextContent();
    const itens = c.items.filter(i => i.str && i.str.trim()).map(i => ({x: i.transform[4], y: i.transform[5], h: Math.abs(i.transform[3]) || 8, s: i.str}));
    itens.sort((a, b) => b.y - a.y || a.x - b.x);
    const grupos = [];
    for (const it of itens) {
      const g = grupos.find(g => Math.abs(g.y - it.y) <= Math.max(2, Math.min(g.h, it.h) * 0.45));
      if (g) g.itens.push(it); else grupos.push({y: it.y, h: it.h, itens: [it]});
    }
    grupos.sort((a, b) => b.y - a.y);
    for (const g of grupos) linhas.push(g.itens.sort((a, b) => a.x - b.x).map(i => i.s.trim()).join(" ").replace(/\s+/g, " "));
  }
  await doc.destroy();
  return MARCA + linhas.join("\n");
}

/* ---------- interpretação ---------- */
const MES = {jan: 1, fev: 2, mar: 3, abr: 4, mai: 5, jun: 6, jul: 7, ago: 8, set: 9, out: 10, nov: 11, dez: 12};
const sem = s => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const p2 = n => String(n).padStart(2, "0");
// Valor em reais: 1.234,56 com sinal antes (-, +, -R$) ou marca depois ((+), (-), C, D, -).
const VALOR = /(^|[\s(:])([-+−]\s*)?(R\$\s*)?([-−]\s*)?(\d{1,3}(?:\.\d{3})*,\d{2})(?!\d)(\s*(?:\((?:\+|-)\)|[CD](?![a-zà-ú])|-(?!\d)))?/gi;
// Data no começo da linha: 05/11/2026, 05-11-2026, 05/11/26, 05/11, 05 NOV 2026, 5 de novembro de 2026.
const DATA = [
  [/^(?:[a-zà-ú]+,\s*)?(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4}|\d{2})(?!\d)/i, m => [m[1], m[2], m[3].length === 2 ? "20" + m[3] : m[3]]],
  [/^(?:[a-zà-ú]+,\s*)?(\d{1,2})\s*(?:de\s+)?(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-zç]*\.?(?:\s*(?:de\s+)?(\d{4}))?/i, m => [m[1], MES[sem(m[2]).slice(0, 3)], m[3]]],
  [/^(\d{2})[\/.-](\d{2})(?![\/.-]?\d)/, m => [m[1], m[2], null]],
];
const IGNORAR = /\bsaldo\b|\btotal\b|limite|custo efetivo|\bcet\b|melhor dia|fechamento|pagamento m[ií]nimo|valor (?:total )?devido|valor liberado|simula[cç]|lan[cç]amentos futuros|parcelamento de fatura|%|^\s*1\s*\+|taxa de|cota[cç][aã]o/i;
const SECAO = /^(?:total de\s+)?(entradas|sa[ií]das|cr[eé]ditos|d[eé]bitos)\b/i;
const NEG = /enviad|pagamento|pagto|pgto|compra|d[eé]bito|tarifa|aplica[cç]|saque|\biof\b|juros|encargo|cobran|boleto|transf.*enviad|parcela|seguro|anuidade/i;
const POS = /recebid|dep[oó]sito|cr[eé]dito|resgate|rendimento|estorno|reembolso|sal[aá]rio|devolu|cashback/i;

function lerData(linha, anoRef) {
  for (const [re, f] of DATA) {
    const m = linha.match(re); if (!m) continue;
    const [d, mm, a] = f(m);
    if (!(+d >= 1 && +d <= 31 && +mm >= 1 && +mm <= 12)) continue;
    let ano = a ? +a : anoRef.ano;
    if (!a && anoRef.mes && +mm > anoRef.mes + 1) ano -= 1; // dd/mm sem ano: mês depois da referência é do ano anterior
    return {data: `${ano}-${p2(mm)}-${p2(d)}`, resto: linha.slice(m[0].length)};
  }
  return null;
}
const num = s => parseFloat(s.replace(/\./g, "").replace(",", "."));

function ler(txt, nome) {
  const linhas = txt.replace(MARCA, "").split("\n").map(l => l.trim()).filter(Boolean);
  const tudo = linhas.join("\n");
  // Data de referência (para datas sem ano) e vencimento, no caso de fatura de cartão.
  const todas = [...tudo.matchAll(/(\d{2})[\/-](\d{2})[\/-](\d{4})/g)].map(m => `${m[3]}-${m[2]}-${m[1]}`).filter(d => d >= "2000");
  const maior = todas.sort().pop() || new Date().toISOString().slice(0, 10);
  const vencM = tudo.match(/venc\w*(?:\s+em)?\s*:?\s*\n?\s*(\d{2})\/(\d{2})\/(\d{4})/i);
  const venc = vencM ? `${vencM[3]}-${vencM[2]}-${vencM[1]}` : null;
  const ref = {ano: +(venc || maior).slice(0, 4), mes: +(venc || maior).slice(5, 7)};
  const inicio = sem(linhas.slice(0, 30).join(" "));
  const fatura = !!venc && (/fatura/i.test(nome) || /fatura|cartao de credito/.test(inicio)) && !/extrato de conta|extrato conta/.test(inicio);
  const conta = nome.replace(/\.pdf$/i, "");
  const out = []; let atual = null, secao = 0, pend = [];
  for (const bruta of linhas) {
    let l = bruta;
    const sc = l.match(SECAO); if (sc) secao = /entrad|cr[eé]d/i.test(sc[1]) ? 1 : -1;
    const d = lerData(l, ref);
    if (d && /^\s*(?:a|at[eé]|-)\s+\d{1,2}\b/i.test(d.resto)) { pend = []; continue; } // cabeçalho de período (01 nov a 07 nov)
    if (d) { atual = d.data; l = d.resto.trim(); }
    if (IGNORAR.test(l) || sc) { pend = []; continue; }
    const vals = [...l.matchAll(VALOR)];
    if (!vals.length) { const t = limpar(l); if (t) { pend.push(t); if (pend.length > 3) pend.shift(); } continue; }
    if (fatura ? !d : !atual) { pend = []; continue; }
    const v = vals[0], abs = num(v[5]); if (!abs) { pend = []; continue; }
    let desc = limpar(l.slice(0, v.index) + " " + l.slice(v.index + v[0].length).replace(VALOR, " "));
    if (!desc || desc.split(" ").length < 2 || /^[a-zà-ú]/.test(desc)) desc = [...pend, desc].filter(Boolean).join(" ");
    pend = [];
    if (!desc) continue; // valor solto (saldo do cabeçalho) não é lançamento
    desc = desc.slice(0, 140);
    const antes = (v[2] || "") + (v[4] || ""), depois = (v[6] || "").trim().toUpperCase();
    let sinal = /[-−]/.test(antes) || depois === "(-)" || depois === "D" || depois === "-" ? -1 : /\+/.test(antes) || depois === "(+)" || depois === "C" ? 1 : 0;
    let data = atual;
    if (fatura) {
      if (/pagamento.*fatura|pagamento recebido|pagto.*fatura/i.test(desc)) continue; // pagar a fatura não é gasto novo
      if (!sinal) sinal = POS.test(desc) && !/compra/i.test(desc) ? 1 : -1;
      if (venc) { desc += ` (compra ${data.slice(8, 10)}/${data.slice(5, 7)})`; data = venc; }
    } else if (!sinal) sinal = POS.test(desc) && !NEG.test(desc) ? 1 : NEG.test(desc) ? -1 : secao || -1;
    out.push({data, desc, valor: Math.round(sinal * abs * 100) / 100, conta});
  }
  return out;
}
function limpar(s) {
  return s.replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ").replace(/\b\d{2,3}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b|\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, " ")
    .replace(/\b\d{4,}-\d\b/g, " ").replace(/^(?:\s*\d{3,}(?![\d-]))+/, " ").replace(/\b\d{8,}\b/g, " ").replace(/R\$/g, " ").replace(/\s+[-|]\s*$/, "")
    .replace(/^[\s\-|•·]+/, "").replace(/\s+/g, " ").trim();
}

window.GFPdf = {texto, ler, marca: MARCA, ehPdf: n => /\.pdf$/i.test(n), relatorio: n => /^relatorio_/i.test(n)};
})();
