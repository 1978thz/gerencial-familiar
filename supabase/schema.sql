-- Rodar uma vez no Supabase: SQL Editor > New query > colar > Run.
-- Guarda só o cadastro e a assinatura. Extratos e relatórios ficam na pasta do cliente.

create table if not exists public.perfis (
  id uuid primary key references auth.users on delete cascade,
  nome text,
  criado_em timestamptz not null default now()
);

create table if not exists public.assinaturas (
  user_id uuid primary key references auth.users on delete cascade,
  status text not null default 'teste' check (status in ('teste', 'ativa', 'suspensa', 'cancelada')),
  plano text not null default 'mensal',
  valido_ate date,
  atualizado_em timestamptz not null default now()
);

alter table public.perfis enable row level security;
alter table public.assinaturas enable row level security;

-- Cada cliente vê e edita só o próprio perfil e só lê a própria assinatura.
-- A assinatura é alterada só por você, no painel do Supabase (Table Editor).
drop policy if exists "perfil: ler o proprio" on public.perfis;
create policy "perfil: ler o proprio" on public.perfis for select using (auth.uid() = id);
drop policy if exists "perfil: editar o proprio" on public.perfis;
create policy "perfil: editar o proprio" on public.perfis for update using (auth.uid() = id);
drop policy if exists "assinatura: ler a propria" on public.assinaturas;
create policy "assinatura: ler a propria" on public.assinaturas for select using (auth.uid() = user_id);

-- Todo cadastro novo ganha perfil e 14 dias de teste.
create or replace function public.novo_usuario() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.perfis (id, nome) values (new.id, coalesce(new.raw_user_meta_data->>'nome', 'Minha família'));
  insert into public.assinaturas (user_id, status, valido_ate) values (new.id, 'teste', current_date + 14);
  return new;
end $$;

drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users for each row execute function public.novo_usuario();
