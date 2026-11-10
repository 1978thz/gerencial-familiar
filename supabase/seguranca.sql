-- Ajustes de segurança (revisão de 27 itens). Rodar UMA vez no Supabase, depois do schema.sql e do admin.sql:
-- SQL Editor > New query > colar > Run. Pode rodar de novo sem problema.

-- 1) Limite de tamanho no nome da família (validação no servidor, não só na tela).
update public.perfis set nome = left(nome, 100) where length(nome) > 100;
alter table public.perfis drop constraint if exists perfis_nome_tamanho;
alter table public.perfis add constraint perfis_nome_tamanho check (nome is null or char_length(nome) <= 100);

-- 2) O cliente edita só o próprio perfil, e a regra vale também para o valor gravado (with check).
drop policy if exists "perfil: editar o proprio" on public.perfis;
create policy "perfil: editar o proprio" on public.perfis for update
  using (auth.uid() = id) with check (auth.uid() = id);

-- 3) A decisão "assinatura liberada?" passa a ser do servidor, com a data do servidor.
--    O app chama esta função ao entrar; futuras funções pagas (ex.: leitura de PDF com IA) devem chamá-la também.
create or replace function public.assinatura_ativa() returns boolean
language sql stable security definer set search_path = public as $$
  select public.sou_admin() or exists (
    select 1 from public.assinaturas a
    where a.user_id = auth.uid()
      and a.status in ('teste', 'ativa')
      and (a.valido_ate is null or a.valido_ate >= (now() at time zone 'America/Sao_Paulo')::date)
  );
$$;
revoke all on function public.assinatura_ativa() from public, anon;
grant execute on function public.assinatura_ativa() to authenticated;

-- 4) Funções internas não ficam expostas para quem não está logado.
revoke all on function public.novo_usuario() from public, anon, authenticated;

-- Conferência: deve listar perfis, assinaturas e admins todos com rowsecurity = true.
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
