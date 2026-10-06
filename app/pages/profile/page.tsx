"use client";

/*
  Profile & CV page  (/pages/profile)
  Title + description come from pageConfig.ts (shared layout).

  VISUAL ONLY for now: every value below is placeholder data.
  When the real data source is decided, replace the PLACEHOLDER_* constants
  (or load them in a useEffect) - the layout does not need to change.
*/

import type { ReactNode } from "react";
import { useT } from "@/app/contexts/LanguageContext";

/* ------------------------------------------------------------------ */
/* Placeholder data (replace later)                                    */
/* ------------------------------------------------------------------ */
const PLACEHOLDER_PROFILE = {
  fullName: "Your Name",
  email: "you@example.com",
  cvLanguage: "English",
  location: "City, Country",
  targetJobs: "Target job title",
  experienceLevel: "Mid",
  cvFileName: "your_resume.pdf",
  uploadDate: "Oct 06, 2026",
  status: "Processed Successfully",
};

const PLACEHOLDER_CV = {
  personal: ["Name", "Contact number", "Contact language", "Preferred CV language", "Experience level"],
  education: ["Degree, University", "Degree, University", "Degree, University"],
  experience: ["Company A", "Company B", "Company C"],
  skills: ["Skill one", "Skill two", "Skill three", "Skill four"],
  projects: ["Project one", "Project two", "Project three"],
  certifications: ["Certification one", "Certification two"],
  languages: ["Language, proficiency", "Language, proficiency"],
};

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */
function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-sm font-semibold text-slate-800">{value}</p>
    </div>
  );
}

function Section({ title, children, onEdit }: { title: string; children: ReactNode; onEdit?: () => void }) {
  const t = useT();
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <button type="button" onClick={onEdit} className="text-xs text-slate-500 hover:text-indigo-600">
          {t("Edit")}
        </button>
      </div>
      {children}
    </div>
  );
}

function PlainList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-[13px] text-slate-600">
      {items.map((x, i) => (
        <li key={i} className="truncate">
          {x}
        </li>
      ))}
    </ul>
  );
}

function BulletList({ items }: { items: string[] }) {
  return (
    <ul className="space-y-1 text-[13px] text-slate-600">
      {items.map((x, i) => (
        <li key={i} className="flex gap-2">
          <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-500" />
          <span className="truncate">{x}</span>
        </li>
      ))}
    </ul>
  );
}

/* A tiny skeleton of a CV page, used as the preview thumbnail. */
function CvThumbnail() {
  const line = (w: string, dark = false) => (
    <div className={`h-[3px] rounded ${dark ? "bg-slate-400" : "bg-slate-200"}`} style={{ width: w }} />
  );
  const block = (title: string, lines: string[]) => (
    <div className="space-y-1">
      <div className="h-[4px] w-1/3 rounded bg-indigo-300" />
      <p className="sr-only">{title}</p>
      {lines.map((w, i) => (
        <div key={i}>{line(w)}</div>
      ))}
    </div>
  );
  return (
    <div className="space-y-3 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="h-[6px] w-1/3 rounded bg-slate-700" />
        <div className="h-[6px] w-6 rounded bg-indigo-500" />
      </div>
      {line("55%", true)}
      {line("40%")}
      {block("Personal", ["90%", "80%", "85%", "60%"])}
      {block("Education", ["95%", "70%", "88%"])}
      {block("Experience", ["92%", "85%", "78%", "90%", "60%"])}
      {block("Skills", ["70%", "50%"])}
      {block("Projects", ["88%", "82%", "74%"])}
      {block("Languages", ["45%", "38%"])}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function ProfilePage() {
  const t = useT();
  const p = PLACEHOLDER_PROFILE;
  const cv = PLACEHOLDER_CV;

  return (
    <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1fr)_240px]">
      {/* ================= LEFT ================= */}
      <div className="space-y-5">
        {/* ----- Profile Information ----- */}
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-semibold text-slate-900">{t("Profile Information")}</h2>
            <button
              type="button"
              className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              {t("Edit Profile")}
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <Field label={t("Full Name")} value={p.fullName} />
            <Field label={t("Email")} value={p.email} />
            <Field label={t("Preferred CV Language")} value={p.cvLanguage} />
            <Field label={t("Location")} value={p.location} />
            <div className="col-span-2 sm:col-span-3">
              <Field label={t("Target Job Titles")} value={p.targetJobs} />
            </div>
            <Field label={t("Experience Level")} value={p.experienceLevel} />
          </div>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4 border-t border-slate-100 pt-4">
            <div className="flex flex-wrap gap-x-10 gap-y-3">
              <Field label={t("CV filename")} value={p.cvFileName} />
              <Field label={t("Upload date")} value={p.uploadDate} />
              <div>
                <p className="text-xs text-slate-500">{t("Status")}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-sm font-semibold text-slate-800">
                  <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
                      clipRule="evenodd"
                    />
                  </svg>
                  {t(p.status)}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                {t("View CV")}
              </button>
              <button
                type="button"
                className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
              >
                {t("Replace CV")}
              </button>
            </div>
          </div>
        </Card>

        {/* ----- CV Extracted Information ----- */}
        <Card className="p-5">
          <h2 className="text-base font-semibold text-slate-900">{t("CV Extracted Information")}</h2>

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            {/* column 1 */}
            <div className="space-y-3">
              <Section title={t("Personal Information")}>
                <PlainList items={cv.personal} />
              </Section>
              <Section title={t("Skills")}>
                <div className="flex flex-wrap gap-1.5">
                  {cv.skills.map((s, i) => (
                    <span key={i} className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
                      {s}
                    </span>
                  ))}
                </div>
              </Section>
            </div>

            {/* column 2 */}
            <div className="space-y-3">
              <Section title={t("Education")}>
                <PlainList items={cv.education} />
              </Section>
              <Section title={t("Projects")}>
                <BulletList items={cv.projects} />
              </Section>
            </div>

            {/* column 3 */}
            <div className="space-y-3">
              <Section title={t("Work Experience")}>
                <PlainList items={cv.experience} />
              </Section>
              <Section title={t("Certifications")}>
                <PlainList items={cv.certifications} />
              </Section>
              <Section title={t("Languages")}>
                <PlainList items={cv.languages} />
              </Section>
            </div>
          </div>

          <button
            type="button"
            className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
          >
            {t("Update Information")}
          </button>
        </Card>
      </div>

      {/* ================= RIGHT: CV preview ================= */}
      <aside className="lg:sticky lg:top-4">
        <Card className="p-3">
          <p className="mb-2 text-xs font-semibold text-slate-600">{t("CV Preview")}</p>
          <CvThumbnail />
        </Card>
      </aside>
    </div>
  );
}
