export type ShiftStatus = "work" | "off";
export type WeekStatus = "draft" | "published";

export type Employee = {
  id: string;
  name: string;
  jobTitle: string;
  active: boolean;
};

export type Shift = {
  id: string;
  weekId: string;
  employeeId: string;
  date: string;
  status: ShiftStatus;
  startTime: string | null;
  endTime: string | null;
};

export type Holiday = {
  id: string;
  date: string;
  name: string;
};

export type ScheduleWeek = {
  id: string;
  startDate: string;
  endDate: string;
  status: WeekStatus;
  publishedAt: string | null;
  shifts: Shift[];
};

export type PortalData = {
  employees: Employee[];
  weeks: ScheduleWeek[];
  holidays: Holiday[];
};

export type DemoState = PortalData;

export type WeekAssignmentDraft = {
  employeeId: string;
  offDays: number[];
  startTime: string;
  endTime: string;
};
