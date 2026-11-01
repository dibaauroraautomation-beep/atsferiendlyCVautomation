import { NextRequest } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";

// Forwards the uploaded CV to n8n, adding the verified user ID and email from the session.
export async function POST(request: NextRequest) {
  const webhook = "https://n8naurora.duckdns.org/webhook/info-extract-upload-cv";
  const formData = await request.formData();

  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "Not signed in" }, { status: 401 });

  formData.set("user_id", data.user.id);
  formData.set("email", data.user.email ?? "");

  try {
    const res = await fetch(webhook, { method: "POST", body: formData, signal: AbortSignal.timeout(60_000) });
    if (!res.ok) return Response.json({ error: `n8n responded with ${res.status}` }, { status: 502 });
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Could not reach the n8n workflow" }, { status: 502 });
  }
}