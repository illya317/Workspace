export type ChinaHolidayKey =
  | "new-year"
  | "spring-festival"
  | "qingming"
  | "labor-day"
  | "dragon-boat"
  | "mid-autumn"
  | "national-day"
  | "national-day-mid-autumn";

export type ChinaCalendarDateKind = "workday" | "weekend" | "holiday" | "adjusted-workday";

export type ChinaHolidaySource = {
  year: number;
  title: string;
  issuedBy: string;
  issuedDate: string;
  url: string;
};

export type ChinaHolidayRange = {
  holidayKey: ChinaHolidayKey;
  holidayName: string;
  startDate: string;
  endDate: string;
};

export type ChinaAdjustedWorkday = {
  date: string;
  holidayKey: ChinaHolidayKey;
  holidayName: string;
};

export type ChinaHolidayYearDefinition = {
  year: number;
  source: ChinaHolidaySource;
  holidayRanges: readonly ChinaHolidayRange[];
  adjustedWorkdays: readonly ChinaAdjustedWorkday[];
};

export type ChinaCalendarDay = {
  date: string;
  kind: ChinaCalendarDateKind;
  isWorkday: boolean;
  isWeekend: boolean;
  isHoliday: boolean;
  isAdjustedWorkday: boolean;
  holidayKey?: ChinaHolidayKey;
  holidayName?: string;
  source?: ChinaHolidaySource;
};

export type ChinaCalendarRange = {
  startDate: string | Date;
  endDate: string | Date;
};

export type WorkdayCalendarMode = "weekday" | "china";

export type CalendarDateRange = {
  startDate: string | Date;
  endDate: string | Date;
};

export type WorkdayCalendarOptions = {
  mode?: WorkdayCalendarMode;
};
