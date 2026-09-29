"use client";

import { AuthProvider } from "./contexts/AuthContext";
import { LanguageProvider } from "./contexts/LanguageContext";
import { UserProvider } from "./contexts/UserContext";
import { JobDescriptionProvider } from "./contexts/JobDescriptionContext";

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <UserProvider>
        <JobDescriptionProvider>
          <LanguageProvider>{children}</LanguageProvider>
        </JobDescriptionProvider>
      </UserProvider>
    </AuthProvider>
  );
}
