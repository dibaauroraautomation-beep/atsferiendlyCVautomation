// Route B: ask the n8n workflow "getJobReport" (server-side only).
import type { ReportData } from "./types";

const DEFAULT_URL = "https://n8naurora.duckdns.org/webhook/e8c2ec9a-f2ef-4029-9161-9a1f82fa1ad7";
const TIMEOUT_MS = 8000;

export async function getReportFromN8n(email?: string | null): Promise<ReportData> {
  const url = process.env.N8N_REPORTS_WEBHOOK_URL || DEFAULT_URL;
  const secret = process.env.N8N_REPORTS_SECRET || "";
  // Set REPORTS_FILTER_BY_EMAIL=false to return every row of the n8n table.
  const filter = process.env.REPORTS_FILTER_BY_EMAIL !== "false";

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
