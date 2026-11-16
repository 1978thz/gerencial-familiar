// Conexão direta com a nuvem do cliente (Google Drive, OneDrive, Dropbox).
// O login acontece na página oficial de cada nuvem; o aparelho recebe uma autorização só de leitura
// e baixa os extratos direto da nuvem. Nada passa pelo servidor do Gerencial Familiar.
(() => {
const $ = s => document.querySelector(s);
const CFG = window.GF_CONFIG || {};
const APP = () => window.GFApp;
const RETORNO = location.origin + "/";

const PROV = {
  google: {
    nome: "Google Drive", id: CFG.googleClientId, criar: "https://accounts.google.com/signup",
    ajuda: "Entre com a mesma conta Google que você usa no app do Google Drive.",
  },
  onedrive: {
    nome: "OneDrive", id: CFG.microsoftClientId, criar: "https://signup.live.com/",
    ajuda: "Entre com a sua conta Microsoft (Outlook, Hotmail ou do trabalho) usada no OneDrive.",
  },
  dropbox: {
    nome: "Dropbox", id: CFG.dropboxAppKey, criar: "https://www.dropbox.com/register",
    ajuda: "Entre com a mesma conta que você usa no app do Dropbox.",
  },
};

/* ---------- guarda da conexão (por usuário, só neste aparelho) ---------- */
const chave = () => "gf_nuvem_" + (APP().usuario() || {}).email;
const ler = () => { try { return JSON.parse(localStorage.getItem(chave())) || null; } catch { return null; } };
const gravar = c => { try { c ? localStorage.setItem(chave(), JSON.stringify(c)) : localStorage.removeItem(chave()); } catch {} };
const chaveDados = () => "nuvem:" + (APP().usuario() || {}).email;
const dadosNuvem = () => APP().idb("readonly", st => st.get(chaveDados())).catch(() => null);
const guardarNuvem = d => APP().idb("readwrite", st => st.put(d, chaveDados())).catch(() => {});
const apagarNuvem = () => APP().idb("readwrite", st => st.delete(chaveDados())).catch(() => {});

/* ---------- OAuth ---------- */
const b64url = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const aleatorio = n => b64url(crypto.getRandomValues(new Uint8Array(n)));
async function desafio(v) { return b64url(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(v))); }
const form = o => new URLSearchParams(o).toString();

async function entrar(prov, silencioso = false) {
  const p = PROV[prov]; if (!p.id) return APP().toast(`${p.nome} ainda não foi liberado neste sistema.`);
  const state = "gfnuvem-" + prov + "-" + aleatorio(12);
  sessionStorage.setItem("gf_oauth_state", state);
  let url;
  if (prov === "google") {
    const c = ler();
    url = "https://accounts.google.com/o/oauth2/v2/auth?" + form({
      client_id: p.id, redirect_uri: RETORNO, response_type: "token", state,
      scope: "https://www.googleapis.com/auth/drive.readonly", include_granted_scopes: "true",
      prompt: silencioso ? "none" : "consent select_account", ...(c && c.prov === "google" && c.conta ? {login_hint: c.conta} : {}),
    });
  } else {
    const verificador = aleatorio(48); sessionStorage.setItem("gf_oauth_pkce", verificador);
    const ch = await desafio(verificador);
    url = prov === "onedrive"
      ? "https://login.microsoftonline.com/common/oauth2/v2.0/authorize?" + form({
          client_id: p.id, response_type: "code", redirect_uri: RETORNO, response_mode: "query", state,
          scope: "Files.Read User.Read offline_access", code_challenge: ch, code_challenge_method: "S256", prompt: "select_account"})
      : "https://www.dropbox.com/oauth2/authorize?" + form({
          client_id: p.id, response_type: "code", redirect_uri: RETORNO, state, token_access_type: "offline",
          code_challenge: ch, code_challenge_method: "S256"});
  }
  location.assign(url);
}

async function trocarCodigo(prov, code) {
  const verificador = sessionStorage.getItem("gf_oauth_pkce"); sessionStorage.removeItem("gf_oauth_pkce");
  const p = PROV[prov];
  const r = prov === "onedrive"
    ? await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: form({client_id: p.id, grant_type: "authorization_code", code, redirect_uri: RETORNO, code_verifier: verificador, scope: "Files.Read User.Read offline_access"})})
    : await fetch("https://api.dropboxapi.com/oauth2/token", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: form({client_id: p.id, grant_type: "authorization_code", code, redirect_uri: RETORNO, code_verifier: verificador})});
  const j = await r.json(); if (!r.ok) throw new Error(j.error_description || j.error || "falha no login");
  return {token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000, refresh: j.refresh_token || null};
}

