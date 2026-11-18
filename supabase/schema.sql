-- Lejon Folgas: estrutura mínima para a consulta de escalas semanais.
-- Execute no SQL Editor de um projeto Supabase novo.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'rh' check (role in ('rh', 'admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (length(trim(display_name)) between 2 and 120),
  job_title text not null default 'Operador de loja'
    constraint employees_job_title_length_check check (length(trim(job_title)) between 2 and 80),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Atualiza instalações existentes sem apagar os colaboradores já cadastrados.
alter table public.employees
  add column if not exists job_title text not null default 'Operador de loja';

create table if not exists public.schedule_weeks (
  id uuid primary key default gen_random_uuid(),
  starts_on date not null,
  ends_on date not null,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on = starts_on + 6)
);

create index if not exists schedule_weeks_public_lookup on public.schedule_weeks (status, starts_on);

create table if not exists public.shifts (
  id uuid primary key default gen_random_uuid(),
  schedule_week_id uuid not null references public.schedule_weeks (id) on delete cascade,
  employee_id uuid not null references public.employees (id) on delete restrict,
  shift_date date not null,
  status text not null check (status in ('work', 'off')),
  start_time time,
  end_time time,
  created_at timestamptz not null default now(),
  unique (schedule_week_id, employee_id, shift_date),
  check ((status = 'off' and start_time is null and end_time is null) or (status = 'work' and start_time is not null and end_time is not null)),
  check (start_time is null or end_time > start_time)
);

create index if not exists shifts_by_employee_date on public.shifts (employee_id, shift_date);
create index if not exists shifts_by_schedule_date on public.shifts (schedule_week_id, shift_date);

create table if not exists public.holidays (
  id uuid primary key default gen_random_uuid(),
  holiday_date date not null,
  name text not null check (length(trim(name)) between 2 and 140),
  created_at timestamptz not null default now()
);

create index if not exists holidays_by_date on public.holidays (holiday_date);

create or replace function public.is_schedule_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users
    where user_id = auth.uid()
  );
$$;

revoke all on function public.is_schedule_admin() from public;
grant execute on function public.is_schedule_admin() to anon, authenticated;

create or replace function public.delete_employee(p_employee_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_schedule_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  -- A exclusão é explícita e também remove as folgas históricas desse cadastro.
  delete from public.shifts where employee_id = p_employee_id;
  delete from public.employees where id = p_employee_id;
  if not found then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_employee(uuid) from public;
grant execute on function public.delete_employee(uuid) to authenticated;

alter table public.admin_users enable row level security;
alter table public.employees enable row level security;
alter table public.schedule_weeks enable row level security;
alter table public.shifts enable row level security;
alter table public.holidays enable row level security;

create policy "admins can read their own admin role"
  on public.admin_users for select to authenticated
  using (user_id = auth.uid());

create policy "public can search active employee names"
  on public.employees for select to anon, authenticated
  using (active = true or public.is_schedule_admin());

create policy "admins manage employees"
  on public.employees for all to authenticated
  using (public.is_schedule_admin())
  with check (public.is_schedule_admin());

create policy "public can read published weeks"
  on public.schedule_weeks for select to anon, authenticated
  using (status = 'published' or public.is_schedule_admin());

create policy "admins manage schedule weeks"
  on public.schedule_weeks for all to authenticated
  using (public.is_schedule_admin())
  with check (public.is_schedule_admin());

create policy "public can read shifts from published weeks"
  on public.shifts for select to anon, authenticated
  using (
    public.is_schedule_admin()
    or exists (
      select 1 from public.schedule_weeks w
      where w.id = schedule_week_id and w.status = 'published'
    )
  );

create policy "admins manage shifts"
  on public.shifts for all to authenticated
  using (public.is_schedule_admin())
  with check (public.is_schedule_admin());

create policy "public can read holidays in published weeks"
  on public.holidays for select to anon, authenticated
  using (
    public.is_schedule_admin()
    or exists (
      select 1 from public.schedule_weeks w
      where w.status = 'published'
        and holiday_date between w.starts_on and w.ends_on
    )
  );

create policy "admins manage holidays"
  on public.holidays for all to authenticated
  using (public.is_schedule_admin())
  with check (public.is_schedule_admin());

grant select on public.schedule_weeks, public.shifts, public.holidays to anon, authenticated;
grant select (id, display_name, job_title) on public.employees to anon;
grant select on public.employees to authenticated;
grant insert, update, delete on public.employees, public.schedule_weeks, public.shifts, public.holidays to authenticated;
grant select on public.admin_users to authenticated;

create or replace function public.publish_schedule(
  p_schedule_id uuid,
  p_starts_on date,
  p_ends_on date,
  p_shifts jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_schedule_admin() then
    raise exception 'Acesso administrativo necessário.' using errcode = '42501';
  end if;

  if p_ends_on <> p_starts_on + 6 then
    raise exception 'A escala deve cobrir sete dias.' using errcode = '22023';
  end if;

  insert into public.schedule_weeks (id, starts_on, ends_on, status, published_at, updated_at)
  values (p_schedule_id, p_starts_on, p_ends_on, 'published', now(), now())
  on conflict (id) do update
    set starts_on = excluded.starts_on,
        ends_on = excluded.ends_on,
        status = 'published',
        published_at = now(),
        updated_at = now();

  delete from public.shifts where schedule_week_id = p_schedule_id;

  insert into public.shifts (schedule_week_id, employee_id, shift_date, status, start_time, end_time)
  select
    p_schedule_id,
    (item ->> 'employee_id')::uuid,
    (item ->> 'shift_date')::date,
    (item ->> 'status'),
    nullif(item ->> 'start_time', '')::time,
    nullif(item ->> 'end_time', '')::time
  from jsonb_array_elements(coalesce(p_shifts, '[]'::jsonb)) as item;
end;
$$;

revoke all on function public.publish_schedule(uuid, date, date, jsonb) from public, anon;
grant execute on function public.publish_schedule(uuid, date, date, jsonb) to authenticated;

-- Após criar um usuário em Authentication > Users, autorize-o para o RH:
-- insert into public.admin_users (user_id, role)
-- values ('UUID_DO_USUARIO_AUTH', 'rh');
