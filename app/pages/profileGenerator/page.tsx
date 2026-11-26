"use client";

/*
  Profile Generator page  (profileGenerator/page.tsx)

  Flow:
    1. The user uploads a CV (PDF only).
    2. The PDF is sent to the n8n workflow  .../webhook/upload-cv-indeed
    3. n8n answers with the extracted info; every value that matches a
       field of the Personal Information form is filled in automatically.
    4. The user can review and edit every field.
*/

import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, DragEvent, ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
const UPLOAD_CV_WEBHOOK = "https://n8naurora.duckdns.org/webhook/upload-cv-indeed";
const MAX_FILE_MB = 5;
const REQUEST_TIMEOUT_MS = 120_000;

/* ------------------------------------------------------------------ */
/* Form model                                                          */
/* ------------------------------------------------------------------ */
type FormState = {
  fullName: string;
  email: string;
  phone: string;
  location: string;
  linkedin: string;
  portfolio: string;
  jobTitle: string;
  experienceLevel: string;
  cvLanguage: string;
  summary: string;
  skills: string;
  education: string;
  experience: string;
  certifications: string;
  languages: string;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  phone: "",
  location: "",
  linkedin: "",
  portfolio: "",
  jobTitle: "",
  experienceLevel: "",
  cvLanguage: "",
  summary: "",
  skills: "",
  education: "",
  experience: "",
  certifications: "",
  languages: "",
};

/* Words n8n may use for each field (compared in lower case, letters/digits only). */
const ALIASES: Record<keyof FormState, string[]> = {
  fullName: ["fullname", "name", "candidatename", "applicantname"],
  email: ["email", "emailaddress", "mail"],
  phone: ["phone", "phonenumber", "contactnumber", "mobile", "mobilenumber", "telephone", "contact"],
  location: ["location", "address", "city", "cityandcountry", "currentlocation"],
  linkedin: ["linkedin", "linkedinurl", "linkedinprofile"],
  portfolio: ["portfolio", "website", "portfoliourl", "personalwebsite", "github"],
  jobTitle: ["jobtitle", "targetjob", "targetjobtitle", "currenttitle", "currentjobtitle", "headline", "position", "role", "title"],
  experienceLevel: ["experiencelevel", "level", "seniority", "yearsofexperience", "totalexperience"],
  cvLanguage: ["cvlanguage", "preferredcvlanguage", "contactlanguage", "language"],
  summary: ["summary", "profile", "profilesummary", "about", "objective", "professionalsummary"],
  skills: ["skills", "skill", "keyskills", "technicalskills"],
  education: ["education", "educations", "qualification", "qualifications"],
  experience: ["experience", "workexperience", "experiences", "employment", "workhistory"],
  certifications: ["certifications", "certification", "certificate", "certificates"],
  languages: ["languages", "spokenlanguages", "languageproficiency"],
};

/* ------------------------------------------------------------------ */
/* Helpers: turn whatever n8n returns into form values                 */
/* ------------------------------------------------------------------ */
const norm = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, "");

/** Any value -> readable text (arrays become one item per line). */
function toText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v.trim();
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    return v
      .map((x) => {
        if (x && typeof x === "object") {
          return Object.values(x as Record<string, unknown>)
            .map(toText)
            .filter(Boolean)
            .join(", ");
        }
        return toText(x);
      })
      .filter(Boolean)
      .join("\n");
  }
  if (typeof v === "object") {
    return Object.values(v as Record<string, unknown>)
      .map(toText)
      .filter(Boolean)
      .join(", ");
  }
  return "";
}

/** Find the object that actually holds the extracted info. */
function unwrap(input: unknown): Record<string, unknown> | null {
  let v: unknown = input;
  for (let i = 0; i < 5; i++) {
    if (typeof v === "string") {
      try {
        v = JSON.parse(v);
      } catch {
        return null;
      }
    }
    if (Array.isArray(v)) {
      if (v.length === 0) return null;
      // [{label, value}, ...] list -> one flat object
      if (v.every((x) => x && typeof x === "object" && "label" in x && "value" in x)) {
        const flat: Record<string, unknown> = {};
        v.forEach((x) => {
          const it = x as { label: unknown; value: unknown };
          flat[String(it.label)] = it.value;
        });
        return flat;
      }
      v = v[0];
      continue;
    }
    if (v && typeof v === "object") {
      const obj = v as Record<string, unknown>;
      const keys = Object.keys(obj).map(norm);
      const hasKnown = keys.some((k) => Object.values(ALIASES).some((list) => list.includes(k)));
      if (hasKnown) return obj;
      const inner = ["output", "data", "body", "json", "row", "result", "info", "cvinfo", "personalinfo"]
        .map((name) => Object.keys(obj).find((k) => norm(k) === name))
        .find(Boolean);
      if (inner) {
        v = obj[inner];
        continue;
      }
      return obj;
    }
    return null;
  }
  return null;
}

/** Match the response keys with the form fields. Only matched values are returned. */
function mapToForm(raw: unknown): Partial<FormState> {
  const obj = unwrap(raw);
  if (!obj) return {};

  // flatten one level so {personal: {name, email}} also works
  const flat: Record<string, unknown> = {};
  Object.entries(obj).forEach(([k, v]) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.entries(v as Record<string, unknown>).forEach(([k2, v2]) => {
        if (!(k2 in flat)) flat[k2] = v2;
      });
    } else {
      flat[k] = v;
    }
  });

  const out: Partial<FormState> = {};
  (Object.keys(ALIASES) as (keyof FormState)[]).forEach((field) => {
    for (const alias of ALIASES[field]) {
      const key = Object.keys(flat).find((k) => norm(k) === alias);
      if (!key) continue;
      const text = toText(flat[key]);
      if (text) {
        out[field] = text;
        break;
      }
    }
  });
  return out;
}

/** The first bytes of a real PDF are "%PDF". */
async function looksLikePdf(file: File): Promise<boolean> {
  try {
    const head = new Uint8Array(await file.slice(0, 5).arrayBuffer());
    return String.fromCharCode(...head).startsWith("%PDF");
  } catch {
    return false;
  }
}

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */
const inputCls =
  "w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-100";

