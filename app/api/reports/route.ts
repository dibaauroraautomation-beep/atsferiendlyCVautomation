import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getReportFromSupabase } from "@/lib/reports/supabaseSource";
import { getReportFromN8n } from "@/lib/reports/n8nSource";
import type { ReportSource } from "@/lib/reports/types";

export const dynamic = "force-dynamic";

// n8n workflow "getJobReport" (production webhook URL; the workflow must be published).
// Must be the same secret as in the Build Report node of that workflow.
const REPORTS_WEBHOOK_URL = "https://n8naurora.duckdns.org/webhook/e8c2ec9a-f2ef-4029-9161-9a1f82fa1ad7";
const REPORTS_SECRET = "c502c856ce500225bb39d0ea5d7a36ab70f9778eebeb116f";

// GET /api/reports            -> reads from n8n first, falls back to Supabase
// GET /api/reports?source=n8n -> force which route is tried first (handy for testing)
export async function GET(request: NextRequest) {
  const supabase = await createServerSupabase();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const wanted = request.nextUrl.searchParams.get("source") ?? "n8n";
  const first: ReportSource = wanted === "n8n" ? "n8n" : "supabase";
  const order: ReportSource[] = first === "n8n" ? ["n8n", "supabase"] : ["supabase", "n8n"];

  const failures: string[] = [];
  for (let i = 0; i < order.length; i++) {
    const source = order[i];
    try {
      const data =
        source === "supabase" ? await getReportFromSupabase(supabase) : await getReportFromN8n(REPORTS_WEBHOOK_URL, REPORTS_SECRET, user.email);
      return Response.json({
        ...data,
        source,
        fallback: i > 0,
        ...(i > 0 ? { fallbackReason: failures.join("; ") } : {}),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      console.error(`[reports] ${source} failed:`, msg);
      failures.push(`${source}: ${msg}`);
    }
  }
  return Response.json({ error: "Both data sources failed", details: failures }, { status: 502 });
}
