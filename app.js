(() => {
const $ = s => document.querySelector(s);
const brl = v => (v < 0 ? "-" : "") + "R$ " + Math.abs(v).toLocaleString("pt-BR", {minimumFractionDigits: 2, maximumFractionDigits: 2});
const MESES = ["janeiro","fevereiro","março","abril","maio","junho","julho","agosto","setembro","outubro","novembro","dezembro"];
const mesNome = m => { const [a, n] = m.split("-"); return MESES[+n - 1][0].toUpperCase() + MESES[+n - 1].slice(1) + "/" + a; };
const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toast.h); toast.h = setTimeout(() => t.hidden = true, 4200); }

/* ---------- categorias ---------- */
const REGRAS = [
  ["Mercado", /mercad|supermerc|atacad|padaria|hortifr|açougue|acougue/i],
  ["Moradia", /alugu|condom|energia|enel|copel|cemig|sabesp|sanepar|água|agua|internet|vivo|claro|tim |gás|gas /i],
  ["Educação", /escola|col[eé]gio|faculd|curso|mensalidade|material escolar/i],
  ["Saúde", /farm|drog|unimed|hospital|cl[ií]nica|odonto|exame|plano de sa/i],
  ["Transporte", /posto|combust|uber|99app|estacion|ped[aá]gio|ipva|oficina/i],
  ["Dívidas e cartão", /fatura|empr[eé]st|financ|parcela|cons[oó]rcio|juros|iof/i],
  ["Lazer", /restaur|ifood|cinema|netflix|spotify|bar |lanch|viagem/i],
];
const PROLAB = /pr[oó][\s-]?labore|distribui[cç][aã]o de lucro|retirada de s[oó]cio|aporte de s[oó]cio/i;
const categoria = (desc, v) => PROLAB.test(desc) ? "Pró-labore e lucros" : v > 0 ? "Entrada" : (REGRAS.find(([, r]) => r.test(desc)) || ["Outros"])[0];

/* ---------- dados de exemplo (fictícios) ---------- */
function exemplo() {
  const base = [
    ["Salário Ana — Empresa Alfa", 7800], ["Comissões Bruno — Representação", 5200],
    ["Aluguel apartamento", -2350], ["Condomínio", -640], ["Energia elétrica", -312.4], ["Internet fibra", -119.9],
    ["Colégio Horizonte — mensalidade", -1890], ["Curso de inglês", -420],
    ["Supermercado Bom Preço", -1384.55], ["Atacadão compras do mês", -862.1], ["Padaria Central", -214.3],
    ["Farmácia Vida", -186.75], ["Plano de saúde", -1120], ["Posto Rota Sul combustível", -540],
    ["Fatura cartão Banco Azul", -3480.22], ["Parcela financiamento carro", -1450], ["Empréstimo pessoal parcela", -612.8],
    ["iFood", -268.4], ["Netflix", -55.9], ["Restaurante Sabor", -189],
  ];
  const meses = ["2026-09", "2026-10", "2026-11"], out = [];
  meses.forEach((m, i) => base.forEach(([d, v], j) => {
    const f = v > 0 ? 1 + (i - 1) * 0.04 : 1 + Math.sin(i * 3 + j) * 0.09;
    out.push({mes: m, data: `${m}-${String(3 + (j * 1.4 | 0)).padStart(2, "0")}`, desc: d, valor: Math.round(v * f * 100) / 100, conta: j % 3 ? "Banco Azul" : "Banco Verde", arquivo: "exemplo"});
  }));
  return out;
}

