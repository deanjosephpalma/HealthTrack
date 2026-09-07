-- Alma (account manager) readable password notes for local RHU ops.
-- Auth passwords remain hashed in Supabase Auth; this vault is staff-admin only via service_role.

create table if not exists public.account_password_vault (
  user_id uuid primary key,
  password_plain text not null,
  updated_at timestamptz not null default now()
);

alter table public.account_password_vault enable row level security;

-- No policies for authenticated/anon — only service_role can read/write.
drop policy if exists account_password_vault_deny_all on public.account_password_vault;

revoke all on table public.account_password_vault from anon, authenticated;
grant all on table public.account_password_vault to service_role;