async function renovar(c) {
  if (c.exp > Date.now()) return c;
  if (!c.refresh) return null; // Google no navegador não tem renovação: pede um toque para reconectar
  const p = PROV[c.prov];
  const r = c.prov === "onedrive"
    ? await fetch("https://login.microsoftonline.com/common/oauth2/v2.0/token", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: form({client_id: p.id, grant_type: "refresh_token", refresh_token: c.refresh, scope: "Files.Read User.Read offline_access"})})
    : await fetch("https://api.dropboxapi.com/oauth2/token", {method: "POST", headers: {"Content-Type": "application/x-www-form-urlencoded"},
        body: form({client_id: p.id, grant_type: "refresh_token", refresh_token: c.refresh})});
  if (!r.ok) return null;
  const j = await r.json();
  Object.assign(c, {token: j.access_token, exp: Date.now() + (j.expires_in - 60) * 1000, refresh: j.refresh_token || c.refresh});
  gravar(c); return c;
}

// Volta do login: a página inicial (index.html) já guardou o retorno e limpou o endereço.
async function tratarRetorno() {
  let r; try { r = JSON.parse(sessionStorage.getItem("gf_oauth_retorno")); } catch {}
  if (!r) return false;
  sessionStorage.removeItem("gf_oauth_retorno");
  const esperado = sessionStorage.getItem("gf_oauth_state"); sessionStorage.removeItem("gf_oauth_state");
  if (!esperado || r.state !== esperado) { APP().toast("Login da nuvem não confirmado. Tente conectar de novo."); return false; }
  const prov = r.state.split("-")[1];
  if (r.error) {
    if (r.error === "interaction_required" || r.error === "login_required" || r.error === "consent_required") return entrar(prov, false);
    APP().toast(r.error === "access_denied" ? "Conexão cancelada." : "A nuvem recusou o login: " + (r.error_description || r.error)); return false;
  }
  try {
    const anterior = ler() || {};
    const t = r.access_token ? {token: r.access_token, exp: Date.now() + ((+r.expires_in || 3600) - 60) * 1000, refresh: null} : await trocarCodigo(prov, r.code);
    const c = {...(anterior.prov === prov ? anterior : {}), prov, ...t};
    c.conta = await API[prov].conta(c.token).catch(() => c.conta || "");
    gravar(c);
    if (!c.pasta) abrirPastas(); else sincronizar();
    desenhar();
  } catch (e) { APP().toast("Não consegui concluir o login: " + e.message); }
  return true;
}

