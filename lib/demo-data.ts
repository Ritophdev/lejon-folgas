import { dateAtDay, mondayOf, parseLocalDate, shiftDate, toIsoDate } from "@/lib/dates";
import type { DemoState, Employee, Holiday, ScheduleWeek, Shift } from "@/lib/types";

export const DEMO_STORAGE_KEY = "lejon-folgas-demo-data-v1";
export const DEMO_ADMIN_KEY = "lejon-folgas-demo-admin-v1";
export const SELECTED_EMPLOYEE_KEY = "lejon-folgas-employee-v1";

const names = ["Ana Souza", "Bruno Lima", "Camila Ferreira", "Diego Santos", "Luana Costa", "Rafael Almeida"];
const jobTitles = ["Operadora de caixa", "Repositor", "Atendente de loja", "Conferente", "Operadora de loja", "Repositor"];

function makeWeek(start: Date, employees: Employee[], id: string, offDays: number[], published = true): ScheduleWeek {
  const startDate = toIsoDate(start);
  const endDate = toIsoDate(shiftDate(start, 6));
  const shifts: Shift[] = [];
  employees.forEach((employee, employeeIndex) => {
    for (let day = 0; day < 7; day += 1) {
      const date = dateAtDay(startDate, day);
      const isOff = day === offDays[employeeIndex % offDays.length];
      shifts.push({
        id: `${id}-${employee.id}-${date}`,
        weekId: id,
        employeeId: employee.id,
        date,
        status: isOff ? "off" : "work",
        startTime: isOff ? null : employeeIndex % 2 === 0 ? "08:00" : "09:00",
        endTime: isOff ? null : employeeIndex % 2 === 0 ? "17:00" : "18:00",
      });
    }
  });
  return {
    id,
    startDate,
    endDate,
    status: published ? "published" : "draft",
    publishedAt: published ? new Date().toISOString() : null,
    shifts,
  };
}

export function createDemoState(): DemoState {
  const employees = names.map((name, index) => ({ id: `demo-${index + 1}`, name, jobTitle: jobTitles[index], active: true }));
  const currentMonday = mondayOf(new Date());
  const nextMonday = shiftDate(currentMonday, 7);
  const november20 = new Date(currentMonday.getFullYear(), 10, 20, 12);
  const holidayMonday = mondayOf(november20);
  const startDates = [currentMonday, nextMonday];
  if (toIsoDate(holidayMonday) !== toIsoDate(currentMonday) && toIsoDate(holidayMonday) !== toIsoDate(nextMonday)) {
    startDates.push(holidayMonday);
  }

  const weeks = startDates.map((start, index) => {
    const offDays = index === 1 ? [4, 0, 2, 5, 1, 3] : [3, 5, 1, 2, 6, 0];
    return makeWeek(start, employees, `demo-week-${index + 1}-${toIsoDate(start)}`, offDays);
  });
  const holidays: Holiday[] = [
    {
      id: "demo-holiday-black-awareness",
      date: `${currentMonday.getFullYear()}-11-20`,
      name: "Dia Nacional de Zumbi e da Consciência Negra",
    },
  ];

  return { employees, weeks, holidays };
}

export function readDemoState(): DemoState {
  if (typeof window === "undefined") return createDemoState();
  const saved = window.localStorage.getItem(DEMO_STORAGE_KEY);
  if (!saved) return createDemoState();
  try {
    const parsed = JSON.parse(saved) as DemoState;
    if (!parsed.employees || !parsed.weeks || !parsed.holidays) return createDemoState();
    return {
      ...parsed,
      employees: parsed.employees.map((employee, index) => ({
        ...employee,
        jobTitle: employee.jobTitle?.trim() || jobTitles[index % jobTitles.length] || "Operador de loja",
      })),
    };
  } catch {
    return createDemoState();
  }
}

export function writeDemoState(state: DemoState): void {
  if (typeof window !== "undefined") window.localStorage.setItem(DEMO_STORAGE_KEY, JSON.stringify(state));
}

export function resetDemoState(): DemoState {
  const fresh = createDemoState();
  writeDemoState(fresh);
  return fresh;
}

export function makeBlankWeek(startDate: string, id = crypto.randomUUID()): ScheduleWeek {
  const start = parseLocalDate(startDate);
  return {
    id,
    startDate,
    endDate: toIsoDate(shiftDate(start, 6)),
    status: "draft",
    publishedAt: null,
    shifts: [],
  };
}
