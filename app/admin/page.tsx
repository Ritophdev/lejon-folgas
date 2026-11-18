"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowLeft, CalendarDays, Check, Copy, Download, Eye, EyeOff, LogOut, Plus, Printer, Save, Search, ShieldCheck, Sun, Trash2, Users, X } from "lucide-react";
import { dateAtDay, dayIndexInWeek, formatFullDate, formatWeekRange, mondayOf, parseLocalDate, shiftDate, SHORT_WEEKDAYS, toIsoDate, WEEKDAYS } from "@/lib/dates";
import { DEMO_ADMIN_KEY, makeBlankWeek, readDemoState, SELECTED_EMPLOYEE_KEY, writeDemoState } from "@/lib/demo-data";
import { getSupabase, loadAdminData, persistDraftWeek, persistEmployee, persistHoliday, publishWeek, removeEmployee as deleteEmployeeRecord, removeHoliday, supabaseConfigState } from "@/lib/supabase";
import type { DemoState, Employee, Holiday, ScheduleWeek, WeekAssignmentDraft } from "@/lib/types";

type AdminTab = "weeks" | "employees" | "holidays";

function LejonMark() {
  return <Link href="/" className="brand-mark" aria-label="Voltar para o portal"><span className="brand-lejon">LEJON</span><span className="brand-folgas">FOLGAS</span></Link>;
}

function defaultAssignments(employees: Employee[], week?: ScheduleWeek): WeekAssignmentDraft[] {
  return employees.filter((employee) => employee.active).map((employee, index) => {
    const shifts = week?.shifts.filter((shift) => shift.employeeId === employee.id) ?? [];
    const offDays = shifts.filter((shift) => shift.status === "off").map((shift) => dayIndexInWeek(shift.date));
    const work = shifts.find((shift) => shift.status === "work" && shift.startTime && shift.endTime);
    return {
      employeeId: employee.id,
      offDays,
      startTime: work?.startTime ?? "",
      endTime: work?.endTime ?? "",
    };
  });
}

function makeWeekWithAssignments(week: ScheduleWeek, startDate: string, assignments: WeekAssignmentDraft[], status = week.status): ScheduleWeek {
  const endDate = toIsoDate(shiftDate(parseLocalDate(startDate), 6));
  const shifts = assignments.flatMap((assignment) => Array.from({ length: 7 }, (_, day) => {
    const off = assignment.offDays.includes(day);
    return {
      id: `${week.id}-${assignment.employeeId}-${dateAtDay(startDate, day)}`,
      weekId: week.id,
      employeeId: assignment.employeeId,
      date: dateAtDay(startDate, day),
      status: off ? "off" as const : "work" as const,
      startTime: off ? null : assignment.startTime,
      endTime: off ? null : assignment.endTime,
    };
  }));
  return { ...week, startDate, endDate, status, shifts, publishedAt: status === "published" ? new Date().toISOString() : week.publishedAt };
}

function statusLabel(status: ScheduleWeek["status"]) {
  return <span className={`status-label ${status === "published" ? "status-published" : "status-draft"}`}>{status === "published" ? "Publicada" : "Rascunho"}</span>;
}

function friendlyFailure() {
  return "Não foi possível concluir agora. Confira sua conexão e tente novamente.";
}

function normalizeSearch(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
}

