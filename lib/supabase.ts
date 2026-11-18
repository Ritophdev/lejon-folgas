import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { DemoState, Employee, Holiday, ScheduleWeek, Shift, ShiftStatus } from "@/lib/types";

let browserClient: SupabaseClient | null = null;

export function supabaseConfigState(): "demo" | "configured" | "incomplete" {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url && key) return "configured";
  if (!url && !key) return "demo";
  return "incomplete";
}

export function getSupabase(): SupabaseClient | null {
  if (supabaseConfigState() !== "configured") return null;
  if (!browserClient) {
    browserClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
    );
  }
  return browserClient;
}

function mapEmployee(row: Record<string, unknown>): Employee {
  return {
    id: String(row.id),
    name: String(row.display_name),
    jobTitle: String(row.job_title ?? "Operador de loja"),
    active: Boolean(row.active ?? true),
  };
}

function mapShift(row: Record<string, unknown>): Shift {
  return {
    id: String(row.id),
    weekId: String(row.schedule_week_id),
    employeeId: String(row.employee_id),
    date: String(row.shift_date),
    status: String(row.status) as ShiftStatus,
    startTime: row.start_time ? String(row.start_time).slice(0, 5) : null,
    endTime: row.end_time ? String(row.end_time).slice(0, 5) : null,
  };
}

function mapWeek(row: Record<string, unknown>, shifts: Shift[]): ScheduleWeek {
  return {
    id: String(row.id),
    startDate: String(row.starts_on),
    endDate: String(row.ends_on),
    status: String(row.status) as "draft" | "published",
    publishedAt: row.published_at ? String(row.published_at) : null,
    shifts: shifts.filter((shift) => shift.weekId === String(row.id)),
  };
}

function mapHoliday(row: Record<string, unknown>): Holiday {
  return { id: String(row.id), date: String(row.holiday_date), name: String(row.name) };
}

export async function loadPublishedData(employeeId?: string): Promise<DemoState> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não está configurado.");
  const shiftsQuery = employeeId
    ? supabase.from("shifts").select("id, schedule_week_id, employee_id, shift_date, status, start_time, end_time").eq("employee_id", employeeId)
    : Promise.resolve({ data: [], error: null });
  const [employeesResult, weeksResult, shiftsResult, holidaysResult] = await Promise.all([
    supabase.from("employees").select("id, display_name, job_title").order("display_name"),
    supabase.from("schedule_weeks").select("id, starts_on, ends_on, status, published_at").eq("status", "published").order("starts_on"),
    shiftsQuery,
    supabase.from("holidays").select("id, holiday_date, name").order("holiday_date"),
  ]);
  for (const result of [employeesResult, weeksResult, shiftsResult, holidaysResult]) {
    if (result.error) throw result.error;
  }
  const shifts = (shiftsResult.data ?? []).map((row) => mapShift(row as Record<string, unknown>));
  return {
    employees: (employeesResult.data ?? []).map((row) => mapEmployee(row as Record<string, unknown>)),
    weeks: (weeksResult.data ?? []).map((row) => mapWeek(row as Record<string, unknown>, shifts)),
    holidays: (holidaysResult.data ?? []).map((row) => mapHoliday(row as Record<string, unknown>)),
  };
}

export async function loadAdminData(): Promise<DemoState> {
  const supabase = getSupabase();
  if (!supabase) throw new Error("Supabase não está configurado.");
  const [employeesResult, weeksResult, shiftsResult, holidaysResult] = await Promise.all([
    supabase.from("employees").select("id, display_name, job_title, active").order("display_name"),
    supabase.from("schedule_weeks").select("id, starts_on, ends_on, status, published_at").order("starts_on", { ascending: false }),
    supabase.from("shifts").select("id, schedule_week_id, employee_id, shift_date, status, start_time, end_time"),
    supabase.from("holidays").select("id, holiday_date, name").order("holiday_date", { ascending: false }),
  ]);
  for (const result of [employeesResult, weeksResult, shiftsResult, holidaysResult]) {
    if (result.error) throw result.error;
  }
  const shifts = (shiftsResult.data ?? []).map((row) => mapShift(row as Record<string, unknown>));
  return {
    employees: (employeesResult.data ?? []).map((row) => mapEmployee(row as Record<string, unknown>)),
    weeks: (weeksResult.data ?? []).map((row) => mapWeek(row as Record<string, unknown>, shifts)),
    holidays: (holidaysResult.data ?? []).map((row) => mapHoliday(row as Record<string, unknown>)),
  };
}

export async function persistEmployee(employee: Employee): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("employees").upsert({
    id: employee.id,
    display_name: employee.name,
    job_title: employee.jobTitle,
    active: employee.active,
  });
  if (error) throw error;
}

export async function removeEmployee(employeeId: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("delete_employee", { p_employee_id: employeeId });
  if (error) throw error;
}

function shiftRows(week: ScheduleWeek) {
  return week.shifts.map((shift) => ({
    schedule_week_id: week.id,
    employee_id: shift.employeeId,
    shift_date: shift.date,
    status: shift.status,
    start_time: shift.startTime,
    end_time: shift.endTime,
  }));
}

export async function persistDraftWeek(week: ScheduleWeek): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error: weekError } = await supabase.from("schedule_weeks").upsert({
    id: week.id,
    starts_on: week.startDate,
    ends_on: week.endDate,
    status: "draft",
    published_at: null,
  });
  if (weekError) throw weekError;
  const { error: deleteError } = await supabase.from("shifts").delete().eq("schedule_week_id", week.id);
  if (deleteError) throw deleteError;
  if (week.shifts.length) {
    const { error: shiftsError } = await supabase.from("shifts").insert(shiftRows(week));
    if (shiftsError) throw shiftsError;
  }
}

export async function publishWeek(week: ScheduleWeek): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.rpc("publish_schedule", {
    p_schedule_id: week.id,
    p_starts_on: week.startDate,
    p_ends_on: week.endDate,
    p_shifts: shiftRows(week),
  });
  if (error) throw error;
}

export async function persistHoliday(holiday: Holiday): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("holidays").upsert({
    id: holiday.id,
    holiday_date: holiday.date,
    name: holiday.name,
  });
  if (error) throw error;
}

export async function removeHoliday(id: string): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) return;
  const { error } = await supabase.from("holidays").delete().eq("id", id);
  if (error) throw error;
}
