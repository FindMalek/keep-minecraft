const DAY = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short" });
const CLOCK = new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit" });

export function when(ms: number): string {
  return `${DAY.format(ms).toLowerCase()} · ${CLOCK.format(ms)}`;
}

export function until(ms: number, now = Date.now()): string {
  const minutes = Math.max(0, Math.round((ms - now) / 60_000));
  if (minutes < 60) return `in ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 48) return `in ${hours} h`;
  return `in ${Math.round(hours / 24)} days`;
}

export function hours(minutes: number): string {
  return minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(minutes < 600 ? 1 : 0)} h`;
}

export function ago(ms: number, now = Date.now()): string {
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 2) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h ago`;
  return `${Math.round(minutes / 1440)} days ago`;
}
