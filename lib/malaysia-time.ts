const localInput = new Intl.DateTimeFormat("sv-SE", {
  timeZone: "Asia/Kuala_Lumpur", year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
});

const display = new Intl.DateTimeFormat("ms-MY", {
  timeZone: "Asia/Kuala_Lumpur", dateStyle: "medium", timeStyle: "medium",
});

export function scheduleValue(date: Date | null) {
  return date ? localInput.format(date).replace(" ", "T") : "";
}

export function formatMalaysiaTime(date: Date) {
  return `${display.format(date)} MYT`;
}

export function parseScheduleValue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/.test(value)) return null;
  const normalized = value.length === 16 ? `${value}:00` : value;
  const date = new Date(`${normalized}+08:00`);
  return Number.isFinite(date.getTime()) && scheduleValue(date) === normalized ? date : null;
}
