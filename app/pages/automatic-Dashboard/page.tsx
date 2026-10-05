"use client";

export const dynamic = "force-dynamic";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import NavAndSidebar from "@/app/components/navAndSidebar"; // same NavAndSidebar the Jobs page uses
import { createClient } from "@/lib/supabase/client";

/*
  Uses the existing NavAndSidebar component (same sidebar + navbar as the Jobs page).
*/

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
// A job counts as "matching" when its match score is at least this value.
const MATCH_THRESHOLD = 70;
// Write the same schedule you set on the n8n Schedule Trigger.
const AUTOMATION_SCHEDULE = "Daily at 8:00 AM";
// Sidebar menu for automated users (same 4 items as the Jobs page)
const AUTOMATED_MENU = [
  { name: "Dashboard", key: "automatic-Dashboard" },
  { name: "Jobs", key: "jobs" },
  { name: "Reports", key: "reports" },
  { name: "Profile", key: "profile" },
];
/*
  Data this page reads (all from "user_documents", filtered per user by RLS):
  - type "job"          -> content: { title, company, location, match_score, url? }
  - type "resume"       -> counted as "CVs Generated"
  - type "application"  -> counted as "Applications This Week"
*/

type JobContent = {
  title?: string;
  company?: string;
  location?: string;
  match_score?: number | string;
  url?: string;
  apply_url?: string;
};

type JobRow = { id: string; created_at: string; content: JobContent };

type Stats = {
  jobsToday: number;
  matchingJobs: number;
  cvsGenerated: number;
  applicationsThisWeek: number;
};

type DbError = { code?: string; message?: string };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());

const score = (j: JobRow) => Number(j.content?.match_score ?? 0) || 0;

const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "2-digit", month: "short" });

const formatDateTime = (iso: string) =>
  new Date(iso).toLocaleString(undefined, {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  });

/** True when the table does not exist yet (schema.sql not run). */
const isMissingTable = (e: DbError) =>
  e.code === "PGRST205" || e.code === "42P01" || /schema cache|does not exist/i.test(e.message ?? "");

