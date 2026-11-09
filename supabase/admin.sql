-- Área de administração. Rodar uma vez no Supabase depois do schema.sql:
-- SQL Editor > New query > colar > Run.
-- Quem é administrador fica na tabela admins (por e-mail). Os clientes não leem essa tabela.
-- Todas as funções conferem no servidor se quem chama é administrador com e-mail confirmado.

create table if not exists public.admins (
  email text primary key,
  criado_em timestamptz not null default now()
);
alter table public.admins enable row level security;
-- Sem políticas: nenhum cliente lê ou altera a lista de administradores pelo app.

insert into public.admins (email) values ('1978.thz@gmail.com') on conflict do nothing;

create or replace function public.sou_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from auth.users u join public.admins a on lower(a.email) = lower(u.email)
    where u.id = auth.uid() and u.email_confirmed_at is not null
  );
$$;

create or replace function public.admin_clientes()
returns table (
  user_id uuid, email text, nome text, criado_em timestamptz, confirmado_em timestamptz,
  ultimo_login timestamptz, status text, plano text, valido_ate date, admin boolean
)
language plpgsql stable security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito ao administrador'; end if;
  return query
    select u.id, u.email::text, p.nome, u.created_at, u.email_confirmed_at, u.last_sign_in_at,
           a.status, a.plano, a.valido_ate,
           exists (select 1 from public.admins x where lower(x.email) = lower(u.email))
    from auth.users u
    left join public.perfis p on p.id = u.id
    left join public.assinaturas a on a.user_id = u.id
    order by u.created_at desc;
end $$;

create or replace function public.admin_atualizar_assinatura(p_user uuid, p_status text, p_valido_ate date)
returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.sou_admin() then raise exception 'Acesso restrito ao administrador'; end if;
  if p_status not in ('teste', 'ativa', 'suspensa', 'cancelada') then raise exception 'Status inválido'; end if;
  insert into public.assinaturas (user_id, status, valido_ate, atualizado_em)
    values (p_user, p_status, p_valido_ate, now())
  on conflict (user_id) do update
    set status = excluded.status, valido_ate = excluded.valido_ate, atualizado_em = now();
end $$;

revoke all on function public.sou_admin() from public, anon;
revoke all on function public.admin_clientes() from public, anon;
revoke all on function public.admin_atualizar_assinatura(uuid, text, date) from public, anon;
grant execute on function public.sou_admin() to authenticated;
grant execute on function public.admin_clientes() to authenticated;
grant execute on function public.admin_atualizar_assinatura(uuid, text, date) to authenticated;
