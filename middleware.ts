// Put this file in the PROJECT ROOT (same level as the "app" folder).
// If you are on Next.js 16+, rename the file to "proxy.ts" and rename the
// exported function from "middleware" to "proxy".
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const LOGIN_PATH = "/pages/login";
const MANUAL_HOME = "/pages/Dashboard";
const AUTOMATED_HOME = "/pages/automatic-Dashboard";

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refreshes the session if needed. Do not remove.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isLoginPage = path.startsWith(LOGIN_PATH);
  const isProtected = path.startsWith("/pages") && !isLoginPage;

  // Not logged in -> trying to open an app page -> send to login
  if (!user && isProtected) {
    const url = request.nextUrl.clone();
    url.pathname = LOGIN_PATH;
    return NextResponse.redirect(url);
  }

  if (user) {
    const isAutomated = user.user_metadata?.registration_type === "automated";
    const home = isAutomated ? AUTOMATED_HOME : MANUAL_HOME;

    // Already logged in -> opening login page -> send to the right dashboard
    // Wrong dashboard for this user type -> send to the right one
    const onWrongDashboard =
      (isAutomated && path.startsWith(MANUAL_HOME)) ||
      (!isAutomated && path.startsWith(AUTOMATED_HOME));

    if (isLoginPage || onWrongDashboard) {
      const url = request.nextUrl.clone();
      url.pathname = home;
      return NextResponse.redirect(url);
    }
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};