/* ------------------------------------------------------------------ */
/* Jobs data from the n8n webhook                                      */
/* Place this file at: lib/jobs.ts                                      */
/* ------------------------------------------------------------------ */

// import page from "@/app/pages/reports/page";
import { createClient } from "@/lib/supabase/client";

// export const JOBS_WEBHOOK_URL =
//   process.env.NEXT_PUBLIC_JOBS_WEBHOOK_URL || "https://n8naurora.duckdns.org/webhook/job-data";
export const JOBS_WEBHOOK_URL = "/api/jobs";

export const NOT_AVAILABLE = "Not available";

/** One job, cleaned up and ready for the table. Empty values are null. */
export type Job = {
  id: string;
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  matchScore: number | null;
  cvLink: string | null;
  coverLetterLink: string | null;
  applyLink: string | null;
};

type RawRow = Record<string, unknown>;

/* ---------- small helpers ---------- */

/** Returns the first non-empty value among several possible column names. */
const pick = (row: RawRow, keys: string[]): string | null => {
  for (const key of keys) {
    const value = row[key];
    if (value === undefined || value === null) continue;
    const text = String(value).trim();
    if (text !== "" && text.toLowerCase() !== "null" && text.toLowerCase() !== "undefined") return text;
  }
  return null;
};

/** "85", "85%", 85, 0.85 -> 85. Anything else -> null. */
const toScore = (value: string | null): number | null => {
  if (!value) return null;
  const n = Number(value.replace("%", "").trim());
  if (!Number.isFinite(n)) return null;
  const pct = n > 0 && n < 1 ? n * 100 : n; // supports 0-1 scores too
  return Math.max(0, Math.min(100, Math.round(pct)));
};

/** Only allow real web links (blocks "javascript:" and other unsafe links). */
const toSafeUrl = (value: string | null): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

/** Accepts the different shapes n8n can return: [...], {jobs:[...]}, {data:[...]}, [{json:{...}}]. */
const extractRows = (payload: unknown): RawRow[] => {
  let list: unknown = payload;
  if (list && !Array.isArray(list) && typeof list === "object") {
    const obj = list as Record<string, unknown>;
    list = obj.jobs ?? obj.data ?? obj.items ?? obj.results ?? [obj];
  }
  if (!Array.isArray(list)) return [];
  return list
    .map((item) => {
      if (item && typeof item === "object" && "json" in item && typeof (item as RawRow).json === "object") {
        return (item as { json: RawRow }).json;
      }
      return item as RawRow;
    })
    .filter((row): row is RawRow => !!row && typeof row === "object");
};

/** Turns one webhook row into a Job. Column names are matched loosely. */
export const normalizeJob = (row: RawRow, index: number): Job => {
  const jobTitle = pick(row, ["jobtitle", "jobTitle", "job_title", "title"]);
  const company = pick(row, ["company", "company_name", "companyName"]);
  const location = pick(row, ["location", "job_location"]);
  const matchScore = toScore(pick(row, ["matchscore", "matchScore", "match_score", "score"]));
  const cvLink = toSafeUrl(pick(row, ["cvlink", "cvLink", "cv_link", "cv_url", "cvUrl"]));
  const coverLetterLink = toSafeUrl(
    pick(row, ["coverletterlink", "coverLetterLink", "cover_letter_link", "cover_letter_url", "coverLetterUrl"])
  );
  const applyLink = toSafeUrl(
    pick(row, ["applylink", "applyLink", "apply_link", "apply_url", "applyUrl", "url", "link"])
  );

  // Stable id so the "Applied" badge keeps working between page loads
  const rawId = pick(row, ["id", "job_id", "jobId"]);
  const id = rawId || applyLink || `${jobTitle ?? "job"}|${company ?? ""}|${location ?? ""}|${index}`;

  return { id, jobTitle, company, location, matchScore, cvLink, coverLetterLink, applyLink };
};

/** Calls the n8n webhook and returns clean jobs. Throws an Error with a user-friendly message. */
/** Loads the logged-in user's jobs from Supabase "job_matches". RLS makes sure each user sees only their own rows. */
export async function fetchJobs(): Promise<Job[]> {
  const supabase = createClient();

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) throw new Error("Your session has expired. Please sign in again.");

  const { data, error } = await supabase
    .from("job_matches")
    .select("job_id, title, company, location, apply_url, match_score, cv, coverletter, created_at")
    .eq("user_id", user.id)
    .order("match_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.error("job_matches load failed:", error);
    throw new Error("Could not load your jobs right now. Try again.");
  }

  return (data ?? [])
    .map((m: RawRow, i: number) =>
      normalizeJob(
        {
          id: m.job_id,
          jobtitle: m.title,
          company: m.company,
          location: m.location,
          matchscore: m.match_score,
          applylink: m.apply_url,
          cvlink: m.cv,
          coverletterlink: m.coverletter,
        },
        i
      )
    )
    .filter((j) => j.jobTitle || j.company || j.location || j.applyLink);
}

/* ------------------------------------------------------------------ */
/* Manual search: sends the job title + profile name to n8n             */
/* ------------------------------------------------------------------ */

export const SEARCH_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_SEARCH_WEBHOOK_URL || "https://n8naurora.duckdns.org/webhook/search-query";

export type SearchInput = {
  jobTitle: string;
  profileName: string;
  email?: string;
  userId?: string;
};

/**
 * Triggers the n8n "search-query" webhook.
 * Sent as a simple form POST (no custom headers), so the browser does not need a
 * CORS preflight. In n8n the values are in: $json.body.jobtitle, $json.body.profile_name,
 * $json.body.email, $json.body.user_id
 *
 * Returns jobs if n8n answers with a list of jobs, otherwise null
 * (for example when the webhook only replies "Workflow was started").
 */
export async function triggerJobSearch(input: SearchInput): Promise<{ jobs: Job[] | null }> {
  const body = new URLSearchParams({
    jobtitle: input.jobTitle,
    profile_name: input.profileName,
    email: input.email ?? "",
    user_id: input.userId ?? "",
  });

  let res: Response;
  try {
    res = await fetch(SEARCH_WEBHOOK_URL, { method: "POST", body, cache: "no-store" });
  } catch {
    console.error(
      `Request to ${SEARCH_WEBHOOK_URL} failed. Check that the n8n workflow is published and ` +
      `that the Webhook node's Allowed Origins includes this website.`
    );
    throw new Error("Could not reach the job search service. Please try again.");
  }

  if (res.status === 404) {
    console.error("n8n returned 404: the search-query workflow is not published, or the method is not POST.");
    throw new Error("The job search service is not active right now. Try again later.");
  }
  if (!res.ok) throw new Error(`The job search failed (${res.status}). Please try again.`);

  const text = await res.text();
  if (!text.trim()) return { jobs: null };

  try {
    const payload: unknown = JSON.parse(text);
    const obj = payload as Record<string, unknown> | null;
    const hasList =
      Array.isArray(payload) ||
      (!!obj && typeof obj === "object" && ["jobs", "data", "items", "results"].some((k) => Array.isArray(obj[k])));
    if (!hasList) return { jobs: null };

    const jobs = extractRows(payload)
      .map(normalizeJob)
      .filter((j) => j.jobTitle || j.company || j.location || j.applyLink);
    return { jobs };
  } catch {
    return { jobs: null }; // not JSON, e.g. a plain "OK"
  }
}