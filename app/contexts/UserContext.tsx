"use client";

import { createContext, useContext, useState, ReactNode } from "react";



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

const defaultUser: User = {
  id: "user-default-001",
  name: "Alex Morgan",
  profilePic: "https://i.pravatar.cc/64?img=12",
  notificationNumber: 5,
  purchasePlan: "Premium Pro",
  WebHook_Url: {
    Dashboard: "WebHook_Url:Dashboardopoopop",
    Resume_Generator: "WebHook_Url:Resume_Generatoropoopop",
    coverLetterGenerator: "WebHook_Url:coverLetterGeneratoropoopop",
    Interview_Prep_AI: "WebHook_Url:Interview_Prep_AIopoopop",
    ApplicationsStatus: "WebHook_Url:ApplicationsStatusopoopop",
    setting: "WebHook_Url:settingopoopop",
  }
};

const UserContext = createContext<UserContextType>({
  user: defaultUser,
  setUser: () => {},
});

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User>(defaultUser);
  return (
    <UserContext.Provider value={{ user, setUser }}>
      {children}
    </UserContext.Provider>
  );
}

export function useUser() {
  return useContext(UserContext);
}
