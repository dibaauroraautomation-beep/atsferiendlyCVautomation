"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";
import { fetchJobs, NOT_AVAILABLE, type Job } from "@/lib/jobs";

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

  /* ---------- Load jobs (n8n) + applied badges (Supabase) ---------- */
  const loadJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");

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

  /* ---------- Filter options from the real data ---------- */
  const titleOptions = useMemo(() => unique(jobs.map((j) => j.jobTitle)).map((v) => ({ value: v, label: v })), [jobs]);
  const companyOptions = useMemo(() => unique(jobs.map((j) => j.company)).map((v) => ({ value: v, label: v })), [jobs]);
  const locationOptions = useMemo(() => unique(jobs.map((j) => j.location)).map((v) => ({ value: v, label: v })), [jobs]);

  /* ---------- Apply filters ---------- */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
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
  }, [jobs, search, titleFilter, companyFilter, locationFilter, minScore]);

  const strongMatches = filtered.filter((j) => (j.matchScore ?? 0) >= STRONG_MATCH).length;

  /* ---------- Apply: open the link and save an "application" row ---------- */
  const handleApply = async (job: Job) => {
    if (!job.applyLink) return;
    window.open(job.applyLink, "_blank", "noopener,noreferrer");
    if (appliedJobIds.has(job.id)) return;

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
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by job title, company or location..."
          className="flex-1 min-w-0 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
        />
      </div>

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
              : `${filtered.length} ${filtered.length === 1 ? "job" : "jobs"} found • ${strongMatches} strong ${
                  strongMatches === 1 ? "match" : "matches"
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
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-slate-600">
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-medium">Job Title</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-3 py-3 font-medium">Company</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-3 py-3 font-medium">Location</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-3 py-3 font-medium whitespace-nowrap">Match Score</th>
                <th className="sticky top-0 z-10 bg-slate-50 px-5 py-3 font-medium">Apply</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-400">Loading jobs...</td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-5 py-10 text-center text-slate-500">
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
                  const applied = appliedJobIds.has(job.id);
                  return (
                    <tr key={job.id} className="border-t border-slate-100">
                      <td className="px-5 py-3.5 min-w-[240px] max-w-[420px] break-words"><Cell value={job.jobTitle} strong /></td>
                      <td className="px-3 py-3.5 min-w-[160px] max-w-[260px] break-words"><Cell value={job.company} /></td>
                      <td className="px-3 py-3.5 min-w-[160px] max-w-[260px] break-words"><Cell value={job.location} /></td>
                      <td className="px-3 py-3.5 whitespace-nowrap"><ScoreCell score={job.matchScore} /></td>
                      <td className="px-5 py-3.5">
                        {job.applyLink ? (
                          <button
                            onClick={() => handleApply(job)}
                            disabled={applyingId === job.id}
                            className={`px-4 py-1.5 text-sm font-medium rounded-md whitespace-nowrap transition ${
                              applied
                                ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                                : "bg-indigo-600 hover:bg-indigo-700 text-white disabled:opacity-60"
                            }`}
                          >
                            {applied ? "Applied" : applyingId === job.id ? "Saving..." : "Apply"}
                          </button>
                        ) : (
                          <span className="text-slate-400">{NOT_AVAILABLE}</span>
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
    </div>
  );
}