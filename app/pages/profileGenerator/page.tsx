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

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, DragEvent, ReactNode } from "react";
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

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [extracted, setExtracted] = useState<Partial<FormState>>({});
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

  const setField = (k: keyof FormState) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const isFilled = (k: keyof FormState) => !!extracted[k] && form[k] === extracted[k];

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

      const mapped = mapToForm(payload);
      if (Object.keys(mapped).length === 0) {
        throw new Error("The CV was uploaded, but no information came back. Please try again.");
      }

      const next = { ...EMPTY_FORM, ...mapped };
      if (!next.email && userEmail) next.email = userEmail; // fall back to the login email
      setExtracted(next);
      setForm(next);
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
    setForm(EMPTY_FORM);
    setExtracted({});
    setError("");
    setState("idle");
  };

  const resetToExtracted = () => setForm({ ...EMPTY_FORM, ...extracted });

  const hiddenInput = (
    <input ref={inputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={onInputChange} />
  );

  /* ---------------- Step 1: upload screen (full page) ---------------- */
  if (state !== "done") {
    const uploading = state === "uploading";
    return (
      <div className="flex min-h-[calc(100vh-8rem)] w-full flex-col">
        {hiddenInput}
        <Card className="flex flex-1 flex-col items-center justify-center px-6 py-12">
          <div className="w-full max-w-xl text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50 text-indigo-600">
              <svg className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth="1.7" viewBox="0 0 24 24" aria-hidden>
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m6.75 12-3-3m0 0-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z"
                />
              </svg>
            </div>
            <h2 className="text-xl font-semibold text-slate-900">Upload your CV</h2>
            <p className="mt-1.5 text-sm text-slate-500">
              We read your CV and fill in your personal information for you.
            </p>

            <div
              onDragOver={onDragOver}
              onDragEnter={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              className={`mt-7 flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed px-6 py-10 transition ${
                dragActive
                  ? "border-indigo-400 bg-indigo-50"
                  : state === "error"
                    ? "border-red-300 bg-red-50/40"
                    : "border-slate-300 bg-slate-50/60"
              }`}
            >
              {uploading ? (
                <>
                  <Spinner />
                  <p className="text-sm font-medium text-slate-700">Reading your CV...</p>
                  {file && (
                    <p className="max-w-full truncate text-xs text-slate-500">
                      {file.name} · {formatSize(file.size)}
                    </p>
                  )}
                  <p className="text-xs text-slate-400">This can take a few seconds.</p>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => inputRef.current?.click()}
                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-700"
                  >
                    Upload your CV
                  </button>
                  <p className="text-sm text-slate-500">or drag and drop your PDF here</p>
                  <p className="text-xs text-slate-400">PDF only, up to {MAX_FILE_MB} MB</p>
                </>
              )}
            </div>

            {state === "error" && error && (
              <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-600" role="alert">
                {error}
              </p>
            )}
          </div>
        </Card>
      </div>
    );
  }

  /* ---------------- Step 2: personal information form ---------------- */
  return (
    <div className="flex min-h-[calc(100vh-8rem)] w-full flex-col">
      {hiddenInput}
      <Card className="flex flex-1 flex-col p-5 sm:p-6">
        {/* uploaded file bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <svg className="h-5 w-5 shrink-0 text-emerald-600" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-slate-800">{file?.name}</p>
              <p className="text-xs text-emerald-700">
                CV uploaded successfully{file ? ` · ${formatSize(file.size)}` : ""}
              </p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Replace CV
            </button>
            <button
              type="button"
              onClick={startOver}
              className="rounded-md px-3.5 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
            >
              Remove
            </button>
          </div>
        </div>

        {/* form */}
        <div className="mt-6 flex items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-slate-900">Personal Information</h2>
          <button
            type="button"
            onClick={resetToExtracted}
            className="text-xs font-medium text-slate-500 hover:text-indigo-600"
          >
            Reset to CV data
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          These details came from your CV. Check them and change anything that is wrong.
        </p>

        <div className="mt-5 grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input label="Full Name" value={form.fullName} onChange={setField("fullName")} filled={isFilled("fullName")} placeholder="Your full name" />
          <Input label="Email" type="email" value={form.email} onChange={setField("email")} filled={isFilled("email")} placeholder="you@example.com" />
          <Input label="Phone Number" value={form.phone} onChange={setField("phone")} filled={isFilled("phone")} placeholder="+00 000 000 000" />
          <Input label="Location" value={form.location} onChange={setField("location")} filled={isFilled("location")} placeholder="City, Country" />
          <Input label="LinkedIn" value={form.linkedin} onChange={setField("linkedin")} filled={isFilled("linkedin")} placeholder="linkedin.com/in/..." />
          <Input label="Portfolio / Website" value={form.portfolio} onChange={setField("portfolio")} filled={isFilled("portfolio")} placeholder="https://" />
          <Input label="Job Title" value={form.jobTitle} onChange={setField("jobTitle")} filled={isFilled("jobTitle")} placeholder="e.g. Software Engineer" />
          <Input label="Experience Level" value={form.experienceLevel} onChange={setField("experienceLevel")} filled={isFilled("experienceLevel")} placeholder="e.g. Mid" />
          <Input label="CV Language" value={form.cvLanguage} onChange={setField("cvLanguage")} filled={isFilled("cvLanguage")} placeholder="e.g. English" />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 lg:grid-cols-2">
          <div className="lg:col-span-2">
            <TextArea label="Summary" value={form.summary} onChange={setField("summary")} filled={isFilled("summary")} rows={3} placeholder="Short professional summary" />
          </div>
          <TextArea label="Skills" value={form.skills} onChange={setField("skills")} filled={isFilled("skills")} placeholder="One per line or comma separated" />
          <TextArea label="Education" value={form.education} onChange={setField("education")} filled={isFilled("education")} placeholder="Degree, University" />
          <TextArea label="Work Experience" value={form.experience} onChange={setField("experience")} filled={isFilled("experience")} placeholder="Company, role, dates" />
          <TextArea label="Certifications" value={form.certifications} onChange={setField("certifications")} filled={isFilled("certifications")} placeholder="Certification name" />
          <div className="lg:col-span-2">
            <TextArea label="Languages" value={form.languages} onChange={setField("languages")} filled={isFilled("languages")} rows={2} placeholder="Language, proficiency" />
          </div>
        </div>

        {state === "done" && error && (
          <p className="mt-4 text-sm font-medium text-red-600" role="alert">
            {error}
          </p>
        )}
      </Card>
    </div>
  );
}