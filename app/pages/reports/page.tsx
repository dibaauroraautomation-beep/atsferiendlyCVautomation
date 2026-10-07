"use client";

/*
  Applications & Reports page  (/pages/reports)
  Title + description come from pageConfig.ts (shared layout).

  Data: GET /api/reports  (server route, one JSON shape)
  - Route A: Supabase table "user_documents"  (types: application, job, resume, cover_letter)
  - Route B: n8n workflow "getJobReport" (reads the n8n data table)
  REPORTS_SOURCE in .env.local picks which one is tried first; if it fails the other one is
  used automatically and `fallback: true` is returned (a small notice is shown below).
*/

import { useCallback, useEffect, useMemo, useState } from "react";
import { jsPDF } from "jspdf";
import { useAuth } from "@/app/contexts/AuthContext";
import { useT } from "@/app/contexts/LanguageContext";
import type { ReportApplication, ReportResponse } from "@/lib/reports/types";

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const STATUS_STYLES: Record<string, string> = {
  interview: "bg-emerald-500 text-white",
  applied: "bg-blue-500 text-white",
  pending: "bg-amber-400 text-white",
  rejected: "bg-red-500 text-white",
  offer: "bg-violet-500 text-white",
};
const STATUSES = ["Applied", "Pending", "Interview", "Rejected", "Offer"];
const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// "YYYY-MM-DD" -> Date at UTC midnight (so the day never shifts with the browser time zone)
const toDate = (s: string | null) => (s ? new Date(`${s}T00:00:00Z`) : null);
const fmtDate = (s: string | null) => {
  const d = toDate(s);
  return d ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }) : "—";
};
function fmtWeek(startIso?: string, endIso?: string) {
  const a = toDate(startIso ?? null);
  const b = toDate(endIso ?? null);
  if (!a || !b) return "";
  const o = { timeZone: "UTC" } as const;
  if (a.getUTCMonth() === b.getUTCMonth()) {
    return `${a.toLocaleDateString("en-US", { month: "long", day: "numeric", ...o })}–${b.toLocaleDateString("en-US", {
      day: "numeric",
      year: "numeric",
      ...o,
    })}`;
  }
  return `${a.toLocaleDateString("en-US", { month: "short", day: "numeric", ...o })} – ${b.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    ...o,
  })}`;
}

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
  const { user, loading: authLoading } = useAuth();
  const t = useT();

  const [report, setReport] = useState<ReportResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"applications" | "weekly">("applications");

  // Filters
  const [dateFilter, setDateFilter] = useState("0");
  const [statusFilter, setStatusFilter] = useState("");
  const [titleFilter, setTitleFilter] = useState("");

  /* ---------- Load data ---------- */
  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/reports", { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setReport((await res.json()) as ReportResponse);
    } catch (e) {
      console.error(e);
      setError(t("Could not load your reports. Refresh the page to try again."));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const applications: ReportApplication[] = report?.applications ?? [];
  const stats = report?.stats ?? { total: 0, thisWeek: 0, pending: 0, interview: 0 };
  const weekly = report?.weekly ?? {
    weekStart: "",
    weekEnd: "",
    jobsFound: 0,
    matchingJobs: 0,
    cvs: 0,
    cvsGenerated: 0,
    coverLetters: 0,
    submitted: 0,
    perDay: [0, 0, 0, 0, 0, 0, 0],
  };
  const topApplied = report?.topApplied ?? [];

  const weekLabel = fmtWeek(weekly.weekStart, weekly.weekEnd);
  const maxPerDay = Math.max(1, ...weekly.perDay);

  /* ---------- Filtered table ---------- */
  const titleOptions = useMemo(
    () => Array.from(new Set(applications.map((r) => r.title).filter(Boolean))).sort(),
    [applications]
  );
  const filtered = applications.filter((r) => {
    const days = Number(dateFilter);
    const d = toDate(r.appliedAt);
    if (days > 0 && d && Date.now() - d.getTime() > days * 86400000) return false;
    if (statusFilter && r.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
    if (titleFilter && r.title !== titleFilter) return false;
    return true;
  });

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
      ["CVs", weekly.cvs],
      ["CVs Generated", weekly.cvsGenerated],
      ["Cover Letters Generated", weekly.coverLetters],
      ["Applications Submitted", weekly.submitted],
    ];
    lines.forEach(([label, value], i) => doc.text(`${label}: ${value}`, 20, 48 + i * 8));
    doc.text("Jobs found per day:", 20, 106);
    DAY_LABELS.forEach((d, i) => doc.text(`${d}: ${weekly.perDay[i]}`, 26, 114 + i * 7));
    if (topApplied.length) {
      doc.text("Top applied jobs:", 20, 170);
      topApplied.forEach((r, i) => doc.text(`${r.title || "—"}  —  ${r.company || "—"}`, 26, 178 + i * 7));
    }
    doc.save(`weekly-report-${weekly.weekStart || "current"}.pdf`);
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

      {error && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600">
          <span>{error}</span>
          <button onClick={load} className="rounded-md border border-red-300 px-2.5 py-1 font-medium hover:bg-red-100">
            {t("Retry")}
          </button>
        </div>
      )}
      {report?.fallback && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          {report.source === "supabase"
            ? t("Showing data from Supabase because n8n is unavailable right now.")
            : t("Showing data from n8n because Supabase is unavailable right now.")}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_340px] gap-6 items-start">
        {/* ================= LEFT: Applications ================= */}
        <section className={`space-y-4 ${tab === "applications" ? "" : "hidden lg:block"}`}>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard label={t("Total Applications")} value={stats.total} />
            <StatCard label={t("This Week")} value={stats.thisWeek} />
            <StatCard label={t("Pending")} value={stats.pending} />
            <StatCard label={t("Interview")} value={stats.interview} />
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
                    const st = r.status.toLowerCase();
                    return (
                      <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                        <td className="px-4 py-3 font-semibold text-slate-800">{r.title || "—"}</td>
                        <td className="px-4 py-3 text-slate-600">{r.company || "—"}</td>
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">{fmtDate(r.appliedAt)}</td>
                        <td className="px-4 py-3"><ViewLink href={r.cvUrl} label={t("View")} /></td>
                        <td className="px-4 py-3"><ViewLink href={r.coverLetterUrl} label={t("View")} /></td>
                        <td className="px-4 py-3">
                          {r.status ? (
                            <span
                              className={`inline-block rounded-md px-2.5 py-1 text-xs font-medium ${
                                STATUS_STYLES[st] ?? "bg-slate-200 text-slate-700"
                              }`}
                            >
                              {t(r.status)}
                            </span>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><ViewLink href={r.url} label={t("View")} icon /></td>
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
              <ReportStat label={t("CVs Generated")} value={weekly.cvsGenerated} />
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
                    <span className="font-medium text-slate-800 truncate">{r.title || "—"}</span>
                    <span className="text-slate-600 truncate">{r.company || "—"}</span>
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
