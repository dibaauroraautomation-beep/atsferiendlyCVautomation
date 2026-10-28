// Reports data: rows come from the n8n report webhook, and the user's own Supabase
// "application" rows decide which of them are marked as applied (same idea as the Jobs page).
import { normalizeStatus, parseDay, iso, weekBounds } from "./week";
import type { ReportApplication, ReportData } from "./types";

export const REPORTS_WEBHOOK_URL = "https://n8naurora.duckdns.org/webhook/e8c2ec9a-f2ef-4029-9161-9a1f82fa1ad7";

export type AppliedInfo = { status: string; appliedAt: string | null };
type ReportRows = Pick<ReportData, "applications" | "weekly">;

const key = (v: unknown) => String(v ?? "").trim().toLowerCase();

/** Calls the n8n webhook. Throws an Error with a user-friendly message. */
export async function fetchReportRows(userId?: string, email?: string): Promise<ReportRows> {
  let res: Response;
  try {
    // Simple form POST (no custom headers), so the browser needs no CORS preflight
    res = await fetch(REPORTS_WEBHOOK_URL, {
      method: "POST",
      body: new URLSearchParams({ user_id: userId ?? "", email: email ?? "" }),
      cache: "no-store",
    });
  } catch {
    console.error(`Request to ${REPORTS_WEBHOOK_URL} failed. Check that the n8n workflow is published and Allowed Origins includes this site.`);
    throw new Error("Could not reach the report service. Check your connection and try again.");
  }
  if (res.status === 401 || res.status === 403) throw new Error("Your session has expired. Please sign in again.");
  if (res.status === 404) {
    console.error("n8n returned 404: the getJobReport workflow is not published/active.");
    throw new Error("The report service is not active right now. Try again later.");
  }
  if (!res.ok) throw new Error(`The report service returned an error (${res.status}). Try again later.`);

  const text = await res.text();
  if (!text.trim()) return { applications: [], weekly: emptyWeekly() };
  let json: { ok?: boolean; applications?: ReportApplication[]; weekly?: ReportData["weekly"] };
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error("The report service sent data in an unexpected format.");
  }
  if (json.ok !== true || !Array.isArray(json.applications) || !json.weekly) {
    throw new Error("The report service sent data in an unexpected format.");
  }
  return { applications: json.applications.map(normalizeRow), weekly: json.weekly };
}

/** Reads the six table columns from a row. Both the report names (title, cvUrl ...) and the raw table names (jobtitle, CV_link ...) work. */
function normalizeRow(raw: unknown, i: number): ReportApplication {
  const row = (raw ?? {}) as Record<string, unknown>;
  const lower: Record<string, unknown> = {};
  for (const k of Object.keys(row)) lower[k.toLowerCase()] = row[k];
  const pick = (...names: string[]) => {
    for (const n of names) {
      const v = lower[n.toLowerCase()];
      if (v === undefined || v === null) continue;
      const t = String(v).trim();
      if (t && t.toLowerCase() !== "null" && t.toLowerCase() !== "undefined") return t;
    }
    return "";
  };
  const score = Number(pick("matchScore", "matchscore").replace("%", ""));
  return {
    id: pick("id", "job_id") || String(i),
    title: pick("title", "jobtitle", "job_title"),
    company: pick("company"),
    status: pick("status") || "Applied",
    appliedAt: iso(parseDay(pick("appliedAt", "applied_at", "createdAt", "created_at"))),
    cvUrl: pick("cvUrl", "CV_link", "cv_link", "cvlink"),
    coverLetterUrl: pick("coverLetterUrl", "CoverLetter", "cover_letter"),
    url: pick("url", "applylink", "apply_link"),
    matchScore: Number.isFinite(score) ? score : 0,
  };
}

/** Turns the user's Supabase "application" rows into a lookup (job id or apply link -> info). */
export function toAppliedMap(rows: { content: Record<string, unknown> | null }[]): Map<string, AppliedInfo> {
  const applied = new Map<string, AppliedInfo>();
  for (const row of rows) {
    const c = row.content ?? {};
    const info = { status: normalizeStatus(c.status), appliedAt: iso(parseDay(c.applied_at)) };
    if (c.job_id) applied.set(key(c.job_id), info);
    if (c.apply_link) applied.set(key(c.apply_link), info);
  }
  return applied;
}

/** Marks every n8n row as applied or not, and counts the stats from the applied ones. */
export function buildReport(data: ReportRows, applied: Map<string, AppliedInfo>): ReportData {
  const applications = data.applications.map((r) => {
    const info = applied.get(key(r.id)) ?? applied.get(key(r.url));
    return info
      ? { ...r, status: info.status, appliedAt: info.appliedAt ?? r.appliedAt }
      : { ...r, status: "Not applied" };
  });
  const mine = applications.filter((a) => a.status !== "Not applied");

  const { start, end } = weekBounds();
  const thisWeek = mine.filter((a) => {
    const ms = parseDay(a.appliedAt);
    return ms != null && ms >= start && ms < end;
  });

  return {
    stats: {
      total: mine.length,
      thisWeek: thisWeek.length,
      pending: mine.filter((a) => a.status === "Pending").length,
      interview: mine.filter((a) => a.status === "Interview").length,
    },
    applications,
    weekly: { ...data.weekly, submitted: thisWeek.length },
    topApplied: mine
      .slice()
      .sort((a, b) => b.matchScore - a.matchScore)
      .slice(0, 5)
      .map((a) => ({ id: a.id, title: a.title, company: a.company })),
  };
}

function emptyWeekly(): ReportData["weekly"] {
  const { start, end } = weekBounds();
  return {
    weekStart: iso(start)!,
    weekEnd: iso(end - 86400000)!,
    jobsFound: 0,
    matchingJobs: 0,
    cvs: 0,
    cvsGenerated: 0,
    coverLetters: 0,
    submitted: 0,
    perDay: [0, 0, 0, 0, 0, 0, 0],
  };
}
