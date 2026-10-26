"use client";

import { createContext, useContext, useMemo, useState, ReactNode } from "react";
import { useAuth } from "./AuthContext";

export type User = {
  id: string;
  name: string;
  profilePic: string;
  notificationNumber: number;
  purchasePlan: string;
  WebHook_Url: Record<string, string>;
};

type UserContextType = {
  user: User;
  setUser: (user: User) => void;
};

const WEBHOOKS: Record<string, string> = {
  Resume_Generator: "https://n8naurora.duckdns.org/webhook/user-info",
  coverLetterGenerator: "https://n8naurora.duckdns.org/webhook/coverLetterGenerator",
  ApplicationsStatus: "https://n8naurora.duckdns.org/webhook/ApplicationsStatus",
};

const UserContext = createContext<UserContextType | undefined>(undefined);

export function UserProvider({ children }: { children: ReactNode }) {
  const { user: authUser, profile } = useAuth();
  const [extra, setExtra] = useState<Partial<User>>({});

  const user = useMemo<User>(() => {
    const name =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || "User";
    return {
      id: authUser?.id ?? "",          // real Supabase user id
      name,
      profilePic: authUser?.user_metadata?.avatar_url ?? "",
      notificationNumber: 0,
      purchasePlan: "",
      WebHook_Url: WEBHOOKS,
      ...extra,
    };
  }, [authUser, profile, extra]);

  return (
    <UserContext.Provider value={{ user, setUser: (u) => setExtra(u) }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  const ctx = useContext(UserContext);
  if (!ctx) throw new Error("useUser must be used inside <UserProvider>");
  return ctx;
}