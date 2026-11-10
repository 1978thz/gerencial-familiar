// Testes das proteções do Gerencial Familiar (item 27 da revisão de segurança).
// Precisa de DOIS usuários de teste já criados e confirmados no app (nenhum deles administrador).
// Como rodar (no computador, com Node 18+), dentro da pasta do projeto:
//   npm i @supabase/supabase-js
//   GF_A_EMAIL=... GF_A_SENHA=... GF_B_EMAIL=... GF_B_SENHA=... node tests/seguranca.mjs
import {createClient} from "@supabase/supabase-js";
import {readFileSync} from "node:fs";

const cfg = readFileSync(new URL("../config.js", import.meta.url), "utf8");
const URL_SB = cfg.match(/supabaseUrl:\s*"([^"]+)"/)[1], KEY = cfg.match(/supabaseAnonKey:\s*"([^"]+)"/)[1];
const novo = () => createClient(URL_SB, KEY, {auth: {persistSession: false}});
const env = k => { if (!process.env[k]) { console.error(`Falta a variável ${k}`); process.exit(2); } return process.env[k]; };

let falhas = 0;
const teste = async (nome, fn) => {
  try { const ok = await fn(); console.log(`${ok ? "PASSOU" : "FALHOU"}  ${nome}`); if (!ok) falhas++; }
  catch (e) { console.log(`ERRO    ${nome}: ${e.message}`); falhas++; }
};
const entrar = async (email, senha) => {
  const c = novo(); const {data, error} = await c.auth.signInWithPassword({email, password: senha});
  if (error) throw new Error(`login de ${email}: ${error.message}`); return {c, id: data.user.id};
};

const A = await entrar(env("GF_A_EMAIL"), env("GF_A_SENHA"));
const B = await entrar(env("GF_B_EMAIL"), env("GF_B_SENHA"));
const anon = novo();

await teste("Visitante sem login não lê perfis", async () => { const {data} = await anon.from("perfis").select("*"); return !data || data.length === 0; });
await teste("Visitante sem login não lê assinaturas", async () => { const {data} = await anon.from("assinaturas").select("*"); return !data || data.length === 0; });
await teste("Cliente A não lê o perfil do cliente B", async () => { const {data} = await A.c.from("perfis").select("*").eq("id", B.id); return !data || data.length === 0; });
await teste("Cliente A não lê a assinatura do cliente B", async () => { const {data} = await A.c.from("assinaturas").select("*").eq("user_id", B.id); return !data || data.length === 0; });
await teste("Cliente A não altera o perfil do cliente B", async () => {
  await A.c.from("perfis").update({nome: "invasao"}).eq("id", B.id);
  const {data} = await B.c.from("perfis").select("nome").eq("id", B.id).single(); return data.nome !== "invasao";
});
await teste("Cliente não altera a própria assinatura", async () => {
  const {data: antes} = await A.c.from("assinaturas").select("status, valido_ate").eq("user_id", A.id).maybeSingle();
  await A.c.from("assinaturas").update({status: "ativa", valido_ate: "2099-12-31"}).eq("user_id", A.id);
  const {data: depois} = await A.c.from("assinaturas").select("status, valido_ate").eq("user_id", A.id).maybeSingle();
  return JSON.stringify(antes) === JSON.stringify(depois);
});
await teste("Cliente não lê a lista de administradores", async () => { const {data} = await A.c.from("admins").select("*"); return !data || data.length === 0; });
await teste("Cliente comum não é administrador", async () => { const {data} = await A.c.rpc("sou_admin"); return data === false; });
await teste("Área admin recusa cliente comum (lista de clientes)", async () => { const {error} = await A.c.rpc("admin_clientes"); return !!error; });
await teste("Área admin recusa cliente comum (alterar assinatura)", async () => {
  const {error} = await A.c.rpc("admin_atualizar_assinatura", {p_user: A.id, p_status: "ativa", p_valido_ate: "2099-12-31"}); return !!error;
});
await teste("Visitante sem login não chama funções de admin", async () => { const {error} = await anon.rpc("admin_clientes"); return !!error; });
await teste("Banco recusa nome com mais de 100 caracteres", async () => {
  const {error} = await A.c.from("perfis").update({nome: "x".repeat(300)}).eq("id", A.id); return !!error;
});
await teste("Assinatura é decidida pelo servidor (função existe)", async () => { const {data, error} = await A.c.rpc("assinatura_ativa"); return !error && typeof data === "boolean"; });
await teste("Muitas senhas erradas seguidas são barradas (limite de tentativas)", async () => {
  const c = novo(); let barrado = false;
  for (let i = 0; i < 40 && !barrado; i++) {
    const {error} = await c.auth.signInWithPassword({email: "teste-limite@exemplo.com", password: "errada" + i});
    if (error && (error.status === 429 || /rate|too many/i.test(error.message))) barrado = true;
  }
  return barrado;
});

console.log(falhas ? `\n${falhas} teste(s) com problema.` : "\nTodas as proteções passaram.");
process.exit(falhas ? 1 : 0);