function numericDate(value: string) {
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function exportDayTitle(value: string) {
  const date = parseLocalDate(value);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(date).toLocaleUpperCase("pt-BR");
  return `${weekday} (${numericDate(value).slice(0, 5)})`;
}

function scheduleExportRows(week: ScheduleWeek, data: DemoState) {
  const idsInWeek = new Set(week.shifts.map((shift) => shift.employeeId));
  const employees = data.employees
    .filter((employee) => employee.active || idsInWeek.has(employee.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  const dates = Array.from({ length: 7 }, (_, index) => dateAtDay(week.startDate, index));
  const holidayNamesByDate = new Map<string, string[]>();
  data.holidays.forEach((holiday) => {
    if (!holidayNamesByDate.has(holiday.date)) holidayNamesByDate.set(holiday.date, []);
    holidayNamesByDate.get(holiday.date)?.push(holiday.name);
  });
  const rows = employees.map((employee) => {
    const shifts = dates.map((date) => week.shifts.find((shift) => shift.employeeId === employee.id && shift.date === date));
    const firstWorkShift = shifts.find((shift) => shift?.status === "work" && shift.startTime && shift.endTime);
    const hours = firstWorkShift?.startTime && firstWorkShift.endTime ? `${firstWorkShift.startTime} às ${firstWorkShift.endTime}` : "Não informado";
    const days = shifts.map((shift, index) => {
      const holidayNames = holidayNamesByDate.get(dates[index]) ?? [];
      const state = shift?.status === "off" ? "FOLGA" : shift?.status === "work" ? "TRABALHO" : "SEM ESCALA";
      return {
        state,
        holidayNames,
        text: holidayNames.length ? `FERIADO: ${holidayNames.join(", ")} · ${state}` : state,
      };
    });
    return { employee, hours, days };
  });
  return { dates, rows };
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function downloadScheduleCsv(week: ScheduleWeek, data: DemoState) {
  const { dates, rows } = scheduleExportRows(week, data);
  const title = `ESCALA DE FOLGAS — ${numericDate(week.startDate)} A ${numericDate(week.endDate)}`;
  const matrix = [
    [title],
    ["COLABORADOR", "CARGO", "HORÁRIO HABITUAL", ...dates.map(exportDayTitle)],
    ...rows.map(({ employee, hours, days }) => [employee.name, employee.jobTitle, hours, ...days.map((day) => day.text)]),
  ];
  const csv = `\uFEFF${matrix.map((row) => row.map(csvCell).join(";")).join("\r\n")}`;
  const file = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(file);
  const link = document.createElement("a");
  link.href = url;
  link.download = `escala-de-folgas-${week.startDate}-${week.endDate}.csv`;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? character);
}

function printSchedule(week: ScheduleWeek, data: DemoState) {
  const popup = window.open("", "_blank");
  if (!popup) return false;
  const { dates, rows } = scheduleExportRows(week, data);
  const title = `ESCALA DE FOLGAS — ${numericDate(week.startDate)} A ${numericDate(week.endDate)}`;
  const headers = dates.map((date) => `<th>${escapeHtml(exportDayTitle(date))}</th>`).join("");
  const body = rows.map(({ employee, hours, days }) => {
    const cells = days.map((day) => {
      const className = day.holidayNames.length ? "holiday" : day.state === "FOLGA" ? "off" : day.state === "TRABALHO" ? "work" : "missing";
      const holiday = day.holidayNames.length ? `<small>FERIADO · ${escapeHtml(day.holidayNames.join(", "))}</small>` : "";
      return `<td class="${className}">${holiday}<strong>${escapeHtml(day.state)}</strong></td>`;
    }).join("");
    return `<tr><td class="employee">${escapeHtml(employee.name)}</td><td class="job-title">${escapeHtml(employee.jobTitle)}</td><td>${escapeHtml(hours)}</td>${cells}</tr>`;
  }).join("");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>
    @page{size:A4 landscape;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#142653;margin:0}header{display:flex;align-items:end;justify-content:space-between;margin-bottom:16px;border-bottom:3px solid #2D348B;padding-bottom:10px}.brand{font-size:19px;font-weight:900;letter-spacing:-1px}.brand span{color:#F0811E}h1{margin:0;font-size:19px;text-align:right}header p{margin:4px 0 0;color:#667085;font-size:11px;text-align:right}table{width:100%;border-collapse:collapse;table-layout:fixed}th,td{border:1px solid #c9ced9;padding:7px 5px;text-align:center;font-size:8px;overflow-wrap:anywhere}th{background:#142653;color:#fff;font-size:8px;text-transform:uppercase}th:first-child,td:first-child{width:15%;text-align:left}th:nth-child(2),td:nth-child(2){width:16%;text-align:left}th:nth-child(3),td:nth-child(3){width:10%}td.employee{font-weight:700}td.job-title{color:#536078;font-size:7.5px}.work{background:#f0f7f2;color:#255f43}.off{background:#fff2e5;color:#b65e11;font-weight:800}.holiday{background:#eef0ff;color:#2D348B}.missing{background:#f7f7f8;color:#707784}.holiday small{display:block;margin-bottom:3px;font-size:7px;font-weight:700}.holiday strong{display:block}.legend{display:flex;gap:16px;margin-top:12px;color:#5e6678;font-size:9px}.legend b{color:#142653}tr{break-inside:avoid}footer{margin-top:12px;color:#7b808d;font-size:8px}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body><header><div class="brand">LEJON <span>FOLGAS</span></div><div><h1>${escapeHtml(title)}</h1><p>Lejon Atacarejo · Maringá</p></div></header><table><thead><tr><th>Colaborador</th><th>Cargo</th><th>Horário habitual</th>${headers}</tr></thead><tbody>${body}</tbody></table><div class="legend"><span><b>TRABALHO</b> · dia de trabalho</span><span><b>FOLGA</b> · descanso previsto</span><span><b>FERIADO</b> · indicado separadamente da escala</span></div><footer>Escala administrativa · Dados conforme a versão selecionada no portal</footer></body></html>`;
  popup.document.open();
  popup.document.write(html);
  popup.document.close();
  window.setTimeout(() => { popup.focus(); popup.print(); }, 350);
  return true;
}

export default function AdminPage() {
  const [config, setConfig] = useState<"demo" | "configured" | "incomplete">("demo");
  const [checking, setChecking] = useState(true);
  const [authorized, setAuthorized] = useState(false);
  const [denied, setDenied] = useState(false);
  const [email, setEmail] = useState("rh@lejon.demo");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [busy, setBusy] = useState(false);
  const [data, setData] = useState<DemoState | null>(null);
  const [tab, setTab] = useState<AdminTab>("weeks");
  const [activeWeekId, setActiveWeekId] = useState("");
  const [weekStart, setWeekStart] = useState("");
  const [assignments, setAssignments] = useState<WeekAssignmentDraft[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState("");
  const [assignmentSearch, setAssignmentSearch] = useState("");
  const [activeEmployeeEdits, setActiveEmployeeEdits] = useState<Record<string, Employee>>({});
  const [newEmployeeName, setNewEmployeeName] = useState("");
  const [newEmployeeJobTitle, setNewEmployeeJobTitle] = useState("");
  const [newHolidayDate, setNewHolidayDate] = useState("");
  const [newHolidayName, setNewHolidayName] = useState("");
  const [message, setMessage] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [reviewWeek, setReviewWeek] = useState<ScheduleWeek | null>(null);

  const verifyAndLoad = useCallback(async (sessionUserId: string): Promise<boolean> => {
    const supabase = getSupabase();
    if (!supabase) return false;
    const { data: adminRow, error } = await supabase.from("admin_users").select("user_id, role").eq("user_id", sessionUserId).maybeSingle();
    if (error || !adminRow) {
      setAuthorized(false);
      setDenied(true);
      setChecking(false);
      return false;
    }
    try {
      const loaded = await loadAdminData();
      setData(loaded);
      const chosenWeek = loaded.weeks[0] ?? null;
      setActiveWeekId(chosenWeek?.id ?? "");
      if (chosenWeek) {
        setWeekStart(chosenWeek.startDate);
        setAssignments(defaultAssignments(loaded.employees, chosenWeek));
      }
      setAuthorized(true);
      setDenied(false);
      setLoginError("");
      setChecking(false);
      return true;
    } catch {
      setErrorMessage(friendlyFailure());
      setChecking(false);
      return false;
    }
  }, []);

  useEffect(() => {
    const currentConfig = supabaseConfigState();
    setConfig(currentConfig);
    if (currentConfig === "demo") {
      if (window.localStorage.getItem(DEMO_ADMIN_KEY) === "true") {
        const loaded = readDemoState();
        setData(loaded);
        setActiveWeekId(loaded.weeks[0]?.id ?? "");
        if (loaded.weeks[0]) {
          setWeekStart(loaded.weeks[0].startDate);
          setAssignments(defaultAssignments(loaded.employees, loaded.weeks[0]));
        }
        setAuthorized(true);
      }
      setChecking(false);
      return;
    }
    if (currentConfig === "incomplete") {
      setChecking(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setChecking(false);
      return;
    }
    let mounted = true;
    void supabase.auth.getSession().then(({ data: result }) => {
      if (!mounted) return;
      if (result.session?.user) void verifyAndLoad(result.session.user.id);
      else setChecking(false);
    }).catch(() => setChecking(false));
    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "SIGNED_OUT" || !session?.user) {
        setAuthorized(false);
        setData(null);
        setDenied(false);
        setChecking(false);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        window.setTimeout(() => { if (mounted) void verifyAndLoad(session.user.id); }, 0);
      }
    });
    return () => {
      mounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [verifyAndLoad]);

  const weeks = useMemo(() => [...(data?.weeks ?? [])].sort((a, b) => b.startDate.localeCompare(a.startDate)), [data?.weeks]);
  const activeWeek = weeks.find((week) => week.id === activeWeekId) ?? null;
  const activeEmployees = useMemo(() => (data?.employees ?? []).filter((employee) => employee.active), [data?.employees]);
  const previousWeek = useMemo(() => {
    if (!weekStart) return null;
    return weeks
      .filter((week) => week.id !== activeWeekId && week.startDate < weekStart)
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0] ?? null;
  }, [weeks, activeWeekId, weekStart]);
  const previousWeekHours = useMemo(() => {
    if (!previousWeek) return new Map<string, { startTime: string; endTime: string }>();
    return new Map(defaultAssignments(activeEmployees, previousWeek)
      .filter((assignment) => assignment.startTime && assignment.endTime)
      .map((assignment) => [assignment.employeeId, { startTime: assignment.startTime, endTime: assignment.endTime }]));
  }, [activeEmployees, previousWeek]);
  const visibleEmployees = useMemo(() => {
    const query = normalizeSearch(employeeSearch);
    return (data?.employees ?? []).filter((employee) => normalizeSearch(`${employee.name} ${employee.jobTitle}`).includes(query));
  }, [data?.employees, employeeSearch]);
  const visibleAssignmentEmployees = useMemo(() => {
    const query = normalizeSearch(assignmentSearch);
    return activeEmployees.filter((employee) => normalizeSearch(`${employee.name} ${employee.jobTitle}`).includes(query));
  }, [activeEmployees, assignmentSearch]);

  useEffect(() => {
    if (!activeWeek) {
      setWeekStart("");
      setAssignments(data ? defaultAssignments(data.employees) : []);
      return;
    }
    setWeekStart(activeWeek.startDate);
    setAssignments(defaultAssignments(data?.employees ?? [], activeWeek));
  }, [activeWeekId]);

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginError("");
    setBusy(true);
    if (config === "demo") {
      if (email.trim().toLowerCase() === "rh@lejon.demo" && password === "lejon2026") {
        window.localStorage.setItem(DEMO_ADMIN_KEY, "true");
        const loaded = readDemoState();
        setData(loaded);
        setActiveWeekId(loaded.weeks[0]?.id ?? "");
        if (loaded.weeks[0]) {
          setWeekStart(loaded.weeks[0].startDate);
          setAssignments(defaultAssignments(loaded.employees, loaded.weeks[0]));
        }
        setAuthorized(true);
        setDenied(false);
      } else setLoginError("E-mail ou senha incorretos. Use os dados de demonstração indicados abaixo.");
      setBusy(false);
      return;
    }
    const supabase = getSupabase();
    if (!supabase) {
      setLoginError("A configuração do Supabase está incompleta.");
      setBusy(false);
      return;
    }
    const { data: result, error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (error || !result.user) setLoginError("Não foi possível entrar. Confira suas credenciais.");
    else {
      const accepted = await verifyAndLoad(result.user.id);
      if (!accepted) {
        await supabase.auth.signOut();
        setLoginError("Este usuário não tem autorização para acessar a área administrativa.");
      }
    }
    setBusy(false);
  }

  async function signOut() {
    if (config === "demo") window.localStorage.removeItem(DEMO_ADMIN_KEY);
    else await getSupabase()?.auth.signOut();
    setAuthorized(false);
    setData(null);
    setDenied(false);
  }

  function updateDemo(next: DemoState) {
    setData(next);
    if (config === "demo") writeDemoState(next);
  }

  function beginNewWeek(source?: ScheduleWeek) {
    if (!data) return;
    const lastDate = [...data.weeks].sort((a, b) => a.endDate.localeCompare(b.endDate)).at(-1)?.endDate;
    const start = lastDate ? shiftDate(parseLocalDate(lastDate), 1) : mondayOf(new Date());
    const startDate = toIsoDate(start);
    const blank = makeBlankWeek(startDate);
    const nextAssignments = defaultAssignments(data.employees, source);
    const prepared = source ? makeWeekWithAssignments(blank, startDate, nextAssignments, "draft") : blank;
    updateDemo({ ...data, weeks: [prepared, ...data.weeks] });
    setActiveWeekId(prepared.id);
    setWeekStart(startDate);
    setAssignments(nextAssignments);
    setMessage("");
    setErrorMessage("");
  }

  function copyPreviousWeekHours() {
    if (!previousWeek || previousWeekHours.size === 0) return;
    const copiedCount = assignments.filter((assignment) => previousWeekHours.has(assignment.employeeId)).length;
    if (copiedCount === 0) {
      setMessage("");
      setErrorMessage("Não há colaboradores desta escala com horários na semana anterior.");
      return;
    }
    setAssignments(assignments.map((assignment) => {
      const hours = previousWeekHours.get(assignment.employeeId);
      return hours ? { ...assignment, ...hours } : assignment;
    }));
    setErrorMessage("");
    setMessage(`Horários de ${formatWeekRange(previousWeek.startDate, previousWeek.endDate)} copiados para ${copiedCount} colaboradores. As folgas foram mantidas.`);
  }

  function buildCurrentWeek(status?: ScheduleWeek["status"]): ScheduleWeek | null {
    if (!activeWeek || !weekStart) return null;
    if (dayIndexInWeek(weekStart) !== 0) {
      setErrorMessage("A semana precisa começar em uma segunda-feira.");
      return null;
    }
    if (assignments.length !== activeEmployees.length || assignments.some((assignment) => assignment.offDays.length === 0 || !assignment.startTime || !assignment.endTime || assignment.startTime >= assignment.endTime)) {
      setErrorMessage("Defina ao menos um dia de folga e confira os horários antes de continuar.");
      return null;
    }
    setErrorMessage("");
    return makeWeekWithAssignments(activeWeek, weekStart, assignments, status ?? activeWeek.status);
  }

  async function saveDraft() {
    const result = buildCurrentWeek("draft");
    if (!result || !data) return;
    setBusy(true);
    setMessage("");
    try {
      await persistDraftWeek(result);
      const next = { ...data, weeks: data.weeks.map((week) => week.id === result.id ? result : week) };
      updateDemo(next);
      setMessage("Rascunho salvo. Ele continua visível somente para o RH.");
    } catch {
      setErrorMessage(friendlyFailure());
    } finally {
      setBusy(false);
    }
  }

  function openReview() {
    const result = buildCurrentWeek(activeWeek?.status ?? "draft");
    if (!result) return;
    if (activeEmployees.length === 0) {
      setErrorMessage("Cadastre ou ative ao menos um colaborador antes de publicar.");
      return;
    }
    setReviewWeek(result);
  }

  function downloadCurrentSchedule() {
    if (!activeWeek || !data) return;
    const current = buildCurrentWeek(activeWeek.status);
    if (current) downloadScheduleCsv(current, data);
  }

  function printCurrentSchedule() {
    if (!activeWeek || !data) return;
    const current = buildCurrentWeek(activeWeek.status);
    if (current && !printSchedule(current, data)) setErrorMessage("Permita a abertura de pop-ups para imprimir ou salvar a escala em PDF.");
  }

  async function confirmPublish() {
    if (!reviewWeek || !data) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await publishWeek(reviewWeek);
      const published = { ...reviewWeek, status: "published" as const, publishedAt: new Date().toISOString() };
      let next: DemoState = { ...data, weeks: data.weeks.map((week) => week.id === published.id ? published : week) };
      if (config === "configured") next = await loadAdminData();
      updateDemo(next);
      setReviewWeek(null);
      setMessage("Escala publicada. Os colaboradores já podem consultar as alterações.");
    } catch {
      setErrorMessage(friendlyFailure());
    } finally {
      setBusy(false);
    }
  }

  async function saveEmployee(employee: Employee) {
    if (!data || employee.name.trim().length < 2 || employee.jobTitle.trim().length < 2) return;
    setBusy(true);
    setMessage("");
    try {
      const normalizedEmployee = { ...employee, name: employee.name.trim(), jobTitle: employee.jobTitle.trim() };
      await persistEmployee(normalizedEmployee);
      updateDemo({ ...data, employees: data.employees.map((item) => item.id === normalizedEmployee.id ? normalizedEmployee : item) });
      setAssignments((current) => {
        if (!normalizedEmployee.active) return current.filter((item) => item.employeeId !== normalizedEmployee.id);
        if (current.some((item) => item.employeeId === normalizedEmployee.id)) return current;
        return [...current, ...defaultAssignments([normalizedEmployee])];
      });
      setActiveEmployeeEdits((current) => { const next = { ...current }; delete next[normalizedEmployee.id]; return next; });
      setMessage("Cadastro do colaborador atualizado.");
    } catch {
      setErrorMessage(friendlyFailure());
    } finally {
      setBusy(false);
    }
  }

  async function addEmployee(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || newEmployeeName.trim().length < 2 || newEmployeeJobTitle.trim().length < 2) return;
    const employee: Employee = { id: config === "demo" ? `demo-${crypto.randomUUID()}` : crypto.randomUUID(), name: newEmployeeName.trim(), jobTitle: newEmployeeJobTitle.trim(), active: true };
    setBusy(true);
    try {
      await persistEmployee(employee);
      updateDemo({ ...data, employees: [...data.employees, employee] });
      setAssignments((current) => [...current, ...defaultAssignments([employee])]);
      setNewEmployeeName("");
      setNewEmployeeJobTitle("");
      setMessage("Colaborador cadastrado.");
    } catch {
      setErrorMessage(friendlyFailure());
    } finally {
      setBusy(false);
    }
  }

  async function deleteEmployee(employee: Employee) {
    const accepted = window.confirm(`Excluir ${employee.name} (${employee.jobTitle})? Esta ação também removerá as folgas dessa pessoa das escalas antigas e publicadas.`);
    if (!accepted || !data) return;
    setBusy(true);
    setMessage("");
    setErrorMessage("");
    try {
      await deleteEmployeeRecord(employee.id);
      updateDemo({
        ...data,
        employees: data.employees.filter((item) => item.id !== employee.id),
        weeks: data.weeks.map((week) => ({ ...week, shifts: week.shifts.filter((shift) => shift.employeeId !== employee.id) })),
      });
      setAssignments((current) => current.filter((assignment) => assignment.employeeId !== employee.id));
      setActiveEmployeeEdits((current) => { const next = { ...current }; delete next[employee.id]; return next; });
      if (window.localStorage.getItem(SELECTED_EMPLOYEE_KEY) === employee.id) window.localStorage.removeItem(SELECTED_EMPLOYEE_KEY);
      setMessage("Colaborador excluído. As escalas também foram atualizadas.");
    } catch {
      setErrorMessage(friendlyFailure());
    } finally {
      setBusy(false);
    }
  }

  async function addHoliday(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!data || !newHolidayDate || newHolidayName.trim().length < 2) return;
    const holiday: Holiday = { id: config === "demo" ? `demo-holiday-${crypto.randomUUID()}` : crypto.randomUUID(), date: newHolidayDate, name: newHolidayName.trim() };
    setBusy(true);
    try {
      await persistHoliday(holiday);
      updateDemo({ ...data, holidays: [...data.holidays, holiday].sort((a, b) => a.date.localeCompare(b.date)) });
      setNewHolidayDate("");
      setNewHolidayName("");
      setMessage("Feriado cadastrado.");
    } catch {
      setErrorMessage(friendlyFailure());
    } finally {
      setBusy(false);
    }
  }

  async function saveHoliday(holiday: Holiday) {
    if (!data) return;
    setBusy(true);
    try {
      await persistHoliday(holiday);
      updateDemo({ ...data, holidays: data.holidays.map((item) => item.id === holiday.id ? holiday : item) });
      setMessage("Feriado atualizado.");
    } catch {
      setErrorMessage(friendlyFailure());
    } finally {
      setBusy(false);
    }
  }

  async function deleteHoliday(id: string) {
    if (!data) return;
    setBusy(true);
    try {
      await removeHoliday(id);
      updateDemo({ ...data, holidays: data.holidays.filter((holiday) => holiday.id !== id) });
      setMessage("Feriado removido.");
    } catch {
      setErrorMessage(friendlyFailure());
    } finally {
      setBusy(false);
    }
  }

  if (checking) {
    return <main className="admin-page"><div className="admin-topbar"><LejonMark /><Link href="/" className="admin-back-link"><ArrowLeft size={16} /> Portal do colaborador</Link></div><div className="loading-row"><span className="spinner" /> Verificando acesso...</div></main>;
  }

  if (config === "incomplete") {
    return <main className="admin-page"><div className="admin-topbar"><LejonMark /><Link href="/" className="admin-back-link"><ArrowLeft size={16} /> Portal do colaborador</Link></div><div className="login-card"><h1>Configuração incompleta</h1><p>Defina <code>NEXT_PUBLIC_SUPABASE_URL</code> e <code>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> no arquivo <code>.env.local</code>.</p></div></main>;
  }

  if (!authorized) {
    return (
      <main className="admin-page">
        <div className="admin-topbar"><LejonMark /><Link href="/" className="admin-back-link"><ArrowLeft size={16} /> Portal do colaborador</Link></div>
        <section className="login-card">
          <h1>Acesso administrativo</h1>
          <p>{config === "demo" ? "Entre no modo de demonstração para administrar colaboradores e escalas." : "Área restrita ao Recursos Humanos e responsáveis autorizados."}</p>
          {denied && <p className="form-error">Este usuário não está autorizado. Solicite ao administrador do Supabase a liberação do seu acesso.</p>}
          <form className="login-form" onSubmit={signIn}>
            <label className="form-label">E-mail<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="username" required /></label>
            <label className="form-label">Senha<div className="password-input-wrap"><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" className="password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"} aria-pressed={showPassword} title={showPassword ? "Ocultar senha" : "Mostrar senha"}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>
            {loginError && <p className="form-error" role="alert">{loginError}</p>}
            <button type="submit" className="publish-button" disabled={busy}><ShieldCheck size={17} /> {busy ? "Verificando..." : "Entrar"}</button>
          </form>
          {config === "demo" && <div className="demo-credentials"><strong>Acesso de demonstração</strong><br />E-mail: rh@lejon.demo<br />Senha: lejon2026</div>}
          <Link href="/" className="login-back"><ArrowLeft size={15} /> Voltar ao portal do colaborador</Link>
        </section>
      </main>
    );
  }

  if (!data) {
    return <main className="admin-page"><div className="admin-topbar"><LejonMark /><button onClick={() => void signOut()}><LogOut size={16} /> Sair</button></div><div className="admin-content"><p className="form-error">{errorMessage || "Não foi possível carregar os dados administrativos."}</p><button className="secondary-button" onClick={() => window.location.reload()}>Tentar novamente</button></div></main>;
  }

  return (
    <main className="admin-page">
      <div className="admin-topbar">
        <LejonMark />
        <div className="admin-topbar-meta">
          {config === "demo" && <span>Modo demonstração</span>}
          <Link href="/"><ArrowLeft size={15} /> Portal</Link>
          <button type="button" onClick={() => void signOut()}><LogOut size={15} /> Sair</button>
        </div>
      </div>
      <div className="admin-content">
        <div className="admin-title">
          <div><span className="eyebrow">Lejon Atacarejo · Maringá</span><h1>Área administrativa</h1><p>Organize as escalas e deixe as informações prontas para consulta.</p></div>
        </div>

        <div className="admin-tabs" role="tablist" aria-label="Seções administrativas">
          <button type="button" role="tab" aria-selected={tab === "weeks"} className={`admin-tab ${tab === "weeks" ? "is-active" : ""}`} onClick={() => { setTab("weeks"); setMessage(""); setErrorMessage(""); }}><CalendarDays size={16} /> Escalas</button>
          <button type="button" role="tab" aria-selected={tab === "employees"} className={`admin-tab ${tab === "employees" ? "is-active" : ""}`} onClick={() => { setTab("employees"); setMessage(""); setErrorMessage(""); }}><Users size={16} /> Colaboradores</button>
          <button type="button" role="tab" aria-selected={tab === "holidays"} className={`admin-tab ${tab === "holidays" ? "is-active" : ""}`} onClick={() => { setTab("holidays"); setMessage(""); setErrorMessage(""); }}><Sun size={16} /> Feriados</button>
        </div>

        {errorMessage && <p className="form-error" role="alert">{errorMessage}</p>}
        {message && <p className="form-success" role="status">{message}</p>}

        {tab === "weeks" && <div className="admin-layout">
          <aside className="admin-card admin-week-nav">
            <h2 className="admin-side-title">Escalas semanais <span>{weeks.length}</span></h2>
            {weeks.length ? <div className="week-list">
              {weeks.map((week) => <button key={week.id} type="button" className={`week-list-item ${week.id === activeWeekId ? "is-current" : ""}`} onClick={() => { setActiveWeekId(week.id); setMessage(""); setErrorMessage(""); }}>
                <strong>{formatWeekRange(week.startDate, week.endDate)}</strong><span>{statusLabel(week.status)}</span>
              </button>)}
            </div> : <p className="admin-empty-copy">Nenhuma escala cadastrada.</p>}
            <div className="week-actions">
              <button type="button" className="small-button primary-mini" onClick={() => beginNewWeek()}><Plus size={15} /> Nova escala</button>
              <button type="button" className="small-button" disabled={!weeks.length} onClick={() => beginNewWeek(weeks[0])}><Copy size={14} /> Duplicar última</button>
              {activeWeek && <>
                <button type="button" className="small-button" onClick={downloadCurrentSchedule}><Download size={14} /> Baixar tabela CSV</button>
                <button type="button" className="small-button" onClick={printCurrentSchedule}><Printer size={14} /> Imprimir / salvar PDF</button>
              </>}
            </div>
          </aside>

          <section className="admin-card">
            {activeWeek ? <div className="week-form">
              <div className="week-form-top">
                <div><h2>{activeWeek.status === "published" ? "Revisar escala publicada" : "Montar escala semanal"}</h2><p>{activeWeek.status === "published" ? "A versão atual continua disponível até você publicar a atualização." : "Escolha uma folga e o horário habitual de cada colaborador."}</p></div>
                <label className="form-label week-date-control">Início da semana<input type="date" value={weekStart} onChange={(event) => setWeekStart(event.target.value)} /></label>
              </div>
              <div className="assignment-list">
                <div className="assignment-tools">
                  <div className="admin-search-row assignment-search-row">
                    <label className="admin-search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Buscar colaborador na escala por nome ou cargo</span><input type="search" value={assignmentSearch} onChange={(event) => setAssignmentSearch(event.target.value)} placeholder="Buscar por nome ou cargo nesta escala" /></label>
                    <span className="search-result-count">{visibleAssignmentEmployees.length}/{activeEmployees.length}</span>
                  </div>
                  <button
                    type="button"
                    className="small-button copy-hours-button"
                    onClick={copyPreviousWeekHours}
                    disabled={busy || previousWeekHours.size === 0}
                    title={previousWeekHours.size > 0 ? `Usar os horários de ${formatWeekRange(previousWeek!.startDate, previousWeek!.endDate)}` : "Não há horários cadastrados na semana anterior"}
                  ><Copy size={14} /> Copiar horários da semana anterior</button>
                </div>
                {visibleAssignmentEmployees.map((employee) => {
                  const assignment = assignments.find((item) => item.employeeId === employee.id) ?? { employeeId: employee.id, offDays: [], startTime: "", endTime: "" };
                  return <div className="assignment-row" key={employee.id}>
                    <div className="assignment-name"><span className="assignment-avatar">{employee.name.slice(0, 1)}</span><span className="assignment-person"><strong>{employee.name}</strong><small>{employee.jobTitle}</small></span></div>
                    <div className="off-days-field">
                      <span className="off-days-label">Dia(s) de folga</span>
                      <div className="weekday-pills" role="group" aria-label={`Dias de folga de ${employee.name}`}>
                        {WEEKDAYS.map((day, index) => {
                          const selectedDay = assignment.offDays.includes(index);
                          return <button key={day} type="button" className={`weekday-pill ${selectedDay ? "is-selected" : ""}`} aria-pressed={selectedDay} title={day} onClick={() => setAssignments((current) => current.map((item) => item.employeeId === employee.id ? { ...item, offDays: selectedDay ? item.offDays.filter((offDay) => offDay !== index) : [...item.offDays, index].sort((a, b) => a - b) } : item))}>{SHORT_WEEKDAYS[index]}</button>;
                        })}
                      </div>
                    </div>
                    <label className="form-label">Entrada<input type="time" value={assignment.startTime} onChange={(event) => setAssignments((current) => current.map((item) => item.employeeId === employee.id ? { ...item, startTime: event.target.value } : item))} /></label>
                    <label className="form-label">Saída<input type="time" value={assignment.endTime} onChange={(event) => setAssignments((current) => current.map((item) => item.employeeId === employee.id ? { ...item, endTime: event.target.value } : item))} /></label>
                  </div>;
                })}
                {activeEmployees.length === 0 && <p className="admin-empty-copy">Ative um colaborador para incluí-lo na escala.</p>}
                {activeEmployees.length > 0 && visibleAssignmentEmployees.length === 0 && <p className="admin-empty-copy">Nenhum colaborador encontrado com esse nome ou cargo.</p>}
              </div>
              <div className="admin-footer-actions">
                <p>{activeEmployees.length} colaboradores ativos · defina as folgas de cada pessoa</p>
                <div>
                  {activeWeek.status === "draft" && <button type="button" className="secondary-button" disabled={busy} onClick={() => void saveDraft()}><Save size={15} /> Salvar rascunho</button>}
                  <button type="button" className="publish-button" disabled={busy || activeEmployees.length === 0} onClick={openReview}><Check size={16} /> Revisar e publicar</button>
                </div>
              </div>
            </div> : <div className="empty-admin-state"><CalendarDays size={31} /><h2>Comece uma escala</h2><p>Crie uma semana nova ou duplique a última escala publicada.</p><button type="button" className="publish-button" onClick={() => beginNewWeek()}><Plus size={16} /> Criar escala</button></div>}
          </section>
        </div>}

        {tab === "employees" && <section className="admin-card">
          <div className="admin-card-title"><div>Cadastro de colaboradores<p>Nome, cargo e situação aparecem nas escalas e consultas.</p></div><span className="status-label status-published">{data.employees.filter((item) => item.active).length} ativos</span></div>
          <form className="employee-form" onSubmit={(event) => void addEmployee(event)}>
            <label className="form-label">Nome do colaborador<input value={newEmployeeName} onChange={(event) => setNewEmployeeName(event.target.value)} placeholder="Digite o nome completo" minLength={2} maxLength={120} required /></label>
            <label className="form-label">Cargo<input value={newEmployeeJobTitle} onChange={(event) => setNewEmployeeJobTitle(event.target.value)} placeholder="Ex.: Operador de loja" minLength={2} maxLength={80} required /></label>
            <button type="submit" className="publish-button" disabled={busy || newEmployeeName.trim().length < 2 || newEmployeeJobTitle.trim().length < 2}><Plus size={16} /> Cadastrar</button>
          </form>
          <div className="admin-search-row employee-search-row">
            <label className="admin-search-field"><Search size={16} aria-hidden="true" /><span className="sr-only">Buscar colaborador por nome ou cargo</span><input type="search" value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} placeholder="Buscar colaborador por nome ou cargo" /></label>
            <span className="search-result-count">{visibleEmployees.length}/{data.employees.length}</span>
          </div>
          <div className="employee-list">
            {visibleEmployees.map((employee) => {
              const edited = activeEmployeeEdits[employee.id] ?? employee;
              return <div className="employee-admin-row" key={employee.id}>
                <label className="employee-admin-field"><span>Nome</span><input maxLength={120} value={edited.name} onChange={(event) => setActiveEmployeeEdits((current) => ({ ...current, [employee.id]: { ...edited, name: event.target.value } }))} /></label>
                <label className="employee-admin-field"><span>Cargo</span><input maxLength={80} value={edited.jobTitle} onChange={(event) => setActiveEmployeeEdits((current) => ({ ...current, [employee.id]: { ...edited, jobTitle: event.target.value } }))} /></label>
                <label className="active-toggle"><input type="checkbox" checked={edited.active} onChange={(event) => setActiveEmployeeEdits((current) => ({ ...current, [employee.id]: { ...edited, active: event.target.checked } }))} /> Ativo</label>
                <div className="employee-admin-actions">
                  <button type="button" className="small-button" disabled={busy || edited.name.trim().length < 2 || edited.jobTitle.trim().length < 2} onClick={() => { void saveEmployee(edited); }}><Save size={14} /> Salvar</button>
                  <button type="button" className="danger-quiet employee-delete-button" aria-label={`Excluir ${employee.name}`} disabled={busy} onClick={() => void deleteEmployee(employee)}><Trash2 size={14} /><span>Excluir</span></button>
                </div>
              </div>;
            })}
            {visibleEmployees.length === 0 && <p className="admin-empty-copy">Nenhum colaborador encontrado.</p>}
          </div>
        </section>}

        {tab === "holidays" && <section className="admin-card">
          <div className="admin-card-title"><div>Feriados cadastrados<p>O feriado aparece separado da folga e não altera a escala automaticamente.</p></div></div>
          <form className="holiday-form" onSubmit={(event) => void addHoliday(event)}>
            <label className="form-label">Data<input type="date" value={newHolidayDate} onChange={(event) => setNewHolidayDate(event.target.value)} required /></label>
            <label className="form-label">Nome do feriado<input value={newHolidayName} onChange={(event) => setNewHolidayName(event.target.value)} placeholder="Ex.: Feriado municipal" minLength={2} required /></label>
            <button type="submit" className="publish-button" disabled={busy}><Plus size={15} /> Cadastrar feriado</button>
          </form>
          {data.holidays.length ? <div className="table-scroll"><table className="holiday-table"><thead><tr><th>Data</th><th>Feriado</th><th>Ações</th></tr></thead><tbody>
            {[...data.holidays].sort((a, b) => a.date.localeCompare(b.date)).map((holiday) => <HolidayRow key={holiday.id} holiday={holiday} busy={busy} onSave={saveHoliday} onDelete={deleteHoliday} />)}
          </tbody></table></div> : <p className="admin-empty-copy">Nenhum feriado cadastrado.</p>}
        </section>}
      </div>

      {reviewWeek && <div className="review-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) setReviewWeek(null); }}>
        <section className="review-dialog" role="dialog" aria-modal="true" aria-labelledby="review-title">
          <div className="review-dialog-head"><div><h2 id="review-title">Revisar escala</h2><p>Semana de {formatWeekRange(reviewWeek.startDate, reviewWeek.endDate)}</p></div><button type="button" className="review-close" aria-label="Fechar revisão" onClick={() => setReviewWeek(null)} disabled={busy}><X size={17} /></button></div>
          <div className="review-summary">
            {assignments.map((assignment) => {
              const employee = data.employees.find((item) => item.id === assignment.employeeId);
              const offDays = assignment.offDays.map((day) => WEEKDAYS[day]).join(", ");
              return <div className="review-row" key={assignment.employeeId}><span className="review-employee"><strong>{employee?.name ?? "Colaborador"}</strong><small>{employee?.jobTitle ?? "Cargo não informado"}</small></span><span>Folga: {offDays} · {assignment.startTime} às {assignment.endTime}</span></div>;
            })}
          </div>
          {data.holidays.some((holiday) => holiday.date >= reviewWeek.startDate && holiday.date <= toIsoDate(shiftDate(parseLocalDate(weekStart), 6))) && <p className="review-alert">Há feriado nesta semana. Ele permanece como informação separada e não muda automaticamente nenhum dia de folga.</p>}
          <button type="button" className="publish-button" onClick={() => void confirmPublish()} disabled={busy}><Check size={16} /> {busy ? "Publicando..." : "Confirmar publicação"}</button>
        </section>
      </div>}
    </main>
  );
}

function HolidayRow({ holiday, busy, onSave, onDelete }: { holiday: Holiday; busy: boolean; onSave: (holiday: Holiday) => void; onDelete: (id: string) => void }) {
  const [edit, setEdit] = useState(holiday);
  useEffect(() => setEdit(holiday), [holiday]);
  return <tr>
    <td><label><span className="sr-only">Data do feriado</span><input className="table-input table-date-input" type="date" value={edit.date} onChange={(event) => setEdit({ ...edit, date: event.target.value })} /></label></td>
    <td><label><span className="sr-only">Nome do feriado</span><input className="table-input" value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} /></label></td>
    <td><div className="table-actions"><button type="button" className="small-button" disabled={busy} onClick={() => onSave(edit)}><Save size={13} /> Salvar</button><button type="button" className="danger-quiet" aria-label={`Remover ${holiday.name}`} disabled={busy} onClick={() => onDelete(holiday.id)}><Trash2 size={14} /></button></div></td>
  </tr>;
}