/* ---------- leitura de arquivos ---------- */
const MES_PT = {jan:1,fev:2,mar:3,abr:4,mai:5,jun:6,jul:7,ago:8,set:9,out:10,nov:11,dez:12};
function mesDaPasta(nome) {
  let m = nome.match(/(20\d\d)[-_ .]?(0[1-9]|1[0-2])\b/); if (m) return `${m[1]}-${m[2]}`;
  m = nome.match(/\b(0[1-9]|1[0-2])[-_ .](20\d\d)/); if (m) return `${m[2]}-${m[1]}`;
  m = nome.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").match(/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)[a-z]*[\s_\-]*(20\d\d)/);
  if (m) return `${m[2]}-${String(MES_PT[m[1]]).padStart(2, "0")}`;
  return null;
}
function numBR(s) {
  s = String(s).trim().replace(/[R$\s]/g, "");
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, "").replace(",", ".");
  return parseFloat(s);
}
function lerOFX(txt, mes, arq) {
  const out = [];
  for (const b of txt.split(/<STMTTRN>/i).slice(1)) {
    const tag = t => (b.match(new RegExp(`<${t}>([^<\\r\\n]+)`, "i")) || [])[1];
    const dt = tag("DTPOSTED"), v = numBR(tag("TRNAMT") || "");
    if (!dt || isNaN(v)) continue;
    out.push({mes, data: `${dt.slice(0,4)}-${dt.slice(4,6)}-${dt.slice(6,8)}`, desc: (tag("MEMO") || tag("NAME") || "Sem descrição").trim(), valor: v, conta: (txt.match(/<ORG>([^<\r\n]+)/i) || [, "OFX"])[1], arquivo: arq});
  }
  return out;
}
function lerCSV(txt, mes, arq) {
  const linhas = txt.split(/\r?\n/).filter(l => l.trim());
  if (!linhas.length) return [];
  const sep = (linhas[0].match(/;/g) || []).length >= (linhas[0].match(/,/g) || []).length ? ";" : ",";
  const cab = linhas[0].toLowerCase().split(sep);
  const iD = cab.findIndex(c => /data/.test(c)), iH = cab.findIndex(c => /descri|hist|lan[cç]/.test(c)), iV = cab.findIndex(c => /valor|quantia|montante/.test(c));
  if (iD < 0 || iV < 0) return [];
  return linhas.slice(1).map(l => l.split(sep)).map(c => {
    const d = (c[iD] || "").trim(), v = numBR(c[iV] || "");
    const m = d.match(/(\d{2})\/(\d{2})\/(\d{4})/), data = m ? `${m[3]}-${m[2]}-${m[1]}` : d.slice(0, 10);
    return {mes, data, desc: (c[iH] || "").replace(/"/g, "").trim() || "Sem descrição", valor: v, conta: arq.replace(/\.[^.]+$/, ""), arquivo: arq};
  }).filter(x => !isNaN(x.valor));
}

/* ---------- estado ---------- */
let usuario = null, lanc = exemplo(), raiz = null, pastasMes = {}, fonte = "exemplo", arquivosLista = [];

/* ---------- perfis: pessoa física + até 3 empresas no mesmo login ---------- */
// Cada perfil tem extratos, pasta, nuvem e análise próprios. "todos" é a visão consolidada.
// A pessoa física usa as chaves antigas (só o e-mail), então os dados que já existiam continuam nela.
let perfilAtual = "pf";
const MAX_PJ = 3;
const empresas = () => store.get("gf_empresas_" + usuario.email, []).filter(e => e && e.nome);
const perfis = () => [{id: "pf", nome: "Pessoa física", tipo: "PF"}, ...empresas().map(e => ({...e, tipo: "PJ"}))];
const perfilInfo = id => perfis().find(p => p.id === id) || {id, nome: "Consolidado", tipo: "todos"};
const escopo = (id = perfilAtual) => usuario.email + (id === "pf" ? "" : "#" + id);
const consolidado = () => perfilAtual === "todos";
const soDig = s => String(s || "").replace(/\D/g, "");
function cnpjValido(c) {
  c = soDig(c); if (c.length !== 14 || /^(\d)\1+$/.test(c)) return false;
  const dv = n => { let s = 0, p = n - 7; for (let i = 0; i < n; i++) { s += +c[i] * p--; if (p < 2) p = 9; } const r = s % 11; return r < 2 ? 0 : 11 - r; };
  return dv(12) === +c[12] && dv(13) === +c[13];
}
const cnpjFmt = c => soDig(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

/* ---------- login ---------- */
// Com Supabase configurado (config.js), o login é no servidor e o acesso depende de assinatura ativa.
// Sem configuração, roda em modo demonstração com cadastro local.
const CFG = window.GF_CONFIG || {};
const sb = CFG.supabaseUrl && CFG.supabaseAnonKey && window.supabase ? window.supabase.createClient(CFG.supabaseUrl, CFG.supabaseAnonKey) : null;
const DEMO = !sb;
async function hash(senha, sal) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(sal + ":" + senha));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
}
async function garantirDemo() {
  const us = store.get("gf_usuarios", {});
  if (!us["demo@gerencial.app"]) { const sal = "demo"; us["demo@gerencial.app"] = {nome: "Família Exemplo", sal, hash: await hash("demo1234", sal)}; store.set("gf_usuarios", us); }
  return us;
}
let modoCriar = false, modoNovaSenha = false;
const msg = (err, ok) => { $("#lg-err").textContent = err || ""; $("#lg-ok").textContent = ok || ""; };
$("#lg-alt").onclick = () => {
  modoCriar = !modoCriar;
  $("#lg-title").textContent = modoCriar ? "Criar acesso" : "Entrar";
  $("#lg-btn").textContent = modoCriar ? "Criar e entrar" : "Entrar";
  $("#lg-alt").textContent = modoCriar ? "Já tenho acesso" : "Criar acesso";
  $("#lg-nome-wrap").hidden = !modoCriar; msg();
};
$("#lg-esqueci").onclick = async () => {
  const email = $("#lg-email").value.trim().toLowerCase();
  if (!email) return msg("Digite seu e-mail acima e clique de novo.");
  if (DEMO) return msg("No modo demonstração não há recuperação de senha.");
  const {error} = await sb.auth.resetPasswordForEmail(email, {redirectTo: location.origin + location.pathname});
  error ? msg("Não consegui enviar: " + error.message) : msg("", "Enviamos um link para criar uma nova senha. Confira seu e-mail.");
};
$("#f-login").addEventListener("submit", async e => {
  e.preventDefault(); msg();
  if (modoNovaSenha) {
    const {error} = await sb.auth.updateUser({password: $("#lg-senha").value});
    return error ? msg(traduz(error.message)) : (msg("", "Senha alterada. Entrando..."), setTimeout(() => location.reload(), 1200));
  }
  const email = $("#lg-email").value.trim().toLowerCase(), senha = $("#lg-senha").value, nome = $("#lg-nome").value.trim() || "Minha família";
  if (senha.length < 6) return msg("A senha precisa de pelo menos 6 caracteres.");
  $("#lg-btn").disabled = true;
  try {
    if (DEMO) {
      const us = await garantirDemo();
      if (modoCriar) {
        if (us[email]) return msg("Este e-mail já tem acesso. Use Entrar.");
        const sal = crypto.getRandomValues(new Uint32Array(2)).join("-");
        us[email] = {nome, sal, hash: await hash(senha, sal)}; store.set("gf_usuarios", us);
      } else if (!us[email] || us[email].hash !== await hash(senha, us[email].sal)) return msg("E-mail ou senha não conferem.");
      try { sessionStorage.setItem("gf_sessao", email); } catch {}
      usuario = {email, nome: us[email].nome};
      return entrar();
    }
    if (modoCriar) {
      const {data, error} = await sb.auth.signUp({email, password: senha, options: {data: {nome}, emailRedirectTo: location.origin + location.pathname}});
      if (error) return msg(traduz(error.message));
      if (!data.session) return msg("", "Conta criada. Confirme pelo link que enviamos ao seu e-mail e depois entre.");
      return aposLogin(data.session);
    }
    const {data, error} = await sb.auth.signInWithPassword({email, password: senha});
    if (error) return msg(traduz(error.message));
    aposLogin(data.session);
  } finally { $("#lg-btn").disabled = false; }
});
function traduz(m) {
  if (/invalid login/i.test(m)) return "E-mail ou senha não conferem.";
  if (/not confirmed/i.test(m)) return "Confirme seu e-mail pelo link que enviamos antes de entrar.";
  if (/already registered/i.test(m)) return "Este e-mail já tem acesso. Use Entrar.";
  return m;
}
async function aposLogin(sessao) {
  const u = sessao.user;
  const {data: perfil} = await sb.from("perfis").select("nome").eq("id", u.id).maybeSingle();
  const {data: ass} = await sb.from("assinaturas").select("status, valido_ate").eq("user_id", u.id).maybeSingle();
  const {data: admin} = await sb.rpc("sou_admin");
  const hoje = new Date().toISOString().slice(0, 10);
  usuario = {email: u.email, nome: (perfil && perfil.nome) || (u.user_metadata && u.user_metadata.nome) || u.email, admin: admin === true};
  if (!usuario.admin && (!ass ||!["ativa", "teste"].includes(ass.status) || (ass.valido_ate && ass.valido_ate < hoje))) {
    $("#login").hidden = true; $("#app").hidden = true; $("#bloqueio").hidden = false; $("#bl-email").textContent = u.email; return;
  }
  entrar();
}
async function sair() {
  if (DEMO) { try { sessionStorage.removeItem("gf_sessao"); } catch {} }
  else await sb.auth.signOut();
  location.reload();
}
$("#sair").onclick = sair; $("#bl-sair").onclick = sair;

function entrar() {
  $("#login").hidden = true; $("#bloqueio").hidden = true; $("#app").hidden = false;
  $("#demo-banner").hidden = !DEMO;
  $("#fam").textContent = usuario.nome;
  const salvo = store.get("gf_perfil_" + usuario.email, "pf");
  perfilAtual = salvo === "todos" || perfis().some(p => p.id === salvo) ? salvo : "pf";
  ajustarAparelho();
  (async () => {
    await abrirPerfil();
    await receberCompartilhados();
  })();
  $("#tab-admin").hidden = !usuario.admin;
  if (usuario.admin) carregarAdmin();
  // No primeiro acesso deste usuário neste navegador, abre direto o guia.
  if (!guiaGet().visto) { guiaMarcar("visto"); irPara("guia"); }
  // Atalhos do ícone instalado (segurar o ícone): ?ir=pasta ou ?ir=relatorio
  const ir = new URLSearchParams(location.search).get("ir");
  if (ir && document.getElementById("v-" + ir)) { irPara(ir); history.replaceState(null, "", location.pathname + location.search.replace(/[?&]ir=[^&]*/, "").replace(/^&/, "?")); }
  desenharGuia();
}

// Carrega o perfil escolhido (ou monta o consolidado) do zero.
function carregarCfg() {
  const cfg = consolidado() ? {} : store.get("gf_cfg_" + escopo(), {});
  $("#pasta-link").value = cfg.link || ""; $("#zap").value = cfg.zap || ""; $("#mail").value = cfg.mail || "";
  const r = document.querySelector(`input[name=nuvem][value=${cfg.nuvem || "drive"}]`); if (r) r.checked = true;
}
async function abrirPerfil() {
  lanc = exemplo(); fonte = "exemplo"; raiz = null; pastasMes = {}; arquivosLista = [];
  $("#pasta-nome").textContent = "Nenhuma pasta escolhida"; $("#limpar-imp").hidden = true; $("#reabrir").hidden = true;
  $("#arquivos").innerHTML = "";
  carregarCfg(); desenharPerfis();
  if (consolidado()) return montarConsolidado();
  atualizarTudo();
  const d = await dadosGuardados(); if (d && d.lanc && d.lanc.length) mostrarImportados(d);
  if (window.GFNuvem) await window.GFNuvem.iniciar();
  if (podePasta()) await restaurarPasta();
}
async function trocarPerfil(id) {
  if (id === perfilAtual) return;
  perfilAtual = id; store.set("gf_perfil_" + usuario.email, id);
  await abrirPerfil();
  toast(consolidado() ? "Visão consolidada: pessoa física e empresas juntas." : `Perfil: ${perfilInfo(id).nome}`);
}
function desenharPerfis() {
  const ps = perfis(), sel = $("#perfil");
  sel.innerHTML = ps.map(p => `<option value="${p.id}">${p.tipo === "PF" ? "Pessoa física" : "Empresa · " + esc(p.nome)}</option>`).join("")
    + (ps.length > 1 ? `<option value="todos">Consolidado (PF + empresas)</option>` : "");
  sel.value = perfilAtual;
  const p = perfilInfo(perfilAtual);
  $("#perfil-sub").textContent = p.tipo === "PJ" ? "CNPJ " + cnpjFmt(p.cnpj) : p.tipo === "PF" ? usuario.nome : `${ps.length - 1} empresa(s) + pessoa física`;
  document.body.classList.toggle("modo-todos", consolidado());
  $("#perfil-aviso").innerHTML = p.tipo === "PJ" ? `Extratos da empresa <b>${esc(p.nome)}</b> (CNPJ ${cnpjFmt(p.cnpj)}). Para outra conta, troque o perfil no topo.` : `Extratos da <b>pessoa física</b>. Para os extratos de uma empresa, troque o perfil no topo${empresas().length ? "" : " (cadastre em Minhas empresas)"}.`;
}
$("#perfil").onchange = e => trocarPerfil(e.target.value);

// Fotografia dos lançamentos de cada perfil, guardada no aparelho, para a visão consolidada.
const chaveSnap = id => "snap:" + escopo(id);
const guardarSnap = () => { if (!consolidado() && fonte !== "exemplo") idb("readwrite", st => st.put({lanc, em: Date.now()}, chaveSnap(perfilAtual))).catch(() => {}); };
// Pares PF x empresa com o mesmo valor (sinais opostos) em até 3 dias: pró-labore, retirada ou aporte.
// No consolidado eles não contam como entrada nem saída, para não somar o mesmo dinheiro duas vezes.
function marcarEntrePerfis(ls) {
  const dia = d => Date.parse(d) / 864e5, usados = new Set();
  const cand = ls.map((l, i) => ({l, i})).filter(x => x.l.valor < 0).sort((a, b) => a.l.data.localeCompare(b.l.data));
  for (const s of cand) {
    const e = ls.findIndex((l, j) => !usados.has(j) && l.valor > 0 && l.perfil !== s.l.perfil && (l.perfil === "pf" || s.l.perfil === "pf")
      && Math.abs(l.valor + s.l.valor) < 0.005 && Math.abs(dia(l.data) - dia(s.l.data)) <= 3);
    if (e < 0) continue;
    usados.add(e); usados.add(s.i); ls[e].entre = ls[s.i].entre = true;
  }
  return ls;
}
async function montarConsolidado() {
  const todos = [];
  for (const p of perfis()) {
    const s = await idb("readonly", st => st.get(chaveSnap(p.id))).catch(() => null);
    if (s && s.lanc) todos.push(...s.lanc.map(l => ({...l, perfil: p.id})));
  }
  lanc = marcarEntrePerfis(todos); fonte = "consolidado"; arquivosLista = [];
  $("#pasta-nome").textContent = "Visão consolidada";
  atualizarTudo();
  if (!todos.length) toast("Ainda não há extratos nos perfis. Escolha a pessoa física ou uma empresa e importe os extratos.");
}

/* ---------- empresas (até 3 CNPJs) ---------- */
function abrirEmpresas() {
  const es = store.get("gf_empresas_" + usuario.email, []);
  $("#emp-lista").innerHTML = Array.from({length: MAX_PJ}, (_, i) => {
    const e = es.find(x => x && x.id === "pj" + (i + 1)) || {};
    return `<fieldset class="emp" data-id="pj${i + 1}"><legend>Empresa ${i + 1}</legend>
      <label class="f">Nome<input class="emp-nome" maxlength="60" value="${esc(e.nome || "")}" placeholder="Razão social ou nome fantasia"></label>
      <label class="f">CNPJ<input class="emp-cnpj" inputmode="numeric" maxlength="18" value="${esc(e.cnpj ? cnpjFmt(e.cnpj) : "")}" placeholder="00.000.000/0000-00"></label></fieldset>`;
  }).join("");
  const d = $("#dlg-emp"); d.showModal ? d.showModal() : d.setAttribute("open", "");
}
const fecharEmpresas = () => { const d = $("#dlg-emp"); d.close ? d.close() : d.removeAttribute("open"); };
async function salvarEmpresas() {
  const antes = store.get("gf_empresas_" + usuario.email, []), novas = [];
  for (const f of document.querySelectorAll("#emp-lista .emp")) {
    const nome = f.querySelector(".emp-nome").value.trim(), cnpj = soDig(f.querySelector(".emp-cnpj").value);
    if (!nome && !cnpj) continue;
    if (!nome) return toast(`${f.querySelector("legend").textContent}: falta o nome.`);
    if (!cnpjValido(cnpj)) return toast(`${nome}: CNPJ inválido. Confira os 14 números.`);
    novas.push({id: f.dataset.id, nome, cnpj});
  }
  if (new Set(novas.map(e => e.cnpj)).size < novas.length) return toast("O mesmo CNPJ aparece duas vezes.");
  const saem = antes.filter(a => a && a.nome && !novas.some(n => n.id === a.id));
  if (saem.length && !confirm(`Remover ${saem.map(e => e.nome).join(", ")}? Os extratos desta empresa guardados neste aparelho serão apagados.`)) return;
  for (const e of saem) {
    const k = escopo(e.id);
    await idb("readwrite", st => { ["dados:", "snap:", "nuvem:"].forEach(p => st.delete(p + k)); st.delete(k); }).catch(() => {});
    try { localStorage.removeItem("gf_cfg_" + k); localStorage.removeItem("gf_nuvem_" + k); } catch {}
  }
  store.set("gf_empresas_" + usuario.email, novas);
  fecharEmpresas();
  if (saem.some(e => e.id === perfilAtual) || (consolidado() && !novas.length)) { perfilAtual = "pf"; store.set("gf_perfil_" + usuario.email, "pf"); await abrirPerfil(); }
  else if (consolidado()) await montarConsolidado(); else desenharPerfis();
  toast(novas.length ? `${novas.length} empresa(s) cadastrada(s). Escolha no seletor de perfil.` : "Nenhuma empresa cadastrada.");
}
$("#perfil-emp").onclick = abrirEmpresas;
$("#emp-salvar").onclick = salvarEmpresas;
$("#emp-fechar").onclick = fecharEmpresas;
$("#emp-lista").oninput = e => { if (e.target.classList.contains("emp-cnpj")) { const d = soDig(e.target.value).slice(0, 14); e.target.value = d.length === 14 ? cnpjFmt(d) : d; } };

/* ---------- administração ---------- */
// A tela só aparece para administradores, mas quem garante a permissão é o servidor:
// as funções admin_* recusam qualquer usuário que não esteja na tabela admins.
let admLista = [];
const dataBR = d => d ? new Date(d.length === 10 ? d + "T12:00:00" : d).toLocaleDateString("pt-BR") : "—";
const dataHoraBR = d => d ? new Date(d).toLocaleString("pt-BR", {dateStyle: "short", timeStyle: "short"}) : "nunca";
const hojeISO = () => new Date().toISOString().slice(0, 10);
function situacao(c) {
  if (!c.confirmado_em) return "pendente";
  if (!c.status) return "sem assinatura";
  if (["teste", "ativa"].includes(c.status) && c.valido_ate && c.valido_ate < hojeISO()) return "vencida";
  return c.status;
}
const ROTULO = {teste: "Em teste", ativa: "Ativa", suspensa: "Suspensa", cancelada: "Cancelada", vencida: "Vencida", pendente: "E-mail não confirmado", "sem assinatura": "Sem assinatura"};
async function carregarAdmin() {
  $("#adm-tab").innerHTML = `<tr><td class="muted">Carregando clientes...</td></tr>`;
  const {data, error} = await sb.rpc("admin_clientes");
  if (error) { $("#adm-tab").innerHTML = `<tr><td class="neg">Não consegui carregar: ${esc(error.message)}</td></tr>`; return; }
  admLista = data || [];
  desenharAdmin();
}
function desenharAdmin() {
  const sits = admLista.map(situacao), conta = s => sits.filter(x => x === s).length;
  $("#adm-kpis").innerHTML = [["Clientes", admLista.length], ["Em teste", conta("teste")], ["Ativas", conta("ativa")],
    ["Vencidas", conta("vencida")], ["Suspensas/canceladas", conta("suspensa") + conta("cancelada")], ["Sem confirmar e-mail", conta("pendente")]]
    .map(([l, v]) => `<div class="kpi"><div class="l">${l}</div><div class="v">${v}</div></div>`).join("");
  const q = $("#adm-busca").value.trim().toLowerCase(), f = $("#adm-filtro").value;
  const linhas = admLista.filter((c, i) => (!q || (c.email + " " + (c.nome || "")).toLowerCase().includes(q)) && (!f || sits[i] === f));
  if (!linhas.length) { $("#adm-tab").innerHTML = `<tr><td class="muted">Nenhum cliente encontrado.</td></tr>`; return; }
  $("#adm-tab").innerHTML = `<tr><th>Cliente</th><th>Cadastro</th><th>Último login</th><th>Situação</th><th>Status</th><th>Válido até</th><th></th></tr>` +
    linhas.map(c => {
      const s = situacao(c), alerta = ["vencida", "suspensa", "cancelada", "pendente", "sem assinatura"].includes(s);
      return `<tr data-id="${esc(c.user_id)}">
        <td><b>${esc(c.nome || "—")}</b>${c.admin ? ' <span class="tag">adm</span>' : ""}<div class="muted small">${esc(c.email)}</div></td>
        <td class="num small" data-l="Cadastro">${dataBR(c.criado_em)}</td>
        <td class="num small" data-l="Último login">${dataHoraBR(c.ultimo_login)}</td>
        <td><span class="tag${alerta ? " warn" : ""}">${ROTULO[s] || s}</span></td>
        <td data-l="Status"><select class="adm-status">${["teste", "ativa", "suspensa", "cancelada"].map(o => `<option value="${o}"${(c.status || "teste") === o ? " selected" : ""}>${ROTULO[o]}</option>`).join("")}</select></td>
        <td data-l="Válido até"><input class="adm-validade" type="date" value="${esc(c.valido_ate || "")}"></td>
        <td class="adm-acoes"><button class="pri adm-salvar">Salvar</button> <button class="adm-30">+30 dias</button></td>
      </tr>`;
    }).join("");
}
async function salvarAssinatura(id, status, validade, botao) {
  botao.disabled = true;
  const {error} = await sb.rpc("admin_atualizar_assinatura", {p_user: id, p_status: status, p_valido_ate: validade || null});
  botao.disabled = false;
  if (error) return toast("Não consegui salvar: " + error.message);
  toast("Assinatura atualizada.");
  carregarAdmin();
}
$("#adm-tab").onclick = e => {
  const tr = e.target.closest("tr[data-id]"); if (!tr) return;
  const id = tr.dataset.id;
  if (e.target.closest(".adm-salvar")) salvarAssinatura(id, tr.querySelector(".adm-status").value, tr.querySelector(".adm-validade").value, e.target);
  if (e.target.closest(".adm-30")) {
    const atual = tr.querySelector(".adm-validade").value, base = atual && atual > hojeISO() ? atual : hojeISO();
    const d = new Date(base + "T12:00:00"); d.setDate(d.getDate() + 30);
    salvarAssinatura(id, "ativa", d.toISOString().slice(0, 10), e.target);
  }
};
$("#adm-busca").oninput = desenharAdmin; $("#adm-filtro").onchange = desenharAdmin; $("#adm-atualizar").onclick = carregarAdmin;

/* ---------- abas ---------- */
function irPara(v) {
  document.querySelectorAll("#tabs button").forEach(x => x.classList.toggle("on", x.dataset.v === v));
  document.querySelectorAll("section.view").forEach(s => s.classList.toggle("on", s.id === "v-" + v));
  window.scrollTo({top: 0});
  if (v === "relatorio") requestAnimationFrame(encaixarRelatorio);
}
$("#tabs").onclick = e => { const b = e.target.closest("button"); if (b) irPara(b.dataset.v); };

/* ---------- como usar ---------- */
// Checklist dos primeiros passos: marca sozinho o que dá para detectar e guarda o resto por usuário neste navegador.
const guiaChave = () => "gf_guia_" + (usuario ? usuario.email : "");
const guiaGet = () => store.get(guiaChave(), {});
function guiaMarcar(k, v = true) { const g = guiaGet(); g[k] = v; store.set(guiaChave(), g); desenharGuia(); }
// Celular ou tablet (o iPad se apresenta como Mac, por isso o teste de toque).
const movel = () => /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const celular = movel;
const podePasta = () => !!window.showDirectoryPicker && !movel();
const android = () => /Android/i.test(navigator.userAgent);
const ios = () => /iPhone|iPad|iPod/i.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
const instalado = () => matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
// Instalar como app: Android/computador usam o convite do navegador; no iPhone/iPad o guia mostra o caminho.
let convite = null;
addEventListener("beforeinstallprompt", e => { e.preventDefault(); convite = e; if (!instalado()) $("#instalar").hidden = false; });
addEventListener("appinstalled", () => { $("#instalar").hidden = true; convite = null; toast("App instalado. Abra pelo ícone Gerencial."); desenharGuia(); });
$("#instalar").onclick = async () => {
  if (convite) { convite.prompt(); await convite.userChoice; convite = null; $("#instalar").hidden = true; return; }
  irPara("guia"); const p = document.querySelector('[data-p="instalar"]'); if (p) p.scrollIntoView({behavior: "smooth", block: "center"});
};
// O relatório é desenhado em tamanho A4; na tela pequena, a prévia é reduzida para caber (o arquivo sai inteiro).
function encaixarRelatorio() {
  const out = $(".rel-out"), rel = $("#rel"); if (!out || !rel) return;
  const w = out.clientWidth, s = Math.min(1, w / 760);
  out.classList.toggle("encaixe", s < 1);
  rel.style.transform = s < 1 ? `scale(${s})` : "";
  out.style.height = s < 1 ? rel.offsetHeight * s + "px" : "";
}
addEventListener("resize", encaixarRelatorio);
function ajustarAparelho() {
  if (ios() && !instalado()) $("#instalar").hidden = false;
  document.documentElement.classList.toggle("movel", movel());
  $("#pasta-movel").hidden = podePasta(); $("#pasta-acoes").hidden = !podePasta();
  $("#pasta-dica").hidden = !podePasta();
  $("#imp-android").hidden = !android();
  if (movel()) { $("#b-pdf").textContent = "Salvar PDF"; $("#b-png").textContent = "Salvar imagem"; }
  // No computador a pasta vem primeiro; no celular e tablet, a importação.
  if (podePasta()) $("#v-pasta").prepend($("#pasta-panel"));
}
function desenharGuia() {
  if (!usuario) return;
  const m = movel(), lista = m ? $("#passos-movel") : $("#passos");
  $("#passos-movel").hidden = !m; $("#passos").hidden = m;
  const g = guiaGet(), temPasta = fonte === "pasta", temDados = fonte !== "exemplo", temMeses = Object.keys(pastasMes).length > 0 || arquivosLista.length > 0;
  const feito = {
    aparelho: podePasta(),
    nuvem: !!g.nuvem || temPasta,
    estrutura: !!g.estrutura || temMeses,
    pasta: temPasta,
    relatorio: !!g.relatorio,
    instalar: instalado(),
    importar: temDados,
    nuvemlig: !!(window.GFNuvem && window.GFNuvem.conectado()) || fonte === "importado",
    conferir: !!g.conferir,
  };
  const itens = [...lista.children];
  itens.forEach(li => li.classList.toggle("feito", !!feito[li.dataset.p]));
  lista.querySelectorAll("[data-manual]").forEach(c => { c.checked = !!feito[c.dataset.manual]; });
  const n = itens.filter(li => feito[li.dataset.p]).length;
  $("#guia-n").textContent = `${n}/${itens.length}`; $("#guia-bar").style.width = (n / itens.length * 100) + "%";
  $("#inst-ios").hidden = !ios(); $("#inst-android").hidden = ios(); $("#dica-compartilhar").hidden = !android();
  $("#guia-nav").textContent = podePasta()
    ? "Este navegador está pronto: lê e grava direto na pasta."
    : m
      ? "Você está no celular ou tablet: veja os passos acima."
      : "Este navegador só consegue ler a pasta e baixar o relatório. Para gravar direto na pasta, abra no Chrome ou no Edge.";
}
$("#passos").onchange = $("#passos-movel").onchange = e => { const c = e.target.closest("[data-manual]"); if (c) guiaMarcar(c.dataset.manual, c.checked); };
$("#v-guia").onclick = e => { const b = e.target.closest("[data-ir]"); if (b) irPara(b.dataset.ir); };

/* ---------- pasta ---------- */
function salvarCfg() { if (usuario && !consolidado()) store.set("gf_cfg_" + escopo(), {link: $("#pasta-link").value, nuvem: document.querySelector("input[name=nuvem]:checked").value, zap: $("#zap").value, mail: $("#mail").value}); }
$("#pasta-link").onchange = salvarCfg; $("#cloud").onchange = salvarCfg; $("#zap").onchange = salvarCfg; $("#mail").onchange = salvarCfg;

// A pasta escolhida fica lembrada neste navegador (IndexedDB), por usuário.
function idb(modo, fn) {
  return new Promise((ok, falha) => {
    let r; try { r = indexedDB.open("gerencial", 1); } catch (e) { return falha(e); }
    r.onupgradeneeded = () => r.result.createObjectStore("pastas");
    r.onerror = () => falha(r.error);
    r.onsuccess = () => { const tx = r.result.transaction("pastas", modo), q = fn(tx.objectStore("pastas")); tx.oncomplete = () => ok(q && q.result); tx.onerror = () => falha(tx.error); };
  });
}
const lembrarPasta = h => idb("readwrite", st => st.put(h, escopo())).catch(() => {});
const pastaLembrada = () => idb("readonly", st => st.get(escopo())).catch(() => null);
async function abrirHandle(h) {
  raiz = h; aplicarLeitura(await carregarDeHandle(h), h.name); $("#reabrir").hidden = true;
}
async function restaurarPasta() {
  const h = await pastaLembrada(); if (!h || !h.queryPermission) return;
  if ((await h.queryPermission({mode: "readwrite"})) === "granted") return abrirHandle(h);
  $("#reabrir").hidden = false; $("#reabrir").textContent = `Reabrir a pasta ${h.name}`;
  $("#reabrir").onclick = async () => { if ((await h.requestPermission({mode: "readwrite"})) === "granted") abrirHandle(h); };
}

async function carregarDeHandle(dir) {
  const novos = []; pastasMes = {}; arquivosLista = [];
  for await (const [nome, h] of dir.entries()) {
    if (h.kind !== "directory") continue;
    const mes = mesDaPasta(nome); if (!mes) continue;
    pastasMes[mes] = h;
    for await (const [fn, fh] of h.entries()) {
      if (fh.kind !== "file") continue;
      const ext = fn.split(".").pop().toLowerCase(); let n = 0;
      if (["ofx", "csv", "txt", "pdf"].includes(ext) && !relatorioTHZ(fn)) {
        const l = await lerArquivo(await fh.getFile(), mes);
        n = l.length; novos.push(...l);
      }
      arquivosLista.push({mes, nome: fn, n, ext});
    }
  }
  return novos;
}
async function carregarDeInput(files) {
  const novos = []; pastasMes = {}; arquivosLista = [];
  for (const f of files) {
    const partes = f.webkitRelativePath.split("/"); if (partes.length < 3) continue;
    const mes = mesDaPasta(partes[1]); if (!mes) continue;
    const ext = f.name.split(".").pop().toLowerCase(); let n = 0;
    if (["ofx", "csv", "txt", "pdf"].includes(ext) && !relatorioTHZ(f.name)) {
      const l = await lerArquivo(f, mes);
      n = l.length; novos.push(...l);
    }
    arquivosLista.push({mes, nome: f.name, n, ext});
  }
  return novos;
}
function aplicarLeitura(novos, nome) {
  if (!novos.length) { toast("Nenhum extrato OFX ou CSV encontrado nas subpastas de mês. Os dados de exemplo continuam na tela."); }
  else { lanc = novos; fonte = "pasta"; }
  $("#pasta-nome").textContent = nome;
  if (!$("#pasta-link").value) $("#pasta-link").value = nome;
  salvarCfg(); atualizarTudo();
  if (novos.length) toast(`${novos.length} lançamentos lidos de ${Object.keys(pastasMes).length || new Set(arquivosLista.map(a => a.mes)).size} mês(es).`);
}
$("#escolher").onclick = async () => {
  if (consolidado()) return toast("Escolha antes a pessoa física ou a empresa dona da pasta.");
  if (window.showDirectoryPicker) {
    try {
      const h = await window.showDirectoryPicker({mode: "readwrite"});
      await abrirHandle(h); lembrarPasta(h);
      return;
    } catch (e) { if (e.name === "AbortError") return; raiz = null; }
  }
  $("#pasta-input").click();
};
$("#pasta-input").onchange = async e => {
  const fs = [...e.target.files]; if (!fs.length) return;
  raiz = null;
  aplicarLeitura(await carregarDeInput(fs), fs[0].webkitRelativePath.split("/")[0] + " (só leitura)");
};
$("#exemplo").onclick = () => { lanc = exemplo(); fonte = "exemplo"; raiz = null; pastasMes = {}; arquivosLista = []; $("#pasta-nome").textContent = "Nenhuma pasta escolhida"; atualizarTudo(); };

/* ---------- importar arquivos (celular, tablet e computador) ---------- */
// Sem pasta: o usuário escolhe os arquivos. O mês vem da data de cada lançamento.
// Os dados ficam só neste aparelho (IndexedDB), por usuário, e voltam no próximo acesso.
const chaveDados = () => "dados:" + escopo();
const dadosGuardados = () => idb("readonly", st => st.get(chaveDados())).catch(() => null);
const guardarDados = d => idb("readwrite", st => st.put(d, chaveDados())).catch(() => {});
const apagarDados = () => idb("readwrite", st => st.delete(chaveDados())).catch(() => {});
const chaveLanc = l => [l.data, l.valor, l.desc.toLowerCase(), l.conta].join("|");
function lerArquivoTexto(txt, nome) {
  const ls = window.GFPdf && txt.startsWith(window.GFPdf.marca) ? window.GFPdf.ler(txt, nome).map(l => ({...l, arquivo: nome}))
    : /<STMTTRN>/i.test(txt) ? lerOFX(txt, null, nome) : lerCSV(txt, null, nome);
  return ls.filter(l => /^\d{4}-\d{2}-\d{2}$/.test(l.data)).map(l => ({...l, mes: l.data.slice(0, 7)}));
}
// Relatórios que o próprio sistema grava na pasta do mês não são extratos.
const relatorioTHZ = nome => /^relatorio_/i.test(nome);
// Lê um arquivo (OFX, CSV ou PDF). Na pasta de mês, o mês da pasta vale para os extratos de conta;
// a fatura de cartão em PDF entra no mês do vencimento.
async function lerArquivo(f, mesPasta) {
  const pdf = /\.pdf$/i.test(f.name);
  if (pdf && !window.GFPdf) return [];
  const txt = pdf ? await window.GFPdf.texto(await f.arrayBuffer()) : await f.text();
  return lerArquivoTexto(txt, f.name).map(l => ({...l, mes: mesPasta && !pdf ? mesPasta : l.mes}));
}
function mostrarImportados(d) {
  lanc = d.lanc; fonte = "importado"; raiz = null; pastasMes = {};
  arquivosLista = d.arquivos.map(a => ({mes: a.mes, nome: a.nome, n: a.n, ext: a.ext}));
  $("#pasta-nome").textContent = `Importados neste aparelho · ${d.arquivos.length} arquivo(s)`;
  $("#limpar-imp").hidden = false;
  atualizarTudo();
}
// Dados vindos da conexão direta com a nuvem (nuvem.js): lidos da pasta do cliente, guardados no aparelho.
function mostrarNuvem(d) {
  lanc = d.lanc; fonte = "nuvem"; raiz = null; pastasMes = {};
  arquivosLista = d.arquivos.map(a => ({mes: a.mes, nome: a.nome, n: a.n, ext: a.ext}));
  $("#pasta-nome").textContent = `${d.provNome} · ${d.pasta} · ${d.arquivos.length} arquivo(s)`;
  atualizarTudo();
}
// Junta os lançamentos de vários arquivos sem contar duas vezes cópias do mesmo extrato.
function montarLancamentos(arqs) {
  const lancs = [], arquivos = [], vistos = new Set();
  for (const a of arqs) {
    const ext = (a.nome.split(".").pop() || "").toLowerCase();
    let ls = [];
    if (["ofx", "csv", "txt", "pdf"].includes(ext) && a.texto != null && !relatorioTHZ(a.nome)) {
      try {
        ls = lerArquivoTexto(a.texto, a.nome).map(l => ({...l, mes: a.mes && ext !== "pdf" ? a.mes : l.mes}));
      } catch { ls = []; }
    }
    const daqui = new Set(), entram = [];
    for (const l of ls) { const k = chaveLanc(l); if (vistos.has(k)) continue; entram.push(l); daqui.add(k); }
    daqui.forEach(k => vistos.add(k)); lancs.push(...entram);
    const cont = {}; entram.forEach(l => cont[l.mes] = (cont[l.mes] || 0) + 1);
    const top = Object.entries(cont).sort((x, y) => y[1] - x[1])[0];
    arquivos.push({nome: a.nome, n: entram.length, ext, mes: a.mes || (top ? top[0] : null)});
  }
  return {lanc: lancs, arquivos: arquivos.filter(a => a.mes)};
}
window.GFApp = {
  usuario: () => usuario, escopo: () => escopo(), consolidado: () => consolidado(), toast, esc, store, irPara, mesDaPasta, montarLancamentos, mostrarNuvem,
  idb: (modo, fn) => idb(modo, fn), atualizarGuia: () => desenharGuia(), movel,
  voltarExemplo: () => $("#exemplo").click(),
};
async function importarArquivos(files) {
  if (!files.length) return;
  if (consolidado()) return toast("Na visão consolidada não dá para importar. Escolha antes a pessoa física ou a empresa dona do extrato.");
  const d = (await dadosGuardados()) || {lanc: [], arquivos: []};
  let novos = 0, repetidos = 0, ignorados = [];
  for (const f of files) {
    const ext = (f.name.split(".").pop() || "").toLowerCase();
    let ls = [];
    try { ls = await lerArquivo(f, null); } catch {}
    if (!ls.length) { ignorados.push(f.name); continue; }
    // Reimportar o mesmo arquivo substitui a versão anterior dele.
    d.lanc = d.lanc.filter(l => l.arquivo !== f.name); d.arquivos = d.arquivos.filter(a => a.nome !== f.name);
    // Lançamento idêntico vindo de outro arquivo (cópia do mesmo extrato) não entra de novo.
    const existentes = new Set(d.lanc.map(chaveLanc));
    const entram = ls.filter(l => !existentes.has(chaveLanc(l)));
    repetidos += ls.length - entram.length; novos += entram.length;
    d.lanc.push(...entram);
    const cont = {}; entram.forEach(l => cont[l.mes] = (cont[l.mes] || 0) + 1);
    const mes = Object.entries(cont).sort((a, b) => b[1] - a[1])[0];
    d.arquivos.push({nome: f.name, n: entram.length, ext, mes: mes ? mes[0] : ls[0].mes, em: new Date().toISOString()});
  }
  if (!novos && !repetidos) return toast(`Não encontrei lançamentos em ${ignorados.join(", ")}. Use extratos em OFX, CSV ou PDF do banco (PDF escaneado ou foto não tem texto para ler).`);
  await guardarDados(d); mostrarImportados(d);
  toast(`${novos} lançamento(s) importado(s)` + (repetidos ? `, ${repetidos} repetido(s) ignorado(s)` : "") + (ignorados.length ? `. Não li: ${ignorados.join(", ")}` : "."));
  irPara("painel");
}
$("#importar").onclick = () => $("#imp-input").click();
$("#imp-input").onchange = async e => { const fs = [...e.target.files]; e.target.value = ""; await importarArquivos(fs); };
$("#limpar-imp").onclick = async () => {
  if (!confirm("Apagar os extratos importados neste aparelho? Os arquivos originais na nuvem não são apagados.")) return;
  await apagarDados(); idb("readwrite", st => st.delete(chaveSnap(perfilAtual))).catch(() => {}); $("#limpar-imp").hidden = true; $("#exemplo").click(); toast("Dados importados apagados deste aparelho.");
};
// Arquivos recebidos pelo "Compartilhar" do Android ficam guardados pelo service worker até o app abrir.
async function receberCompartilhados() {
  if (!new URLSearchParams(location.search).has("compartilhado") || !("caches" in window)) return;
  history.replaceState(null, "", location.pathname);
  const c = await caches.open("gf-compartilhado"), reqs = await c.keys(), files = [];
  for (const r of reqs) { const resp = await c.match(r); files.push(new File([await resp.blob()], decodeURIComponent(resp.headers.get("x-nome") || "extrato.ofx"))); await c.delete(r); }
  if (files.length) await importarArquivos(files);
}

/* ---------- painel ---------- */
const mesesDisp = () => [...new Set(lanc.map(l => l.mes))].sort();
function resumo(m, perfil) {
  const ls = lanc.filter(l => l.mes === m && (!perfil || l.perfil === perfil));
  // No consolidado, o dinheiro que só passou da empresa para a pessoa física (ou o contrário) fica de fora.
  const conta = perfil ? ls : ls.filter(l => !l.entre);
  const ent = conta.filter(l => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const sai = conta.filter(l => l.valor < 0).reduce((s, l) => s + l.valor, 0);
  const entre = ls.filter(l => l.entre && l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const cats = {};
  conta.filter(l => l.valor < 0).forEach(l => { const c = categoria(l.desc, l.valor); cats[c] = (cats[c] || 0) - l.valor; });
  return {ls, ent, sai, saldo: ent + sai, entre, cats: Object.entries(cats).sort((a, b) => b[1] - a[1])};
}
// Tabela por perfil do mês (só na visão consolidada).
function tabelaPerfis(m) {
  const linhas = perfis().map(p => ({p, r: resumo(m, p.id)})).filter(x => x.r.ls.length);
  const t = resumo(m);
  return `<tr><th>Perfil</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Saldo</th></tr>` +
    linhas.map(({p, r}) => `<tr><td>${p.tipo === "PF" ? "Pessoa física" : esc(p.nome)}</td><td class="r num">${brl(r.ent)}</td><td class="r num">${brl(r.sai)}</td><td class="r num ${r.saldo < 0 ? "neg" : "pos"}">${brl(r.saldo)}</td></tr>`).join("") +
    (t.entre ? `<tr><td class="muted">Entre você e as empresas (pró-labore, retiradas, aportes)</td><td class="r num muted" colspan="3">${brl(t.entre)} · fora do total</td></tr>` : "") +
    `<tr class="tot"><td><b>Consolidado</b></td><td class="r num"><b>${brl(t.ent)}</b></td><td class="r num"><b>${brl(t.sai)}</b></td><td class="r num ${t.saldo < 0 ? "neg" : "pos"}"><b>${brl(t.saldo)}</b></td></tr>`;
}
const contaTxt = l => (consolidado() && l.perfil ? (l.perfil === "pf" ? "PF" : perfilInfo(l.perfil).nome) + " · " : "") + l.conta;
function preencherMeses() {
  const ms = mesesDisp(), opts = ms.map(m => `<option value="${m}">${mesNome(m)}</option>`).join("");
  for (const id of ["#mes", "#mes-rel"]) { const s = $(id), v = s.value; s.innerHTML = opts; s.value = ms.includes(v) ? v : ms[ms.length - 1]; }
}
function desenharPainel() {
  const m = $("#mes").value;
  $("#p-perfis").hidden = !consolidado() || !m;
  if (!m) {
    $("#kpis").innerHTML = `<div class="kpi"><div class="l">Sem lançamentos</div><div class="v">—</div></div>`;
    ["#cats", "#evol", "#lanc"].forEach(id => $(id).innerHTML = ""); $("#tot-lanc").textContent = ""; return;
  }
  if (consolidado()) $("#t-perfis").innerHTML = tabelaPerfis(m);
  const r = resumo(m), q = $("#busca").value.trim().toLowerCase();
  $("#kpis").innerHTML = [
    ["Entradas", r.ent, "pos"], ["Saídas", r.sai, "neg"], ["Saldo do mês", r.saldo, r.saldo < 0 ? "neg" : "pos"],
    ["Maior gasto", r.cats[0] ? r.cats[0][1] : 0, "", r.cats[0] ? r.cats[0][0] : "—"],
  ].map(([l, v, c, n]) => `<div class="kpi"><div class="l">${l}${n ? " · " + esc(n) : ""}</div><div class="v ${c}">${brl(v)}</div></div>`).join("");
  const max = r.cats[0] ? r.cats[0][1] : 1;
  $("#cats").innerHTML = r.cats.map(([c, v]) => `<div class="bar"><span>${esc(c)}</span><div class="track"><div class="fill" style="width:${(v / max * 100).toFixed(1)}%"></div></div><span class="num" style="text-align:right">${brl(v)}</span></div>`).join("") || `<span class="muted">Sem saídas neste mês.</span>`;
  $("#evol").innerHTML = `<tr><th>Mês</th><th class="r">Entradas</th><th class="r">Saídas</th><th class="r">Saldo</th></tr>` +
    mesesDisp().map(mm => { const x = resumo(mm); return `<tr><td>${mesNome(mm)}</td><td class="r num">${brl(x.ent)}</td><td class="r num">${brl(x.sai)}</td><td class="r num ${x.saldo < 0 ? "neg" : "pos"}">${brl(x.saldo)}</td></tr>`; }).join("");
  const ls = r.ls.filter(l => !q || (l.desc + " " + categoria(l.desc, l.valor) + " " + contaTxt(l)).toLowerCase().includes(q)).sort((a, b) => a.data.localeCompare(b.data));
  $("#tot-lanc").textContent = `${ls.length} lançamentos`;
  $("#lanc").innerHTML = `<tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Conta</th><th class="r">Valor</th></tr>` +
    ls.map(l => `<tr><td class="num">${l.data.split("-").reverse().join("/")}</td><td>${esc(l.desc)}</td><td><span class="tag${l.valor > 0 ? "" : " warn"}">${categoria(l.desc, l.valor)}</span>${l.entre ? ` <span class="tag">Entre perfis</span>` : ""}</td><td>${esc(contaTxt(l))}</td><td class="r num ${l.valor < 0 ? "neg" : "pos"}">${brl(l.valor)}</td></tr>`).join("");
}

/* ---------- arquivos ---------- */
function desenharArquivos() {
  if (fonte === "exemplo" && !arquivosLista.length) return;
  $("#arquivos").innerHTML = arquivosLista.sort((a, b) => (a.mes + a.nome).localeCompare(b.mes + b.nome)).map(a =>
    `<li><span><b>${mesNome(a.mes)}</b> · ${esc(a.nome)}</span><span class="muted">${a.n ? a.n + " lançamentos" : relatorioTHZ(a.nome) ? "relatório do sistema" : a.ext === "pdf" ? "PDF sem lançamentos reconhecidos (escaneado?)" : ["jpg","jpeg","png"].includes(a.ext) ? "foto: não é lida" : "ignorado"}</span></li>`).join("") || `<li><span class="muted">Nenhuma subpasta com nome de mês encontrada.</span></li>`;
}

/* ---------- relatório ---------- */
function desenharRelatorio() {
  const m = $("#mes-rel").value; if (!m) { $("#rel").innerHTML = `<p class="muted">Sem lançamentos para o relatório.</p>`; return; }
  const pi = perfilInfo(perfilAtual), titulo = pi.tipo === "PJ" ? `${esc(pi.nome)} <small style="font-weight:400;font-size:13px">CNPJ ${cnpjFmt(pi.cnpj)}</small>` : pi.tipo === "todos" ? `${esc(usuario.nome)} · consolidado PF + empresas` : esc(usuario.nome);
  const r = resumo(m), max = r.cats[0] ? r.cats[0][1] : 1, hoje = new Date().toLocaleDateString("pt-BR");
  const top = r.ls.filter(l => l.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, 8);
  $("#rel").innerHTML = `
    <div class="rh"><div style="display:flex;gap:12px;align-items:center"><img src="icons/thz-selo.png" alt="THZ" style="width:44px;height:44px;border-radius:50%"><div><div style="font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#006747;font-weight:600">Relatório mensal</div><h2>${titulo} · ${mesNome(m)}</h2></div></div>
      <div style="text-align:right;font-size:12px;color:#56665e">Gerado em ${hoje}<br>${fonte !== "exemplo" ? "Fonte: " + esc(fonte === "importado" ? "extratos importados" : fonte === "nuvem" ? $("#pasta-nome").textContent.split(" · ").slice(0, 2).join(" · ") : fonte === "consolidado" ? "extratos de todos os perfis" : $("#pasta-nome").textContent) : "Dados de exemplo"}</div></div>
    <div class="rk"><div><span>Entradas</span><b class="pos">${brl(r.ent)}</b></div><div><span>Saídas</span><b class="neg">${brl(r.sai)}</b></div><div><span>Saldo do mês</span><b class="${r.saldo < 0 ? "neg" : "pos"}">${brl(r.saldo)}</b></div></div>
    ${consolidado() ? `<h3 style="margin:0 0 10px;color:#0d1210">Por perfil</h3><table style="margin-bottom:16px">${tabelaPerfis(m)}</table>` : ""}
    <h3 style="margin:0 0 10px;color:#0d1210">Saídas por categoria</h3>
    ${r.cats.map(([c, v]) => `<div class="rb"><span>${esc(c)}</span><i style="width:${(v / max * 100).toFixed(1)}%"></i><span class="num" style="text-align:right">${brl(v)}</span></div>`).join("")}
    <h3 style="margin:18px 0 6px;color:#0d1210">Maiores saídas</h3>
    <table><tr><th>Data</th><th>Descrição</th><th class="r">Valor</th></tr>${top.map(l => `<tr><td class="num">${l.data.split("-").reverse().join("/")}</td><td>${esc(l.desc)}</td><td class="r num neg">${brl(l.valor)}</td></tr>`).join("")}</table>
    <div class="foot">Gerencial Familiar, um sistema THZ Gestão de Projetos Especiais · ${r.ls.length} lançamentos considerados · valores conforme os arquivos da pasta do mês.</div>`;
  $("#rel-dest").textContent = raiz && pastasMes[m] ? `Destino: ${raiz.name} / ${pastasMes[m].name} (a mesma pasta dos extratos do mês).` : raiz ? `Destino: ${raiz.name} (este mês não tem subpasta própria).` : movel() ? "No celular ou tablet, o arquivo abre a opção de salvar no Drive, em Arquivos ou de enviar direto." : "Destino: sem pasta com gravação liberada, o arquivo é baixado.";
  requestAnimationFrame(encaixarRelatorio);
}
const nomeArq = ext => `Relatorio_${perfilAtual === "pf" ? "" : (consolidado() ? "Consolidado" : perfilInfo(perfilAtual).nome.normalize("NFD").replace(/[^A-Za-z0-9]+/g, "")) + "_"}${$("#mes-rel").value}_${new Date().toISOString().slice(0, 10)}.${ext}`;
async function gerarCanvas() {
  const rel = $("#rel"), t = rel.style.transform; rel.style.transform = "";
  try { return await html2canvas(rel, {scale: 2, backgroundColor: "#ffffff"}); } finally { rel.style.transform = t; }
}
async function gerarBlob(tipo) {
  const c = await gerarCanvas();
  if (tipo === "png") return new Promise(res => c.toBlob(res, "image/png"));
  const pdf = new jspdf.jsPDF({unit: "mm", format: "a4"}), w = 190, h = c.height * w / c.width;
  let y = 0; const pg = 277;
  while (y < h) { if (y) pdf.addPage(); pdf.addImage(c.toDataURL("image/jpeg", 0.92), "JPEG", 10, 10 - y, w, h); y += pg; }
  return pdf.output("blob");
}
async function gravarNaPasta(blob, nome) {
  const alvo = pastasMes[$("#mes-rel").value] || raiz;
  if (alvo) {
    try {
      if ((await alvo.queryPermission({mode: "readwrite"})) !== "granted" && (await alvo.requestPermission({mode: "readwrite"})) !== "granted") throw new Error("sem permissão");
      const fh = await alvo.getFileHandle(nome, {create: true}), w = await fh.createWritable();
      await w.write(blob); await w.close();
      return `Salvo em ${raiz.name}${alvo !== raiz ? " / " + alvo.name : ""} / ${nome}`;
    } catch (e) { /* cai no download */ }
  }
  // Celular e tablet: a folha de compartilhar deixa salvar no Drive/Arquivos ou mandar direto.
  if (movel()) {
    try {
      const f = new File([blob], nome, {type: blob.type});
      if (navigator.canShare && navigator.canShare({files: [f]})) { await navigator.share({files: [f], title: nome}); return `${nome} pronto.`; }
    } catch (e) { if (e.name === "AbortError") return "Operação cancelada."; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); a.remove();
  if (movel()) return `${nome} salvo em Downloads.`;
  return `${nome} salvo em Downloads (escolha a pasta da nuvem para gravar direto nela).`;
}
async function salvar(tipo) {
  toast("Gerando o relatório...");
  try { const b = await gerarBlob(tipo); toast(await gravarNaPasta(b, nomeArq(tipo))); guiaMarcar("relatorio"); }
  catch (e) { toast("Não consegui gerar o arquivo: " + e.message); }
}
$("#b-pdf").onclick = () => salvar("pdf");
$("#b-png").onclick = () => salvar("png");
function textoResumo() {
  const m = $("#mes-rel").value, r = resumo(m);
  const pi = perfilInfo(perfilAtual);
  return `Relatório ${mesNome(m)} · ${pi.tipo === "PJ" ? pi.nome : pi.tipo === "todos" ? usuario.nome + " (consolidado)" : usuario.nome}\nEntradas: ${brl(r.ent)}\nSaídas: ${brl(r.sai)}\nSaldo: ${brl(r.saldo)}\nMaior gasto: ${r.cats[0] ? r.cats[0][0] + " " + brl(r.cats[0][1]) : "—"}`;
}
async function compartilhar(canal) {
  // 1) Celular: abre a folha de compartilhar com o PDF anexado (WhatsApp, Gmail etc.)
  try {
    const b = await gerarBlob("pdf"), f = new File([b], nomeArq("pdf"), {type: "application/pdf"});
    if (navigator.canShare && navigator.canShare({files: [f]})) { await navigator.share({files: [f], title: "Relatório financeiro", text: textoResumo()}); guiaMarcar("relatorio"); return; }
  } catch (e) { if (e.name === "AbortError") return; }
  // 2) Computador: mensagem com o resumo; o PDF salvo na pasta vai como anexo pelo usuário
  const txt = textoResumo();
  if (canal === "zap") {
    const n = $("#zap").value.replace(/\D/g, ""), num = n ? (n.length <= 11 ? "55" + n : n) : "";
    const a = document.createElement("a"); a.href = `https://wa.me/${num}?text=${encodeURIComponent(txt)}`; a.target = "_blank"; a.rel = "noopener"; document.body.appendChild(a); a.click(); a.remove();
    toast("WhatsApp aberto com o resumo. Anexe o PDF salvo na pasta."); guiaMarcar("relatorio");
  } else {
    const a = document.createElement("a"); a.href = `mailto:${encodeURIComponent($("#mail").value)}?subject=${encodeURIComponent("Relatório financeiro " + mesNome($("#mes-rel").value))}&body=${encodeURIComponent(txt)}`; document.body.appendChild(a); a.click(); a.remove();
    toast("Rascunho de e-mail aberto com o resumo. Anexe o PDF salvo na pasta.");
  }
}
$("#b-zap").onclick = () => compartilhar("zap");
$("#b-mail").onclick = () => compartilhar("mail");

/* ---------- geral ---------- */
function atualizarTudo() {
  preencherMeses(); desenharPainel(); desenharArquivos(); desenharRelatorio(); guardarSnap();
  $("#fonte-txt").textContent = fonte === "consolidado" ? "Consolidado: pessoa física e empresas" : fonte === "pasta" ? "Lido de: " + $("#pasta-nome").textContent : fonte === "importado" ? "Extratos importados neste aparelho" : fonte === "nuvem" ? "Sincronizado: " + $("#pasta-nome").textContent : "Dados de exemplo (fictícios)";
  desenharGuia();
}
$("#mes").onchange = desenharPainel; $("#busca").oninput = desenharPainel; $("#mes-rel").onchange = desenharRelatorio;

(async () => {
  $("#demo-nota").hidden = !DEMO;
  if (DEMO) {
    $("#lg-email").value = "demo@gerencial.app"; $("#lg-senha").value = "demo1234";
    const us = await garantirDemo();
    let s = null; try { s = sessionStorage.getItem("gf_sessao"); } catch {}
    if (s && us[s]) { usuario = {email: s, nome: us[s].nome}; entrar(); }
    return;
  }
  const {data} = await sb.auth.getSession();
  if (data.session) aposLogin(data.session);
  sb.auth.onAuthStateChange((ev, sessao) => { if (ev === "PASSWORD_RECOVERY") novaSenha(); });
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
function novaSenha() {
  modoNovaSenha = true;
  $("#lg-title").textContent = "Criar nova senha"; $("#lg-email").closest("label").hidden = true; $("#lg-email").required = false;
  $("#lg-alt").hidden = true; $("#lg-esqueci").hidden = true;
  $("#lg-btn").textContent = "Salvar nova senha"; $("#login").hidden = false; $("#app").hidden = true;
}
if ("serviceWorker" in navigator && location.protocol === "https:") navigator.serviceWorker.register("sw.js").catch(() => {});
})();
