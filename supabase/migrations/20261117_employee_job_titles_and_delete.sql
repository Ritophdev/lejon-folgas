-- Execute no SQL Editor do Supabase para atualizar um projeto já existente.

alter table public.employees
  add column if not exists job_title text not null default 'Operador de loja';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'employees_job_title_length_check'
      and conrelid = 'public.employees'::regclass
  ) then
    alter table public.employees
      add constraint employees_job_title_length_check
      check (length(trim(job_title)) between 2 and 80);
  end if;
end;
$$;

grant select (id, display_name, job_title) on public.employees to anon;

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

  delete from public.shifts where employee_id = p_employee_id;
  delete from public.employees where id = p_employee_id;
  if not found then
    raise exception 'Colaborador não encontrado.' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.delete_employee(uuid) from public;
grant execute on function public.delete_employee(uuid) to authenticated;
