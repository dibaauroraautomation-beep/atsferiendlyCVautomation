// One shape for BOTH data routes (Supabase = Route A, n8n = Route B),
// so the reports page never needs to know where the data came from.

export type ReportApplication = {
  id: string | number;
  title: string;
  company: string;
  status: string; // "Applied" | "Pending" | "Interview" | "Rejected" | "Offer" (or custom)
  appliedAt: string | null; // YYYY-MM-DD
  cvUrl: string;
  coverLetterUrl: string;
  url: string;
  matchScore: number;
};

export type ReportData = {
  stats: { total: number; thisWeek: number; pending: number; interview: number };
  applications: ReportApplication[];
  weekly: {
    weekStart: string; // YYYY-MM-DD (Monday)
    weekEnd: string; // YYYY-MM-DD (Sunday)
    jobsFound: number;
    matchingJobs: number;
    cvs: number;
    cvsGenerated: number;
    coverLetters: number;
    submitted: number;
    perDay: number[]; // Mon..Sun
  };
  topApplied: { id: string | number; title: string; company: string }[];
};

export type ReportSource = "supabase" | "n8n";

export type ReportResponse = ReportData & {
  source: ReportSource;
  fallback: boolean; // true when the preferred route failed and the other one answered
  fallbackReason?: string;
};

export const MATCH_THRESHOLD = 70;
