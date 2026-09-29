import { createBrowserClient } from "@supabase/ssr";

// Browser-side Supabase client. Use this inside "use client" components.
// The session is stored in cookies, so middleware can read it too.
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}