/* ---------- APIs de cada nuvem (somente leitura) ---------- */
async function pedir(url, token, opt = {}) {
  const r = await fetch(url, {...opt, headers: {Authorization: "Bearer " + token, ...(opt.headers || {})}});
  if (r.status === 401) { const e = new Error("sessão da nuvem expirou"); e.expirou = true; throw e; }
  if (!r.ok) throw new Error(`${r.status} ${(await r.text()).slice(0, 120)}`);
  return r;
}
const PASTA_G = "application/vnd.google-apps.folder";
// Cabeçalho do Dropbox só aceita ASCII: acentos viram \uXXXX.
const jsonAscii = o => JSON.stringify(o).replace(/[\u007f-￿]/g, c => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
const API = {
  google: {
    async conta(t) { const j = await (await pedir("https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)", t)).json(); return j.user.emailAddress; },
    async listar(t, id) {
      const out = []; let page = "";
      do {
        const q = encodeURIComponent(`'${id || "root"}' in parents and trashed=false`);
        const j = await (await pedir(`https://www.googleapis.com/drive/v3/files?q=${q}&fields=nextPageToken,files(id,name,mimeType)&pageSize=1000&orderBy=folder,name&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? "&pageToken=" + page : ""}`, t)).json();
        out.push(...j.files.map(f => ({id: f.id, nome: f.name, pasta: f.mimeType === PASTA_G})));
        page = j.nextPageToken || "";
      } while (page);
      return out;
    },
    baixar(t, item) { return pedir(`https://www.googleapis.com/drive/v3/files/${item.id}?alt=media&supportsAllDrives=true`, t); },
  },
  onedrive: {
    async conta(t) { const j = await (await pedir("https://graph.microsoft.com/v1.0/me?$select=userPrincipalName,mail", t)).json(); return j.mail || j.userPrincipalName; },
    async listar(t, id) {
      const out = []; let url = `https://graph.microsoft.com/v1.0/me/drive/${id ? "items/" + id : "root"}/children?$top=999`;
      while (url) {
        const j = await (await pedir(url, t)).json();
        out.push(...j.value.map(f => ({id: f.id, nome: f.name, pasta: !!f.folder, baixar: f["@microsoft.graph.downloadUrl"]})));
        url = j["@odata.nextLink"] || "";
      }
      return out;
    },
    async baixar(t, item) {
      if (item.baixar) { const r = await fetch(item.baixar); if (r.ok) return r; }
      return pedir(`https://graph.microsoft.com/v1.0/me/drive/items/${item.id}/content`, t);
    },
  },
  dropbox: {
    async conta(t) { const j = await (await pedir("https://api.dropboxapi.com/2/users/get_current_account", t, {method: "POST"})).json(); return j.email; },
    async listar(t, id) {
      const out = [];
      let j = await (await pedir("https://api.dropboxapi.com/2/files/list_folder", t, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({path: id || "", limit: 2000})})).json();
      for (;;) {
        out.push(...j.entries.map(f => ({id: f.path_lower, nome: f.name, pasta: f[".tag"] === "folder"})));
        if (!j.has_more) break;
        j = await (await pedir("https://api.dropboxapi.com/2/files/list_folder/continue", t, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({cursor: j.cursor})})).json();
      }
      return out.sort((a, b) => (b.pasta - a.pasta) || a.nome.localeCompare(b.nome));
    },
    baixar(t, item) { return pedir("https://content.dropboxapi.com/2/files/download", t, {method: "POST", headers: {"Dropbox-API-Arg": jsonAscii({path: item.id})}}); },
  },
};
async function comToken(fn) {
  let c = ler(); if (!c) throw new Error("nuvem não conectada");
  c = await renovar(c);
  if (!c) { const e = new Error("reconectar"); e.expirou = true; throw e; }
  try { return await fn(c); }
  catch (e) {
    if (e.expirou && ler().refresh) { const c2 = ler(); c2.exp = 0; const r = await renovar(c2); if (r) return fn(r); }
    throw e;
  }
}

