import { createServerSupabase } from "@/lib/supabase/server";

// Asks n8n for the cover letter of ONE job (matched by the logged-in email + job title).
// If that row has no letter yet, the n8n workflow writes it with AI, saves it, and returns it.
// n8n webhook (production URL, workflow must be published).
export async function POST(req: Request) {
  const webhook = "https://n8naurora.duckdns.org/webhook/profile-cover-letter";

  let email = "";
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    email = data.user?.email ?? "";
  } catch {
    email = "";
  }
  if (!email) return Response.json({ error: "Not signed in" }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const jobtitle = typeof body?.jobtitle === "string" ? body.jobtitle.trim() : "";
  if (!jobtitle) return Response.json({ error: "Missing job title" }, { status: 400 });

  try {
    const res = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, jobtitle }),
      cache: "no-store",
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return Response.json({ error: `n8n responded with ${res.status}` }, { status: 502 });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try {
      json = text ? JSON.parse(text) : {};
    } catch {
      json = {};
    }
    const letter = typeof json.CoverLetter === "string" ? json.CoverLetter : "";
    return Response.json({ jobtitle, coverLetter: letter });
  } catch {
    return Response.json({ error: "Could not reach the n8n workflow" }, { status: 502 });
  }
}
