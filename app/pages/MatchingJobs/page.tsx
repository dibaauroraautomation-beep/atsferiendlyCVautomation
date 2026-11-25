"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
// import { fetchJobs, NOT_AVAILABLE, type Job } from "@/lib/jobs";
import { fetchJobs, triggerJobSearch, NOT_AVAILABLE, type Job } from "@/lib/jobs";
import { generateCoverLetterPDF } from "@/app/components/jsPDF";
import { generateCoverLetterDocx } from "@/app/components/DocxGenerator";
/* ------------------------------------------------------------------ */
/* Jobs come from the n8n webhook (see lib/jobs.ts).                    */
/* Columns: jobtitle, company, matchscore, location, applylink          */
/* Any empty value is shown as "Not available".                         */
/* ------------------------------------------------------------------ */

const STRONG_MATCH = 85;

const SCORE_OPTIONS = [
  { value: "0", label: "Any Match Score" },
  { value: "90", label: "90% and above" },
  { value: "80", label: "80% and above" },
  { value: "70", label: "70% and above" },
];

const unique = (values: (string | null)[]) =>
  Array.from(new Set(values.filter((v): v is string => !!v && v.trim() !== ""))).sort();

/* ------------------------------------------------------------------ */
/* Small components                                                    */
/* ------------------------------------------------------------------ */
function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full px-3 py-2.5 text-sm text-slate-700 bg-white rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400"
    >
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Shows the value, or a grey "Not available" when it's empty. */
function Cell({ value, strong = false }: { value: string | null; strong?: boolean }) {
  if (!value) return <span className="text-slate-400 font-normal">{NOT_AVAILABLE}</span>;
  return <span className={strong ? "font-semibold text-slate-900" : "text-slate-600"}>{value}</span>;
}

function ScoreCell({ score }: { score: number | null }) {
  if (score === null) return <span className="text-slate-400">{NOT_AVAILABLE}</span>;
  const color = score >= STRONG_MATCH ? "text-emerald-600" : score >= 70 ? "text-amber-600" : "text-slate-500";
  return <span className={`font-medium ${color}`}>{score}%</span>;
}
/** Shows a "View" link when the file exists, otherwise "Not available". */
function ViewLink({ href }: { href: string | null }) {
  if (!href) return <span className="text-slate-400 leading-tight">{NOT_AVAILABLE}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
    >
      View
    </a>
  );
}

/** Shows the job date in a readable form; shows the raw text if it is not a real date. */
function formatDate(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
}

/** Status column: what the user picked for a job. */
type JobStatus = "applied" | "not_applied";
const STATUS_OPTIONS: { value: JobStatus; label: string }[] = [
  { value: "applied", label: "Applied" },
  { value: "not_applied", label: "Not Applied" },
];

