"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/app/contexts/AuthContext";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Data shape                                                          */
/* ------------------------------------------------------------------ */
/*
  Jobs are read from "user_documents" where type = "job" (RLS = only this user's rows).
  n8n should save each job with a content object like:
  {
    title, company, location,
    work_mode: "remote" | "onsite" | "hybrid",
    experience: "entry" | "mid" | "senior",
    match_score: 94,
    posted_at: "2026-10-04T08:00:00Z",
    apply_url, cv_url, cover_letter_url,
    source: "automatic" | "manual"
  }
  Any missing field simply shows "—" or is skipped by the filters.
*/
type JobContent = {
  title?: string;
  company?: string;
  location?: string;
  work_mode?: string;
  experience?: string;
  match_score?: number | string;
  posted_at?: string;
  apply_url?: string;
  url?: string;
  cv_url?: string;
  cover_letter_url?: string;
  source?: string;
};

type JobRow = { id: string; created_at: string; content: JobContent };

const STRONG_MATCH = 85;

const TIME_OPTIONS = [
  { value: "24h", label: "Last 24 hours", hours: 24 },
  { value: "7d", label: "Last 7 days", hours: 24 * 7 },
  { value: "30d", label: "Last 30 days", hours: 24 * 30 },
  { value: "all", label: "Any time", hours: 0 },
];

const SCORE_OPTIONS = [
  { value: "0", label: "Any Match Score" },
  { value: "90", label: "90% and above" },
  { value: "80", label: "80% and above" },
  { value: "70", label: "70% and above" },
];

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const score = (j: JobRow) => Number(j.content?.match_score ?? 0) || 0;
const postedDate = (j: JobRow) => new Date(j.content?.posted_at || j.created_at);