/* ---------- sincronização ---------- */
const LEGIVEL = /\.(ofx|csv|txt|pdf)$/i;
// PDF vira texto aqui mesmo no aparelho (leitor-pdf.js); OFX e CSV já são texto.
async function conteudo(api, t, f) {
  const r = await api.baixar(t, f);
  if (!/\.pdf$/i.test(f.nome)) return r.text();
  if (!window.GFPdf || /^relatorio_/i.test(f.nome)) return null;
  try { return await window.GFPdf.texto(await r.arrayBuffer()); } catch { return null; }
}
let sincronizando = false;
async function sincronizar(silencioso = false) {
  const c = ler(); if (!c || !c.pasta || sincronizando) return;
  sincronizando = true; desenhar();
  try {
    const arqs = await comToken(async c => {
      const api = API[c.prov], itens = await api.listar(c.token, c.pasta.id);
      const meses = itens.filter(i => i.pasta && APP().mesDaPasta(i.nome));
      const lista = [];
      if (meses.length) {
        for (const m of meses) {
          const mes = APP().mesDaPasta(m.nome);
          for (const f of (await api.listar(c.token, m.id)).filter(f => !f.pasta)) lista.push({...f, mes});
        }
      } else {
        lista.push(...itens.filter(f => !f.pasta).map(f => ({...f, mes: null})));
      }
      const out = [];
      for (const f of lista) out.push({nome: f.nome, mes: f.mes, texto: LEGIVEL.test(f.nome) ? await conteudo(api, c.token, f) : null});
      return out;
    });
    const m = APP().montarLancamentos(arqs);
    const d = {...m, provNome: PROV[c.prov].nome, pasta: c.pasta.nome, em: new Date().toISOString()};
    await guardarNuvem(d);
    const atual = ler(); atual.ultima = d.em; gravar(atual);
    if (d.lanc.length) APP().mostrarNuvem(d);
    if (!silencioso || !d.lanc.length) APP().toast(d.lanc.length
      ? `${d.lanc.length} lançamentos lidos de ${PROV[c.prov].nome} / ${c.pasta.nome}.`
      : `Nenhum extrato OFX, CSV ou PDF legível em ${c.pasta.nome}. Confira se escolheu a pasta principal, com as subpastas de mês.`);
  } catch (e) {
    if (e.expirou) { const a = ler(); if (a) { a.exp = 0; gravar(a); } if (!silencioso) APP().toast(`Toque em "Atualizar" para entrar de novo no ${PROV[c.prov].nome}.`); }
    else APP().toast("Não consegui ler a nuvem: " + e.message);
  } finally { sincronizando = false; desenhar(); }
}

/* ---------- escolher a pasta ---------- */
let trilha = [];
// A janela fica fora das abas, para abrir mesmo quando a aba Extratos não está à mostra.
document.body.appendChild($("#nv-dlg"));
async function abrirPastas() {
  trilha = [{id: null, nome: "Início"}];
  APP().irPara("pasta");
  $("#nv-dlg").showModal ? $("#nv-dlg").showModal() : $("#nv-dlg").setAttribute("open", "");
  listarPasta();
}
async function listarPasta() {
  const atual = trilha[trilha.length - 1];
  $("#nv-trilha").innerHTML = trilha.map((t, i) => `<button class="link" data-i="${i}">${APP().esc(t.nome)}</button>`).join(" / ");
  $("#nv-lista").innerHTML = `<li class="muted">Carregando...</li>`;
  $("#nv-usar").disabled = !atual.id;
  try {
    const itens = await comToken(c => API[c.prov].listar(c.token, atual.id));
    const pastas = itens.filter(i => i.pasta), meses = pastas.filter(p => APP().mesDaPasta(p.nome)).length;
    const extratos = itens.filter(i => !i.pasta && LEGIVEL.test(i.nome)).length;
    $("#nv-info").textContent = atual.id
      ? (meses ? `${meses} subpasta(s) de mês aqui: esta parece ser a pasta principal.` : extratos ? `${extratos} extrato(s) soltos aqui; o mês vem da data de cada lançamento.` : "Entre na pasta onde ficam os extratos.")
      : "Toque numa pasta para entrar nela. Depois toque em Usar esta pasta.";
    $("#nv-lista").innerHTML = pastas.map(p => `<li><button class="nv-item" data-id="${APP().esc(p.id)}" data-nome="${APP().esc(p.nome)}"><span class="nv-ic">📁</span>${APP().esc(p.nome)}${APP().mesDaPasta(p.nome) ? ' <span class="tag">mês</span>' : ""}</button></li>`).join("")
      || `<li class="muted">Nenhuma subpasta aqui.</li>`;
  } catch (e) {
    $("#nv-lista").innerHTML = `<li class="neg">Não consegui abrir: ${APP().esc(e.expirou ? "a sessão expirou, feche e toque em Atualizar." : e.message)}</li>`;
  }
}
function fecharPastas() { $("#nv-dlg").close ? $("#nv-dlg").close() : $("#nv-dlg").removeAttribute("open"); }