function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-slate-200 bg-white ${className}`}>{children}</div>;
}

function Input({
  label,
  value,
  onChange,
  filled,
  type = "text",
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  filled: boolean;
  type?: string;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        {label}
        {filled && (
          <span className="rounded bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700">Auto-filled</span>
        )}
      </span>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
    </label>
  );
}

function TextArea({
  label,
  value,
  onChange,
  filled,
  rows = 4,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  filled: boolean;
  rows?: number;
  placeholder?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="mb-1 flex items-center gap-1.5 text-xs font-medium text-slate-600">
        {label}
        {filled && (
          <span className="rounded bg-emerald-50 px-1.5 py-px text-[10px] font-semibold text-emerald-700">Auto-filled</span>
        )}
      </span>
      <textarea
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={`${inputCls} resize-y leading-relaxed`}
      />
    </label>
  );
}

const Spinner = () => (
  <svg className="h-5 w-5 animate-spin text-indigo-600" viewBox="0 0 24 24" fill="none" aria-hidden>
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" className="opacity-25" />
    <path d="M22 12a10 10 0 0 0-10-10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
  </svg>
);

/* ---- form fields (real inputs, filled from the CV) ---- */
const NEON_FIELDS: { id: string; s: string; l: string }[] = [{"id": "s0_0", "s": "s0", "l": "LinkedIn profile URL"}, {"id": "s0_1", "s": "s0", "l": "Online CV / portfolio link"}, {"id": "s0_2", "s": "s0", "l": "Language"}, {"id": "s0_3", "s": "s0", "l": "Auto-fill sections"}, {"id": "s0_4", "s": "s0", "l": "CV title"}, {"id": "s0_5", "s": "s0", "l": "Target role"}, {"id": "s0_6", "s": "s0", "l": "Visibility"}, {"id": "s0_7", "s": "s0", "l": "Share with recruiters"}, {"id": "s0_8", "s": "s0", "l": "Keep original file"}, {"id": "s0_9", "s": "s0", "l": "Preferred file format"}, {"id": "s0_10", "s": "s0", "l": "Maximum file size"}, {"id": "s0_11", "s": "s0", "l": "Page limit"}, {"id": "s0_12", "s": "s0", "l": "Document language"}, {"id": "s0_13", "s": "s0", "l": "Detect sections automatically"}, {"id": "s0_14", "s": "s0", "l": "Extract skills from text"}, {"id": "s0_15", "s": "s0", "l": "Extract dates and durations"}, {"id": "s0_16", "s": "s0", "l": "Merge with existing profile"}, {"id": "s0_17", "s": "s0", "l": "Notes about this CV"}, {"id": "s1_0", "s": "s1", "l": "Full name"}, {"id": "s1_1", "s": "s1", "l": "Headline"}, {"id": "s1_2", "s": "s1", "l": "Date of birth"}, {"id": "s1_3", "s": "s1", "l": "Email"}, {"id": "s1_4", "s": "s1", "l": "Phone"}, {"id": "s1_5", "s": "s1", "l": "Location"}, {"id": "s1_6", "s": "s1", "l": "LinkedIn"}, {"id": "s1_7", "s": "s1", "l": "Portfolio website"}, {"id": "s1_8", "s": "s1", "l": "GitHub"}, {"id": "s1_9", "s": "s1", "l": "Professional summary"}, {"id": "s1_10", "s": "s1", "l": "Street address"}, {"id": "s1_11", "s": "s1", "l": "City"}, {"id": "s1_12", "s": "s1", "l": "Postal code"}, {"id": "s1_13", "s": "s1", "l": "Country"}, {"id": "s1_14", "s": "s1", "l": "Preferred contact method"}, {"id": "s1_15", "s": "s1", "l": "Availability"}, {"id": "s1_16", "s": "s1", "l": "Expected salary"}, {"id": "s1_17", "s": "s1", "l": "Middle name"}, {"id": "s1_18", "s": "s1", "l": "Preferred name"}, {"id": "s1_19", "s": "s1", "l": "Gender"}, {"id": "s1_20", "s": "s1", "l": "Nationality"}, {"id": "s1_21", "s": "s1", "l": "Marital status"}, {"id": "s1_22", "s": "s1", "l": "Passport / ID number"}, {"id": "s1_23", "s": "s1", "l": "Work permit status"}, {"id": "s1_24", "s": "s1", "l": "Willing to relocate"}, {"id": "s1_25", "s": "s1", "l": "Willing to travel"}, {"id": "s1_26", "s": "s1", "l": "Notice period"}, {"id": "s1_27", "s": "s1", "l": "Twitter / X"}, {"id": "s1_28", "s": "s1", "l": "Behance"}, {"id": "s1_29", "s": "s1", "l": "Dribbble"}, {"id": "s1_30", "s": "s1", "l": "Medium"}, {"id": "s2_0", "s": "s2", "l": "Institution"}, {"id": "s2_1", "s": "s2", "l": "Degree"}, {"id": "s2_2", "s": "s2", "l": "Field of study"}, {"id": "s2_3", "s": "s2", "l": "Start date"}, {"id": "s2_4", "s": "s2", "l": "End date"}, {"id": "s2_5", "s": "s2", "l": "Grade / CGPA"}, {"id": "s2_6", "s": "s2", "l": "Achievements & activities"}, {"id": "s2_7", "s": "s2", "l": "Award title"}, {"id": "s2_8", "s": "s2", "l": "Awarded by"}, {"id": "s2_9", "s": "s2", "l": "Year"}, {"id": "s2_10", "s": "s2", "l": "Course name"}, {"id": "s2_11", "s": "s2", "l": "Platform"}, {"id": "s2_12", "s": "s2", "l": "Completion date"}, {"id": "s2_13", "s": "s2", "l": "School name"}, {"id": "s2_14", "s": "s2", "l": "Board / curriculum"}, {"id": "s2_15", "s": "s2", "l": "Group / stream"}, {"id": "s2_16", "s": "s2", "l": "Passing year"}, {"id": "s2_17", "s": "s2", "l": "GPA"}, {"id": "s2_18", "s": "s2", "l": "Institution"}, {"id": "s2_19", "s": "s2", "l": "Degree"}, {"id": "s2_20", "s": "s2", "l": "Thesis title"}, {"id": "s2_21", "s": "s2", "l": "Supervisor"}, {"id": "s2_22", "s": "s2", "l": "Clubs & societies"}, {"id": "s2_23", "s": "s2", "l": "Volunteering"}, {"id": "s2_24", "s": "s2", "l": "Other academic notes"}, {"id": "s3_0", "s": "s3", "l": "Project title"}, {"id": "s3_1", "s": "s3", "l": "Your role"}, {"id": "s3_2", "s": "s3", "l": "Project link"}, {"id": "s3_3", "s": "s3", "l": "Start date"}, {"id": "s3_4", "s": "s3", "l": "End date"}, {"id": "s3_5", "s": "s3", "l": "Technologies used"}, {"id": "s3_6", "s": "s3", "l": "What did you build?"}, {"id": "s3_7", "s": "s3", "l": "Team size"}, {"id": "s3_8", "s": "s3", "l": "Key result"}, {"id": "s3_9", "s": "s3", "l": "Client / company"}, {"id": "s3_10", "s": "s3", "l": "Live demo link"}, {"id": "s3_11", "s": "s3", "l": "Screenshot URL"}, {"id": "s3_12", "s": "s3", "l": "Project category"}, {"id": "s3_13", "s": "s3", "l": "Project status"}, {"id": "s3_14", "s": "s3", "l": "Client"}, {"id": "s3_15", "s": "s3", "l": "Budget"}, {"id": "s3_16", "s": "s3", "l": "Duration"}, {"id": "s3_17", "s": "s3", "l": "Responsibilities"}, {"id": "s3_18", "s": "s3", "l": "Methodology"}, {"id": "s3_19", "s": "s3", "l": "Version control"}, {"id": "s3_20", "s": "s3", "l": "Hosting platform"}, {"id": "s3_21", "s": "s3", "l": "Users reached"}, {"id": "s3_22", "s": "s3", "l": "Revenue impact"}, {"id": "s3_23", "s": "s3", "l": "Awards or recognition"}, {"id": "s3_24", "s": "s3", "l": "Lessons learned"}, {"id": "s4_0", "s": "s4", "l": "Job title"}, {"id": "s4_1", "s": "s4", "l": "Company"}, {"id": "s4_2", "s": "s4", "l": "Location"}, {"id": "s4_3", "s": "s4", "l": "Start date"}, {"id": "s4_4", "s": "s4", "l": "End date"}, {"id": "s4_5", "s": "s4", "l": "Employment type"}, {"id": "s4_6", "s": "s4", "l": "Key achievements"}, {"id": "s4_7", "s": "s4", "l": "Tools used"}, {"id": "s4_8", "s": "s4", "l": "Team size"}, {"id": "s4_9", "s": "s4", "l": "Reported to"}, {"id": "s4_10", "s": "s4", "l": "Referee name"}, {"id": "s4_11", "s": "s4", "l": "Referee email"}, {"id": "s4_12", "s": "s4", "l": "Referee phone"}, {"id": "s4_13", "s": "s4", "l": "Company website"}, {"id": "s4_14", "s": "s4", "l": "Industry"}, {"id": "s4_15", "s": "s4", "l": "Company size"}, {"id": "s4_16", "s": "s4", "l": "Department"}, {"id": "s4_17", "s": "s4", "l": "Starting salary"}, {"id": "s4_18", "s": "s4", "l": "Final salary"}, {"id": "s4_19", "s": "s4", "l": "Bonuses"}, {"id": "s4_20", "s": "s4", "l": "Reason for leaving"}, {"id": "s4_21", "s": "s4", "l": "Employment status"}, {"id": "s4_22", "s": "s4", "l": "Direct reports"}, {"id": "s4_23", "s": "s4", "l": "Budget owned"}, {"id": "s4_24", "s": "s4", "l": "Key tools"}, {"id": "s4_25", "s": "s4", "l": "Major accomplishments"}, {"id": "s5_0", "s": "s5", "l": "Certification name"}, {"id": "s5_1", "s": "s5", "l": "Issuing organisation"}, {"id": "s5_2", "s": "s5", "l": "Credential ID"}, {"id": "s5_3", "s": "s5", "l": "Issue date"}, {"id": "s5_4", "s": "s5", "l": "Expiry date"}, {"id": "s5_5", "s": "s5", "l": "Credential URL"}, {"id": "s5_6", "s": "s5", "l": "Topics covered"}, {"id": "s5_7", "s": "s5", "l": "Score / grade"}, {"id": "s5_8", "s": "s5", "l": "Additional notes"}, {"id": "s5_9", "s": "s5", "l": "Issuer website"}, {"id": "s5_10", "s": "s5", "l": "Issuer country"}, {"id": "s5_11", "s": "s5", "l": "Certificate level"}, {"id": "s5_12", "s": "s5", "l": "Exam code"}, {"id": "s5_13", "s": "s5", "l": "Training provider"}, {"id": "s5_14", "s": "s5", "l": "Study hours"}, {"id": "s5_15", "s": "s5", "l": "Exam date"}, {"id": "s5_16", "s": "s5", "l": "Retake count"}, {"id": "s5_17", "s": "s5", "l": "Renewal required"}, {"id": "s5_18", "s": "s5", "l": "Renewal date"}, {"id": "s5_19", "s": "s5", "l": "Continuing education credits"}, {"id": "s5_20", "s": "s5", "l": "Certificate status"}, {"id": "s6_0", "s": "s6", "l": "Skill"}, {"id": "s6_1", "s": "s6", "l": "Proficiency"}, {"id": "s6_2", "s": "s6", "l": "Years of experience"}, {"id": "s6_3", "s": "s6", "l": "Skill"}, {"id": "s6_4", "s": "s6", "l": "Proficiency"}, {"id": "s6_5", "s": "s6", "l": "Language"}, {"id": "s6_6", "s": "s6", "l": "Level"}, {"id": "s6_7", "s": "s6", "l": "Tool"}, {"id": "s6_8", "s": "s6", "l": "Level"}, {"id": "s6_9", "s": "s6", "l": "Years of experience"}, {"id": "s6_10", "s": "s6", "l": "Describe your top strengths"}, {"id": "s6_11", "s": "s6", "l": "Language"}, {"id": "s6_12", "s": "s6", "l": "Proficiency"}, {"id": "s6_13", "s": "s6", "l": "Years of experience"}, {"id": "s6_14", "s": "s6", "l": "Last used"}, {"id": "s6_15", "s": "s6", "l": "Tool"}, {"id": "s6_16", "s": "s6", "l": "Proficiency"}, {"id": "s6_17", "s": "s6", "l": "Years of experience"}, {"id": "s6_18", "s": "s6", "l": "Last used"}, {"id": "s6_19", "s": "s6", "l": "Communication"}, {"id": "s6_20", "s": "s6", "l": "Teamwork"}, {"id": "s6_21", "s": "s6", "l": "Problem solving"}, {"id": "s6_22", "s": "s6", "l": "Time management"}, {"id": "s6_23", "s": "s6", "l": "Adaptability"}, {"id": "s6_24", "s": "s6", "l": "Second language"}, {"id": "s6_25", "s": "s6", "l": "Proficiency level"}, {"id": "s6_26", "s": "s6", "l": "Third language"}, {"id": "s6_27", "s": "s6", "l": "Proficiency level"}, {"id": "s7_0", "s": "s7", "l": "Hiring manager name"}, {"id": "s7_1", "s": "s7", "l": "Company name"}, {"id": "s7_2", "s": "s7", "l": "Job title applying for"}, {"id": "s7_3", "s": "s7", "l": "Subject line"}, {"id": "s7_4", "s": "s7", "l": "Letter body"}, {"id": "s7_5", "s": "s7", "l": "Writing tone"}, {"id": "s7_6", "s": "s7", "l": "Length"}, {"id": "s7_7", "s": "s7", "l": "Greeting"}, {"id": "s7_8", "s": "s7", "l": "Opening hook"}, {"id": "s7_9", "s": "s7", "l": "Closing line"}, {"id": "s7_10", "s": "s7", "l": "Signature name"}, {"id": "s7_11", "s": "s7", "l": "Contact line"}, {"id": "s7_12", "s": "s7", "l": "Your full name"}, {"id": "s7_13", "s": "s7", "l": "Your address"}, {"id": "s7_14", "s": "s7", "l": "Your email"}, {"id": "s7_15", "s": "s7", "l": "Your phone"}, {"id": "s7_16", "s": "s7", "l": "Date"}, {"id": "s7_17", "s": "s7", "l": "Company address"}, {"id": "s7_18", "s": "s7", "l": "Hiring manager title"}, {"id": "s7_19", "s": "s7", "l": "Job reference number"}, {"id": "s7_20", "s": "s7", "l": "Where you found the role"}, {"id": "s7_21", "s": "s7", "l": "Key achievement 1"}, {"id": "s7_22", "s": "s7", "l": "Key achievement 2"}, {"id": "s7_23", "s": "s7", "l": "Why this company"}, {"id": "s8_0", "s": "s8", "l": "Template style"}, {"id": "s8_1", "s": "s8", "l": "Accent colour"}, {"id": "s8_2", "s": "s8", "l": "File format"}, {"id": "s8_3", "s": "s8", "l": "File name"}, {"id": "s8_4", "s": "s8", "l": "Education"}, {"id": "s8_5", "s": "s8", "l": "Projects"}, {"id": "s8_6", "s": "s8", "l": "Certifications"}, {"id": "s8_7", "s": "s8", "l": "Cover letter"}, {"id": "s8_8", "s": "s8", "l": "Public link"}, {"id": "s8_9", "s": "s8", "l": "Password protection"}, {"id": "s8_10", "s": "s8", "l": "Page size"}, {"id": "s8_11", "s": "s8", "l": "Margins"}, {"id": "s8_12", "s": "s8", "l": "Font family"}, {"id": "s8_13", "s": "s8", "l": "Font size"}, {"id": "s8_14", "s": "s8", "l": "Line spacing"}, {"id": "s8_15", "s": "s8", "l": "Primary colour"}, {"id": "s8_16", "s": "s8", "l": "Heading style"}, {"id": "s8_17", "s": "s8", "l": "Photo"}, {"id": "s8_18", "s": "s8", "l": "Icons"}, {"id": "s8_19", "s": "s8", "l": "Spelling check"}, {"id": "s8_20", "s": "s8", "l": "Missing sections"}, {"id": "s8_21", "s": "s8", "l": "ATS compatibility"}, {"id": "s8_22", "s": "s8", "l": "Page count"}, {"id": "s8_23", "s": "s8", "l": "Last saved"}];

type NeonCtxType = {
  values: Record<string, string>;
  filled: Record<string, boolean>;
  setValue: (id: string, v: string) => void;
};
const NeonCtx = createContext<NeonCtxType>({ values: {}, filled: {}, setValue: () => {} });

function Fld({ id, label, c, ph, h }: { id: string; label: string; c: string; ph: string; h?: number }) {
  const { values, filled, setValue } = useContext(NeonCtx);
  const common = {
    id: "f_" + id,
    className: "fi",
    value: values[id] ?? "",
    placeholder: ph,
    autoComplete: "off",
  };
  return (
    <div>
      <label className="fl" htmlFor={"f_" + id}>
        {label}
        {filled[id] && values[id] ? <span className="af">Auto-filled</span> : null}
      </label>
      {h ? (
        <textarea
          {...common}
          onChange={(e) => setValue(id, e.target.value)}
          style={{ "--c": c, height: h + "px", paddingTop: "14px", resize: "none" } as CSSProperties}
        />
      ) : (
        <input {...common} onChange={(e) => setValue(id, e.target.value)} style={{ "--c": c } as CSSProperties} />
      )}
    </div>
  );
}

/* where each of the old 15 form values goes in the neon form */
const NEON_EXPLICIT: Record<keyof FormState, [string, string][]> = {
  fullName: [["s1", "Full name"]],
  email: [["s1", "Email"]],
  phone: [["s1", "Phone"]],
  location: [["s1", "Location"]],
  linkedin: [["s1", "LinkedIn"], ["s0", "LinkedIn profile URL"]],
  portfolio: [["s1", "Portfolio website"], ["s0", "Online CV / portfolio link"]],
  jobTitle: [["s1", "Headline"], ["s0", "Target role"]],
  experienceLevel: [["s1", "Availability"]],
  cvLanguage: [["s0", "Language"]],
  summary: [["s1", "Professional summary"]],
  skills: [["s6", "Describe your top strengths"]],
  education: [["s2", "Achievements & activities"]],
  experience: [["s4", "Key achievements"]],
  certifications: [["s5", "Additional notes"]],
  languages: [["s6", "Language"]],
};

/* other words n8n may use for a neon field label (letters/digits only) */
const NEON_LABEL_ALIASES: Record<string, string[]> = {
  institution: ["school", "university", "college", "institute"],
  degree: ["qualification", "degreename"],
  fieldofstudy: ["field", "major", "subject", "fieldofstudy"],
  startdate: ["start", "from", "startyear"],
  enddate: ["end", "to", "endyear", "graduationdate"],
  gradecgpa: ["gpa", "cgpa", "grade"],
  jobtitle: ["title", "position", "role"],
  company: ["employer", "organization", "organisation", "companyname"],
  keyachievements: ["description", "responsibilities", "achievements", "highlights"],
  projecttitle: ["name", "title", "project"],
  whatdidyoubuild: ["description", "summary"],
  technologiesused: ["technologies", "stack", "techstack", "tools"],
  projectlink: ["url", "link"],
  certificationname: ["name", "certification", "title", "certificate"],
  issuingorganisation: ["issuer", "issuedby", "organization", "organisation", "authority"],
  issuedate: ["date", "issued", "year"],
  skill: ["name", "skill"],
  language: ["name", "language"],
  proficiency: ["level"],
  headline: ["jobtitle", "title"],
  dateofbirth: ["dob", "birthdate"],
  streetaddress: ["address"],
  postalcode: ["zip", "zipcode", "postcode"],
  github: ["githuburl"],
  nationality: ["citizenship"],
  gender: ["sex"],
};

const NEON_SECTION_HINT: Record<string, string> = {
  education: "s2", educations: "s2", academic: "s2",
  projects: "s3", project: "s3",
  experience: "s4", experiences: "s4", workexperience: "s4", employment: "s4", workhistory: "s4",
  certifications: "s5", certification: "s5", certificates: "s5", certificate: "s5",
  skills: "s6", skill: "s6", languages: "s6",
  coverletter: "s7",
};

/** n8n response -> { fieldId: value } for the neon form. */
function mapToNeon(raw: unknown, userEmail: string): Record<string, string> {
  const out: Record<string, string> = {};
  const byLabel = (s: string, l: string) => NEON_FIELDS.find((f) => f.s === s && f.l === l && !(f.id in out));

  // 1) the 15 known values
  const known = mapToForm(raw);
  (Object.keys(known) as (keyof FormState)[]).forEach((k) => {
    const v = known[k];
    if (!v) return;
    NEON_EXPLICIT[k].forEach(([s, l]) => {
      const f = byLabel(s, l);
      if (f) out[f.id] = v;
    });
  });

  // 2) every other key whose name matches a neon label
  const obj = unwrap(raw);
  if (obj) {
    const items: { key: string; value: string; hint: string }[] = [];
    const walk = (o: Record<string, unknown>, hint: string, depth: number) => {
      for (const [k, v] of Object.entries(o)) {
        const h = NEON_SECTION_HINT[norm(k)] ?? hint;
        if (Array.isArray(v)) {
          const first = v.find((x) => x && typeof x === "object" && !Array.isArray(x));
          if (first && depth < 4) walk(first as Record<string, unknown>, h, depth + 1);
        } else if (v && typeof v === "object") {
          if (depth < 4) walk(v as Record<string, unknown>, h, depth + 1);
        } else {
          const text = toText(v);
          if (text) items.push({ key: norm(k), value: text, hint: h });
        }
      }
    };
    walk(obj, "", 0);

    items.forEach(({ key, value, hint }) => {
      const sections = hint ? [hint] : ["s1", "s0"];
      const f = NEON_FIELDS.find(
        (x) =>
          sections.includes(x.s) &&
          !(x.id in out) &&
          (norm(x.l) === key || (NEON_LABEL_ALIASES[norm(x.l)] ?? []).includes(key)),
      );
      if (f) out[f.id] = value;
    });
  }

  if (userEmail && !Object.keys(out).some((id) => NEON_FIELDS.find((f) => f.id === id)?.l === "Email")) {
    const f = byLabel("s1", "Email");
    if (f) out[f.id] = userEmail;
  }
  return out;
}

/* ---------------- Neon timeline form ---------------- */
const NEON_COLORS = ["#22b8ff", "#4d7bff", "#9b5cff", "#ff2bd6", "#ff3d6e", "#ff8a1f", "#f2c200", "#7ddc1f", "#00d68f"];
const NEON_DARK = ["#0f5272", "#223772", "#452972", "#721360", "#721b31", "#723e0d", "#6c5700", "#38630d", "#006040"];

const NEON_CSS = `
body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif}
.fl{display:block;font-size:12px;font-weight:700;color:#0b1024;margin:0 0 7px 4px}
.fi{height:46px;border-radius:12px;border:1.5px solid var(--c);background:linear-gradient(180deg,#f3f5fb,#fff);box-shadow:0 0 10px var(--c),inset 0 3px 5px rgba(11,16,36,.10);display:flex;align-items:center;padding:0 16px;font-size:13px;color:#6b7390;box-sizing:border-box}
.sh{display:flex;align-items:center;gap:16px;margin:0 0 16px;font-size:15px;font-weight:800;color:#0b1024;letter-spacing:.2px}
.sh i{flex:1;height:2px;border-radius:2px;background:linear-gradient(90deg,var(--c),#ffffff00);box-shadow:0 0 8px var(--c)}
.sg{display:grid;grid-template-columns:1fr;gap:16px 0;margin-bottom:30px}
.fb{height:48px;border-radius:14px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:800;color:#0b1024;box-sizing:border-box}

input.fi,textarea.fi{width:100%;outline:none;font-family:inherit;color:#0b1024}
input.fi::placeholder,textarea.fi::placeholder{color:#6b7390}
input.fi:focus,textarea.fi:focus{box-shadow:0 0 16px var(--c),inset 0 3px 5px rgba(11,16,36,.10)}
.af{margin-left:8px;padding:1px 6px;border-radius:6px;background:#dcfce7;color:#047857;font-size:10px;font-weight:700}
.tb{transition:transform .12s}
#tabbar::-webkit-scrollbar{display:none}
.tb.on,.tb:active{transform:translateY(6px)!important;filter:drop-shadow(0 1px 0 var(--d)) drop-shadow(0 3px 3px rgba(0,0,0,.35)) drop-shadow(0 0 7px var(--g))!important}
.tb.on>div,.tb:active>div{box-shadow:inset 0 8px 12px rgba(0,0,0,.4),inset 0 -3px 6px rgba(255,255,255,.25)!important;filter:brightness(.88)}
html{scroll-behavior:smooth}
body{background:#fff}`;

type NeonUpload = {
  uploading: boolean;
  dragActive: boolean;
  error: string;
  fileName: string;
  filledCount: number;
  onPick: () => void;
  onDragOver: (e: DragEvent<HTMLDivElement>) => void;
  onDragLeave: (e: DragEvent<HTMLDivElement>) => void;
  onDrop: (e: DragEvent<HTMLDivElement>) => void;
};

function NeonTimelineForm({ upload, ctx }: { upload: NeonUpload; ctx: NeonCtxType }) {
  useEffect(() => {
    const btn = document.getElementById("uptop");
    let last = -1;

    const ctr = (i: number) => {
      const bar = document.getElementById("tabbar");
      const el = document.querySelectorAll<HTMLElement>(".tb")[i];
      if (bar && el) bar.scrollTo({ left: el.offsetLeft + 82 - bar.clientWidth / 2, behavior: "smooth" });
    };

    const upd = () => {
      let k = 0;
      for (let i = 0; i < 9; i++) {
        const e = document.getElementById("s" + i);
        if (e && e.getBoundingClientRect().top <= 240) k = i;
      }
      document.querySelectorAll(".tb").forEach((t, idx) => t.classList.toggle("on", idx === k));
      if (k !== last) {
        last = k;
        ctr(k);
      }
      if (btn) {
        btn.style.borderColor = NEON_COLORS[k];
        btn.querySelector("svg")?.setAttribute("stroke", NEON_COLORS[k]);
        btn.style.boxShadow = `0 5px 0 ${NEON_DARK[k]},0 10px 12px rgba(0,0,0,.18),0 0 16px ${NEON_COLORS[k]}`;
      }
    };

    const tabs = Array.from(document.querySelectorAll<HTMLElement>(".tb"));
    const clickHandlers = tabs.map((_, i) => () => ctr(i));
    tabs.forEach((el, i) => el.addEventListener("click", clickHandlers[i]));
    document.addEventListener("scroll", upd, true);
    window.addEventListener("resize", upd);
    upd();

    return () => {
      tabs.forEach((el, i) => el.removeEventListener("click", clickHandlers[i]));
      document.removeEventListener("scroll", upd, true);
      window.removeEventListener("resize", upd);
    };
  }, []);

  return (
    <NeonCtx.Provider value={ctx}>
      <style>{NEON_CSS}</style>
<div id="s-top" style={{ width: "100%", minHeight: "100vh", background: "#ffffff", padding: "0 0 90px", boxSizing: "border-box" }}>
<a id="uptop" href="#s-top" aria-label="Back to top" style={{ position: "fixed", right: "28px", bottom: "28px", zIndex: "50", width: "56px", height: "56px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", cursor: "pointer", background: "#ffffff", border: "2.5px solid #22b8ff", boxSizing: "border-box", boxShadow: "0 5px 0 #0f5272,0 10px 12px rgba(0,0,0,.18),0 0 16px #22b8ff" }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#22b8ff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg></a>
<div id="tabbar" style={{ position: "sticky", top: "0", zIndex: "40", background: "#ffffff", height: "190px", overflowX: "auto", overflowY: "hidden", scrollbarWidth: "none" }}>
<div style={{ position: "relative", width: "2640px", height: "190px" }}>
<a href="#s0" className="tb" style={{ "--d": "#0f5272", "--g": "#22b8ff", display: "block", textDecoration: "none", cursor: "pointer", position: "absolute", left: "624px", top: "62px", width: "164px", height: "76px", filter: "drop-shadow(0 7px 0 #0f5272) drop-shadow(0 14px 9px rgba(0,0,0,.3)) drop-shadow(0 0 12px #22b8ff)" } as CSSProperties}><div style={{ width: "164px", height: "76px", background: "linear-gradient(180deg,#ffffffaa 0,#22b8ff 38%,#1780b2 100%)", clipPath: "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%,12% 50%)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 20px 0 26px", boxSizing: "border-box" }}><div style={{ flex: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg></div><div style={{ fontSize: "12.5px", fontWeight: "700", lineHeight: "1.15", color: "#0b1024", textAlign: "left" }}>Upload CV</div></div></a>
<a href="#s1" className="tb" style={{ "--d": "#223772", "--g": "#4d7bff", display: "block", textDecoration: "none", cursor: "pointer", position: "absolute", left: "778px", top: "62px", width: "164px", height: "76px", filter: "drop-shadow(0 7px 0 #223772) drop-shadow(0 14px 9px rgba(0,0,0,.3)) drop-shadow(0 0 12px #4d7bff)" } as CSSProperties}><div style={{ width: "164px", height: "76px", background: "linear-gradient(180deg,#ffffffaa 0,#4d7bff 38%,#3556b2 100%)", clipPath: "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%,12% 50%)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 20px 0 26px", boxSizing: "border-box" }}><div style={{ flex: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg></div><div style={{ fontSize: "12.5px", fontWeight: "700", lineHeight: "1.15", color: "#0b1024", textAlign: "left" }}>Profile Information</div></div></a>
<a href="#s2" className="tb" style={{ "--d": "#452972", "--g": "#9b5cff", display: "block", textDecoration: "none", cursor: "pointer", position: "absolute", left: "932px", top: "62px", width: "164px", height: "76px", filter: "drop-shadow(0 7px 0 #452972) drop-shadow(0 14px 9px rgba(0,0,0,.3)) drop-shadow(0 0 12px #9b5cff)" } as CSSProperties}><div style={{ width: "164px", height: "76px", background: "linear-gradient(180deg,#ffffffaa 0,#9b5cff 38%,#6c40b2 100%)", clipPath: "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%,12% 50%)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 20px 0 26px", boxSizing: "border-box" }}><div style={{ flex: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/></svg></div><div style={{ fontSize: "12.5px", fontWeight: "700", lineHeight: "1.15", color: "#0b1024", textAlign: "left" }}>Education</div></div></a>
<a href="#s3" className="tb" style={{ "--d": "#721360", "--g": "#ff2bd6", display: "block", textDecoration: "none", cursor: "pointer", position: "absolute", left: "1086px", top: "62px", width: "164px", height: "76px", filter: "drop-shadow(0 7px 0 #721360) drop-shadow(0 14px 9px rgba(0,0,0,.3)) drop-shadow(0 0 12px #ff2bd6)" } as CSSProperties}><div style={{ width: "164px", height: "76px", background: "linear-gradient(180deg,#ffffffaa 0,#ff2bd6 38%,#b21e95 100%)", clipPath: "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%,12% 50%)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 20px 0 26px", boxSizing: "border-box" }}><div style={{ flex: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 6h7l2 2h9v11H3z"/></svg></div><div style={{ fontSize: "12.5px", fontWeight: "700", lineHeight: "1.15", color: "#0b1024", textAlign: "left" }}>Projects</div></div></a>
<a href="#s4" className="tb" style={{ "--d": "#721b31", "--g": "#ff3d6e", display: "block", textDecoration: "none", cursor: "pointer", position: "absolute", left: "1240px", top: "62px", width: "164px", height: "76px", filter: "drop-shadow(0 7px 0 #721b31) drop-shadow(0 14px 9px rgba(0,0,0,.3)) drop-shadow(0 0 12px #ff3d6e)" } as CSSProperties}><div style={{ width: "164px", height: "76px", background: "linear-gradient(180deg,#ffffffaa 0,#ff3d6e 38%,#b22a4d 100%)", clipPath: "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%,12% 50%)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 20px 0 26px", boxSizing: "border-box" }}><div style={{ flex: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 13h18"/></svg></div><div style={{ fontSize: "12.5px", fontWeight: "700", lineHeight: "1.15", color: "#0b1024", textAlign: "left" }}>Work Experience</div></div></a>
<a href="#s5" className="tb" style={{ "--d": "#723e0d", "--g": "#ff8a1f", display: "block", textDecoration: "none", cursor: "pointer", position: "absolute", left: "1394px", top: "62px", width: "164px", height: "76px", filter: "drop-shadow(0 7px 0 #723e0d) drop-shadow(0 14px 9px rgba(0,0,0,.3)) drop-shadow(0 0 12px #ff8a1f)" } as CSSProperties}><div style={{ width: "164px", height: "76px", background: "linear-gradient(180deg,#ffffffaa 0,#ff8a1f 38%,#b26015 100%)", clipPath: "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%,12% 50%)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 20px 0 26px", boxSizing: "border-box" }}><div style={{ flex: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></svg></div><div style={{ fontSize: "12.5px", fontWeight: "700", lineHeight: "1.15", color: "#0b1024", textAlign: "left" }}>Certifications</div></div></a>
<a href="#s6" className="tb" style={{ "--d": "#6c5700", "--g": "#f2c200", display: "block", textDecoration: "none", cursor: "pointer", position: "absolute", left: "1548px", top: "62px", width: "164px", height: "76px", filter: "drop-shadow(0 7px 0 #6c5700) drop-shadow(0 14px 9px rgba(0,0,0,.3)) drop-shadow(0 0 12px #f2c200)" } as CSSProperties}><div style={{ width: "164px", height: "76px", background: "linear-gradient(180deg,#ffffffaa 0,#f2c200 38%,#a98700 100%)", clipPath: "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%,12% 50%)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 20px 0 26px", boxSizing: "border-box" }}><div style={{ flex: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg></div><div style={{ fontSize: "12.5px", fontWeight: "700", lineHeight: "1.15", color: "#0b1024", textAlign: "left" }}>Skills</div></div></a>
<a href="#s7" className="tb" style={{ "--d": "#38630d", "--g": "#7ddc1f", display: "block", textDecoration: "none", cursor: "pointer", position: "absolute", left: "1702px", top: "62px", width: "164px", height: "76px", filter: "drop-shadow(0 7px 0 #38630d) drop-shadow(0 14px 9px rgba(0,0,0,.3)) drop-shadow(0 0 12px #7ddc1f)" } as CSSProperties}><div style={{ width: "164px", height: "76px", background: "linear-gradient(180deg,#ffffffaa 0,#7ddc1f 38%,#579a15 100%)", clipPath: "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%,12% 50%)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 20px 0 26px", boxSizing: "border-box" }}><div style={{ flex: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div><div style={{ fontSize: "12.5px", fontWeight: "700", lineHeight: "1.15", color: "#0b1024", textAlign: "left" }}>Cover Letter</div></div></a>
<a href="#s8" className="tb" style={{ "--d": "#006040", "--g": "#00d68f", display: "block", textDecoration: "none", cursor: "pointer", position: "absolute", left: "1856px", top: "62px", width: "164px", height: "76px", filter: "drop-shadow(0 7px 0 #006040) drop-shadow(0 14px 9px rgba(0,0,0,.3)) drop-shadow(0 0 12px #00d68f)" } as CSSProperties}><div style={{ width: "164px", height: "76px", background: "linear-gradient(180deg,#ffffffaa 0,#00d68f 38%,#009564 100%)", clipPath: "polygon(0 0,88% 0,100% 50%,88% 100%,0 100%,12% 50%)", display: "flex", alignItems: "center", justifyContent: "center", gap: "4px", padding: "0 20px 0 26px", boxSizing: "border-box" }}><div style={{ flex: "none" }}><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></div><div style={{ fontSize: "12.5px", fontWeight: "700", lineHeight: "1.15", color: "#0b1024", textAlign: "left" }}>CV Preview</div></div></a>
</div></div>
<div style={{ width: "640px", margin: "28px auto 0", boxSizing: "border-box", padding: "34px 36px", borderRadius: "24px", background: "linear-gradient(180deg,#ffffff,#f7f8fd)", border: "1.5px solid #4d7bff", borderLeftColor: "#ffffff", borderRightColor: "#ffffff", boxShadow: "0 8px 0 #223772,0 18px 28px rgba(0,0,0,.18),0 -8px 22px -8px #4d7bff" }}>
<div style={{ fontSize: "24px", fontWeight: "800", color: "#0b1024", marginLeft: "4px" }}>Build your CV</div>
<div style={{ fontSize: "13px", color: "#6b7390", margin: "4px 0 26px 4px" }}>Complete every section below · 9 steps in one form</div>
<div id="s0" style={{ scrollMarginTop: "210px", marginTop: "0px" }}><div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "0 0 20px" }}><div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#22b8ff 38%,#1780b2 100%)", boxShadow: "0 4px 0 #0f5272,0 0 14px #22b8ff", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg></div><div><div style={{ fontSize: "19px", fontWeight: "800", color: "#0b1024" }}>Upload CV</div><div style={{ fontSize: "12px", color: "#6b7390", marginTop: "2px" }}>Step 1 of 9 · Start with your existing CV</div></div></div><div className="sh" style={{ "--c": "#22b8ff" } as CSSProperties}>Upload file<i></i></div>
<div className="sg">
<div
  onClick={() => !upload.uploading && upload.onPick()}
  onDragOver={upload.onDragOver}
  onDragEnter={upload.onDragOver}
  onDragLeave={upload.onDragLeave}
  onDrop={upload.onDrop}
  role="button"
  tabIndex={0}
  onKeyDown={(e) => { if ((e.key === "Enter" || e.key === " ") && !upload.uploading) upload.onPick(); }}
  style={{ height: "190px", borderRadius: "16px", border: "2px dashed " + (upload.error ? "#ff3d6e" : "#22b8ff"), background: upload.dragActive ? "#eaf7ff" : "linear-gradient(180deg,#f3f5fb,#fff)", boxShadow: "0 0 12px #22b8ff, inset 0 3px 6px rgba(11,16,36,.08)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "8px", cursor: upload.uploading ? "progress" : "pointer", textAlign: "center", padding: "0 16px", boxSizing: "border-box" }}
>
  <div style={{ width: "54px", height: "54px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#22b8ff 38%,#1780b2 100%)", boxShadow: "0 4px 0 #0f5272,0 0 14px #22b8ff", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 16V4M7 9l5-5 5 5M4 20h16"/></svg></div>
  {upload.uploading ? (
    <>
      <div style={{ fontSize: "15px", fontWeight: 800, color: "#0b1024" }}>Reading your CV...</div>
      <div style={{ fontSize: "12px", color: "#6b7390" }}>{upload.fileName} · this can take a few seconds</div>
    </>
  ) : (
    <>
      <div style={{ fontSize: "15px", fontWeight: 800, color: "#0b1024" }}>{upload.fileName ? upload.fileName : "Drag & drop your CV here, or click to upload"}</div>
      <div style={{ fontSize: "12px", color: "#6b7390" }}>{upload.filledCount > 0 ? `Filled ${upload.filledCount} fields from your CV - review them below` : `PDF only · up to ${MAX_FILE_MB} MB`}</div>
    </>
  )}
  {upload.error && <div role="alert" style={{ fontSize: "12px", fontWeight: 700, color: "#d6204f" }}>{upload.error}</div>}
</div>
</div>
<div className="sh" style={{ "--c": "#22b8ff" } as CSSProperties}>Import from link<i></i></div>
<div className="sg">
<Fld id="s0_0" label="LinkedIn profile URL" c="#22b8ff" ph="linkedin.com/in/janedoe" />
<Fld id="s0_1" label="Online CV / portfolio link" c="#22b8ff" ph="https://" />
</div>
<div className="sh" style={{ "--c": "#22b8ff" } as CSSProperties}>Parsing options<i></i></div>
<div className="sg">
<Fld id="s0_2" label="Language" c="#22b8ff" ph="English" />
<Fld id="s0_3" label="Auto-fill sections" c="#22b8ff" ph="All sections" />
</div>
<div className="sh" style={{ "--c": "#22b8ff" } as CSSProperties}>Document details<i></i></div>
<div className="sg">
<Fld id="s0_4" label="CV title" c="#22b8ff" ph="Jane Doe - Product Designer" />
<Fld id="s0_5" label="Target role" c="#22b8ff" ph="Senior Product Designer" />
<Fld id="s0_6" label="Visibility" c="#22b8ff" ph="Private" />
</div>
<div className="sh" style={{ "--c": "#22b8ff" } as CSSProperties}>Privacy<i></i></div>
<div className="sg">
<Fld id="s0_7" label="Share with recruiters" c="#22b8ff" ph="Allowed" />
<Fld id="s0_8" label="Keep original file" c="#22b8ff" ph="Yes, store securely" />
</div>
<div className="sh" style={{ "--c": "#22b8ff" } as CSSProperties}>File preferences<i></i></div>
<div className="sg">
<Fld id="s0_9" label="Preferred file format" c="#22b8ff" ph="PDF" />
<Fld id="s0_10" label="Maximum file size" c="#22b8ff" ph="10 MB" />
<Fld id="s0_11" label="Page limit" c="#22b8ff" ph="2 pages" />
<Fld id="s0_12" label="Document language" c="#22b8ff" ph="English" />
</div>
<div className="sh" style={{ "--c": "#22b8ff" } as CSSProperties}>Parsing settings<i></i></div>
<div className="sg">
<Fld id="s0_13" label="Detect sections automatically" c="#22b8ff" ph="On" />
<Fld id="s0_14" label="Extract skills from text" c="#22b8ff" ph="On" />
<Fld id="s0_15" label="Extract dates and durations" c="#22b8ff" ph="On" />
<Fld id="s0_16" label="Merge with existing profile" c="#22b8ff" ph="Ask me first" />
</div>
<div className="sh" style={{ "--c": "#22b8ff" } as CSSProperties}>Notes<i></i></div>
<div className="sg">
<Fld id="s0_17" label="Notes about this CV" c="#22b8ff" ph="Anything the parser should know, e.g. career gap, name change..." h={90} />
</div>
</div><div id="s1" style={{ scrollMarginTop: "210px", marginTop: "30px" }}><div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "0 0 20px" }}><div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#4d7bff 38%,#3556b2 100%)", boxShadow: "0 4px 0 #223772,0 0 14px #4d7bff", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-7 8-7s8 3 8 7"/></svg></div><div><div style={{ fontSize: "19px", fontWeight: "800", color: "#0b1024" }}>Profile Information</div><div style={{ fontSize: "12px", color: "#6b7390", marginTop: "2px" }}>Step 2 of 9 · Tell us about yourself</div></div></div><div className="sh" style={{ "--c": "#4d7bff" } as CSSProperties}>Personal details<i></i></div>
<div className="sg">
<Fld id="s1_0" label="Full name" c="#4d7bff" ph="Jane Doe" />
<Fld id="s1_1" label="Headline" c="#4d7bff" ph="Product Designer" />
<Fld id="s1_2" label="Date of birth" c="#4d7bff" ph="DD / MM / YYYY" />
</div>
<div className="sh" style={{ "--c": "#4d7bff" } as CSSProperties}>Contact<i></i></div>
<div className="sg">
<Fld id="s1_3" label="Email" c="#4d7bff" ph="jane@email.com" />
<Fld id="s1_4" label="Phone" c="#4d7bff" ph="+880 1700 000000" />
<Fld id="s1_5" label="Location" c="#4d7bff" ph="Dhaka, Bangladesh" />
</div>
<div className="sh" style={{ "--c": "#4d7bff" } as CSSProperties}>Online presence<i></i></div>
<div className="sg">
<Fld id="s1_6" label="LinkedIn" c="#4d7bff" ph="linkedin.com/in/janedoe" />
<Fld id="s1_7" label="Portfolio website" c="#4d7bff" ph="janedoe.com" />
<Fld id="s1_8" label="GitHub" c="#4d7bff" ph="github.com/janedoe" />
</div>
<div className="sh" style={{ "--c": "#4d7bff" } as CSSProperties}>About you<i></i></div>
<div className="sg">
<Fld id="s1_9" label="Professional summary" c="#4d7bff" ph="Write a short summary about your experience, strengths and goals..." h={104} />
</div>
<div className="sh" style={{ "--c": "#4d7bff" } as CSSProperties}>Address<i></i></div>
<div className="sg">
<Fld id="s1_10" label="Street address" c="#4d7bff" ph="House 12, Road 5" />
<Fld id="s1_11" label="City" c="#4d7bff" ph="Dhaka" />
<Fld id="s1_12" label="Postal code" c="#4d7bff" ph="1212" />
<Fld id="s1_13" label="Country" c="#4d7bff" ph="Bangladesh" />
</div>
<div className="sh" style={{ "--c": "#4d7bff" } as CSSProperties}>Preferences<i></i></div>
<div className="sg">
<Fld id="s1_14" label="Preferred contact method" c="#4d7bff" ph="Email" />
<Fld id="s1_15" label="Availability" c="#4d7bff" ph="Immediately" />
<Fld id="s1_16" label="Expected salary" c="#4d7bff" ph="$60,000 / year" />
</div>
<div className="sh" style={{ "--c": "#4d7bff" } as CSSProperties}>Identity<i></i></div>
<div className="sg">
<Fld id="s1_17" label="Middle name" c="#4d7bff" ph="Ahmed" />
<Fld id="s1_18" label="Preferred name" c="#4d7bff" ph="Jane" />
<Fld id="s1_19" label="Gender" c="#4d7bff" ph="Female" />
<Fld id="s1_20" label="Nationality" c="#4d7bff" ph="Bangladeshi" />
<Fld id="s1_21" label="Marital status" c="#4d7bff" ph="Single" />
<Fld id="s1_22" label="Passport / ID number" c="#4d7bff" ph="XX0000000" />
</div>
<div className="sh" style={{ "--c": "#4d7bff" } as CSSProperties}>Work authorisation<i></i></div>
<div className="sg">
<Fld id="s1_23" label="Work permit status" c="#4d7bff" ph="Citizen" />
<Fld id="s1_24" label="Willing to relocate" c="#4d7bff" ph="Yes" />
<Fld id="s1_25" label="Willing to travel" c="#4d7bff" ph="Up to 25%" />
<Fld id="s1_26" label="Notice period" c="#4d7bff" ph="30 days" />
</div>
<div className="sh" style={{ "--c": "#4d7bff" } as CSSProperties}>Social links<i></i></div>
<div className="sg">
<Fld id="s1_27" label="Twitter / X" c="#4d7bff" ph="x.com/janedoe" />
<Fld id="s1_28" label="Behance" c="#4d7bff" ph="behance.net/janedoe" />
<Fld id="s1_29" label="Dribbble" c="#4d7bff" ph="dribbble.com/janedoe" />
<Fld id="s1_30" label="Medium" c="#4d7bff" ph="medium.com/@janedoe" />
</div>
</div><div id="s2" style={{ scrollMarginTop: "210px", marginTop: "30px" }}><div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "0 0 20px" }}><div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#9b5cff 38%,#6c40b2 100%)", boxShadow: "0 4px 0 #452972,0 0 14px #9b5cff", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11v5c3 2 9 2 12 0v-5"/></svg></div><div><div style={{ fontSize: "19px", fontWeight: "800", color: "#0b1024" }}>Education</div><div style={{ fontSize: "12px", color: "#6b7390", marginTop: "2px" }}>Step 3 of 9 · Your academic background</div></div></div><div className="sh" style={{ "--c": "#9b5cff" } as CSSProperties}>Degree<i></i></div>
<div className="sg">
<Fld id="s2_0" label="Institution" c="#9b5cff" ph="University of Dhaka" />
<Fld id="s2_1" label="Degree" c="#9b5cff" ph="Bachelor of Science" />
<Fld id="s2_2" label="Field of study" c="#9b5cff" ph="Computer Science" />
</div>
<div className="sh" style={{ "--c": "#9b5cff" } as CSSProperties}>Duration<i></i></div>
<div className="sg">
<Fld id="s2_3" label="Start date" c="#9b5cff" ph="MM / YYYY" />
<Fld id="s2_4" label="End date" c="#9b5cff" ph="MM / YYYY" />
<Fld id="s2_5" label="Grade / CGPA" c="#9b5cff" ph="3.80 / 4.00" />
</div>
<div className="sh" style={{ "--c": "#9b5cff" } as CSSProperties}>Details<i></i></div>
<div className="sg">
<Fld id="s2_6" label="Achievements &amp; activities" c="#9b5cff" ph="Honors, clubs, thesis, relevant coursework..." h={104} />
</div>
<div className="sh" style={{ "--c": "#9b5cff" } as CSSProperties}>Awards &amp; honors<i></i></div>
<div className="sg">
<Fld id="s2_7" label="Award title" c="#9b5cff" ph="Dean's List" />
<Fld id="s2_8" label="Awarded by" c="#9b5cff" ph="University of Dhaka" />
<Fld id="s2_9" label="Year" c="#9b5cff" ph="2022" />
</div>
<div className="sh" style={{ "--c": "#9b5cff" } as CSSProperties}>Courses<i></i></div>
<div className="sg">
<Fld id="s2_10" label="Course name" c="#9b5cff" ph="Machine Learning" />
<Fld id="s2_11" label="Platform" c="#9b5cff" ph="Coursera" />
<Fld id="s2_12" label="Completion date" c="#9b5cff" ph="MM / YYYY" />
</div>
<div className="sh" style={{ "--c": "#9b5cff" } as CSSProperties}>Secondary education<i></i></div>
<div className="sg">
<Fld id="s2_13" label="School name" c="#9b5cff" ph="Dhaka College" />
<Fld id="s2_14" label="Board / curriculum" c="#9b5cff" ph="HSC" />
<Fld id="s2_15" label="Group / stream" c="#9b5cff" ph="Science" />
<Fld id="s2_16" label="Passing year" c="#9b5cff" ph="2018" />
<Fld id="s2_17" label="GPA" c="#9b5cff" ph="5.00 / 5.00" />
</div>
<div className="sh" style={{ "--c": "#9b5cff" } as CSSProperties}>Postgraduate<i></i></div>
<div className="sg">
<Fld id="s2_18" label="Institution" c="#9b5cff" ph="BRAC University" />
<Fld id="s2_19" label="Degree" c="#9b5cff" ph="Master of Science" />
<Fld id="s2_20" label="Thesis title" c="#9b5cff" ph="Human-centred design systems" />
<Fld id="s2_21" label="Supervisor" c="#9b5cff" ph="Prof. A. Rahman" />
</div>
<div className="sh" style={{ "--c": "#9b5cff" } as CSSProperties}>Extracurricular<i></i></div>
<div className="sg">
<Fld id="s2_22" label="Clubs &amp; societies" c="#9b5cff" ph="Design Society, Robotics Club" />
<Fld id="s2_23" label="Volunteering" c="#9b5cff" ph="Teach For Bangladesh" />
<Fld id="s2_24" label="Other academic notes" c="#9b5cff" ph="Scholarships, exchange programs, publications..." h={90} />
</div>
</div><div id="s3" style={{ scrollMarginTop: "210px", marginTop: "30px" }}><div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "0 0 20px" }}><div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#ff2bd6 38%,#b21e95 100%)", boxShadow: "0 4px 0 #721360,0 0 14px #ff2bd6", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h7l2 2h9v11H3z"/></svg></div><div><div style={{ fontSize: "19px", fontWeight: "800", color: "#0b1024" }}>Projects</div><div style={{ fontSize: "12px", color: "#6b7390", marginTop: "2px" }}>Step 4 of 9 · Show what you have built</div></div></div><div className="sh" style={{ "--c": "#ff2bd6" } as CSSProperties}>Project info<i></i></div>
<div className="sg">
<Fld id="s3_0" label="Project title" c="#ff2bd6" ph="Neon CV Builder" />
<Fld id="s3_1" label="Your role" c="#ff2bd6" ph="Lead Developer" />
<Fld id="s3_2" label="Project link" c="#ff2bd6" ph="github.com/janedoe/project" />
</div>
<div className="sh" style={{ "--c": "#ff2bd6" } as CSSProperties}>Timeline<i></i></div>
<div className="sg">
<Fld id="s3_3" label="Start date" c="#ff2bd6" ph="MM / YYYY" />
<Fld id="s3_4" label="End date" c="#ff2bd6" ph="MM / YYYY" />
</div>
<div className="sh" style={{ "--c": "#ff2bd6" } as CSSProperties}>Description<i></i></div>
<div className="sg">
<Fld id="s3_5" label="Technologies used" c="#ff2bd6" ph="React, Node.js, PostgreSQL" />
<Fld id="s3_6" label="What did you build?" c="#ff2bd6" ph="Describe the problem, your work and the result..." h={104} />
</div>
<div className="sh" style={{ "--c": "#ff2bd6" } as CSSProperties}>Team &amp; impact<i></i></div>
<div className="sg">
<Fld id="s3_7" label="Team size" c="#ff2bd6" ph="5" />
<Fld id="s3_8" label="Key result" c="#ff2bd6" ph="Reached 10,000 users" />
<Fld id="s3_9" label="Client / company" c="#ff2bd6" ph="Acme Inc." />
</div>
<div className="sh" style={{ "--c": "#ff2bd6" } as CSSProperties}>Media<i></i></div>
<div className="sg">
<Fld id="s3_10" label="Live demo link" c="#ff2bd6" ph="https://demo.example.com" />
<Fld id="s3_11" label="Screenshot URL" c="#ff2bd6" ph="https://img.example.com/shot.png" />
</div>
<div className="sh" style={{ "--c": "#ff2bd6" } as CSSProperties}>Project details<i></i></div>
<div className="sg">
<Fld id="s3_12" label="Project category" c="#ff2bd6" ph="Web application" />
<Fld id="s3_13" label="Project status" c="#ff2bd6" ph="Completed" />
<Fld id="s3_14" label="Client" c="#ff2bd6" ph="Acme Inc." />
<Fld id="s3_15" label="Budget" c="#ff2bd6" ph="$20,000" />
<Fld id="s3_16" label="Duration" c="#ff2bd6" ph="6 months" />
</div>
<div className="sh" style={{ "--c": "#ff2bd6" } as CSSProperties}>Contribution<i></i></div>
<div className="sg">
<Fld id="s3_17" label="Responsibilities" c="#ff2bd6" ph="Design, frontend, testing" />
<Fld id="s3_18" label="Methodology" c="#ff2bd6" ph="Agile / Scrum" />
<Fld id="s3_19" label="Version control" c="#ff2bd6" ph="Git / GitHub" />
<Fld id="s3_20" label="Hosting platform" c="#ff2bd6" ph="AWS" />
</div>
<div className="sh" style={{ "--c": "#ff2bd6" } as CSSProperties}>Outcomes<i></i></div>
<div className="sg">
<Fld id="s3_21" label="Users reached" c="#ff2bd6" ph="10,000+" />
<Fld id="s3_22" label="Revenue impact" c="#ff2bd6" ph="+18%" />
<Fld id="s3_23" label="Awards or recognition" c="#ff2bd6" ph="Best Product 2023" />
<Fld id="s3_24" label="Lessons learned" c="#ff2bd6" ph="What went well and what you would do differently..." h={90} />
</div>
</div><div id="s4" style={{ scrollMarginTop: "210px", marginTop: "30px" }}><div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "0 0 20px" }}><div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#ff3d6e 38%,#b22a4d 100%)", boxShadow: "0 4px 0 #721b31,0 0 14px #ff3d6e", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 13h18"/></svg></div><div><div style={{ fontSize: "19px", fontWeight: "800", color: "#0b1024" }}>Work Experience</div><div style={{ fontSize: "12px", color: "#6b7390", marginTop: "2px" }}>Step 5 of 9 · Where you have worked</div></div></div><div className="sh" style={{ "--c": "#ff3d6e" } as CSSProperties}>Position<i></i></div>
<div className="sg">
<Fld id="s4_0" label="Job title" c="#ff3d6e" ph="Senior Product Designer" />
<Fld id="s4_1" label="Company" c="#ff3d6e" ph="Acme Inc." />
<Fld id="s4_2" label="Location" c="#ff3d6e" ph="Dhaka, Bangladesh" />
</div>
<div className="sh" style={{ "--c": "#ff3d6e" } as CSSProperties}>Duration<i></i></div>
<div className="sg">
<Fld id="s4_3" label="Start date" c="#ff3d6e" ph="MM / YYYY" />
<Fld id="s4_4" label="End date" c="#ff3d6e" ph="Present" />
<Fld id="s4_5" label="Employment type" c="#ff3d6e" ph="Full-time" />
</div>
<div className="sh" style={{ "--c": "#ff3d6e" } as CSSProperties}>Responsibilities<i></i></div>
<div className="sg">
<Fld id="s4_6" label="Key achievements" c="#ff3d6e" ph="Led a team of 5, increased conversion by 32%..." h={104} />
</div>
<div className="sh" style={{ "--c": "#ff3d6e" } as CSSProperties}>Tools &amp; team<i></i></div>
<div className="sg">
<Fld id="s4_7" label="Tools used" c="#ff3d6e" ph="Figma, React, Jira" />
<Fld id="s4_8" label="Team size" c="#ff3d6e" ph="8" />
<Fld id="s4_9" label="Reported to" c="#ff3d6e" ph="Head of Design" />
</div>
<div className="sh" style={{ "--c": "#ff3d6e" } as CSSProperties}>Reference<i></i></div>
<div className="sg">
<Fld id="s4_10" label="Referee name" c="#ff3d6e" ph="Sarah Khan" />
<Fld id="s4_11" label="Referee email" c="#ff3d6e" ph="sarah@acme.com" />
<Fld id="s4_12" label="Referee phone" c="#ff3d6e" ph="+880 1800 000000" />
</div>
<div className="sh" style={{ "--c": "#ff3d6e" } as CSSProperties}>Company details<i></i></div>
<div className="sg">
<Fld id="s4_13" label="Company website" c="#ff3d6e" ph="acme.com" />
<Fld id="s4_14" label="Industry" c="#ff3d6e" ph="Software / SaaS" />
<Fld id="s4_15" label="Company size" c="#ff3d6e" ph="201 - 500 employees" />
<Fld id="s4_16" label="Department" c="#ff3d6e" ph="Design &amp; Product" />
</div>
<div className="sh" style={{ "--c": "#ff3d6e" } as CSSProperties}>Compensation<i></i></div>
<div className="sg">
<Fld id="s4_17" label="Starting salary" c="#ff3d6e" ph="$45,000" />
<Fld id="s4_18" label="Final salary" c="#ff3d6e" ph="$60,000" />
<Fld id="s4_19" label="Bonuses" c="#ff3d6e" ph="10% annual" />
<Fld id="s4_20" label="Reason for leaving" c="#ff3d6e" ph="Career growth" />
</div>
<div className="sh" style={{ "--c": "#ff3d6e" } as CSSProperties}>Role scope<i></i></div>
<div className="sg">
<Fld id="s4_21" label="Employment status" c="#ff3d6e" ph="Full-time, on-site" />
<Fld id="s4_22" label="Direct reports" c="#ff3d6e" ph="5" />
<Fld id="s4_23" label="Budget owned" c="#ff3d6e" ph="$150,000" />
<Fld id="s4_24" label="Key tools" c="#ff3d6e" ph="Figma, Jira, Notion" />
<Fld id="s4_25" label="Major accomplishments" c="#ff3d6e" ph="Shipped 3 products, reduced churn by 14%..." h={90} />
</div>
</div><div id="s5" style={{ scrollMarginTop: "210px", marginTop: "30px" }}><div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "0 0 20px" }}><div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#ff8a1f 38%,#b26015 100%)", boxShadow: "0 4px 0 #723e0d,0 0 14px #ff8a1f", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="9" r="6"/><path d="M8.5 14L7 22l5-3 5 3-1.5-8"/></svg></div><div><div style={{ fontSize: "19px", fontWeight: "800", color: "#0b1024" }}>Certifications</div><div style={{ fontSize: "12px", color: "#6b7390", marginTop: "2px" }}>Step 6 of 9 · Licences and credentials</div></div></div><div className="sh" style={{ "--c": "#ff8a1f" } as CSSProperties}>Certificate<i></i></div>
<div className="sg">
<Fld id="s5_0" label="Certification name" c="#ff8a1f" ph="AWS Certified Developer" />
<Fld id="s5_1" label="Issuing organisation" c="#ff8a1f" ph="Amazon Web Services" />
<Fld id="s5_2" label="Credential ID" c="#ff8a1f" ph="ABC-123-XYZ" />
</div>
<div className="sh" style={{ "--c": "#ff8a1f" } as CSSProperties}>Validity<i></i></div>
<div className="sg">
<Fld id="s5_3" label="Issue date" c="#ff8a1f" ph="MM / YYYY" />
<Fld id="s5_4" label="Expiry date" c="#ff8a1f" ph="MM / YYYY" />
</div>
<div className="sh" style={{ "--c": "#ff8a1f" } as CSSProperties}>Verification<i></i></div>
<div className="sg">
<Fld id="s5_5" label="Credential URL" c="#ff8a1f" ph="https://verify.example.com/abc" />
</div>
<div className="sh" style={{ "--c": "#ff8a1f" } as CSSProperties}>Skills covered<i></i></div>
<div className="sg">
<Fld id="s5_6" label="Topics covered" c="#ff8a1f" ph="Cloud, Serverless, Security" />
<Fld id="s5_7" label="Score / grade" c="#ff8a1f" ph="92%" />
</div>
<div className="sh" style={{ "--c": "#ff8a1f" } as CSSProperties}>Notes<i></i></div>
<div className="sg">
<Fld id="s5_8" label="Additional notes" c="#ff8a1f" ph="Anything employers should know about this credential..." h={90} />
</div>
<div className="sh" style={{ "--c": "#ff8a1f" } as CSSProperties}>Issuer details<i></i></div>
<div className="sg">
<Fld id="s5_9" label="Issuer website" c="#ff8a1f" ph="aws.amazon.com" />
<Fld id="s5_10" label="Issuer country" c="#ff8a1f" ph="United States" />
<Fld id="s5_11" label="Certificate level" c="#ff8a1f" ph="Associate" />
<Fld id="s5_12" label="Exam code" c="#ff8a1f" ph="DVA-C02" />
</div>
<div className="sh" style={{ "--c": "#ff8a1f" } as CSSProperties}>Training<i></i></div>
<div className="sg">
<Fld id="s5_13" label="Training provider" c="#ff8a1f" ph="A Cloud Guru" />
<Fld id="s5_14" label="Study hours" c="#ff8a1f" ph="80" />
<Fld id="s5_15" label="Exam date" c="#ff8a1f" ph="MM / YYYY" />
<Fld id="s5_16" label="Retake count" c="#ff8a1f" ph="0" />
</div>
<div className="sh" style={{ "--c": "#ff8a1f" } as CSSProperties}>Renewal<i></i></div>
<div className="sg">
<Fld id="s5_17" label="Renewal required" c="#ff8a1f" ph="Every 3 years" />
<Fld id="s5_18" label="Renewal date" c="#ff8a1f" ph="MM / YYYY" />
<Fld id="s5_19" label="Continuing education credits" c="#ff8a1f" ph="20 CPE" />
<Fld id="s5_20" label="Certificate status" c="#ff8a1f" ph="Active" />
</div>
</div><div id="s6" style={{ scrollMarginTop: "210px", marginTop: "30px" }}><div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "0 0 20px" }}><div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#f2c200 38%,#a98700 100%)", boxShadow: "0 4px 0 #6c5700,0 0 14px #f2c200", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/></svg></div><div><div style={{ fontSize: "19px", fontWeight: "800", color: "#0b1024" }}>Skills</div><div style={{ fontSize: "12px", color: "#6b7390", marginTop: "2px" }}>Step 7 of 9 · What you are good at</div></div></div><div className="sh" style={{ "--c": "#f2c200" } as CSSProperties}>Technical skills<i></i></div>
<div className="sg">
<Fld id="s6_0" label="Skill" c="#f2c200" ph="JavaScript" />
<Fld id="s6_1" label="Proficiency" c="#f2c200" ph="Expert" />
<Fld id="s6_2" label="Years of experience" c="#f2c200" ph="6" />
</div>
<div className="sh" style={{ "--c": "#f2c200" } as CSSProperties}>Soft skills<i></i></div>
<div className="sg">
<Fld id="s6_3" label="Skill" c="#f2c200" ph="Leadership" />
<Fld id="s6_4" label="Proficiency" c="#f2c200" ph="Advanced" />
</div>
<div className="sh" style={{ "--c": "#f2c200" } as CSSProperties}>Languages<i></i></div>
<div className="sg">
<Fld id="s6_5" label="Language" c="#f2c200" ph="English" />
<Fld id="s6_6" label="Level" c="#f2c200" ph="Fluent" />
</div>
<div className="sh" style={{ "--c": "#f2c200" } as CSSProperties}>Tools &amp; frameworks<i></i></div>
<div className="sg">
<Fld id="s6_7" label="Tool" c="#f2c200" ph="React" />
<Fld id="s6_8" label="Level" c="#f2c200" ph="Advanced" />
<Fld id="s6_9" label="Years of experience" c="#f2c200" ph="4" />
</div>
<div className="sh" style={{ "--c": "#f2c200" } as CSSProperties}>Strengths summary<i></i></div>
<div className="sg">
<Fld id="s6_10" label="Describe your top strengths" c="#f2c200" ph="What makes you stand out in your field..." h={90} />
</div>
<div className="sh" style={{ "--c": "#f2c200" } as CSSProperties}>Programming languages<i></i></div>
<div className="sg">
<Fld id="s6_11" label="Language" c="#f2c200" ph="TypeScript" />
<Fld id="s6_12" label="Proficiency" c="#f2c200" ph="Advanced" />
<Fld id="s6_13" label="Years of experience" c="#f2c200" ph="5" />
<Fld id="s6_14" label="Last used" c="#f2c200" ph="This year" />
</div>
<div className="sh" style={{ "--c": "#f2c200" } as CSSProperties}>Design &amp; tools<i></i></div>
<div className="sg">
<Fld id="s6_15" label="Tool" c="#f2c200" ph="Figma" />
<Fld id="s6_16" label="Proficiency" c="#f2c200" ph="Expert" />
<Fld id="s6_17" label="Years of experience" c="#f2c200" ph="6" />
<Fld id="s6_18" label="Last used" c="#f2c200" ph="This year" />
</div>
<div className="sh" style={{ "--c": "#f2c200" } as CSSProperties}>Interpersonal skills<i></i></div>
<div className="sg">
<Fld id="s6_19" label="Communication" c="#f2c200" ph="Excellent" />
<Fld id="s6_20" label="Teamwork" c="#f2c200" ph="Excellent" />
<Fld id="s6_21" label="Problem solving" c="#f2c200" ph="Advanced" />
<Fld id="s6_22" label="Time management" c="#f2c200" ph="Advanced" />
<Fld id="s6_23" label="Adaptability" c="#f2c200" ph="Advanced" />
</div>
<div className="sh" style={{ "--c": "#f2c200" } as CSSProperties}>Languages<i></i></div>
<div className="sg">
<Fld id="s6_24" label="Second language" c="#f2c200" ph="Bengali" />
<Fld id="s6_25" label="Proficiency level" c="#f2c200" ph="Native" />
<Fld id="s6_26" label="Third language" c="#f2c200" ph="Hindi" />
<Fld id="s6_27" label="Proficiency level" c="#f2c200" ph="Conversational" />
</div>
</div><div id="s7" style={{ scrollMarginTop: "210px", marginTop: "30px" }}><div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "0 0 20px" }}><div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#7ddc1f 38%,#579a15 100%)", boxShadow: "0 4px 0 #38630d,0 0 14px #7ddc1f", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg></div><div><div style={{ fontSize: "19px", fontWeight: "800", color: "#0b1024" }}>Cover Letter</div><div style={{ fontSize: "12px", color: "#6b7390", marginTop: "2px" }}>Step 8 of 9 · Introduce yourself to employers</div></div></div><div className="sh" style={{ "--c": "#7ddc1f" } as CSSProperties}>Recipient<i></i></div>
<div className="sg">
<Fld id="s7_0" label="Hiring manager name" c="#7ddc1f" ph="Mr. John Smith" />
<Fld id="s7_1" label="Company name" c="#7ddc1f" ph="Acme Inc." />
<Fld id="s7_2" label="Job title applying for" c="#7ddc1f" ph="Product Designer" />
</div>
<div className="sh" style={{ "--c": "#7ddc1f" } as CSSProperties}>Letter<i></i></div>
<div className="sg">
<Fld id="s7_3" label="Subject line" c="#7ddc1f" ph="Application for Product Designer" />
<Fld id="s7_4" label="Letter body" c="#7ddc1f" ph="Dear Mr. Smith, I am excited to apply for..." h={190} />
</div>
<div className="sh" style={{ "--c": "#7ddc1f" } as CSSProperties}>Tone<i></i></div>
<div className="sg">
<Fld id="s7_5" label="Writing tone" c="#7ddc1f" ph="Professional" />
<Fld id="s7_6" label="Length" c="#7ddc1f" ph="Medium" />
</div>
<div className="sh" style={{ "--c": "#7ddc1f" } as CSSProperties}>Opening<i></i></div>
<div className="sg">
<Fld id="s7_7" label="Greeting" c="#7ddc1f" ph="Dear Mr. Smith," />
<Fld id="s7_8" label="Opening hook" c="#7ddc1f" ph="I was thrilled to see your opening for..." h={90} />
</div>
<div className="sh" style={{ "--c": "#7ddc1f" } as CSSProperties}>Closing<i></i></div>
<div className="sg">
<Fld id="s7_9" label="Closing line" c="#7ddc1f" ph="Thank you for your time and consideration." />
<Fld id="s7_10" label="Signature name" c="#7ddc1f" ph="Jane Doe" />
<Fld id="s7_11" label="Contact line" c="#7ddc1f" ph="jane@email.com · +880 1700 000000" />
</div>
<div className="sh" style={{ "--c": "#7ddc1f" } as CSSProperties}>Sender details<i></i></div>
<div className="sg">
<Fld id="s7_12" label="Your full name" c="#7ddc1f" ph="Jane Doe" />
<Fld id="s7_13" label="Your address" c="#7ddc1f" ph="House 12, Road 5, Dhaka" />
<Fld id="s7_14" label="Your email" c="#7ddc1f" ph="jane@email.com" />
<Fld id="s7_15" label="Your phone" c="#7ddc1f" ph="+880 1700 000000" />
<Fld id="s7_16" label="Date" c="#7ddc1f" ph="23 Nov 2026" />
</div>
<div className="sh" style={{ "--c": "#7ddc1f" } as CSSProperties}>Recipient details<i></i></div>
<div className="sg">
<Fld id="s7_17" label="Company address" c="#7ddc1f" ph="Level 4, Tower A, Gulshan" />
<Fld id="s7_18" label="Hiring manager title" c="#7ddc1f" ph="Head of Design" />
<Fld id="s7_19" label="Job reference number" c="#7ddc1f" ph="REF-2026-118" />
<Fld id="s7_20" label="Where you found the role" c="#7ddc1f" ph="LinkedIn" />
</div>
<div className="sh" style={{ "--c": "#7ddc1f" } as CSSProperties}>Highlights<i></i></div>
<div className="sg">
<Fld id="s7_21" label="Key achievement 1" c="#7ddc1f" ph="Increased conversion by 32% through a checkout redesign..." h={90} />
<Fld id="s7_22" label="Key achievement 2" c="#7ddc1f" ph="Led a team of 5 to launch a design system..." h={90} />
<Fld id="s7_23" label="Why this company" c="#7ddc1f" ph="Mission and product culture" />
</div>
</div><div id="s8" style={{ scrollMarginTop: "210px", marginTop: "30px" }}><div style={{ display: "flex", alignItems: "center", gap: "14px", margin: "0 0 20px" }}><div style={{ flex: "none", width: "46px", height: "46px", borderRadius: "50%", background: "linear-gradient(180deg,#ffffffaa 0,#00d68f 38%,#009564 100%)", boxShadow: "0 4px 0 #006040,0 0 14px #00d68f", display: "flex", alignItems: "center", justifyContent: "center" }}><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="#0b1024" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></div><div><div style={{ fontSize: "19px", fontWeight: "800", color: "#0b1024" }}>CV Preview</div><div style={{ fontSize: "12px", color: "#6b7390", marginTop: "2px" }}>Step 9 of 9 · Review and download</div></div></div><div className="sh" style={{ "--c": "#00d68f" } as CSSProperties}>Preview<i></i></div>
<div className="sg">
<div style={{ height: "330px", borderRadius: "16px", background: "#f3f5fb", boxShadow: "inset 0 3px 8px rgba(11,16,36,.10),0 0 12px #00d68f", border: "1.5px solid #00d68f", display: "flex", alignItems: "center", justifyContent: "center" }}><div style={{ width: "230px", height: "290px", background: "#fff", borderRadius: "6px", boxShadow: "0 6px 0 #006040,0 12px 16px rgba(0,0,0,.2),0 0 16px #00d68f", padding: "22px", boxSizing: "border-box" }}><div style={{ height: "14px", width: "55%", borderRadius: "4px", background: "linear-gradient(90deg,#00d68f,#9b5cff)" }}></div><div style={{ height: "8px", width: "35%", borderRadius: "4px", background: "#c9cfe4", marginTop: "8px" }}></div><div style={{ height: "8px", borderRadius: "4px", background: "#dfe3f0", width: "90%", marginTop: "10px" }}></div><div style={{ height: "8px", borderRadius: "4px", background: "#dfe3f0", width: "75%", marginTop: "10px" }}></div><div style={{ height: "8px", borderRadius: "4px", background: "#dfe3f0", width: "85%", marginTop: "10px" }}></div><div style={{ height: "8px", borderRadius: "4px", background: "#dfe3f0", width: "60%", marginTop: "10px" }}></div><div style={{ height: "8px", borderRadius: "4px", background: "#dfe3f0", width: "80%", marginTop: "10px" }}></div><div style={{ height: "8px", borderRadius: "4px", background: "#dfe3f0", width: "70%", marginTop: "10px" }}></div><div style={{ height: "8px", borderRadius: "4px", background: "#dfe3f0", width: "88%", marginTop: "10px" }}></div><div style={{ height: "8px", borderRadius: "4px", background: "#dfe3f0", width: "55%", marginTop: "10px" }}></div></div></div>
</div>
<div className="sh" style={{ "--c": "#00d68f" } as CSSProperties}>Template<i></i></div>
<div className="sg">
<Fld id="s8_0" label="Template style" c="#00d68f" ph="Neon Modern" />
<Fld id="s8_1" label="Accent colour" c="#00d68f" ph="Electric blue" />
</div>
<div className="sh" style={{ "--c": "#00d68f" } as CSSProperties}>Download<i></i></div>
<div className="sg">
<Fld id="s8_2" label="File format" c="#00d68f" ph="PDF" />
<Fld id="s8_3" label="File name" c="#00d68f" ph="Jane_Doe_CV" />
</div>
<div className="sh" style={{ "--c": "#00d68f" } as CSSProperties}>Sections to include<i></i></div>
<div className="sg">
<Fld id="s8_4" label="Education" c="#00d68f" ph="Show" />
<Fld id="s8_5" label="Projects" c="#00d68f" ph="Show" />
<Fld id="s8_6" label="Certifications" c="#00d68f" ph="Show" />
<Fld id="s8_7" label="Cover letter" c="#00d68f" ph="Attach" />
</div>
<div className="sh" style={{ "--c": "#00d68f" } as CSSProperties}>Sharing<i></i></div>
<div className="sg">
<Fld id="s8_8" label="Public link" c="#00d68f" ph="https://cv.example.com/janedoe" />
<Fld id="s8_9" label="Password protection" c="#00d68f" ph="Off" />
</div>
<div className="sh" style={{ "--c": "#00d68f" } as CSSProperties}>Layout<i></i></div>
<div className="sg">
<Fld id="s8_10" label="Page size" c="#00d68f" ph="A4" />
<Fld id="s8_11" label="Margins" c="#00d68f" ph="Normal" />
<Fld id="s8_12" label="Font family" c="#00d68f" ph="Inter" />
<Fld id="s8_13" label="Font size" c="#00d68f" ph="11 pt" />
<Fld id="s8_14" label="Line spacing" c="#00d68f" ph="1.15" />
</div>
<div className="sh" style={{ "--c": "#00d68f" } as CSSProperties}>Style<i></i></div>
<div className="sg">
<Fld id="s8_15" label="Primary colour" c="#00d68f" ph="#22b8ff" />
<Fld id="s8_16" label="Heading style" c="#00d68f" ph="Bold, uppercase" />
<Fld id="s8_17" label="Photo" c="#00d68f" ph="Include, circular" />
<Fld id="s8_18" label="Icons" c="#00d68f" ph="Show" />
</div>
<div className="sh" style={{ "--c": "#00d68f" } as CSSProperties}>Content checks<i></i></div>
<div className="sg">
<Fld id="s8_19" label="Spelling check" c="#00d68f" ph="Passed" />
<Fld id="s8_20" label="Missing sections" c="#00d68f" ph="None" />
<Fld id="s8_21" label="ATS compatibility" c="#00d68f" ph="92% score" />
<Fld id="s8_22" label="Page count" c="#00d68f" ph="2 pages" />
<Fld id="s8_23" label="Last saved" c="#00d68f" ph="Today, 6:55 PM" />
</div>
</div>
<div style={{ display: "flex", justifyContent: "flex-end", gap: "18px", marginTop: "34px" }}>
<div className="fb" style={{ width: "140px", background: "#fff", border: "1.5px solid #4d7bff", boxShadow: "0 5px 0 #223772,0 0 12px #4d7bff" }}>Back</div>
<div className="fb" style={{ width: "240px", background: "linear-gradient(180deg,#ffffffaa 0,#00d68f 38%,#009564 100%)", boxShadow: "0 5px 0 #006040,0 10px 10px rgba(0,0,0,.25),0 0 16px #00d68f" }}>Submit CV</div>
</div>
</div>
</div>

    </NeonCtx.Provider>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
type UploadState = "idle" | "uploading" | "done" | "error";

export default function ProfileGeneratorPage() {
  const supabase = createClient();

  const [state, setState] = useState<UploadState>("idle");
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const [values, setValues] = useState<Record<string, string>>({});
  const [filled, setFilled] = useState<Record<string, boolean>>({});
  const [userEmail, setUserEmail] = useState("");
  const [userId, setUserId] = useState("");

  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  /* who is logged in (sent to n8n so it knows whose CV this is) */
  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserEmail(data.user?.email ?? "");
      setUserId(data.user?.id ?? "");
    });
    return () => abortRef.current?.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setValue = (id: string, v: string) => setValues((s) => ({ ...s, [id]: v }));

  /* ---------------- Upload ---------------- */
  const handleFile = async (f: File) => {
    setError("");

    // PDF only: check extension, MIME type and the real file header
    const nameOk = /\.pdf$/i.test(f.name);
    const typeOk = f.type === "application/pdf" || f.type === "";
    if (!nameOk || !typeOk || !(await looksLikePdf(f))) {
      setError("Only PDF files are accepted. Please upload your CV as a PDF.");
      setState("error");
      return;
    }
    if (f.size > MAX_FILE_MB * 1024 * 1024) {
      setError(`This file is too large. The maximum size is ${MAX_FILE_MB} MB.`);
      setState("error");
      return;
    }

    setFile(f);
    setState("uploading");

    const controller = new AbortController();
    abortRef.current?.abort();
    abortRef.current = controller;
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const fd = new FormData();
      fd.append("cv", f, f.name);
      fd.append("fileName", f.name);
      fd.append("uploadDate", new Date().toISOString());
      if (userEmail) fd.append("email", userEmail);
      if (userId) fd.append("user id", userId);

      // Don't set Content-Type yourself: the browser adds the multipart boundary
      const res = await fetch(UPLOAD_CV_WEBHOOK, { method: "POST", body: fd, signal: controller.signal });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);

      const text = await res.text();
      let payload: unknown = text;
      try {
        payload = JSON.parse(text);
      } catch {
        /* not JSON: mapToForm will try to handle the string */
      }

      const neon = mapToNeon(payload, userEmail);
      if (Object.keys(neon).length === 0) {
        throw new Error("The CV was uploaded, but no information came back. Please try again.");
      }

      setValues(neon);
      setFilled(Object.fromEntries(Object.keys(neon).map((id) => [id, true])));
      setState("done");
    } catch (err) {
      setState("error");
      if (err instanceof DOMException && err.name === "AbortError") {
        setError("The request took too long. Please try again.");
      } else {
        setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      }
    } finally {
      clearTimeout(timer);
    }
  };

  const onInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (f) handleFile(f);
  };
  const onDragOver = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };
  const onDragLeave = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  };
  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f && state !== "uploading") handleFile(f);
  };

  const startOver = () => {
    abortRef.current?.abort();
    setFile(null);
    setValues({});
    setFilled({});
    setError("");
    setState("idle");
  };

  const hiddenInput = (
    <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={onInputChange} />
  );

  /* ---------------- Single page: neon timeline form, CV upload is its first step ---------------- */
  return (
    <>
      {hiddenInput}
      <NeonTimelineForm
        upload={{
          uploading: state === "uploading",
          dragActive,
          error: state === "error" ? error : "",
          fileName: file?.name ?? "",
          filledCount: Object.keys(filled).length,
          onPick: () => inputRef.current?.click(),
          onDragOver,
          onDragLeave,
          onDrop,
        }}
        ctx={{ values, filled, setValue }}
      />
    </>
  );
}