/** Turns Supabase errors into a short message the user can act on. */
const friendlyError = (e: DbError) => {
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("jwt") || msg.includes("token")) return "Your session has expired. Please log out and sign in again.";
  if (e.code === "42501" || msg.includes("permission")) return "You don't have permission to read this data. Please sign in again.";
  return "Could not load your dashboard data right now.";
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
function StatCard({ label, value, icon }: { label: string; value: number | string; icon: string }) {
  return (
    <div className="bg-white rounded-xl border border-slate-200 p-4 flex items-start justify-between">
      <div>
        <p className="text-sm text-slate-600">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
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
        {/* X axis */}
        <div className="flex justify-between mt-2 text-[11px] text-slate-400">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function AutomaticDashboardPage() {
  const supabase = createClient();
  const { user, profile, loading: authLoading } = useAuth();

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [stats, setStats] = useState<Stats>({
    jobsToday: 0,
    matchingJobs: 0,
    cvsGenerated: 0,
    applicationsThisWeek: 0,
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  /* ---------- First name for the welcome line (never the email) ---------- */
  const firstName = useMemo(() => {
    return (
      profile?.first_name ||
      (user?.user_metadata?.first_name as string | undefined) ||
      "there"
    );
  }, [profile, user]);

  /* ---------- Load data (RLS returns only this user's rows) ---------- */
  const loadData = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setError("Your session has expired. Please log out and sign in again.");
        return;
      }

      const today = startOfDay(new Date());
      const weekAgo = new Date(today);
      weekAgo.setDate(weekAgo.getDate() - 6);

      const [jobsRes, cvRes, appRes] = await Promise.all([
        supabase
          .from("user_documents")
          .select("id, created_at, content")
          .eq("type", "job")
          .order("created_at", { ascending: false }),
        supabase
          .from("user_documents")
          .select("id", { count: "exact", head: true })
          .eq("type", "resume"),
        supabase
          .from("user_documents")
          .select("id", { count: "exact", head: true })
          .eq("type", "application")
          .gte("created_at", weekAgo.toISOString()),
      ]);

      // Show a message only for real problems; a missing table just means "no data yet"
      const firstError = (jobsRes.error || cvRes.error || appRes.error) as DbError | null;
      if (firstError) {
        console.error("Dashboard load failed:", firstError);
        if (isMissingTable(firstError)) {
          console.warn("user_documents table not found. Run supabase/schema.sql in the Supabase SQL Editor.");
        } else {
          setError(friendlyError(firstError));
        }
      }

      const jobRows = (jobsRes.error ? [] : jobsRes.data ?? []) as JobRow[];
      setJobs(jobRows);
      setStats({
        jobsToday: jobRows.filter((j) => new Date(j.created_at) >= today).length,
        matchingJobs: jobRows.filter((j) => score(j) >= MATCH_THRESHOLD).length,
        cvsGenerated: cvRes.error ? 0 : cvRes.count ?? 0,
        applicationsThisWeek: appRes.error ? 0 : appRes.count ?? 0,
      });
    } catch (err) {
      console.error("Dashboard load crashed:", err);
      setError("Could not connect to the server. Check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      setLoading(false);
      return;
    }
    loadData();
  }, [authLoading, user, loadData]);

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
        const t = new Date(j.created_at);
        return t >= d && t < next;
      }).length;
    });
    const labels = days.map((d) => d.toLocaleDateString(undefined, { weekday: "short" }));
    return { labels, values };
  }, [jobs]);

  const topJobs = useMemo(() => [...jobs].sort((a, b) => score(b) - score(a)).slice(0, 5), [jobs]);

  const lastSearch = jobs[0]?.created_at;
  const automationActive = Boolean(profile?.cv_path) || jobs.length > 0;

  /* ---------- Render ---------- */
  return (
    <NavAndSidebar
      pageInfo={["Dashboard", "", "automatic-Dashboard"]}
      user={["", "", 0, "", ""]}
      menu={AUTOMATED_MENU}
    >
    <div className="space-y-5">
      <div>
        <h2 className="text-2xl font-bold text-slate-900">Welcome back, {firstName}</h2>
        <p className="text-sm text-slate-500 mt-1">
          {automationActive
            ? "Your automated job search is running."
            : "Your automated job search will start once your CV is processed."}
        </p>
      </div>

      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
          <span>{error}</span>
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
        <StatCard label="Jobs Found Today" value={loading ? "–" : stats.jobsToday} icon={ICONS.search} />
        <StatCard label="Matching Jobs" value={loading ? "–" : stats.matchingJobs} icon={ICONS.target} />
        <StatCard label="CVs Generated" value={loading ? "–" : stats.cvsGenerated} icon={ICONS.doc} />
        <StatCard label="Applications This Week" value={loading ? "–" : stats.applicationsThisWeek} icon={ICONS.send} />
      </div>

      {/* Chart */}
      <section className="bg-white rounded-xl border border-slate-200 p-5">
        <h3 className="text-sm font-semibold text-slate-900 mb-4">Job Search Activity</h3>
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
                  topJobs.map((job) => {
                    const s = score(job);
                    const link = job.content.url || job.content.apply_url;
                    return (
                      <tr key={job.id} className="border-t border-slate-100">
                        <td className="px-5 py-3 font-semibold text-slate-900 whitespace-nowrap">
                          {job.content.title || "Untitled role"}
                        </td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{job.content.company || "—"}</td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{job.content.location || "—"}</td>
                        <td
                          className={`px-3 py-3 font-medium ${
                            s >= 85 ? "text-emerald-600" : s >= MATCH_THRESHOLD ? "text-amber-600" : "text-slate-500"
                          }`}
                        >
                          {s}%
                        </td>
                        <td className="px-3 py-3 text-slate-600 whitespace-nowrap">{formatDate(job.created_at)}</td>
                        <td className="px-5 py-3">
                          {link ? (
                            <a
                              href={link}
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
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 h-fit">
          <h3 className="text-sm font-semibold text-slate-900 px-5 py-4 border-b border-slate-100">
            Automation Status
          </h3>
          <div className="p-5 space-y-3">
            <div
              className={`flex items-center gap-3 p-3 rounded-lg ${
                automationActive ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-800"
              }`}
            >
              <span
                className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-white ${
                  automationActive ? "bg-emerald-500" : "bg-amber-500"
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
          </div>
        </section>
      </div>
    </div>
    </NavAndSidebar>
  );
}