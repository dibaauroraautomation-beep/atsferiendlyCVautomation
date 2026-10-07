// Route A: build the report from the Supabase table "user_documents".
import type { SupabaseClient } from "@supabase/supabase-js";
import { DAY, iso, normalizeStatus, parseDay, weekBounds } from "./week";
import { MATCH_THRESHOLD, type ReportApplication, type ReportData } from "./types";

type Row = { id: string; type: string; created_at: string; content: Record<string, unknown> | null };
const str = (v: unknown) => (v === undefined || v === null ? "" : String(v).trim());

export async function getReportFromSupabase(supabase: SupabaseClient): Promise<ReportData> {
  const { data, error } = await supabase
    .from("user_documents")
    .select("id, type, created_at, content")
    .in("type", ["application", "job", "resume", "cover_letter"])
    .order("created_at", { ascending: false });
  if (error) throw new Error(`Supabase: ${error.message}`);
  const rows = (data ?? []) as Row[];

  const { start, end } = weekBounds();
  const inWeek = (ms: number | null) => ms != null && ms >= start && ms < end;
  const created = (r: Row) => parseDay(r.created_at);

  const applications: ReportApplication[] = rows
    .filter((r) => r.type === "application")
    .map((r) => {
      const c = r.content ?? {};
      const ms = parseDay(c.applied_at) ?? created(r);
      return {
        id: r.id,
        title: str(c.title),
        company: str(c.company),
        status: normalizeStatus(c.status),
        appliedAt: iso(ms),
        cvUrl: str(c.cv_url),
        coverLetterUrl: str(c.cover_letter_url),
        url: str(c.url ?? c.apply_url),
        matchScore: Number(c.match_score) || 0,
      };
    })
    .sort((a, b) => String(b.appliedAt).localeCompare(String(a.appliedAt)));

  const weekRows = rows.filter((r) => inWeek(created(r)));
  const jobs = weekRows.filter((r) => r.type === "job");
  const perDay = [0, 0, 0, 0, 0, 0, 0];
  jobs.forEach((j) => {
    const ms = created(j);
    if (ms != null) perDay[Math.floor((ms - start) / DAY)]++;
  });
  const thisWeekApps = applications.filter((a) => inWeek(parseDay(a.appliedAt)));
  const resumes = weekRows.filter((r) => r.type === "resume").length;

  return {
    stats: {
      total: applications.length,
      thisWeek: thisWeekApps.length,
      pending: applications.filter((a) => a.status === "Pending").length,
      interview: applications.filter((a) => a.status === "Interview").length,
    },
    applications,
    weekly: {
      weekStart: iso(start)!,
      weekEnd: iso(end - DAY)!,
      jobsFound: jobs.length,
      matchingJobs: jobs.filter((j) => Number(j.content?.match_score ?? 0) >= MATCH_THRESHOLD).length,
      cvs: new Set(thisWeekApps.map((a) => a.cvUrl).filter(Boolean)).size,
      cvsGenerated: resumes,
      coverLetters: weekRows.filter((r) => r.type === "cover_letter").length,
      submitted: thisWeekApps.length,
      perDay,
    },
    topApplied: applications
      .slice()
      .sort((a, b) => b.matchScore - a.matchScore || String(b.appliedAt).localeCompare(String(a.appliedAt)))
      .slice(0, 5)
      .map((a) => ({ id: a.id, title: a.title, company: a.company })),
  };
}
