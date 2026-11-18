"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, Check, ChevronDown, Clock3, Download, LockKeyhole, Search, Sun, Umbrella, RefreshCw, X } from "lucide-react";
import { dateAtDay, formatFullDate, formatShortDate, formatWeekRange, parseLocalDate, SHORT_WEEKDAYS, shiftDate, todayIso, toIsoDate } from "@/lib/dates";
import { readDemoState, SELECTED_EMPLOYEE_KEY } from "@/lib/demo-data";
import { withBasePath } from "@/lib/site-path";
import { loadPublishedData, supabaseConfigState } from "@/lib/supabase";
import type { DemoState, Employee, Holiday, ScheduleWeek, Shift } from "@/lib/types";
import PwaRegister from "@/components/pwa-register";

function LejonMark() {
  return (
    <Link href="/" className="brand-mark" aria-label="Lejon Folgas, início">
      <span className="brand-lejon">LEJON</span><span className="brand-folgas">FOLGAS</span>
    </Link>
  );
}

function findUpcomingOff(data: DemoState, employeeId: string): { week: ScheduleWeek; shift: Shift } | null {
  const now = todayIso();
  const ordered = data.weeks
    .filter((week) => week.status === "published")
    .flatMap((week) => week.shifts.filter((shift) => shift.employeeId === employeeId && shift.status === "off" && shift.date >= now).map((shift) => ({ week, shift })))
    .sort((a, b) => a.shift.date.localeCompare(b.shift.date));
  return ordered[0] ?? null;
}

function weekForToday(weeks: ScheduleWeek[]): string {
  const now = todayIso();
  return weeks.find((week) => week.status === "published" && week.startDate <= now && week.endDate >= now)?.id
    ?? weeks.find((week) => week.status === "published" && week.endDate >= now)?.id
    ?? weeks[0]?.id
    ?? "";
}

function calendarDate(value: string): string {
  return value.replaceAll("-", "");
}

function nextCalendarDate(value: string): string {
  return calendarDate(toIsoDate(shiftDate(parseLocalDate(value), 1)));
}

