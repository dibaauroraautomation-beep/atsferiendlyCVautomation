import { createServerSupabase } from "@/lib/supabase/server";

// Loads the logged-in user's saved CV info from the n8n data table "Candidate cvinfo(ats cv)".
// The row is matched by the user's email through an n8n webhook.
// Set N8N_PROFILE_CV_FETCH_WEBHOOK_URL in .env.local to that webhook's URL.
export async function GET() {
  const webhook = process.env.N8N_PROFILE_CV_FETCH_WEBHOOK_URL;
  if (!webhook) {
    return Response.json({ error: "N8N_PROFILE_CV_FETCH_WEBHOOK_URL is not set in .env.local" }, { status: 500 });
  }

  // Who is asking: taken from the logged-in Supabase session (cannot be faked by the browser).
  let email = "";
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? "";
  } catch {
    email = "";
  }
  if (!email) {
    return Response.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      return Response.json({ error: `n8n responded with ${res.status}` }, { status: 502 });
    }
    const text = await res.text();
    let row: Record<string, unknown> | null = null;
    try {
      const parsed = text ? JSON.parse(text) : null;
      row = Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
    } catch {
      row = null;
    }
    // an empty object means no row was found for this email
    if (row && Object.keys(row).length === 0) row = null;
    return Response.json({ email, row });
  } catch {
    return Response.json({ error: "Could not reach the n8n workflow" }, { status: 502 });
  }
}
