export const WEEKDAYS = ["Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado", "Domingo"];
export const SHORT_WEEKDAYS = ["SEG", "TER", "QUA", "QUI", "SEX", "SÁB", "DOM"];

export function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day, 12);
}

export function toIsoDate(date: Date): string {
  const local = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  return `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, "0")}-${String(local.getDate()).padStart(2, "0")}`;
}

export function mondayOf(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12);
  const weekday = result.getDay();
  result.setDate(result.getDate() + (weekday === 0 ? -6 : 1 - weekday));
  return result;
}

export function shiftDate(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function formatFullDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long", day: "numeric", month: "long" }).format(parseLocalDate(value));
}

export function formatShortDate(value: string): string {
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" }).format(parseLocalDate(value)).replace(".", "");
}

export function formatWeekRange(startDate: string, endDate: string): string {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const sameMonth = start.getMonth() === end.getMonth();
  const monthStart = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(start);
  const monthEnd = new Intl.DateTimeFormat("pt-BR", { month: "long" }).format(end);
  if (sameMonth) return `${start.getDate()} a ${end.getDate()} de ${monthEnd}`;
  return `${start.getDate()} de ${monthStart} a ${end.getDate()} de ${monthEnd}`;
}

export function dateAtDay(startDate: string, dayIndex: number): string {
  return toIsoDate(shiftDate(parseLocalDate(startDate), dayIndex));
}

export function dayIndexInWeek(value: string): number {
  const day = parseLocalDate(value).getDay();
  return day === 0 ? 6 : day - 1;
}

export function todayIso(): string {
  return toIsoDate(new Date());
}
