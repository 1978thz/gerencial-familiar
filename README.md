# Gerencial Familiar

App web (instalável no computador e no celular) que lê os extratos de cada mês direto da pasta da família na nuvem, mostra o painel e gera o relatório em PDF ou PNG na mesma pasta, com envio por WhatsApp e e-mail.

## Como funciona

- **Login e assinatura** no Supabase: e-mail e senha, recuperação de senha por e-mail, 14 dias de teste a cada cadastro novo. Sem o Supabase configurado, o app roda em modo demonstração (login guardado só no navegador, conta `demo@gerencial.app` / `demo1234`).
- **Pasta na nuvem**: o cliente escolhe a pasta sincronizada do Google Drive, OneDrive ou Dropbox no computador (Chrome ou Edge). O app lê as subpastas de mês (`Novembro2026`, `Nov 2026`, `2026-11`, `11-2026`) e importa arquivos OFX e CSV. A pasta fica lembrada para a próxima vez.
- **Celular e tablet**: os extratos entram por **Importar extratos** (vários OFX/CSV de uma vez, do Drive, OneDrive, Dropbox ou Arquivos); o mês vem da data de cada lançamento, reimportar não duplica e os dados ficam guardados no aparelho. No Android, com o app instalado, dá para mandar o extrato pelo botão **Compartilhar** de outro app. Navegação na parte de baixo da tela, lançamentos em cartões e instalação como app (ícone na tela inicial).
- **Conectar minha nuvem** (celular, tablet e computador): o cliente entra na conta do Google Drive, OneDrive ou Dropbox, escolhe a pasta principal e o app lê os meses sozinho a cada abertura. Acesso somente leitura; os arquivos vão direto da nuvem para o aparelho (`nuvem.js`). Os IDs públicos de cada nuvem ficam em `config.js`.
- **Relatório**: PDF (A4) ou PNG gravado na subpasta do mês. No celular, "Enviar" abre o compartilhamento com o PDF anexado. No computador, abre o WhatsApp ou o e-mail com o resumo do mês.
- **Privacidade**: extratos e relatórios nunca saem da máquina do cliente. O servidor guarda só nome, e-mail e assinatura.

## Publicar (uma vez)

1. **Supabase** (supabase.com, plano gratuito): crie um projeto na região São Paulo.
   - SQL Editor > New query > cole `supabase/schema.sql` > Run.
   - Authentication > URL Configuration: em Site URL, coloque o endereço do app na Vercel.
   - Project Settings > API Keys: copie a Project URL e a chave publicável (`sb_publishable_...`) para `config.js`.
2. **Vercel** (vercel.com, plano gratuito): Add New > Project > importe este repositório do GitHub > Deploy. Não precisa de build.
3. **Nuvens** (para "Conectar minha nuvem"): cadastre o app em cada uma, com o endereço de retorno `https://gerencial-familiar.vercel.app/`:
   - Google Cloud: projeto > ativar Google Drive API > tela de consentimento (Externo, escopo `drive.readonly`, política em `/privacidade.html`) > credencial "ID do cliente OAuth" tipo Aplicativo da Web, com a origem e o URI de redirecionamento acima. Enquanto o app estiver em "Teste", só os usuários de teste cadastrados conseguem entrar (até 100); para liberar a todos, envie para verificação.
   - Microsoft (portal.azure.com > Registros de aplicativo): contas de qualquer organização e pessoais, plataforma "Aplicativo de página única (SPA)" com o URI acima, permissões delegadas `Files.Read`, `User.Read`, `offline_access`.
   - Dropbox (dropbox.com/developers/apps): Scoped access, Full Dropbox, permissões `files.metadata.read` e `files.content.read`, Redirect URI acima, "Allow public clients (PKCE)". Acima de 50 usuários, peça status de produção.
4. **Domínio** (opcional, ~R$ 40/ano no registro.br): aponte para a Vercel em Settings > Domains.

## Administração

- Rode também `supabase/admin.sql` no SQL Editor (uma vez). Ele cria a tabela `admins` com 1978.thz@gmail.com e as funções que só o administrador pode usar.
- Entre no app com o e-mail de administrador (cadastrado e confirmado): aparece a aba **Administração**, com todos os clientes, data de cadastro, último login, situação (teste, ativa, vencida, suspensa, cancelada, e-mail não confirmado) e os botões para mudar status, validade ou somar 30 dias.
- O administrador entra mesmo sem assinatura. Para incluir outro administrador: Table Editor > `admins` > Insert, com o e-mail dele.
- Também dá para ajustar direto no Supabase, em Table Editor > `assinaturas`. O app confere a assinatura a cada login.

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
| `nuvem.js` | conexão com Google Drive, OneDrive e Dropbox |
| `privacidade.html` | política de privacidade (exigida pelo Google) |
| `supabase/admin.sql` | administrador e funções da aba Administração |
| `sw.js`, `manifest.webmanifest`, `icons/` | instalar como app e abrir rápido |
| `vendor/` | bibliotecas de PDF/PNG e do Supabase, sem depender de CDN |

## Segurança
- Depois do `schema.sql` e do `admin.sql`, rode também `supabase/seguranca.sql` no SQL Editor (limite do nome, assinatura decidida no servidor).
- Testes das proteções: `tests/seguranca.mjs` (instruções no topo do arquivo).
- `vercel.json` traz os cabeçalhos de segurança (CSP). Se mudar o script embutido no `index.html`, atualize o hash `sha256-` da CSP.
- `.vercelignore` impede que `supabase/`, `tests/` e este README sejam publicados no site.
