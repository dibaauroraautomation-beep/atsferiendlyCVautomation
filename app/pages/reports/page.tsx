"use client";

/*
  Applications & Reports page  (/pages/reports)
  Title + description come from pageConfig.ts (shared layout).

  Data: Supabase table "user_documents" (RLS returns only this user's rows)
  - type "application"  -> content: { title, company, status, cv_url, cover_letter_url, url, applied_at }
                           status: "Applied" | "Pending" | "Interview" | "Rejected" | "Offer"
  - type "job"          -> content: { match_score, ... }   (jobs found by the automation)
  - type "resume"       -> counted as "CVs Generated"
  - type "cover_letter" -> counted as "Cover Letters Generated"
*/

import { useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/app/contexts/AuthContext";
import { useT } from "@/app/contexts/LanguageContext";

/* ------------------------------------------------------------------ */
/* Types & helpers                                                     */
/* ------------------------------------------------------------------ */
type AppContent = {
  title?: string;
  company?: string;
  status?: string;
  cv_url?: string;
  cover_letter_url?: string;
  url?: string;
  applied_at?: string;
};
type Row<T> = { id: string; type: string; created_at: string; content: T };

// A job counts as "matching" at or above this score.
const MATCH_THRESHOLD = 70;

const STATUS_STYLES: Record<string, string> = {
  interview: "bg-emerald-500 text-white",
  applied: "bg-blue-500 text-white",
  pending: "bg-amber-400 text-white",
  rejected: "bg-red-500 text-white",
  offer: "bg-violet-500 text-white",
};
const STATUSES = ["Applied", "Pending", "Interview", "Rejected", "Offer"];

const appliedDate = (r: Row<AppContent>) => new Date(r.content?.applied_at || r.created_at);
const fmtDate = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

// Monday 00:00 of the week that contains `d`
function startOfWeek(d: Date) {
  const s = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const day = (s.getDay() + 6) % 7; // Mon = 0
  s.setDate(s.getDate() - day);
  return s;
}
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */
function StatCard({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
      <p className="text-xs font-semibold text-slate-700">{label}</p>
      <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ReportStat({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs font-semibold text-slate-700 leading-tight">{label}</p>
      <p className="text-2xl font-bold text-slate-900">{value}</p>
    </div>
  );
}

function ViewLink({ href, label, icon }: { href?: string; label: string; icon?: boolean }) {
  if (!href) return <span className="text-slate-300">—</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-indigo-600 hover:underline"
    >
      {label}
      {icon && (
        <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H18v4.5M18 6l-7.5 7.5M10.5 6H6v12h12v-4.5" />
        </svg>
      )}
    </a>
  );
}

function FilterSelect({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function ReportsPage() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();
  const t = useT();

  const [rows, setRows] = useState<Row<Record<string, unknown>>[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"applications" | "weekly">("applications");

  // Filters
  const [dateFilter, setDateFilter] = useState("0");
  const [statusFilter, setStatusFilter] = useState("");
  const [titleFilter, setTitleFilter] = useState("");

  /* ---------- Load data ---------- */
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      setLoading(true);
      setError("");
      const { data, error } = await supabase
        .from("user_documents")
        .select("id, type, created_at, content")
        .in("type", ["application", "job", "resume", "cover_letter"])
        .order("created_at", { ascending: false });
      if (error) {
        console.error(error);
        setError(t("Could not load your reports. Refresh the page to try again."));
      }
      setRows((data ?? []) as Row<Record<string, unknown>>[]);
      setLoading(false);
    };
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const applications = useMemo(
    () => rows.filter((r) => r.type === "application") as Row<AppContent>[],
    [rows]
  );

  /* ---------- Top stats ---------- */
  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const inThisWeek = (d: Date) => d >= weekStart && d < weekEnd;
  const statusOf = (r: Row<AppContent>) => (r.content?.status || "").toLowerCase();

  const totalApps = applications.length;
  const appsThisWeek = applications.filter((r) => inThisWeek(appliedDate(r))).length;
  const pending = applications.filter((r) => statusOf(r) === "pending").length;
  const interview = applications.filter((r) => statusOf(r) === "interview").length;

  /* ---------- Weekly report ---------- */
  const weekly = useMemo(() => {
    const thisWeek = rows.filter((r) => inThisWeek(new Date(r.created_at)));
    const jobs = thisWeek.filter((r) => r.type === "job");
    const perDay = DAY_LABELS.map((_, i) => {
      const dayStart = new Date(weekStart);
      dayStart.setDate(dayStart.getDate() + i);
      const dayEnd = new Date(dayStart);
      dayEnd.setDate(dayEnd.getDate() + 1);
      return jobs.filter((j) => {
        const d = new Date(j.created_at);
        return d >= dayStart && d < dayEnd;
      }).length;
    });
    return {
      jobsFound: jobs.length,
      matchingJobs: jobs.filter((j) => Number(j.content?.match_score ?? 0) >= MATCH_THRESHOLD).length,
      cvs: thisWeek.filter((r) => r.type === "resume").length,
      coverLetters: thisWeek.filter((r) => r.type === "cover_letter").length,
      submitted: applications.filter((r) => inThisWeek(appliedDate(r))).length,
      perDay,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, applications]);

  const lastDay = new Date(weekEnd);
  lastDay.setDate(lastDay.getDate() - 1);
  const weekLabel = `${weekStart.toLocaleDateString("en-US", { month: "long", day: "numeric" })}–${lastDay.toLocaleDateString(
    "en-US",
    { day: "numeric", year: "numeric" }
  )}`;
  const maxPerDay = Math.max(1, ...weekly.perDay);

  /* ---------- Filtered table ---------- */
  const titleOptions = useMemo(
    () => Array.from(new Set(applications.map((r) => r.content?.title).filter(Boolean) as string[])).sort(),
    [applications]
  );
  const filtered = applications.filter((r) => {
    const days = Number(dateFilter);
    if (days > 0 && Date.now() - appliedDate(r).getTime() > days * 86400000) return false;
    if (statusFilter && statusOf(r) !== statusFilter.toLowerCase()) return false;
    if (titleFilter && r.content?.title !== titleFilter) return false;
    return true;
  });

  const topApplied = applications.slice(0, 5);

  /* ---------- PDF ---------- */
  const downloadPdf = () => {
    const doc = new jsPDF();
    doc.setFontSize(18);
    doc.text("Weekly Job Search Report", 20, 22);
    doc.setFontSize(11);
    doc.text(`Week: ${weekLabel}`, 20, 32);
    const lines: [string, number][] = [
      ["Jobs Found", weekly.jobsFound],
      ["Matching Jobs", weekly.matchingJobs],
      ["CVs Generated", weekly.cvs],
      ["Cover Letters Generated", weekly.coverLetters],
      ["Applications Submitted", weekly.submitted],
    ];
    lines.forEach(([label, value], i) => doc.text(`${label}: ${value}`, 20, 48 + i * 8));
    doc.text("Jobs found per day:", 20, 98);
    DAY_LABELS.forEach((d, i) => doc.text(`${d}: ${weekly.perDay[i]}`, 26, 106 + i * 7));
    if (topApplied.length) {
      doc.text("Top applied jobs:", 20, 162);
      topApplied.forEach((r, i) =>
        doc.text(`${r.content?.title || "—"}  —  ${r.content?.company || "—"}`, 26, 170 + i * 7)
      );
    }
    doc.save(`weekly-report-${weekStart.toISOString().slice(0, 10)}.pdf`);
  };

  if (authLoading) {
    return <div className="py-20 text-center text-sm text-slate-500">{t("Loading...")}</div>;
  }

  /* ---------- Render ---------- */
  return (
    <div className="space-y-4">
      {/* Tabs (on small screens they switch the view; on large screens both are shown) */}
      <div className="flex gap-6 border-b border-slate-200 text-sm">
        {(["applications", "weekly"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`-mb-px pb-2 border-b-2 transition ${
              tab === k ? "border-indigo-600 text-indigo-700 font-semibold" : "border-transparent text-slate-500"
            }`}
          >
            {k === "applications" ? t("Applications") : t("Weekly Reports")}
          </button>
        ))}
      </div>

      {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">{error}</div>}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* ================= LEFT: Applications ================= */}
        <section className={`space-y-4 ${tab === "applications" ? "" : "hidden lg:block"}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t("Total Applications")} value={totalApps} />
            <StatCard label={t("This Week")} value={appsThisWeek} />
            <StatCard label={t("Pending")} value={pending} />
            <StatCard label={t("Interview")} value={interview} />
          </div>

          <h2 className="text-lg font-semibold text-slate-800">{t("Filters")}</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl">
            <FilterSelect
              value={dateFilter}
              onChange={setDateFilter}
              options={[
                { value: "0", label: t("Date") },
                { value: "7", label: t("Last 7 days") },
                { value: "30", label: t("Last 30 days") },
                { value: "90", label: t("Last 90 days") },
              ]}
            />
            <FilterSelect
              value={statusFilter}
              onChange={setStatusFilter}
              options={[{ value: "", label: t("Status") }, ...STATUSES.map((s) => ({ value: s, label: t(s) }))]}
            />
            <FilterSelect
              value={titleFilter}
              onChange={setTitleFilter}
              options={[{ value: "", label: t("Job Title") }, ...titleOptions.map((v) => ({ value: v, label: v }))]}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-600 border-b border-slate-100">
                  <th className="px-4 py-2.5 font-medium">{t("Job Title")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Company")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Applied Date")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("CV")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Cover Letter")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Status")}</th>
                  <th className="px-4 py-2.5 font-medium">{t("Apply Link")}</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">{t("Loading...")}</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-400">
                      {applications.length === 0 ? t("No applications yet.") : t("No applications match your filters.")}
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => {
                    const c = r.content ?? {};
                    const st = statusOf(r);
                    return (
                      <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{c.title || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{c.company || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(appliedDate(r))}</td>
                        <td className="px-4 py-3"><ViewLink href={c.cv_url} label={t("View")} /></td>
                        <td className="px-4 py-3"><ViewLink href={c.cover_letter_url} label={t("View")} /></td>
                        <td className="px-4 py-3">
                          {c.status ? (
                            <span
                              className={`inline-block rounded-md px-2.5 py-1 text-xs font-medium ${
                                STATUS_STYLES[st] ?? "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {t(c.status)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><ViewLink href={c.url} label={t("View")} icon /></td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ================= RIGHT: Weekly report ================= */}
        <aside className={`space-y-4 ${tab === "weekly" ? "" : "hidden lg:block"}`}>
          <div className="rounded-xl border border-slate-200 bg-white p-5 space-y-4">
            <div>
              <h2 className="text-lg font-bold text-slate-900">{t("Weekly Job Search Report")}</h2>
              <p className="text-sm text-slate-500">{t("Week")}: {weekLabel}</p>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <ReportStat label={t("Jobs Found")} value={weekly.jobsFound} />
              <ReportStat label={t("Matching Jobs")} value={weekly.matchingJobs} />
              <ReportStat label={t("CVs")} value={weekly.cvs} />
              <ReportStat label={t("CVs Generated")} value={weekly.cvs} />
              <ReportStat label={t("Cover Letters Generated")} value={weekly.coverLetters} />
              <ReportStat label={t("Applications Submitted")} value={weekly.submitted} />
            </div>

            {/* Bar chart: jobs found per day */}
            <div>
              <div className="flex items-end gap-2 h-32">
                {weekly.perDay.map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center justify-end h-full">
                    <div
                      title={`${v}`}
                      className="w-full rounded-t bg-indigo-600"
                      style={{ height: `${(v / maxPerDay) * 100}%`, minHeight: v > 0 ? 4 : 0 }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-1 flex gap-2">
                {DAY_LABELS.map((d) => (
                  <span key={d} className="flex-1 text-center text-[11px] text-slate-500">{t(d)}</span>
                ))}
              </div>
            </div>

            <button
              onClick={downloadPdf}
              className="w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {t("Download PDF Report")}
            </button>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white">
            <h3 className="px-5 py-3 text-sm font-semibold text-slate-800 border-b border-slate-100">
              {t("Top Applied Jobs")}
            </h3>
            {topApplied.length === 0 ? (
              <p className="px-5 py-6 text-sm text-slate-400">{t("No applications yet.")}</p>
            ) : (
              <ul>
                {topApplied.map((r) => (
                  <li key={r.id} className="grid grid-cols-2 gap-3 px-5 py-3 text-sm border-b border-slate-100 last:border-0">
                    <span className="font-medium text-slate-800 truncate">{r.content?.title || "—"}</span>
                    <span className="text-slate-600 truncate">{r.content?.company || "—"}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