/* ---------- tela ---------- */
function desenhar() {
  const c = ler(), lig = !!(c && c.prov);
  for (const [k, p] of Object.entries(PROV)) {
    const b = document.querySelector(`.nv-prov[data-prov="${k}"]`); if (!b) continue;
    b.disabled = !p.id; b.querySelector("small").textContent = p.id ? "Entrar e escolher a pasta" : "Em liberação";
  }
  $("#nv-escolha").hidden = lig; $("#nv-ligado").hidden = !lig;
  if (lig) {
    const p = PROV[c.prov], expirado = !c.refresh && c.exp < Date.now();
    $("#nv-titulo").textContent = `${p.nome} conectado`;
    $("#nv-conta").textContent = c.conta || "";
    $("#nv-pasta").textContent = c.pasta ? c.pasta.nome : "Nenhuma pasta escolhida";
    $("#nv-ultima").textContent = sincronizando ? "Lendo a pasta..." : c.ultima ? "Atualizado em " + new Date(c.ultima).toLocaleString("pt-BR", {dateStyle: "short", timeStyle: "short"}) : "Ainda não sincronizado";
    $("#nv-sync").textContent = expirado ? `Atualizar (entrar no ${p.nome})` : "Atualizar agora";
    $("#nv-sync").disabled = sincronizando || !c.pasta;
  }
  if (APP()) APP().atualizarGuia();
}
const conectado = () => { const c = ler(); return !!(c && c.prov && c.pasta); };

$("#nv-escolha").onclick = e => { const b = e.target.closest(".nv-prov"); if (b && !b.disabled) entrar(b.dataset.prov); };
$("#nv-sync").onclick = () => { const c = ler(); if (!c) return; if (!c.refresh && c.exp < Date.now()) return entrar(c.prov, true); sincronizar(); };
$("#nv-trocar").onclick = () => { const c = ler(); if (c && !c.refresh && c.exp < Date.now()) return entrar(c.prov, true); abrirPastas(); };
$("#nv-sair").onclick = async () => {
  if (!confirm("Desconectar a nuvem deste aparelho? Seus arquivos na nuvem não são apagados.")) return;
  gravar(null); await apagarNuvem(); desenhar(); APP().voltarExemplo(); APP().toast("Nuvem desconectada deste aparelho.");
};
$("#nv-trilha").onclick = e => { const b = e.target.closest("[data-i]"); if (!b) return; trilha = trilha.slice(0, +b.dataset.i + 1); listarPasta(); };
$("#nv-lista").onclick = e => { const b = e.target.closest(".nv-item"); if (!b) return; trilha.push({id: b.dataset.id, nome: b.dataset.nome}); listarPasta(); };
$("#nv-usar").onclick = () => {
  const atual = trilha[trilha.length - 1], c = ler(); if (!atual.id || !c) return;
  c.pasta = {id: atual.id, nome: atual.nome}; gravar(c); fecharPastas(); desenhar(); sincronizar();
};
$("#nv-fechar").onclick = fecharPastas;

window.GFNuvem = {
  conectado,
  // Chamado depois do login no sistema: mostra o que já foi lido e atualiza sozinho quando dá.
  async iniciar() {
    desenhar();
    if (await tratarRetorno()) return;
    const c = ler(); if (!c || !c.pasta) return;
    const d = await dadosNuvem(); if (d && d.lanc && d.lanc.length) APP().mostrarNuvem(d);
    if (c.refresh || c.exp > Date.now()) sincronizar(true);
  },
};
})();
