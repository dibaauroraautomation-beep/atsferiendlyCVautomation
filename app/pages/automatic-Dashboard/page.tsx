"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import NavAndSidebar from "@/app/components/navAndSidebar"; // same NavAndSidebar the Jobs page uses
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
// n8n webhook that returns the rows of the "job data" table
// const JOBS_WEBHOOK_URL = "https://n8naurora.duckdns.org/webhook/job-data";
const JOBS_WEBHOOK_URL = "/api/jobs";
// A job counts as "matching" when its match score is at least this value.
const MATCH_THRESHOLD = 70;
// Write the same schedule you set on the n8n Schedule Trigger.
const AUTOMATION_SCHEDULE = "Daily at 8:00 AM";
// How many jobs to show in the "Top Matching Jobs" table
const TOP_JOBS_LIMIT = 5;
// Sidebar menu for automated users (same 4 items as the Jobs page)
const AUTOMATED_MENU = [
  { name: "Dashboard", key: "automatic-Dashboard" },
  { name: "Jobs", key: "jobs" },
  { name: "Reports", key: "reports" },
  { name: "Profile", key: "profile" },
];

/*
  Data sources:
  - Jobs  -> n8n webhook (job data table). Row shape:
      { id, jobtitle, company, location, matchscore, applylink,
        scorebreakdown, jd, skillrequired, publish, createdAt, updatedAt }
  - CVs Generated / Applications This Week -> Supabase "user_documents"
      (type "resume" and type "application"), filtered per user by RLS.
*/

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */
type WebhookJob = {
  id?: number | string;
  jobtitle?: string | null;
  company?: string | null;
  location?: string | null;
  matchscore?: string | number | null;
  applylink?: string | null;
  scorebreakdown?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  score: number | null; // null = not scored yet
  link: string;
  breakdown: string;
  createdAt: string;
  updatedAt: string;
};

type Counts = { cvsGenerated: number; applicationsThisWeek: number };

type DbError = { code?: string; message?: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const clean = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** "5" -> 5, "" / null / "abc" -> null */
const parseScore = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

/** Map one webhook row to the shape the dashboard uses. */
const normalizeJob = (row: WebhookJob, index: number): Job => ({
  id: String(row.id ?? `row-${index}`),
  title: clean(row.jobtitle),
  company: clean(row.company),
  location: clean(row.location),
  score: parseScore(row.matchscore),
  link: clean(row.applylink),
  breakdown: clean(row.scorebreakdown),
  createdAt: row.createdAt || "",
  updatedAt: row.updatedAt || row.createdAt || "",
});

/** Webhook may return an array, or an object wrapping the array. */
const extractRows = (payload: unknown): WebhookJob[] => {
  if (Array.isArray(payload)) return payload as WebhookJob[];
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    for (const key of ["data", "jobs", "items", "rows"]) {
      if (Array.isArray(obj[key])) return obj[key] as WebhookJob[];
    }
  }
  return [];
};

const isValidDate = (iso: string) => Boolean(iso) && !Number.isNaN(new Date(iso).getTime());

const formatDate = (iso: string) =>
  isValidDate(iso) ? new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" }) : "—";

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** True when the Supabase table does not exist yet (schema.sql not run). */
const isMissingTable = (e: DbError) =>
  e.code === "PGRST205" || e.code === "42P01" || /schema cache|does not exist/i.test(e.message ?? "");

/** Short, actionable message for Supabase errors. */
const friendlyDbError = (e: DbError) => {
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("jwt") || msg.includes("token")) return "Your session has expired. Please log out and sign in again.";
  if (e.code === "42501" || msg.includes("permission")) return "You don't have permission to read your CV data. Please sign in again.";
  return "Could not load your CV and application counts right now.";
};

