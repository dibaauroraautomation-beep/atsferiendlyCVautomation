import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// Forwards the generated CV (PDF + info) to the n8n workflow.
// Set N8N_PROFILE_CV_WEBHOOK_URL in .env.local to the workflow's Webhook-node URL.
export async function POST(request: NextRequest) {
  const webhook = process.env.N8N_PROFILE_CV_WEBHOOK_URL;
  if (!webhook) {
    return Response.json({ error: "N8N_PROFILE_CV_WEBHOOK_URL is not set in .env.local" }, { status: 500 });
  }

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
