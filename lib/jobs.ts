/* ------------------------------------------------------------------ */
/* Jobs data from the n8n webhook                                      */
/* Place this file at: lib/jobs.ts                                      */
/* ------------------------------------------------------------------ */

export const JOBS_WEBHOOK_URL =
  process.env.NEXT_PUBLIC_JOBS_WEBHOOK_URL || "https://n8naurora.duckdns.org/webhook/job-data";

export const NOT_AVAILABLE = "Not available";

/** One job, cleaned up and ready for the table. Empty values are null. */
export type Job = {
  id: string;
  jobTitle: string | null;
  company: string | null;
  location: string | null;
  matchScore: number | null;
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
  const applyLink = toSafeUrl(
    pick(row, ["applylink", "applyLink", "apply_link", "apply_url", "applyUrl", "url", "link"])
  );

  // Stable id so the "Applied" badge keeps working between page loads
  const rawId = pick(row, ["id", "job_id", "jobId"]);
  const id = rawId || applyLink || `${jobTitle ?? "job"}|${company ?? ""}|${location ?? ""}|${index}`;

  return { id, jobTitle, company, location, matchScore, applyLink };
};

/** Calls the n8n webhook and returns clean jobs. Throws an Error with a user-friendly message. */
export async function fetchJobs(accessToken?: string): Promise<Job[]> {
  let res: Response;
  try {
    res = await fetch(JOBS_WEBHOOK_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      cache: "no-store",
    });
  } catch {
    // Browsers report CORS blocks and offline errors the same way, so the message covers both
    console.error(
      `Request to ${JOBS_WEBHOOK_URL} failed. Check: 1) the n8n workflow is published/active, ` +
        `2) the Webhook node's Allowed Origins includes ${typeof window !== "undefined" ? window.location.origin : "this site"}.`
    );
    throw new Error("Could not reach the job service. Check your connection and try again.");
  }

  if (res.status === 401 || res.status === 403) throw new Error("Your session has expired. Please sign in again.");
  if (res.status === 404) {
    console.error("n8n returned 404: the workflow with this webhook is not published/active.");
    throw new Error("The job service is not active right now. Try again later.");
  }
  if (!res.ok) throw new Error(`The job service returned an error (${res.status}). Try again later.`);

  const text = await res.text();
  if (!text.trim()) return []; // n8n returned an empty body = no jobs

  let payload: unknown;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error("The job service sent data in an unexpected format.");
  }

  // Drop rows that have no useful information at all
  return extractRows(payload)
    .map(normalizeJob)
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