# Gerencial Familiar

App web (instalável no computador e no celular) que lê os extratos de cada mês direto da pasta da família na nuvem, mostra o painel e gera o relatório em PDF ou PNG na mesma pasta, com envio por WhatsApp e e-mail.

## Como funciona

- **Login e assinatura** no Supabase: e-mail e senha, recuperação de senha por e-mail, 14 dias de teste a cada cadastro novo. Sem o Supabase configurado, o app roda em modo demonstração (login guardado só no navegador, conta `demo@gerencial.app` / `demo1234`).
- **Pasta na nuvem**: o cliente escolhe a pasta sincronizada do Google Drive, OneDrive ou Dropbox no computador (Chrome ou Edge). O app lê as subpastas de mês (`Novembro2026`, `Nov 2026`, `2026-11`, `11-2026`) e importa arquivos OFX e CSV. A pasta fica lembrada para a próxima vez.
- **Relatório**: PDF (A4) ou PNG gravado na subpasta do mês. No celular, "Enviar" abre o compartilhamento com o PDF anexado. No computador, abre o WhatsApp ou o e-mail com o resumo do mês.
- **Privacidade**: extratos e relatórios nunca saem da máquina do cliente. O servidor guarda só nome, e-mail e assinatura.

## Publicar (uma vez)

1. **Supabase** (supabase.com, plano gratuito): crie um projeto na região São Paulo.
   - SQL Editor > New query > cole `supabase/schema.sql` > Run.
   - Authentication > URL Configuration: em Site URL, coloque o endereço do app na Vercel.
   - Project Settings > API: copie a Project URL e a chave `anon public` para `config.js`.
2. **Vercel** (vercel.com, plano gratuito): Add New > Project > importe este repositório do GitHub > Deploy. Não precisa de build.
3. **Domínio** (opcional, ~R$ 40/ano no registro.br): aponte para a Vercel em Settings > Domains.

## Liberar ou bloquear um cliente

No Supabase, Table Editor > `assinaturas`: mude `status` (`teste`, `ativa`, `suspensa`, `cancelada`) e `valido_ate`. O app confere a cada login.

## Próximas etapas

- Leitura de PDFs e imagens de extratos e faturas.
- Cobrança automática da assinatura (Mercado Pago ou Stripe) atualizando a tabela `assinaturas`.
- Leitura direta pelo link do Google Drive, sem programa instalado (exige verificação de segurança do Google).

## Arquivos

| Arquivo | Para quê |
|---|---|
| `index.html`, `styles.css`, `app.js` | o app |
| `config.js` | endereço e chave pública do Supabase |
| `supabase/schema.sql` | tabelas e regras de acesso do login |
| `sw.js`, `manifest.webmanifest`, `icons/` | instalar como app e abrir rápido |
| `vendor/` | bibliotecas de PDF/PNG e do Supabase, sem depender de CDN |