// shared cell styles for the grid look of the table
const CELL = "border-b border-r border-slate-200 px-3 py-3.5 align-middle";
const CELL_LAST = "border-b border-slate-200 px-3 py-3.5 align-middle";
/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function JobsPage() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();

  const [jobs, setJobs] = useState<Job[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [companyFilter, setCompanyFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [minScore, setMinScore] = useState("0");
  // Webhook search (search icon / Enter)
  const [searching, setSearching] = useState(false);
  const [searchNotice, setSearchNotice] = useState("");
  const [activeSearch, setActiveSearch] = useState<string | null>(null);
  const [letterJob, setLetterJob] = useState<Job | null>(null);   // job whose cover letter is open
  // Name sent to n8n. Uses the name saved on the Supabase account, falls back to the email.
    // Action column: jobs the user already opened ("View" becomes "Viewed")
  const [viewedIds, setViewedIds] = useState<Set<string>>(new Set());
  // Status column: the user's choice per job (falls back to the saved application in Supabase)
  const [statusById, setStatusById] = useState<Record<string, JobStatus>>({});
  const meta = (user?.user_metadata ?? {}) as Record<string, unknown>;
  const profileName =
    String(meta.full_name || meta.name || meta.display_name || meta.username || "").trim() ||
    user?.email?.split("@")[0] ||
    "Unknown";
  /* ---------- Load jobs (n8n) + applied badges (Supabase) ---------- */
  const loadJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");
    setActiveSearch(null);
    setSearchNotice("");
    try {
      // The job-data webhook is public job listings, so no token is sent.
      // Sending an Authorization header would force a CORS "preflight" request,
      // which is what was getting blocked before.
      const [jobsResult, appsRes] = await Promise.all([
        fetchJobs().then(
          (data) => ({ data, error: null as string | null }),
          (err: Error) => ({ data: [] as Job[], error: err.message })
        ),
        supabase.from("user_documents").select("content").eq("type", "application"),
      ]);

      if (jobsResult.error) {
        console.error("Jobs load failed:", jobsResult.error);
        setError(jobsResult.error);
      }
      setJobs(jobsResult.data);

      // Applied badges are optional: a failure here never blocks the page
      if (appsRes.error) {
        console.warn("Applications load failed:", appsRes.error);
        setAppliedJobIds(new Set());
      } else {
        const ids = (appsRes.data ?? [])
          .map((a: { content: { job_id?: string } | null }) => a.content?.job_id)
          .filter((id): id is string => !!id);
        setAppliedJobIds(new Set(ids));
      }
    } catch (err) {
      console.error("Jobs load crashed:", err);
      setError("Could not load your jobs right now. Try again.");
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
    loadJobs();
  }, [authLoading, user, loadJobs]);

  /* ---------- Remember "Viewed" and the Status choice between visits (saved in this browser) ---------- */
  const uiStateKey = user ? `jobs-ui-state:${user.id}` : null;

  useEffect(() => {
    let viewed: string[] = [];
    let status: Record<string, JobStatus> = {};
    if (uiStateKey) {
      try {
        const saved = localStorage.getItem(uiStateKey);
        if (saved) {
          const parsed = JSON.parse(saved) as { viewed?: string[]; status?: Record<string, JobStatus> };
          viewed = parsed.viewed ?? [];
          status = parsed.status ?? {};
        }
      } catch {
        /* ignore a corrupted value */
      }
    }
    setViewedIds(new Set(viewed));
    setStatusById(status);
  }, [uiStateKey]);

  const persistUiState = (viewed: Set<string>, status: Record<string, JobStatus>) => {
    if (!uiStateKey) return;
    try {
      localStorage.setItem(uiStateKey, JSON.stringify({ viewed: Array.from(viewed), status }));
    } catch {
      /* storage full or blocked */
    }
  };
  /* ---------- Filter options from the real data ---------- */
  const titleOptions = useMemo(() => unique(jobs.map((j) => j.jobTitle)).map((v) => ({ value: v, label: v })), [jobs]);
  const companyOptions = useMemo(() => unique(jobs.map((j) => j.company)).map((v) => ({ value: v, label: v })), [jobs]);
  const locationOptions = useMemo(() => unique(jobs.map((j) => j.location)).map((v) => ({ value: v, label: v })), [jobs]);

  /* ---------- Apply filters ---------- */
  const filtered = useMemo(() => {
    // When showing webhook results, don't filter them again by the typed text
    const q = activeSearch ? "" : search.trim().toLowerCase();
    const min = Number(minScore);

    return jobs
      .filter((j) => !titleFilter || j.jobTitle === titleFilter)
      .filter((j) => !companyFilter || j.company === companyFilter)
      .filter((j) => !locationFilter || j.location === locationFilter)
      .filter((j) => min === 0 || (j.matchScore ?? 0) >= min) // jobs without a score only show for "Any"
      .filter((j) => {
        if (!q) return true;
        return [j.jobTitle, j.company, j.location].join(" ").toLowerCase().includes(q);
      })
      .sort((a, b) => (b.matchScore ?? -1) - (a.matchScore ?? -1)); // no score goes last
  }, [jobs, search, activeSearch, titleFilter, companyFilter, locationFilter, minScore]);

  const strongMatches = filtered.filter((j) => (j.matchScore ?? 0) >= STRONG_MATCH).length;

    /* ---------- Action: open the job link and mark the row as "Viewed" ---------- */
  const handleView = (job: Job) => {
    if (!job.applyLink) return;
    window.open(job.applyLink, "_blank", "noopener,noreferrer");
    if (viewedIds.has(job.id)) return;

    const next = new Set(viewedIds).add(job.id);
    setViewedIds(next);
    persistUiState(next, statusById);
  };

  /* ---------- Status: Applied / Not Applied dropdown ---------- */
  const getStatus = (job: Job): JobStatus =>
    statusById[job.id] ?? (appliedJobIds.has(job.id) ? "applied" : "not_applied");

  const handleStatusChange = async (job: Job, status: JobStatus) => {
    const nextStatus = { ...statusById, [job.id]: status };
    setStatusById(nextStatus);
    persistUiState(viewedIds, nextStatus);

    // "Applied" also saves an application row, the same way the old Apply button did
    if (status !== "applied" || appliedJobIds.has(job.id)) return;

    setApplyingId(job.id);
    const { error: insertError } = await supabase.from("user_documents").insert({
      type: "application",
      title: job.jobTitle ?? null,
      content: {
        job_id: job.id,
        title: job.jobTitle,
        company: job.company,
        location: job.location,
        match_score: job.matchScore,
        apply_link: job.applyLink,
        status: "applied",
        applied_at: new Date().toISOString(),
      },
    });
    setApplyingId(null);

    if (insertError) {
      console.error("Saving application failed:", insertError.message);
      return;
    }
    setAppliedJobIds((prev) => new Set(prev).add(job.id));
  };
  /* ---------- Search icon / Enter: send job title + profile name to n8n ---------- */
  const handleSearch = async () => {
    const jobTitle = search.trim();
    if (!jobTitle) {
      setSearchNotice("Type a job title first, then press Enter or click the search icon.");
      return;
    }
    if (searching) return;

    setSearching(true);
    setError("");
    setSearchNotice("");
    try {
      const { jobs: results } = await triggerJobSearch({
        jobTitle,
        profileName,
        email: user?.email ?? "",
        userId: user?.id ?? "",
      });

      if (results) {
        // n8n answered with jobs: show them right away
        setJobs(results);
        setActiveSearch(jobTitle);
        setSearchNotice(
          results.length
            ? `Showing ${results.length} ${results.length === 1 ? "result" : "results"} for "${jobTitle}".`
            : `No jobs found for "${jobTitle}". Try a different title.`
        );
      } else {
        // n8n only confirmed it started: results will arrive in the job list later
        setSearchNotice(`Searching for "${jobTitle}"... New jobs will appear here shortly. Click Refresh to check.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "The job search failed. Please try again.");
    } finally {
      setSearching(false);
    }
  };
  const resetFilters = () => {
    setSearch("");
    setTitleFilter("");
    setCompanyFilter("");
    setLocationFilter("");
    setMinScore("0");
  };

  /* ---------- Render ---------- */
  return (
    // No NavAndSidebar here: ClientLayout already wraps every /pages/* route with it.
    <div className="space-y-4">
      {error && (
        <div className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-lg bg-red-50 border border-red-200 text-sm text-red-600">
          <span>{error}</span>
          <button
            onClick={loadJobs}
            disabled={loading}
            className="px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 rounded-md hover:bg-red-100 disabled:opacity-60"
          >
            {loading ? "Retrying..." : "Try again"}
          </button>
        </div>
      )}

      {/* Search */}
      <div className="flex items-stretch bg-white rounded-lg border border-slate-200 overflow-hidden focus-within:ring-2 focus-within:ring-indigo-200">
        <span className="px-3 flex items-center text-sm text-slate-600 bg-slate-50 border-r border-slate-200 whitespace-nowrap">
          Search Jobs
        </span>
        <input
          type="text"
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            if (searchNotice) setSearchNotice("");
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleSearch();
            }
          }}
          placeholder="Type a job title and press Enter..."
          aria-label="Search jobs by job title"
          className="flex-1 min-w-0 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="button"
          onClick={handleSearch}
          disabled={searching}
          aria-label="Search"
          title="Search"
          className="px-4 flex items-center justify-center text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 transition"
        >
          {searching ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
              <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"
              strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          )}
        </button>
      </div>

      {searchNotice && (
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100 text-sm text-indigo-700">
          <span>{searchNotice}</span>
          {activeSearch && (
            <button onClick={loadJobs} className="font-medium text-indigo-700 hover:text-indigo-900 underline">
              Show all jobs
            </button>
          )}
        </div>
      )}

      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <FilterSelect value={titleFilter} onChange={setTitleFilter} placeholder="Job Title" options={titleOptions} />
        <FilterSelect value={companyFilter} onChange={setCompanyFilter} placeholder="Company" options={companyOptions} />
        <FilterSelect value={locationFilter} onChange={setLocationFilter} placeholder="Location" options={locationOptions} />
        <FilterSelect value={minScore} onChange={setMinScore} options={SCORE_OPTIONS} />
      </div>

      {/* Results table */}
      <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <p className="text-sm text-slate-700">
            {loading
              ? "Loading jobs..."
              : `${filtered.length} ${filtered.length === 1 ? "job" : "jobs"} found • ${strongMatches} strong ${strongMatches === 1 ? "match" : "matches"
              }`}
          </p>
          <button
            onClick={loadJobs}
            disabled={loading}
            className="text-sm text-indigo-600 hover:text-indigo-800 font-medium disabled:opacity-50"
          >
            Refresh
          </button>
        </div>

                {/*
          The table scrolls inside this box (both directions), and the box is never taller
          than the screen. So the left-right scrollbar always sits at the bottom of the
          visible area, and there is only one horizontal scrollbar.
        */}
        <div className="overflow-auto overscroll-contain max-h-[70vh] md:max-h-[calc(100dvh-22rem)] min-h-[16rem]">
          <table className="w-full min-w-[1100px] table-fixed border-separate border-spacing-0 text-sm">
            <colgroup>
              <col className="w-[18%]" />{/* Title */}
              <col className="w-[12%]" />{/* Company */}
              <col className="w-[11%]" />{/* Location */}
              <col className="w-[9%]" />{/* Date */}
              <col className="w-[8%]" />{/* Original Match */}
              <col className="w-[8%]" />{/* Action */}
              <col className="w-[6%]" />{/* ATS CV */}
              <col className="w-[8%]" />{/* ATS Cover Letter */}
              <col className="w-[7%]" />{/* ATS Score */}
              <col className="w-[13%]" />{/* Status */}
            </colgroup>
            <thead>
              {/* Row 1: group headers. Status spans both header rows. */}
              <tr className="text-slate-700">
                <th
                  colSpan={6}
                  className="sticky top-0 z-10 h-10 border-b border-r border-slate-200 bg-slate-100 px-4 text-left font-semibold"
                >
                  Top Matching Jobs
                </th>
                <th
                  colSpan={3}
                  className="sticky top-0 z-10 h-10 border-b border-r border-slate-200 bg-slate-100 px-4 text-left font-semibold"
                >
                  Automation
                </th>
                <th
                  rowSpan={2}
                  className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 text-center font-medium text-slate-600"
                >
                  Status
                </th>
              </tr>
              {/* Row 2: column headers. Sticks right under row 1 (2.5rem tall). */}
              <tr className="text-slate-600">
                {[
                  "Title",
                  "Company",
                  "Location",
                  "Date",
                  "Original Match",
                  "Action",
                  "ATS CV",
                  "ATS Cover Letter",
                  "ATS Score",
                ].map((heading) => (
                  <th
                    key={heading}
                    className="sticky top-[2.5rem] z-10 border-b border-r border-slate-200 bg-slate-50 px-3 py-3 text-center font-medium"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-slate-400">Loading jobs...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-5 py-10 text-center text-slate-500">
                    {jobs.length === 0
                      ? "No jobs yet. Matches will appear here after your next automated search."
                      : "No jobs match these filters."}
                    {jobs.length > 0 && (
                      <button onClick={resetFilters} className="ml-2 text-indigo-600 hover:text-indigo-800 font-medium">
                        Clear filters
                      </button>
                    )}
                  </td>
                </tr>
              ) : (
                filtered.map((job) => {
                  const viewed = viewedIds.has(job.id);
                  const status = getStatus(job);
                  return (
                    <tr key={job.id} className="hover:bg-slate-50/60">
                      {/* Title */}
                      <td className={`${CELL} break-words`}><Cell value={job.jobTitle} strong /></td>
                      {/* Company */}
                      <td className={`${CELL} break-words`}><Cell value={job.company} /></td>
                      {/* Location */}
                      <td className={`${CELL} break-words`}><Cell value={job.location} /></td>
                      {/* Date */}
                      <td className={`${CELL} text-center`}><Cell value={formatDate(job.date)} /></td>
                      {/* Original Match */}
                      <td className={`${CELL} whitespace-nowrap text-center`}><ScoreCell score={job.matchScore} /></td>
                      {/* Action: View, then Viewed once clicked */}
                      <td className={`${CELL} text-center`}>
                        {job.applyLink ? (
                          <button
                            onClick={() => handleView(job)}
                            className={`px-3 py-1 text-sm font-medium rounded-md whitespace-nowrap transition ${viewed
                              ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                              : "bg-indigo-600 hover:bg-indigo-700 text-white"
                              }`}
                          >
                            {viewed ? "Viewed" : "View"}
                          </button>
                        ) : (
                          <span className="text-slate-400">{NOT_AVAILABLE}</span>
                        )}
                      </td>
                      {/* ATS CV */}
                      <td className={`${CELL} text-center`}><ViewLink href={job.cvLink} /></td>
                      {/* ATS Cover Letter */}
                      <td className={`${CELL} text-center`}>
                        {job.coverLetterLink ? (
                          <ViewLink href={job.coverLetterLink} />
                        ) : job.coverLetterText ? (
                          <button
                            onClick={() => setLetterJob(job)}
                            className="font-medium text-indigo-600 hover:text-indigo-800 hover:underline"
                          >
                            View
                          </button>
                        ) : (
                          <span className="text-slate-400 leading-tight">{NOT_AVAILABLE}</span>
                        )}
                      </td>
                      {/* ATS Score (comes from the n8n workflow) */}
                      <td className={`${CELL} whitespace-nowrap text-center`}><ScoreCell score={job.atsScore} /></td>
                      {/* Status: Applied / Not Applied */}
                      <td className={`${CELL_LAST} text-center`}>
                        <select
                          value={status}
                          onChange={(e) => handleStatusChange(job, e.target.value as JobStatus)}
                          disabled={applyingId === job.id}
                          aria-label="Application status"
                          className={`w-full rounded-md border px-2 py-1.5 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-200 disabled:opacity-60 ${status === "applied"
                            ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-600"
                            }`}
                        >
                          {STATUS_OPTIONS.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
              {letterJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setLetterJob(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[80vh] overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-base font-semibold text-slate-900">Cover Letter</h3>
                <p className="truncate text-xs text-slate-500">
                  {letterJob.jobTitle}
                  {letterJob.company ? ` · ${letterJob.company}` : ""}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-3 text-xs font-medium">
                <button
                  onClick={() => generateCoverLetterDocx(letterJob.coverLetterText ?? "")}
                  className="text-slate-500 hover:text-indigo-600"
                >
                  DOCX
                </button>
                <button
                  onClick={() => generateCoverLetterPDF(letterJob.coverLetterText ?? "")}
                  className="text-slate-500 hover:text-indigo-600"
                >
                  PDF
                </button>
                <button
                  onClick={() => setLetterJob(null)}
                  aria-label="Close"
                  className="text-slate-400 hover:text-slate-700"
                >
                  ✕
                </button>
              </div>
            </div>
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-slate-700">
              {letterJob.coverLetterText}
            </p>
          </div>
        </div>
      )}
      </section>
    </div>
  );
}