/** Turns points into a smooth SVG path (Catmull-Rom -> Bezier). */
const smoothPath = (pts: { x: number; y: number }[]) => {
  if (pts.length < 2) return "";
  let d = `M ${pts[0].x} ${pts[0].y}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */
const Icon = ({ d, className = "w-5 h-5" }: { d: string; className?: string }) => (
  <svg className={className} fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d={d} />
  </svg>
);

const ICONS = {
  search: "m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z",
  target: "M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z",
  doc: "M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z",
  send: "M6 12 3.269 3.125A59.769 59.769 0 0 1 21.485 12 59.768 59.768 0 0 1 3.27 20.875L5.999 12Zm0 0h7.5",
  check: "m4.5 12.75 6 6 9-13.5",
};

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */
function StatCard({
  label,
  value,
  hint,
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: string;
}) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-600">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
        {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      </div>
      <div className="w-9 h-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
        <Icon d={icon} className="w-5 h-5" />
      </div>
    </div>
  );
}

function ActivityChart({ labels, values }: { labels: string[]; values: number[] }) {
  const W = 700;
  const H = 200;
  const max = Math.max(10, ...values);
  const niceMax = Math.ceil(max / 10) * 10;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => Math.round(niceMax * t));

  const pts = values.map((v, i) => ({
    x: values.length === 1 ? W / 2 : (i / (values.length - 1)) * W,
    y: H - (v / niceMax) * H,
  }));
  const line = smoothPath(pts);
  const area = line ? `${line} L ${W} ${H} L 0 ${H} Z` : "";

  return (
    <div className="flex gap-2">
      {/* Y axis */}
      <div className="flex flex-col-reverse justify-between h-[200px] text-[11px] text-slate-400 w-7 text-right">
        {ticks.map((t, i) => (
          <span key={i} className="leading-none">{t}</span>
        ))}
      </div>

      <div className="flex-1 min-w-0">
        <div className="relative h-[200px]">
          {/* Grid */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((_, i) => (
              <div key={i} className="border-t border-slate-100" />
            ))}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 w-full h-full">
            <defs>
              <linearGradient id="activityFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#4f46e5" stopOpacity="0" />
              </linearGradient>
            </defs>
            {area && <path d={area} fill="url(#activityFill)" />}
            {line && (
              <path d={line} fill="none" stroke="#4f46e5" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            )}
          </svg>
        </div>
        {/* X axis: weekday + value so the exact count is readable */}
        <div className="flex justify-between mt-2 text-[11px] text-slate-400">
          {labels.map((l, i) => (
            <span key={i} className="text-center">
              {l}
              <span className="block text-slate-600 font-medium">{values[i]}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-400">Not available</span>;
  const color = score >= 85 ? "text-emerald-600" : score >= MATCH_THRESHOLD ? "text-amber-600" : "text-slate-500";
  return <span className={`font-medium ${color}`}>{score}%</span>;
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function AutomaticDashboardPage() {
  const supabase = createClient();
  const { user, profile, loading: authLoading } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [counts, setCounts] = useState<Counts>({ cvsGenerated: 0, applicationsThisWeek: 0 });
  const [loading, setLoading] = useState(true);
  const [jobsError, setJobsError] = useState("");
  const [dbError, setDbError] = useState("");

  /* ---------- First name for the welcome line (never the email) ---------- */
  const firstName = useMemo(() => {
    return profile?.first_name || (user?.user_metadata?.first_name as string | undefined) || "there";
  }, [profile, user]);

  /* ---------- Jobs from the n8n webhook ---------- */
  const loadJobs = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from("job_matches")
      .select("match_score, created_at, jobs ( id, title, company, location, url )")
      .eq("user_id", user.id)
      .order("match_score", { ascending: false });

    if (error) {
      console.error("job_matches load failed:", error);
      setJobs([]);
      setJobsError("Could not load your matched jobs.");
      return;
    }

    setJobs(
      (data ?? []).map((m: any, i: number) =>
        normalizeJob(
          {
            id: m.jobs?.id,
            jobtitle: m.jobs?.title,
            company: m.jobs?.company,
            location: m.jobs?.location,
            matchscore: m.match_score,
            applylink: m.jobs?.url,
            createdAt: m.created_at,
          },
          i
        )
      )
    );
    setJobsError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);
  /* ---------- CV + application counts from Supabase ---------- */
  const loadCounts = useCallback(async () => {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setDbError("Your session has expired. Please log out and sign in again.");
        return;
      }

      const weekAgo = startOfDay(new Date());
      weekAgo.setDate(weekAgo.getDate() - 6);

      const [cvRes, appRes] = await Promise.all([
        supabase.from("user_documents").select("id", { count: "exact", head: true }).eq("type", "resume"),
        supabase
          .from("user_documents")
          .select("id", { count: "exact", head: true })
          .eq("type", "application")
          .gte("created_at", weekAgo.toISOString()),
      ]);

      const firstError = (cvRes.error || appRes.error) as DbError | null;
      if (firstError) {
        console.error("Supabase counts failed:", firstError);
        if (isMissingTable(firstError)) {
          console.warn("user_documents table not found. Run supabase/schema.sql in the Supabase SQL Editor.");
          setDbError("");
        } else {
          setDbError(friendlyDbError(firstError));
        }
      } else {
        setDbError("");
      }

      setCounts({
        cvsGenerated: cvRes.error ? 0 : cvRes.count ?? 0,
        applicationsThisWeek: appRes.error ? 0 : appRes.count ?? 0,
      });
    } catch (err) {
      console.error("Supabase counts crashed:", err);
      setDbError("Could not connect to the server. Check your internet connection and try again.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    await Promise.all([loadJobs(), loadCounts()]);
    setLoading(false);
  }, [user, loadJobs, loadCounts]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadData();
  }, [authLoading, user, loadData]);

  /* ---------- Derived stats ---------- */
  const stats = useMemo(() => {
    const today = startOfDay(new Date());
    const scored = jobs.filter((j) => j.score !== null);
    return {
      total: jobs.length,
      today: jobs.filter((j) => isValidDate(j.createdAt) && new Date(j.createdAt) >= today).length,
      scored: scored.length,
      matching: scored.filter((j) => (j.score as number) >= MATCH_THRESHOLD).length,
    };
  }, [jobs]);

  /* ---------- Chart: jobs found per day, last 7 days ---------- */
  const chart = useMemo(() => {
    const today = startOfDay(new Date());
    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(today);
      d.setDate(d.getDate() - (6 - i));
      return d;
    });
    const values = days.map((d) => {
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      return jobs.filter((j) => {
        if (!isValidDate(j.createdAt)) return false;
        const t = new Date(j.createdAt);
        return t >= d && t < next;
      }).length;
    });
    const labels = days.map((d) => d.toLocaleDateString(undefined, { weekday: "short" }));
    return { labels, values };
  }, [jobs]);

  /* ---------- Top jobs: highest score first, unscored jobs after (newest first) ---------- */
  const topJobs = useMemo(() => {
    return [...jobs]
      .sort((a, b) => {
        if (a.score !== null && b.score !== null) return b.score - a.score;
        if (a.score !== null) return -1;
        if (b.score !== null) return 1;
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      })
      .slice(0, TOP_JOBS_LIMIT);
  }, [jobs]);

  /* ---------- Last search = newest createdAt ---------- */
  const lastSearch = useMemo(() => {
    const times = jobs.filter((j) => isValidDate(j.createdAt)).map((j) => new Date(j.createdAt).getTime());
    return times.length ? new Date(Math.max(...times)).toISOString() : "";
  }, [jobs]);

  const automationActive = Boolean(profile?.cv_path) || jobs.length > 0;
  const errors = [jobsError, dbError].filter(Boolean);
  const dash = "–";

  /* ---------- Render ---------- */
  return (
    <NavAndSidebar
      pageInfo={["Dashboard", "", "automatic-Dashboard"]}
      user={["", "", 0, "", ""]}
      menu={AUTOMATED_MENU}
    >
      <div className="space-y-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}</h2>
            <p className="text-sm text-slate-500 mt-1">
              {automationActive
                ? "Your automated job search is running."
                : "Your automated job search will start once your CV is processed."}
            </p>
          </div>
          <button
            onClick={loadData}
            disabled={loading}
            className="text-sm font-medium text-indigo-600 hover:text-indigo-700 disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>

        {errors.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
            <div className="space-y-1">
              {errors.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
            <button
              onClick={loadData}
              disabled={loading}
              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-60"
            >
              {loading ? "Retrying..." : "Try again"}
            </button>
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          <StatCard
            label="Total Jobs Found"
            value={loading ? dash : stats.total}
            hint={loading ? undefined : `${stats.today} found today`}
            icon={ICONS.search}
          />
          <StatCard
            label="Matching Jobs"
            value={loading ? dash : stats.matching}
            hint={loading ? undefined : `Score ${MATCH_THRESHOLD}%+ • ${stats.scored} of ${stats.total} scored`}
            icon={ICONS.target}
          />
          <StatCard label="CVs Generated" value={loading ? dash : counts.cvsGenerated} icon={ICONS.doc} />
          <StatCard
            label="Applications This Week"
            value={loading ? dash : counts.applicationsThisWeek}
            icon={ICONS.send}
          />
        </div>

        {/* Chart */}
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-baseline justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">Job Search Activity</h3>
            <span className="text-xs text-slate-500">Jobs found per day, last 7 days</span>
          </div>
          <ActivityChart labels={chart.labels} values={chart.values} />
        </section>

        {/* Table + status */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
          <section className="xl:col-span-2 bg-white rounded-xl border border-slate-200 overflow-hidden">
            <h3 className="text-sm font-semibold text-slate-900 px-5 py-4 border-b border-slate-100">
              Top Matching Jobs
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50 text-left text-slate-600">
                    <th className="px-5 py-2.5 font-medium">Job Title</th>
                    <th className="px-3 py-2.5 font-medium">Company</th>
                    <th className="px-3 py-2.5 font-medium">Location</th>
                    <th className="px-3 py-2.5 font-medium">Match Score</th>
                    <th className="px-3 py-2.5 font-medium">Date</th>
                    <th className="px-5 py-2.5 font-medium">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-400">Loading jobs...</td>
                    </tr>
                  ) : topJobs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-5 py-8 text-center text-slate-500">
                        No jobs found yet. New matches will appear here after the next automated search.
                      </td>
                    </tr>
                  ) : (
                    topJobs.map((job) => (
                      <tr key={job.id} className="border-t border-slate-100 align-top">
                        <td className="px-5 py-3 font-semibold text-slate-900 max-w-[260px]">
                          <span className="line-clamp-2">{job.title || "Untitled role"}</span>
                        </td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{job.company || "—"}</td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{job.location || "—"}</td>
                        <td className="px-3 py-3 whitespace-nowrap" title={job.breakdown || undefined}>
                          <ScoreCell score={job.score} />
                        </td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatDate(job.createdAt)}</td>
                        <td className="px-5 py-3">
                          {job.link ? (
                            <a
                              href={job.link}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-block px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-md whitespace-nowrap"
                            >
                              View Details
                            </a>
                          ) : (
                            <span className="text-xs text-slate-400">No link</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
            {!loading && stats.total > TOP_JOBS_LIMIT && (
              <p className="px-5 py-3 text-xs text-slate-500 border-t border-slate-100">
                Showing {TOP_JOBS_LIMIT} of {stats.total} jobs. See all on the Jobs page.
              </p>
            )}
          </section>

          <section className="bg-white rounded-xl border border-slate-200 h-fit">
            <h3 className="text-sm font-semibold text-slate-900 px-5 py-4 border-b border-slate-100">
              Automation Status
            </h3>
            <div className="p-5 space-y-3">
              <div
                className={`flex items-center gap-3 p-3 rounded-lg ${automationActive ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
                  }`}
              >
                <span
                  className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-white ${automationActive ? "bg-emerald-500" : "bg-amber-500"
                    }`}
                >
                  <Icon d={ICONS.check} className="w-4 h-4" />
                </span>
                <span className="text-sm font-medium">
                  {automationActive ? "Automated Job Search Active" : "Waiting for CV analysis"}
                </span>
              </div>
              <p className="text-xs text-slate-600">
                Last search: {lastSearch ? formatDateTime(lastSearch) : "No searches yet"}
              </p>
              <p className="text-xs text-slate-600">Schedule: {AUTOMATION_SCHEDULE}</p>
              {!loading && stats.total > 0 && (
                <p className="text-xs text-slate-600">
                  Scoring progress: {stats.scored} of {stats.total} jobs scored
                </p>
              )}
            </div>
          </section>
        </div>
      </div>
    </NavAndSidebar>
  );
}