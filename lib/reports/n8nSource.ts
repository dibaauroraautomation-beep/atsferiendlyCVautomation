// Route B: ask the n8n workflow "getJobReport" (server-side only).
import type { ReportData } from "./types";

const TIMEOUT_MS = 8000;

// url + secret = the n8n webhook link and secret (defined in app/api/reports/route.ts)
export async function getReportFromN8n(url: string, secret: string, email?: string | null): Promise<ReportData> {
  const filter = true; // only this user's rows

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-reports-secret": secret },
      body: JSON.stringify(filter && email ? { email } : {}),
      cache: "no-store",
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`n8n answered ${res.status}`);
    const json = await res.json();
    if (!json || json.ok !== true || !json.stats || !json.weekly || !Array.isArray(json.applications)) {
      throw new Error("n8n returned an unexpected response");
    }
    return {
      stats: json.stats,
      applications: json.applications,
      weekly: json.weekly,
      topApplied: json.topApplied ?? [],
    };
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new Error("n8n timed out");
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
