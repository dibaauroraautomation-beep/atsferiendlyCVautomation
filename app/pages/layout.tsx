"use client";

// Shared layout for everything under /pages.
// Pages listed in PAGE_CONFIG (pageConfig.ts) get the sidebar + top bar, rendered ONCE here.
// Any other page (login, about, automatic-Dashboard, ...) is shown as-is, without the sidebar.
import { usePathname } from "next/navigation";
import NavAndSidebar from "@/app/components/navAndSidebar";
import { useUser } from "@/app/contexts/UserContext";
import { PAGE_CONFIG } from "@/app/components/pageConfig";

export default function PagesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const key = pathname.split("/")[2] ?? ""; // "/pages/Dashboard" -> "Dashboard"
  const page = PAGE_CONFIG[key];
  const { user } = useUser();

  // Not a sidebar page -> render it without the sidebar
  if (!page) return <>{children}</>;

  return (
    <NavAndSidebar
      pageInfo={[page.title, page.description, key]}
      user={[
        user.name,
        user.profilePic,
        user.notificationNumber,
        user.purchasePlan,
        user.WebHook_Url?.[key] ?? "",
      ]}
    >
      {children}
    </NavAndSidebar>
  );
}