function makeFolgasCalendar(employeeId: string, shifts: Shift[]): string {
  const stamp = new Date().toISOString().replaceAll("-", "").replaceAll(":", "").replace(/\.\d{3}Z$/, "Z");
  const safeEmployeeId = employeeId.replace(/[^a-zA-Z0-9-]/g, "-");
  const events = shifts.map((shift) => [
    "BEGIN:VEVENT",
    `UID:lejon-folgas-${safeEmployeeId}-${calendarDate(shift.date)}@lejonatacarejo.com.br`,
    `DTSTAMP:${stamp}`,
    `DTSTART;VALUE=DATE:${calendarDate(shift.date)}`,
    `DTEND;VALUE=DATE:${nextCalendarDate(shift.date)}`,
    "SUMMARY:Folga - Lejon Atacarejo",
    "DESCRIPTION:Folga conforme escala publicada. Consulte o portal para atualizacoes.",
    "STATUS:CONFIRMED",
    "TRANSP:TRANSPARENT",
    "END:VEVENT",
  ].join("\r\n"));

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Lejon Atacarejo//Folgas//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "X-WR-CALNAME:Minhas folgas - Lejon Atacarejo",
    ...events,
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

function WeekCalendar({ week, employeeId, holidays }: { week: ScheduleWeek; employeeId: string; holidays: Holiday[] }) {
  const holidayByDate = new Map(holidays.map((holiday) => [holiday.date, holiday]));
  const days = Array.from({ length: 7 }, (_, index) => {
    const date = dateAtDay(week.startDate, index);
    const shift = week.shifts.find((item) => item.employeeId === employeeId && item.date === date);
    return { date, index, shift, holiday: holidayByDate.get(date) };
  });
  return (
    <div className="calendar-grid" aria-label={`Calendário da semana de ${formatWeekRange(week.startDate, week.endDate)}`}>
      {days.map(({ date, index, shift, holiday }) => {
        const status = shift?.status ?? "missing";
        return (
          <div key={date} className={`calendar-day ${status === "off" ? "is-off" : status === "work" ? "is-work" : "is-missing"} ${holiday ? "has-holiday" : ""}`}>
            <span className="calendar-weekday">{SHORT_WEEKDAYS[index]}</span>
            <span className="calendar-date">{parseLocalDate(date).getDate()}</span>
            <span className="calendar-state">
              {status === "off" ? <Umbrella size={15} aria-hidden="true" /> : status === "work" ? <Check size={15} aria-hidden="true" /> : <span className="calendar-dot" />}
              <span>{status === "off" ? "Folga" : status === "work" ? "Trabalho" : "Sem escala"}</span>
            </span>
            {holiday && <span className="holiday-tag" title={holiday.name}>Feriado</span>}
          </div>
        );
      })}
    </div>
  );
}

export default function EmployeePortal() {
  const [data, setData] = useState<DemoState>({ employees: [], weeks: [], holidays: [] });
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Employee | null>(null);
  const [selectedWeekId, setSelectedWeekId] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [demoMode, setDemoMode] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [calendarMessage, setCalendarMessage] = useState("");

  const refresh = useCallback(async (quiet = false, employeeId?: string) => {
    const config = supabaseConfigState();
    setDemoMode(config === "demo");
    if (config === "incomplete") {
      setLoadError("A configuração do Supabase está incompleta. Confira as duas variáveis no arquivo .env.local.");
      setData({ employees: [], weeks: [], holidays: [] });
      setIsLoading(false);
      return;
    }
    if (!quiet) setIsLoading(true);
    setLoadError("");
    try {
      const rememberedId = typeof window !== "undefined" ? window.localStorage.getItem(SELECTED_EMPLOYEE_KEY) : null;
      const targetId = employeeId ?? rememberedId ?? undefined;
      const result = config === "configured" ? await loadPublishedData(targetId) : readDemoState();
      setData(result);
      setSelectedWeekId((current) => current && result.weeks.some((week) => week.id === current && week.status === "published") ? current : weekForToday(result.weeks));
      if (typeof window !== "undefined") {
        const savedId = targetId;
        if (savedId) {
          const saved = result.employees.find((employee) => employee.id === savedId && employee.active);
          if (saved) setSelected(saved);
          else {
            window.localStorage.removeItem(SELECTED_EMPLOYEE_KEY);
            setSelected(null);
          }
        }
      }
    } catch (error) {
      setLoadError("Não foi possível carregar a escala agora. Confira sua conexão e tente novamente.");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const onFocus = () => { void refresh(true, selected?.id); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh, selected?.id]);

  const activeEmployees = useMemo(() => data.employees.filter((employee) => employee.active), [data.employees]);
  const matches = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    if (normalized.length < 1) return [];
    return activeEmployees.filter((employee) => employee.name.toLocaleLowerCase("pt-BR").includes(normalized)).slice(0, 5);
  }, [activeEmployees, query]);
  const publishedWeeks = useMemo(() => data.weeks.filter((week) => week.status === "published").sort((a, b) => a.startDate.localeCompare(b.startDate)), [data.weeks]);
  const selectedWeek = publishedWeeks.find((week) => week.id === selectedWeekId) ?? null;
  const upcomingOffShifts = useMemo(() => {
    if (!selected) return [];
    const today = todayIso();
    return publishedWeeks
      .flatMap((week) => week.shifts.filter((shift) => shift.employeeId === selected.id && shift.status === "off" && shift.date >= today))
      .sort((a, b) => a.date.localeCompare(b.date));
  }, [publishedWeeks, selected]);
  const upcomingOff = selected ? findUpcomingOff(data, selected.id) : null;
  const selectedWeekShifts = selected && selectedWeek ? selectedWeek.shifts.filter((shift) => shift.employeeId === selected.id) : [];
  const usualHours = selectedWeekShifts.find((shift) => shift.status === "work" && shift.startTime && shift.endTime)
    ?? (selected ? data.weeks.flatMap((week) => week.shifts).find((shift) => shift.employeeId === selected.id && shift.status === "work" && shift.startTime && shift.endTime) : undefined);
  const weekHolidays = selectedWeek ? data.holidays.filter((holiday) => holiday.date >= selectedWeek.startDate && holiday.date <= selectedWeek.endDate).sort((a, b) => a.date.localeCompare(b.date)) : [];

  function chooseEmployee(employee: Employee) {
    setSelected(employee);
    setCalendarMessage("");
    setQuery(employee.name);
    setSuggestionsOpen(false);
  }

  function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (selected && query.trim() === selected.name) {
      void confirmSelection();
      return;
    }
    if (matches.length === 1) chooseEmployee(matches[0]);
    else if (matches.length > 0) setSuggestionsOpen(true);
  }

  async function confirmSelection() {
    if (!selected) return;
    window.localStorage.setItem(SELECTED_EMPLOYEE_KEY, selected.id);
    setQuery(selected.name);
    if (supabaseConfigState() === "configured") {
      setRefreshing(true);
      await refresh(true, selected.id);
    }
  }

  function changeEmployee() {
    window.localStorage.removeItem(SELECTED_EMPLOYEE_KEY);
    setSelected(null);
    setCalendarMessage("");
    setQuery("");
  }

  async function saveFolgasToPhone() {
    if (!selected || upcomingOffShifts.length === 0) return;
    const fileName = "minhas-folgas-lejon.ics";
    const calendar = makeFolgasCalendar(selected.id, upcomingOffShifts);
    const blob = new Blob([calendar], { type: "text/calendar;charset=utf-8" });

    if (navigator.share && typeof File !== "undefined") {
      const file = new File([blob], fileName, { type: "text/calendar;charset=utf-8" });
      if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ title: "Minhas folgas - Lejon Atacarejo", files: [file] });
        setCalendarMessage("Arquivo compartilhado. Abra-o no celular para adicionar as folgas à agenda.");
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
      }
      }
    }

    const objectUrl = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = fileName;
    link.style.display = "none";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
    setCalendarMessage("Arquivo baixado. Toque nele no celular para adicionar as folgas à agenda.");
  }

  return (
    <main className="portal-shell">
      <PwaRegister />
      <header className="masthead">
        <LejonMark />
        <p>Portal do colaborador</p>
        {demoMode && <span className="demo-ribbon">Demonstração</span>}
      </header>

      <div className="content-wrap">
        {!selected ? (
          <>
            <div className="team-visual">
              <Image
                src={withBasePath("/images/team-illustration-v2.png")}
                alt="Equipe de colaboradores do Lejon reunida para consultar a escala semanal"
                fill
                priority
                sizes="(max-width: 740px) 100vw, 1080px"
                className="team-image"
              />
            </div>
            <section className="welcome-section" aria-labelledby="welcome-title">
            <div className="intro-copy">
              <span className="eyebrow">Sua rotina, mais simples</span>
              <h1 id="welcome-title">Quando é minha folga?</h1>
              <p>Consulte sua escala em segundos.</p>
            </div>
            {loadError ? (
              <div className="notice notice-error" role="alert">
                <span>{loadError}</span>
                <button type="button" className="text-button" onClick={() => void refresh()}>Tentar novamente</button>
              </div>
            ) : isLoading ? (
              <div className="loading-row" role="status"><span className="spinner" /> Carregando sua escala...</div>
            ) : (
              <form className="search-form" onSubmit={submitSearch}>
                <div className="search-field-wrap">
                  <label className="search-field" htmlFor="employee-search">
                    <Search size={25} strokeWidth={2.2} aria-hidden="true" />
                    <input
                      id="employee-search"
                      type="search"
                      autoComplete="off"
                      placeholder="Digite seu nome"
                      value={query}
                      onChange={(event) => {
                        setQuery(event.target.value);
                        setSelected(null);
                        setSuggestionsOpen(true);
                      }}
                      onFocus={() => setSuggestionsOpen(true)}
                      onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 140)}
                      aria-autocomplete="list"
                      aria-expanded={suggestionsOpen && matches.length > 0}
                      aria-controls="employee-suggestions"
                    />
                    {query && <button className="clear-search" type="button" aria-label="Limpar busca" onMouseDown={(event) => event.preventDefault()} onClick={() => { setQuery(""); setSelected(null); }}><X size={18} /></button>}
                  </label>
                  {suggestionsOpen && query.trim() && matches.length > 0 && (
                    <ul className="suggestions" id="employee-suggestions" role="listbox" aria-label="Sugestões de colaboradores">
                      {matches.map((employee) => (
                        <li key={employee.id} role="option" aria-selected={false}>
                          <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => chooseEmployee(employee)}>
                            <span className="suggestion-avatar">{employee.name.slice(0, 1)}</span>
                            <span className="suggestion-person"><strong>{employee.name}</strong><small>{employee.jobTitle}</small></span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {suggestionsOpen && query.trim() && matches.length === 0 && !selected && (
                    <div className="suggestions empty-suggestions">Nenhum nome encontrado.</div>
                  )}
                </div>
                <button className="primary-button search-submit" type="submit" disabled={!selected}>
                  Consultar minha folga <ChevronDown className="button-arrow" size={19} />
                </button>
              </form>
            )}
            {!isLoading && !loadError && activeEmployees.length === 0 && (
              <p className="helper-copy">Sua escala ainda não está disponível. Fale com o RH para saber quando ela será publicada.</p>
            )}
            </section>
          </>
        ) : (
          <section className="results-section" aria-live="polite">
            <div className="results-heading">
              <div>
                <span className="eyebrow">Que bom ter você por aqui</span>
                <h1>Olá, {selected.name.split(" ")[0]}!</h1>
                <span className="results-job-title">{selected.jobTitle}</span>
                <p>Veja o que está programado para você.</p>
              </div>
              <button type="button" className="icon-button refresh-button" onClick={() => { setRefreshing(true); void refresh(true); }} aria-label="Atualizar escala" title="Atualizar escala" disabled={refreshing}>
                <RefreshCw size={18} className={refreshing ? "spin" : ""} />
              </button>
            </div>

            {publishedWeeks.length === 0 ? (
              <div className="notice notice-empty">
                <CalendarDays size={26} />
                <div><strong>Sua escala ainda não foi publicada.</strong><span>Assim que o RH liberar uma semana, ela aparecerá aqui.</span></div>
              </div>
            ) : (
              <>
                <article className="next-off-card">
                  <div className="next-off-copy">
                    <span className="next-off-label"><Sun size={16} /> SUA PRÓXIMA FOLGA</span>
                    {upcomingOff ? (
                      <>
                        <h2>{new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(parseLocalDate(upcomingOff.shift.date))}</h2>
                        <p>{formatFullDate(upcomingOff.shift.date)}</p>
                      </>
                    ) : <><h2>Sem folga publicada</h2><p>Confira com o RH a próxima semana disponível.</p></>}
                  </div>
                  <div className="off-calendar-art" aria-hidden="true"><CalendarDays size={50} strokeWidth={1.65} /></div>
                  <div className="habitual-hours"><Clock3 size={17} /><span>Horário habitual</span><strong>{usualHours?.startTime && usualHours?.endTime ? `${usualHours.startTime} às ${usualHours.endTime}` : "Não informado"}</strong></div>
                </article>

                <div className="calendar-export">
                  <div className="calendar-export-copy">
                    <span className="calendar-export-icon"><CalendarDays size={19} aria-hidden="true" /></span>
                    <div>
                      <strong>Leve suas folgas com você</strong>
                      <p>{upcomingOffShifts.length > 0
                        ? `${upcomingOffShifts.length} ${upcomingOffShifts.length === 1 ? "folga publicada" : "folgas publicadas"} · arquivo compatível com iPhone e Android.`
                        : "Ainda não há folgas futuras publicadas para baixar."}</p>
                    </div>
                  </div>
                  <button type="button" className="calendar-export-button" onClick={() => void saveFolgasToPhone()} disabled={upcomingOffShifts.length === 0}>
                    <Download size={17} aria-hidden="true" /> {upcomingOffShifts.length > 0 ? "Salvar na agenda" : "Sem folgas para baixar"}
                  </button>
                  {calendarMessage && <p className="calendar-export-message" role="status" aria-live="polite">{calendarMessage}</p>}
                </div>

                <section className="week-panel" aria-labelledby="week-title">
                  <div className="week-heading">
                    <div>
                      <span className="eyebrow">Sua programação</span>
                      <h2 id="week-title">Calendário da semana</h2>
                    </div>
                    {publishedWeeks.length > 1 && <span className="week-count">{publishedWeeks.length} semanas publicadas</span>}
                  </div>
                  {publishedWeeks.length > 1 && (
                    <div className="week-switcher" role="group" aria-label="Escolha uma semana publicada">
                      {publishedWeeks.map((week) => (
                        <button key={week.id} type="button" className={`week-choice ${week.id === selectedWeekId ? "is-selected" : ""}`} onClick={() => setSelectedWeekId(week.id)}>
                          <CalendarDays size={15} /> {formatWeekRange(week.startDate, week.endDate)}
                        </button>
                      ))}
                    </div>
                  )}
                  {selectedWeek ? <>
                    <div className="selected-week-caption">Semana de {formatWeekRange(selectedWeek.startDate, selectedWeek.endDate)}</div>
                    <WeekCalendar week={selectedWeek} employeeId={selected.id} holidays={weekHolidays} />
                    <div className="calendar-legend" aria-label="Legenda">
                      <span><i className="legend-dot legend-work" /> Trabalho</span>
                      <span><i className="legend-dot legend-off" /> Folga</span>
                      <span><i className="legend-dot legend-holiday" /> Feriado</span>
                    </div>
                    <div className="holiday-list">
                      <div className="holiday-list-icon"><Sun size={18} /></div>
                      <div className="holiday-list-copy">
                        <strong>Feriados da semana</strong>
                        {weekHolidays.length ? weekHolidays.map((holiday) => (
                          <p key={holiday.id}><span>{formatShortDate(holiday.date)}</span> {holiday.name}</p>
                        )) : <p>Nenhum feriado cadastrado para esta semana.</p>}
                      </div>
                    </div>
                  </> : <div className="notice notice-empty">Selecione uma semana publicada.</div>}
                </section>
              </>
            )}

            <div className="result-actions">
              <button type="button" className="change-person-button" onClick={changeEmployee}><Search size={17} /> Trocar colaborador</button>
              <span className="private-note"><LockKeyhole size={14} /> Seus dados ficam neste dispositivo</span>
            </div>
          </section>
        )}

        <footer className="portal-footer">Lejon Atacarejo <span aria-hidden="true">·</span> Maringá</footer>
      </div>
    </main>
  );
}
