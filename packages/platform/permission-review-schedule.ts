type ZonedParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function zonedDateTimeToUtc(target: ZonedParts, timeZone: string) {
  const targetAsUtc = Date.UTC(
    target.year,
    target.month - 1,
    target.day,
    target.hour,
    target.minute,
    target.second,
  );
  let candidate = targetAsUtc;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const observed = zonedParts(new Date(candidate), timeZone);
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second,
    );
    const adjustment = targetAsUtc - observedAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }
  return new Date(candidate);
}

function nextCalendarDay(parts: ZonedParts): ZonedParts {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + 1));
  return {
    ...parts,
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

export function nextPermissionReviewRunAt(
  now: Date,
  dailyAt: string,
  timeZone: string,
) {
  const [hour, minute] = dailyAt.split(":").map(Number);
  if (!Number.isInteger(hour) || !Number.isInteger(minute)) throw new Error(`Invalid dailyAt: ${dailyAt}`);
  const localNow = zonedParts(now, timeZone);
  let target: ZonedParts = { ...localNow, hour, minute, second: 0 };
  let candidate = zonedDateTimeToUtc(target, timeZone);
  if (candidate.getTime() <= now.getTime()) {
    target = nextCalendarDay(target);
    candidate = zonedDateTimeToUtc(target, timeZone);
  }
  return candidate;
}
