// Week helpers (Monday-Sunday). Works on "UTC midnight" day numbers so results
// don't depend on the server's time zone. REPORTS_TZ_OFFSET_HOURS shifts "today".
export const DAY = 86400000;

export function parseDay(s: unknown): number | null {
  if (!s) return null;
  const str = String(s).trim();
  let m = str.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/); // dd-mm-yyyy
  if (m) return Date.UTC(+m[3], +m[2] - 1, +m[1]);
  m = str.match(/^(\d{4})-(\d{2})-(\d{2})/); // yyyy-mm-dd...
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  const t = Date.parse(str);
  if (isNaN(t)) return null;
  const d = new Date(t + tzOffsetMs());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export const iso = (ms: number | null) => (ms == null ? null : new Date(ms).toISOString().slice(0, 10));

export function tzOffsetMs() {
  const h = Number(process.env.REPORTS_TZ_OFFSET_HOURS ?? 6); // default Asia/Dhaka
  return (isNaN(h) ? 6 : h) * 3600000;
}

export function weekBounds() {
  const now = new Date(Date.now() + tzOffsetMs());
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const start = today - ((new Date(today).getUTCDay() + 6) % 7) * DAY;
  return { start, end: start + 7 * DAY }; // end is exclusive
}

export const STATUS_LABELS: Record<string, string> = {
  applied: "Applied",
  pending: "Pending",
  interview: "Interview",
  rejected: "Rejected",
  offer: "Offer",
};
export const normalizeStatus = (s: unknown) => {
  const v = String(s ?? "").trim();
  return STATUS_LABELS[v.toLowerCase()] || v || "Applied";
};