const timeAgo = (date: Date) => {
  const mins = Math.max(0, Math.floor((Date.now() - date.getTime()) / 60000));
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

const unique = (values: (string | undefined)[]) =>
  Array.from(new Set(values.filter((v): v is string => !!v && v.trim() !== ""))).sort();

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

type DbError = { code?: string; message?: string };

/** True when the table does not exist yet (schema.sql not run). */
const isMissingTable = (e: DbError) =>
  e.code === "PGRST205" || e.code === "42P01" || /schema cache|does not exist/i.test(e.message ?? "");

/** Turns Supabase errors into a short message the user can act on. */
const friendlyError = (e: DbError) => {
  const msg = (e.message ?? "").toLowerCase();
  if (msg.includes("jwt") || msg.includes("token")) return "Your session has expired. Please log out and sign in again.";
  if (e.code === "42501" || msg.includes("permission")) return "You don't have permission to read these jobs. Please sign in again.";
  return "Could not load your jobs right now.";
};

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

function ViewLink({ href }: { href?: string }) {
  if (!href) return <span className="text-slate-300">—</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:text-indigo-800 font-medium">
      View
    </a>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function JobsPage() {
  const supabase = createClient();
  const { user, loading: authLoading } = useAuth();

  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [appliedJobIds, setAppliedJobIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [applyingId, setApplyingId] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [titleFilter, setTitleFilter] = useState("");
  const [locationFilter, setLocationFilter] = useState("");
  const [workMode, setWorkMode] = useState("");
  const [experience, setExperience] = useState("");
  const [minScore, setMinScore] = useState("0");
  const [timeRange, setTimeRange] = useState("24h");
  const [automatic, setAutomatic] = useState(true);

  /* ---------- Load jobs + applications ---------- */
  const loadJobs = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError("");

    try {
      // Make sure the session is fresh before querying (avoids errors from an expired token)
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        setJobs([]);
        setAppliedJobIds(new Set());
        setError("Your session has expired. Please log out and sign in again.");
        return;
      }

      const [jobsRes, appsRes] = await Promise.all([
        supabase
          .from("user_documents")
          .select("id, created_at, content")
          .eq("type", "job")
          .order("created_at", { ascending: false }),
        supabase.from("user_documents").select("content").eq("type", "application"),
      ]);

      // Jobs: the main data. Only this failing shows a message.
      if (jobsRes.error) {
        console.error("Jobs load failed:", jobsRes.error);
        if (isMissingTable(jobsRes.error)) {
          // Table not created yet: treat as "no jobs" instead of a scary error
          setJobs([]);
          console.warn("user_documents table not found. Run supabase/schema.sql in the Supabase SQL Editor.");
        } else {
          setError(friendlyError(jobsRes.error));
        }
      } else {
        setJobs((jobsRes.data ?? []) as JobRow[]);
      }

      // Applications: only used for the "Applied" badge, so a failure here never blocks the page
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
      // Network problems (offline, Supabase unreachable)
      console.error("Jobs load crashed:", err);
      setError("Could not connect to the server. Check your internet connection and try again.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    if (authLoading) return; // wait until we know who is logged in
    if (!user) {
      setLoading(false);
      return;
    }
    loadJobs();
  }, [authLoading, user, loadJobs]);

  /* ---------- Filter options built from the real data ---------- */
  const titleOptions = useMemo(() => unique(jobs.map((j) => j.content.title)).map((v) => ({ value: v, label: v })), [jobs]);
  const locationOptions = useMemo(() => unique(jobs.map((j) => j.content.location)).map((v) => ({ value: v, label: v })), [jobs]);
  const workModeOptions = useMemo(
    () => unique(jobs.map((j) => j.content.work_mode?.toLowerCase())).map((v) => ({ value: v, label: cap(v) })),
    [jobs]
  );
  const experienceOptions = useMemo(
    () => unique(jobs.map((j) => j.content.experience?.toLowerCase())).map((v) => ({ value: v, label: cap(v) })),
    [jobs]
  );

  /* ---------- Apply filters ---------- */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const hours = TIME_OPTIONS.find((t) => t.value === timeRange)?.hours ?? 0;
    const since = hours ? Date.now() - hours * 3600 * 1000 : 0;
    const wantedSource = automatic ? "automatic" : "manual";

    return jobs
      .filter((j) => (j.content.source || "automatic") === wantedSource)
      .filter((j) => !titleFilter || j.content.title === titleFilter)
      .filter((j) => !locationFilter || j.content.location === locationFilter)
      .filter((j) => !workMode || j.content.work_mode?.toLowerCase() === workMode)
      .filter((j) => !experience || j.content.experience?.toLowerCase() === experience)
      .filter((j) => score(j) >= Number(minScore))
      .filter((j) => !since || postedDate(j).getTime() >= since)
      .filter((j) => {
        if (!q) return true;
        const text = [j.content.title, j.content.company, j.content.location].join(" ").toLowerCase();
        return text.includes(q);
      })
      .sort((a, b) => score(b) - score(a));
  }, [jobs, search, titleFilter, locationFilter, workMode, experience, minScore, timeRange, automatic]);

  const strongMatches = filtered.filter((j) => score(j) >= STRONG_MATCH).length;
  const timeLabel = TIME_OPTIONS.find((t) => t.value === timeRange)?.label.toLowerCase() ?? "";

  /* ---------- Apply: open the job and save an "application" row ---------- */
  const handleApply = async (job: JobRow) => {
    const link = job.content.apply_url || job.content.url;
    if (link) window.open(link, "_blank", "noopener,noreferrer");
    if (appliedJobIds.has(job.id)) return;

    setApplyingId(job.id);
    const { error: insertError } = await supabase.from("user_documents").insert({
      type: "application",
      title: job.content.title ?? null,
      content: {
        job_id: job.id,
        title: job.content.title,
        company: job.content.company,
        location: job.content.location,
        match_score: score(job),
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
    setLocationFilter("");
    setWorkMode("");
    setExperience("");
    setMinScore("0");
    setTimeRange("all");
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
            placeholder="Search by keywords, skills..."
            className="flex-1 min-w-0 px-3 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 focus:outline-none"
          />
        </div>

        {/* Filters */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-3">
          <FilterSelect value={titleFilter} onChange={setTitleFilter} placeholder="Job Title" options={titleOptions} />
          <FilterSelect value={locationFilter} onChange={setLocationFilter} placeholder="Location" options={locationOptions} />
          <FilterSelect value={workMode} onChange={setWorkMode} placeholder="Remote/On-site" options={workModeOptions} />
          <FilterSelect value={experience} onChange={setExperience} placeholder="Experience" options={experienceOptions} />
          <FilterSelect value={minScore} onChange={setMinScore} options={SCORE_OPTIONS} />
          <FilterSelect
            value={timeRange}
            onChange={setTimeRange}
            options={TIME_OPTIONS.map((t) => ({ value: t.value, label: t.label }))}
          />
        </div>

        {/* Automatic / Manual toggle */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            role="switch"
            aria-checked={automatic}
            onClick={() => setAutomatic((p) => !p)}
            className={`relative w-10 h-6 rounded-full transition ${automatic ? "bg-blue-600" : "bg-slate-300"}`}
          >
            <span
              className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${
                automatic ? "translate-x-4" : ""
              }`}
            />
          </button>
          <button
            type="button"
            onClick={() => setAutomatic(true)}
            className={`text-sm ${automatic ? "font-semibold text-slate-800" : "text-slate-500"}`}
          >
            Automatic Matches
          </button>
          <span className="text-slate-300">|</span>
          <button
            type="button"
            onClick={() => setAutomatic(false)}
            className={`text-sm ${!automatic ? "font-semibold text-slate-800" : "text-slate-500"}`}
          >
            Manual Search
          </button>
        </div>

        {/* Results table */}
        <section className="bg-white rounded-xl border border-slate-200 overflow-hidden">
          <p className="px-5 py-3 text-sm text-slate-700 border-b border-slate-100">
            {loading
              ? "Loading jobs..."
              : `${filtered.length} ${filtered.length === 1 ? "job" : "jobs"} found ${timeLabel === "any time" ? "" : timeLabel} • ${strongMatches} strong ${
                  strongMatches === 1 ? "match" : "matches"
                }`}
          </p>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-slate-600">
                  <th className="px-5 py-3 font-medium">Job Title</th>
                  <th className="px-3 py-3 font-medium">Company</th>
                  <th className="px-3 py-3 font-medium">Location</th>
                  <th className="px-3 py-3 font-medium">Match Score</th>
                  <th className="px-3 py-3 font-medium">Posted</th>
                  <th className="px-3 py-3 font-medium">CV</th>
                  <th className="px-3 py-3 font-medium">Cover Letter</th>
                  <th className="px-5 py-3 font-medium">Apply</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-slate-400">Loading jobs...</td>
                  </tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="px-5 py-10 text-center text-slate-500">
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
                    const s = score(job);
                    const applied = appliedJobIds.has(job.id);
                    return (
                      <tr key={job.id} className="border-t border-slate-100">
                        <td className="px-5 py-3.5 font-semibold text-slate-900 whitespace-nowrap">
                          {job.content.title || "Untitled role"}
                        </td>
                        <td className="px-3 py-3.5 text-slate-600 whitespace-nowrap">{job.content.company || "—"}</td>
                        <td className="px-3 py-3.5 text-slate-600 whitespace-nowrap">{job.content.location || "—"}</td>
                        <td
                          className={`px-3 py-3.5 font-medium ${
                            s >= STRONG_MATCH ? "text-emerald-600" : s >= 70 ? "text-amber-600" : "text-slate-500"
                          }`}
                        >
                          {s}%
                        </td>
                        <td className="px-3 py-3.5 text-slate-600 whitespace-nowrap">{timeAgo(postedDate(job))}</td>
                        <td className="px-3 py-3.5"><ViewLink href={job.content.cv_url} /></td>
                        <td className="px-3 py-3.5"><ViewLink href={job.content.cover_letter_url} /></td>
                        <td className="px-5 py-3.5">
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