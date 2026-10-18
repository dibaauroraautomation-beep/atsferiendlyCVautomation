import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// Forwards the generated CV (PDF + info) to the n8n workflow.
// n8n webhook (production URL, workflow must be published).
export async function POST(request: NextRequest) {
  const webhook = "https://n8naurora.duckdns.org/webhook/profile-cv";
  // const webhook = "https://n8naurora.duckdns.org/webhook-test/profile-cv";
  const formData = await request.formData();

  // Who sent it: taken from the logged-in Supabase session (cannot be faked by the browser).
  try {
    const supabase = await createServerSupabase();
    const { data } = await supabase.auth.getUser();
    formData.set("user_email", data.user?.email ?? "");
    formData.set("user_id", data.user?.id ?? "");
  } catch {
    formData.set("user_email", "");
    formData.set("user_id", "");
  }

  try {
    const res = await fetch(webhook, {
      method: "POST",
      body: formData,
      signal: AbortSignal.timeout(60_000),
    });
    if (!res.ok) {
      return Response.json({ error: `n8n responded with ${res.status}` }, { status: 502 });
    }
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not reach the n8n workflow" }, { status: 502 });
  }
}
