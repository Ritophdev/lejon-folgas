-- Dados fictícios e seguros para testar o portal. Execute após schema.sql.
-- As duas semanas são calculadas a partir da semana atual do banco.

insert into public.employees (id, display_name, job_title, active)
values
  ('10000000-0000-4000-8000-000000000001', 'Ana Souza', 'Operadora de caixa', true),
  ('10000000-0000-4000-8000-000000000002', 'Bruno Lima', 'Repositor', true),
  ('10000000-0000-4000-8000-000000000003', 'Camila Ferreira', 'Atendente de loja', true),
  ('10000000-0000-4000-8000-000000000004', 'Diego Santos', 'Conferente', true),
  ('10000000-0000-4000-8000-000000000005', 'Luana Costa', 'Operadora de loja', true),
  ('10000000-0000-4000-8000-000000000006', 'Rafael Almeida', 'Repositor', true)
on conflict (id) do update set
  display_name = excluded.display_name,
  job_title = excluded.job_title,
  active = excluded.active,
  updated_at = now();

insert into public.schedule_weeks (id, starts_on, ends_on, status, published_at)
values
  ('20000000-0000-4000-8000-000000000001', date_trunc('week', current_date)::date, date_trunc('week', current_date)::date + 6, 'published', now()),
  ('20000000-0000-4000-8000-000000000002', date_trunc('week', current_date)::date + 7, date_trunc('week', current_date)::date + 13, 'published', now())
on conflict (id) do update set
  starts_on = excluded.starts_on,
  ends_on = excluded.ends_on,
  status = excluded.status,
  published_at = excluded.published_at,
  updated_at = now();

with weeks as (
  select id, starts_on, 1 as week_number
  from public.schedule_weeks
  where id = '20000000-0000-4000-8000-000000000001'
  union all
  select id, starts_on, 2 as week_number
  from public.schedule_weeks
  where id = '20000000-0000-4000-8000-000000000002'
), assignments(employee_id, first_off_day, second_off_day, start_time, end_time) as (
  values
    ('10000000-0000-4000-8000-000000000001'::uuid, 3, 4, '08:00'::time, '17:00'::time),
    ('10000000-0000-4000-8000-000000000002'::uuid, 5, 0, '09:00'::time, '18:00'::time),
    ('10000000-0000-4000-8000-000000000003'::uuid, 1, 2, '08:00'::time, '17:00'::time),
    ('10000000-0000-4000-8000-000000000004'::uuid, 2, 5, '09:00'::time, '18:00'::time),
    ('10000000-0000-4000-8000-000000000005'::uuid, 6, 1, '08:00'::time, '17:00'::time),
    ('10000000-0000-4000-8000-000000000006'::uuid, 0, 3, '09:00'::time, '18:00'::time)
), days as (
  select weeks.id as schedule_week_id,
         assignments.employee_id,
         weeks.starts_on + day_offset as shift_date,
         case when day_offset = case weeks.week_number when 1 then assignments.first_off_day else assignments.second_off_day end then 'off' else 'work' end as status,
         assignments.start_time,
         assignments.end_time
  from weeks
  cross join assignments
  cross join generate_series(0, 6) as day_values(day_offset)
)
insert into public.shifts (schedule_week_id, employee_id, shift_date, status, start_time, end_time)
select schedule_week_id, employee_id, shift_date, status,
       case when status = 'off' then null else start_time end,
       case when status = 'off' then null else end_time end
from days
on conflict (schedule_week_id, employee_id, shift_date) do update set
  status = excluded.status,
  start_time = excluded.start_time,
  end_time = excluded.end_time;

insert into public.holidays (id, holiday_date, name)
values (
  '30000000-0000-4000-8000-000000000001',
  make_date(extract(year from current_date)::integer, 11, 20),
  'Dia Nacional de Zumbi e da Consciência Negra'
)
on conflict (id) do update set
  holiday_date = excluded.holiday_date,
  name = excluded.name;
