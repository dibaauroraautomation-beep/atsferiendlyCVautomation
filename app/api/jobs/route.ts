import { createServerSupabase } from "@/lib/supabase/server";

export async function GET() {
  const supabase = await createServerSupabase();
  const { data } = await supabase.auth.getUser();
  if (!data.user) return Response.json({ error: "Not signed in" }, { status: 401 });

  const res = await fetch("https://n8naurora.duckdns.org/webhook/job-data", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: data.user.id, email: data.user.email }),
    cache: "no-store",
  });
  const text = await res.text();
  return new Response(text || "[]", {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}