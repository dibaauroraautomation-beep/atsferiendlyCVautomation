"use client";

/*
  Profile & CV page  (/pages/profile)
  Title + description come from pageConfig.ts (shared layout).

  Data is still local state (placeholders). Swap PLACEHOLDER_* for real
  data later - the UI already supports editing everything.
*/

import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, ReactNode } from "react";
import { useT } from "@/app/contexts/LanguageContext";
import { buildCvPdf, photoToCircleDataUrl } from "@/lib/cvPdf";
import { countText } from "@/lib/textCount";

/* ------------------------------------------------------------------ */
/* Placeholder data (replace later)                                    */
/* ------------------------------------------------------------------ */
type PersonalItem = { label: string; value: string };

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
  personal: [
    { label: "Name", value: "Your Name" },
    { label: "Contact number", value: "+00 000 000 000" },
    { label: "Contact language", value: "English" },
    { label: "Preferred CV language", value: "English" },
    { label: "Experience level", value: "Mid" },
  ] as PersonalItem[],
  education: ["Degree, University", "Degree, University", "Degree, University"],
  experience: ["Company A", "Company B", "Company C"],
  skills: ["Skill one", "Skill two", "Skill three", "Skill four"],
  projects: ["Project one", "Project two", "Project three"],
  certifications: ["Certification one", "Certification two"],
  languages: ["Language, proficiency", "Language, proficiency"],
};

type Profile = typeof PLACEHOLDER_PROFILE;
type CvData = typeof PLACEHOLDER_CV;

/* Rows of the n8n table "Candidate cvinfo(ats cv)" -> page state */
type CvRow = Record<string, unknown>;
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");
const lines = (v: unknown, sep: RegExp) =>
  str(v)
    .split(sep)
    .map((x) => x.trim())
    .filter(Boolean);

function rowToProfile(row: CvRow, prev: Profile, email: string): Profile {
  return {
    ...prev,
    fullName: str(row.name) || prev.fullName,
    email: str(row.email) || email || prev.email,
    cvLanguage: str(row.cvLanguage) || prev.cvLanguage,
    location: str(row.location) || prev.location,
    targetJobs: str(row.targetjob) || prev.targetJobs,
    experienceLevel: str(row.experiencelevel) || prev.experienceLevel,
    cvFileName: str(row.cvfilename) || prev.cvFileName,
    uploadDate: str(row.uploaddate) || prev.uploadDate,
  };
}

function rowToCv(row: CvRow, prev: CvData): CvData {
  let personal = prev.personal;
  try {
    const parsed = JSON.parse(str(row.personalinfo) || "[]");
    if (Array.isArray(parsed) && parsed.length > 0) {
      personal = parsed
        .filter((x) => x && typeof x === "object")
        .map((x) => ({ label: str((x as PersonalItem).label), value: str((x as PersonalItem).value) }));
    }
  } catch {
    /* keep the current personal info */
  }
  const pick = (v: unknown, sep: RegExp, fallback: string[]) => {
    const a = lines(v, sep);
    return a.length > 0 ? a : fallback;
  };
  return {
    personal,
    education: pick(row.education, /\n/, prev.education),
    experience: pick(row.experience, /\n/, prev.experience),
    skills: pick(row.skill, /[\n,]/, prev.skills),
    projects: pick(row.project, /\n/, prev.projects),
    certifications: pick(row.certificate, /\n/, prev.certifications),
    languages: pick(row.language, /\n/, prev.languages),
  };
}

type CvFile = {
  url: string;
  name: string;
  type: string;
  size: number;
  text?: string;
};

const PAGE_SIZES = {
  A4: { w: 210, h: 297 },
  A5: { w: 148, h: 210 },
  Letter: { w: 216, h: 279 },
  Legal: { w: 216, h: 356 },
  B5: { w: 176, h: 250 },
  Executive: { w: 184, h: 267 },
} as const;
type PageSize = keyof typeof PAGE_SIZES;

const CV_LANGUAGES = ["English", "Deutsch"];
const LEVELS = ["Junior", "Mid", "Senior", "Lead"];

const UPLOAD_CV_WEBHOOK = "https://n8naurora.duckdns.org/webhook/info-extract-upload-cv";
/* ------------------------------------------------------------------ */
/* Icons                                                               */
/* ------------------------------------------------------------------ */
const iconProps = {
  className: "h-4 w-4",
  viewBox: "0 0 20 20",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

const MaximizeIcon = () => (
  <svg {...iconProps}>
    <path d="M12 3h5v5M8 17H3v-5M17 3l-5.5 5.5M3 17l5.5-5.5" />
  </svg>
);
const RestoreIcon = () => (
  <svg {...iconProps}>
    <path d="M16 8h-4V4M4 12h4v4M12 8l5-5M8 12l-5 5" />
  </svg>
);

function IconButton({
  onClick,
  label,
  children,
}: {
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-300 bg-white text-slate-600 hover:bg-slate-50 hover:text-indigo-600"
    >
      {children}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/* Small UI pieces                                                     */
/* ------------------------------------------------------------------ */
const inputCls =
  "w-full rounded-md border border-slate-300 bg-white px-2 py-1 text-sm text-slate-800 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500";

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

function EditField({
  label,
  value,
  onChange,
  options,
  type = "text",
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options?: string[];
  type?: string;
}) {
  return (
    <label className="block min-w-0">
      <span className="text-xs text-slate-500">{label}</span>
      {options ? (
        <select className={`${inputCls} mt-0.5`} value={value} onChange={(e) => onChange(e.target.value)}>
          {(options.includes(value) ? options : [value, ...options]).map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          className={`${inputCls} mt-0.5`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </label>
  );
}

type Variant = "plain" | "bullet" | "chips";

/* A CV card. Click Edit -> every item becomes an input (add / remove / change). */
function Section({
  title,
  items,
  onChange,
  variant = "plain",
  onDone,
}: {
  title: string;
  items: string[];
  onChange: (items: string[]) => void;
  variant?: Variant;
  onDone?: (items: string[]) => void; // called when the user presses Done (e.g. to send the CV)
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);

  const update = (i: number, v: string) => onChange(items.map((x, idx) => (idx === i ? v : x)));
  const remove = (i: number) => onChange(items.filter((_, idx) => idx !== i));
  const add = () => onChange([...items, ""]);

  const finish = () => {
    // drop empty rows when leaving edit mode
    const cleaned = items.map((x) => x.trim()).filter(Boolean);
    onChange(cleaned);
    setEditing(false);
    onDone?.(cleaned);
  };

  return (
    <div className={`rounded-lg border bg-white p-3 ${editing ? "border-indigo-300 ring-1 ring-indigo-100" : "border-slate-200"}`}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <button
          type="button"
          onClick={() => (editing ? finish() : setEditing(true))}
          className={`text-xs font-medium ${editing ? "text-indigo-600" : "text-slate-500 hover:text-indigo-600"}`}
        >
          {editing ? t("Done") : t("Edit")}
        </button>
      </div>

      {editing ? (
        <div className="space-y-1.5">
          {items.map((x, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <input
                className={inputCls}
                value={x}
                onChange={(e) => update(i, e.target.value)}
                aria-label={`${title} ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => remove(i)}
                title={t("Remove")}
                aria-label={t("Remove")}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={add}
            className="mt-1 text-xs font-medium text-indigo-600 hover:text-indigo-700"
          >
            + {t("Add")}
          </button>
        </div>
      ) : variant === "chips" ? (
        <div className="flex flex-wrap gap-1.5">
          {items.map((s, i) => (
            <span key={i} className="rounded-md bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700">
              {s}
            </span>
          ))}
        </div>
      ) : (
        <ul className="space-y-1 text-[13px] text-slate-600">
          {items.map((x, i) => (
            <li key={i} className={variant === "bullet" ? "flex gap-2" : "truncate"}>
              {variant === "bullet" && <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-slate-500" />}
              <span className="truncate">{x}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* Personal Information card: a small form - label + value, edit = inputs.
   The input placeholder is the card's current value. */
function PersonalSection({
  title,
  items,
  onChange,
  onDone,
}: {
  title: string;
  items: PersonalItem[];
  onChange: (items: PersonalItem[]) => void;
  onDone?: (items: PersonalItem[]) => void;
}) {
  const t = useT();
  const [editing, setEditing] = useState(false);
  const [original, setOriginal] = useState<PersonalItem[]>(items);

  const start = () => {
    setOriginal(items);
    setEditing(true);
  };
  const setValue = (i: number, v: string) =>
    onChange(items.map((x, idx) => (idx === i ? { ...x, value: v } : x)));

  return (
    <div className={`rounded-lg border bg-white p-3 ${editing ? "border-indigo-300 ring-1 ring-indigo-100" : "border-slate-200"}`}>
      <div className="mb-2 flex items-center justify-between">
        <h4 className="text-sm font-semibold text-slate-800">{title}</h4>
        <button
          type="button"
          onClick={() => {
            if (editing) {
              setEditing(false);
              onDone?.(items);
            } else start();
          }}
          className={`text-xs font-medium ${editing ? "text-indigo-600" : "text-slate-500 hover:text-indigo-600"}`}
        >
          {editing ? t("Done") : t("Edit")}
        </button>
      </div>

      {editing ? (
        <div className="space-y-2">
          {items.map((it, i) => (
            <label key={it.label} className="block">
              <span className="text-xs text-slate-500">{t(it.label)}</span>
              <input
                className={`${inputCls} mt-0.5`}
                value={it.value}
                placeholder={original[i]?.value || t(it.label)}
                onChange={(e) => setValue(i, e.target.value)}
              />
            </label>
          ))}
        </div>
      ) : (
        <dl className="space-y-1.5">
          {items.map((it) => (
            <div key={it.label} className="min-w-0">
              <dt className="text-xs text-slate-500">{t(it.label)}</dt>
              <dd className="truncate text-[13px] font-medium text-slate-700">{it.value || "-"}</dd>
            </div>
          ))}
        </dl>
      )}
    </div>
  );
}

/* Dark-sidebar CV rendered from the CURRENT profile + extracted info (updates live). */
function CvRendered({
  profile,
  cv,
  photo,
  large,
  pageSize,
}: {
  profile: Profile;
  cv: CvData;
  photo: string | null;
  large: boolean;
  pageSize: PageSize;
}) {
  const t = useT();
  const name = cv.personal.find((x) => x.label === "Name")?.value || profile.fullName;
  const phone = cv.personal.find((x) => x.label === "Contact number")?.value;
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  const summary = `${name} is a ${profile.experienceLevel.toLowerCase()}-level candidate targeting ${profile.targetJobs}${profile.location ? `, based in ${profile.location}` : ""
    }.${cv.skills.length ? ` Listed strengths: ${cv.skills.join(", ")}.` : ""}`;

  /* sizes: tiny in the side card, normal when maximized */
  const sz = large
    ? { pad: "p-6", avatar: "h-20 w-20 text-xl", name: "text-xl", job: "text-xs", body: "text-xs leading-relaxed", head: "text-[11px]", gap: "mt-6", main: "p-8", chip: "px-3 py-1 text-xs", icon: "h-3.5 w-3.5", mainTitle: "text-sm" }
    : { pad: "p-2", avatar: "h-9 w-9 text-[9px]", name: "text-[9px] leading-[11px]", job: "text-[6px]", body: "text-[6px] leading-[8px]", head: "text-[5px]", gap: "mt-2", main: "p-2", chip: "px-1 py-[1px] text-[5px]", icon: "h-1.5 w-1.5", mainTitle: "text-[7px]" };

  const svg = (d: string) => (
    <svg className={`${sz.icon} shrink-0`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d} />
    </svg>
  );
  const contact = (icon: string, text: string) => (
    <li className="flex items-center gap-1.5 break-all">
      {svg(icon)}
      <span className="font-semibold text-white">{text || t("Not on file")}</span>
    </li>
  );
  const sideHead = (title: string) => (
    <h3 className={`${sz.gap} mb-1 font-bold uppercase tracking-widest text-zinc-400 ${sz.head}`}>{title}</h3>
  );
  const mainHead = (title: string) => (
    <h3 className={`${sz.gap} mb-1 font-bold uppercase tracking-widest text-amber-500 ${sz.head}`}>{title}</h3>
  );

  return (
    <div
      className="grid grid-cols-[36%_minmax(0,1fr)] overflow-clip rounded-xl border border-slate-200 bg-white shadow-sm"
      style={{ aspectRatio: `${PAGE_SIZES[pageSize].w} / ${PAGE_SIZES[pageSize].h}` }}
    >
      {/* ---- dark sidebar ---- */}
      <div className={`bg-zinc-900 text-zinc-300 ${sz.pad} ${sz.body}`}>
        <div className={`flex items-center justify-center overflow-hidden rounded-full bg-amber-500 font-bold text-zinc-900 ${sz.avatar}`}>
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-full w-full object-cover" />
          ) : (
            initials
          )}
        </div>
        <h2 className={`mt-2 font-extrabold uppercase text-white ${sz.name}`}>{name}</h2>
        <p className={`font-semibold text-amber-500 ${sz.job}`}>{profile.targetJobs}</p>

        <ul className={`${sz.gap} space-y-1`}>
          {contact("M4 4h16v16H4zM4 6l8 7 8-7", profile.email)}
          {contact("M22 16.9v3a2 2 0 01-2.2 2 19.8 19.8 0 01-8.6-3.1 19.5 19.5 0 01-6-6A19.8 19.8 0 012.1 4.2 2 2 0 014.1 2h3a2 2 0 012 1.7c.1 1 .4 1.9.7 2.8a2 2 0 01-.5 2.1L8.1 9.9a16 16 0 006 6l1.3-1.3a2 2 0 012.1-.4c.9.3 1.8.6 2.8.7a2 2 0 011.7 2z", phone ?? "")}
          {contact("M12 21s-7-6.2-7-11a7 7 0 0114 0c0 4.8-7 11-7 11zM12 12a2 2 0 100-4 2 2 0 000 4z", profile.location)}
        </ul>

        {sideHead(t("Skills"))}
        <div className="flex flex-wrap gap-1">
          {cv.skills.map((k, i) => (
            <span key={i} className={`rounded-full border border-zinc-500 text-zinc-200 ${sz.chip}`}>
              {k}
            </span>
          ))}
        </div>

        {sideHead(t("Education"))}
        <ul className="space-y-1 font-bold text-white">
          {cv.education.map((x, i) => (
            <li key={i} className="break-words">
              {x}
            </li>
          ))}
        </ul>

        {sideHead(t("Certifications"))}
        {cv.certifications.length ? (
          <ul className="space-y-1 font-semibold text-white">
            {cv.certifications.map((x, i) => (
              <li key={i} className="break-words">
                {x}
              </li>
            ))}
          </ul>
        ) : (
          <p className="font-semibold text-white">{t("Not on file")}</p>
        )}
      </div>

      {/* ---- white main column ---- */}
      <div className={`${sz.main} text-slate-600 ${sz.body}`}>
        {mainHead(t("Profile"))}
        <p>{summary}</p>

        {mainHead(t("Experience"))}
        <ul className="space-y-1.5">
          {cv.experience.map((x, i) => (
            <li key={i} className={`font-semibold text-slate-800 ${sz.mainTitle}`}>
              {x}
            </li>
          ))}
        </ul>

        {cv.projects.length > 0 && (
          <>
            {mainHead(t("Projects"))}
            <ul className="space-y-0.5">
              {cv.projects.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </>
        )}

        {cv.languages.length > 0 && (
          <>
            {mainHead(t("Languages"))}
            <ul className="space-y-0.5">
              {cv.languages.map((x, i) => (
                <li key={i}>{x}</li>
              ))}
            </ul>
          </>
        )}
      </div>
    </div>
  );
}

/* The real preview of the uploaded file (pdf / image / text / other). */
function CvFileView({ file, heightCls }: { file: CvFile; heightCls: string }) {
  const t = useT();
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const isImage = file.type.startsWith("image/");

  if (isPdf) {
    return <iframe src={file.url} title={file.name} className={`w-full rounded-md border border-slate-200 ${heightCls}`} />;
  }
  if (isImage) {
    return (
      <div className={`overflow-auto rounded-md border border-slate-200 bg-slate-50 ${heightCls}`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={file.url} alt={file.name} className="mx-auto h-auto max-w-full" />
      </div>
    );
  }
  if (file.text !== undefined) {
    return (
      <pre className={`overflow-auto whitespace-pre-wrap rounded-md border border-slate-200 bg-white p-3 text-xs text-slate-700 ${heightCls}`}>
        {file.text}
      </pre>
    );
  }
  return (
    <div className={`flex flex-col items-center justify-center gap-1 rounded-md border border-dashed border-slate-300 bg-slate-50 p-4 text-center ${heightCls}`}>
      <p className="max-w-full truncate text-sm font-semibold text-slate-700">{file.name}</p>
      <p className="text-xs text-slate-500">{(file.size / 1024).toFixed(1)} KB</p>
      <p className="mt-1 text-xs text-slate-500">{t("Preview is not available for this file type.")}</p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function ProfilePage() {
  const t = useT();

  const [profile, setProfile] = useState<Profile>(PLACEHOLDER_PROFILE);
  const [draft, setDraft] = useState<Profile>(PLACEHOLDER_PROFILE);
  const [editingProfile, setEditingProfile] = useState(false);

  const [cv, setCv] = useState<CvData>(PLACEHOLDER_CV);
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent" | "nochange" | "error">("idle");
  const [sendMsg, setSendMsg] = useState("");
  const [fetchState, setFetchState] = useState<"idle" | "loading" | "loaded" | "empty" | "error">("idle");
  const [fetchMsg, setFetchMsg] = useState("");

  /* Cover letter (column "cover_letter"): written by the AI agent in n8n when empty, editable here */
  const [coverLetter, setCoverLetter] = useState("");
  const [coverDraft, setCoverDraft] = useState("");
  const [coverEditing, setCoverEditing] = useState(false);
  const [coverMax, setCoverMax] = useState(false); // card enlarged to a big window
  const [coverState, setCoverState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [coverMsg, setCoverMsg] = useState("");
  /* What n8n already has: nothing is sent when the data is unchanged. */
  const baselineRef = useRef<string | null>(null);
  const snap = (p: Profile, c: CvData, letter: string) => JSON.stringify([p, c, letter, pageSize, photo]);
  const saveCover = async (text: string) => {
    if (text === coverLetter) {
      setCoverEditing(false);
      setCoverState("idle");
      return;
    }
    setCoverState("saving");
    setCoverMsg("");
    const ok = await sendCv(profile, cv, text);
    if (ok) {
      setCoverLetter(text);
      setCoverEditing(false);
      setCoverState("saved");
    } else {
      setCoverMsg(t("Please try again"));
      setCoverState("error");
    }
  };
  const [uploadState, setUploadState] = useState<"idle" | "uploading" | "done" | "error">("idle");
  const [uploadMsg, setUploadMsg] = useState("");

  /* Load the saved row (matched by the logged-in email) from the n8n table. */
  const fetchSaved = async () => {
    setFetchState("loading");
    setFetchMsg("");
    try {
      const res = await fetch("/api/profile-cv/fetch", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const email: string = data.email || "";
      if (!data.row) {
        if (email) {
          setProfile((p) => ({ ...p, email }));
        }
        setFetchState("empty");
        return;
      }
      const row = data.row as CvRow;
      setProfile((p) => rowToProfile(row, p, email));
      setCv((c) => rowToCv(row, c));
      setCoverLetter(str(row.cover_letter));
      setFetchState("loaded");
    } catch (err) {
      setFetchMsg(err instanceof Error ? err.message : "Something went wrong");
      setFetchState("error");
    }
  };
  // remember the loaded data as "already saved in n8n"
  useEffect(() => {
    if (fetchState === "loaded") baselineRef.current = snap(profile, cv, coverLetter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchState]);
  // when the page opens
  useEffect(() => {
    fetchSaved();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [cvFile, setCvFile] = useState<CvFile | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const [photo, setPhoto] = useState<string | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const photoUrlRef = useRef<string | null>(null);
  const onPhoto = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f || !f.type.startsWith("image/")) return;
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    const url = URL.createObjectURL(f);
    photoUrlRef.current = url;
    setPhoto(url);
  };
  const removePhoto = () => {
    if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    photoUrlRef.current = null;
    setPhoto(null);
  };

  const [previewTab, setPreviewTab] = useState<"file" | "info">("file"); // when a CV file is uploaded
  const [pageSize, setPageSize] = useState<PageSize>("A4");
  const [previewMax, setPreviewMax] = useState(false); // preview takes the whole page (left cards hidden)

  // free the blob URL when the file is replaced / page closes
  const urlRef = useRef<string | null>(null);
  useEffect(() => {
    return () => {
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      if (photoUrlRef.current) URL.revokeObjectURL(photoUrlRef.current);
    };
  }, []);

  /* ---- profile editing ---- */
  const startEdit = () => {
    setDraft(profile);
    setEditingProfile(true);
  };
  const saveEdit = () => {
    setProfile(draft);
    setEditingProfile(false);
    sendCv(draft, cv); // Save also sends the complete CV
  };
  const cancelEdit = () => setEditingProfile(false);
  const setD = (k: keyof Profile) => (v: string) => setDraft((d) => ({ ...d, [k]: v }));

  /* ---- CV upload / replace ---- */
  const pickFile = () => fileInput.current?.click();

  // const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
  //   const f = e.target.files?.[0];
  //   e.target.value = ""; // allow picking the same file again
  //   if (!f) return;

  //   if (urlRef.current) URL.revokeObjectURL(urlRef.current);
  //   const url = URL.createObjectURL(f);
  //   urlRef.current = url;

  //   let text: string | undefined;
  //   if (f.type.startsWith("text/") || /\.(txt|md)$/i.test(f.name)) {
  //     text = await f.text();
  //   }
  /* Send the uploaded CV file to the n8n webhook */
  const uploadCvToN8n = async (f: File) => {
    setUploadState("uploading");
    setUploadMsg("");
    try {
      const fd = new FormData();
      fd.append("cv", f, f.name);              // the file itself
      fd.append("email", profile.email);       // tells n8n whose CV this is
      fd.append("fileName", f.name);
      fd.append("uploadDate", new Date().toISOString());

      // Don't set Content-Type yourself: the browser adds the correct multipart header
      const res = await fetch(UPLOAD_CV_WEBHOOK, { method: "POST", body: fd });
      if (!res.ok) throw new Error(`Upload failed (${res.status})`);

      setUploadState("done");
      setProfile((p) => ({ ...p, status: "Uploaded successfully" }));
    } catch (err) {
      setUploadMsg(err instanceof Error ? err.message : "Something went wrong");
      setUploadState("error");
    }
  };

  const onFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = ""; // allow picking the same file again
    if (!f) return;

    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    const url = URL.createObjectURL(f);
    urlRef.current = url;

    let text: string | undefined;
    if (f.type.startsWith("text/") || /\.(txt|md)$/i.test(f.name)) {
      text = await f.text();
    }

    setCvFile({ url, name: f.name, type: f.type, size: f.size, text });
    setPreviewTab("file");
    setProfile((p) => ({
      ...p,
      cvFileName: f.name,
      uploadDate: new Date().toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }),
    }));

    // send the file to n8n
    await uploadCvToN8n(f);
  };

  /* ---- CV cards ---- */
  const setSection = (k: Exclude<keyof CvData, "personal">) => (items: string[]) => {
    setCv((c) => ({ ...c, [k]: items }));
    setSendState("idle");
  };
  /* Build the full PDF from the given data and send it (with the user's email) to n8n. */
  const sendCv = async (p: Profile, c: CvData, coverOverride?: string): Promise<boolean> => {
    const letterNow = coverOverride ?? coverLetter;
    if (baselineRef.current !== null && baselineRef.current === snap(p, c, letterNow)) {
      setSendState("nochange");
      return true;
    }
    setSendState("sending");
    setSendMsg("");
    try {
      const photoDataUrl = photo ? await photoToCircleDataUrl(photo) : null;
      const blob = buildCvPdf({ profile: p, cv: c, photoDataUrl, page: PAGE_SIZES[pageSize] });
      const cvName = c.personal.find((x) => x.label === "Name")?.value || p.fullName;
      const safeName = (cvName || "CV").trim().replace(/[^\w-]+/g, "_");

      const fd = new FormData();
      fd.append("cv", blob, `${safeName}_CV.pdf`);
      fd.append("name", cvName);
      fd.append("email", p.email);
      fd.append("location", p.location);
      fd.append("targetJobs", p.targetJobs);
      fd.append("experienceLevel", p.experienceLevel);
      fd.append("cvLanguage", p.cvLanguage);
      // flat fields named exactly like the n8n table columns ("Candidate cvinfo(ats cv)")
      const join = (a: string[], sep: string) => a.join(sep);
      fd.append("targetjob", p.targetJobs);
      fd.append("experiencelevel", p.experienceLevel);
      fd.append("cvfilename", p.cvFileName);
      fd.append("uploaddate", p.uploadDate);
      fd.append("personalinfo", JSON.stringify(c.personal));
      fd.append("education", join(c.education, "\n"));
      fd.append("skill", join(c.skills, ", "));
      fd.append("experience", join(c.experience, "\n"));
      fd.append("certificate", join(c.certifications, "\n"));
      fd.append("project", join(c.projects, "\n"));
      fd.append("language", join(c.languages, "\n"));
      fd.append("profile", JSON.stringify({ ...p, fullName: cvName }));
      fd.append("cvInfo", JSON.stringify(c));
      fd.append("pageSize", pageSize);
      // saved/edited cover letter (only sent when there is one, so an empty value never blanks the cell)
      const letter = coverOverride ?? coverLetter;
      if (letter) fd.append("cover_letter", letter);

      const res = await fetch("/api/profile-cv", { method: "POST", body: fd });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      baselineRef.current = snap(p, c, letterNow);
      setSendState("sent");
      return true;
    } catch (err) {
      setSendMsg(err instanceof Error ? err.message : "Something went wrong");
      setSendState("error");
      return false;
    }
  };
  const updateInfo = () => sendCv(profile, cv);
  // a CV card's "Done" button: save that card, then send the complete CV
  const doneSection = (k: Exclude<keyof CvData, "personal">) => (items: string[]) => sendCv(profile, { ...cv, [k]: items });

  /* ---- layout ---- */
  const gridCls = previewMax ? "grid-cols-1" : "lg:grid-cols-[minmax(0,1fr)_240px]";
  const previewHeight = previewMax ? "h-[82vh]" : "h-[420px]";

  const collapseBtn = (
    <IconButton onClick={() => setPreviewMax(true)} label={t("Minimize panels")}>
      <RestoreIcon />
    </IconButton>
  );

  return (
    <div className={`grid grid-cols-1 items-start gap-5 ${gridCls}`}>
      <input
        ref={fileInput}
        type="file"
        accept=".pdf,.doc,.docx,.txt,.md,image/*"
        className="hidden"
        onChange={onFile}
      />
      <input ref={photoInput} type="file" accept="image/*" className="hidden" onChange={onPhoto} />

      {/* ================= LEFT ================= */}
      {!previewMax && (
        <div className="space-y-5">
          {/* ----- Profile Information ----- */}
          <Card className="p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-semibold text-slate-900">{t("Profile Information")}</h2>
              <div className="flex items-center gap-2">
                {collapseBtn}
                {(editingProfile ? (
                  <>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      className="rounded-md border border-slate-300 bg-white px-4 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {t("Cancel")}
                    </button>
                    <button
                      type="button"
                      onClick={saveEdit}
                      className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                    >
                      {t("Save")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={startEdit}
                    className="rounded-md bg-indigo-600 px-4 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700"
                  >
                    {t("Edit Profile")}
                  </button>
                ))}
              </div>
            </div>

            <div className="mt-4 flex items-center gap-4">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border border-slate-200 bg-slate-100 text-slate-400">
                {photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo} alt={t("Profile photo")} className="h-full w-full object-cover" />
                ) : (
                  <svg className="h-9 w-9" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
                    <path d="M12 12a4.5 4.5 0 100-9 4.5 4.5 0 000 9zm0 2c-4.4 0-8 2.2-8 5v1h16v-1c0-2.8-3.6-5-8-5z" />
                  </svg>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => photoInput.current?.click()}
                  className="rounded-md border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  {photo ? t("Change photo") : t("Upload photo")}
                </button>
                {photo && (
                  <button
                    type="button"
                    onClick={removePhoto}
                    className="rounded-md px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50"
                  >
                    {t("Remove")}
                  </button>
                )}
              </div>
            </div>

            {(
              <>
                <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  {editingProfile ? (
                    <>
                      <EditField label={t("Full Name")} value={draft.fullName} onChange={setD("fullName")} />
                      <EditField label={t("Email")} type="email" value={draft.email} onChange={setD("email")} />
                      <EditField
                        label={t("Preferred CV Language")}
                        value={draft.cvLanguage}
                        onChange={setD("cvLanguage")}
                        options={CV_LANGUAGES}
                      />
                      <EditField label={t("Location")} value={draft.location} onChange={setD("location")} />
                      <div className="col-span-2 sm:col-span-3">
                        <EditField label={t("Target Job Titles")} value={draft.targetJobs} onChange={setD("targetJobs")} />
                      </div>
                      <EditField
                        label={t("Experience Level")}
                        value={draft.experienceLevel}
                        onChange={setD("experienceLevel")}
                        options={LEVELS}
                      />
                    </>
                  ) : (
                    <>
                      <Field label={t("Full Name")} value={profile.fullName} />
                      <Field label={t("Email")} value={profile.email} />
                      <Field label={t("Preferred CV Language")} value={profile.cvLanguage} />
                      <Field label={t("Location")} value={profile.location} />
                      <div className="col-span-2 sm:col-span-3">
                        <Field label={t("Target Job Titles")} value={profile.targetJobs} />
                      </div>
                      <Field label={t("Experience Level")} value={profile.experienceLevel} />
                    </>
                  )}
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-3">
                  <div className="flex flex-wrap gap-x-16 gap-y-3">
                    <Field label={t("CV filename")} value={profile.cvFileName} />
                    <Field label={t("Upload date")} value={profile.uploadDate} />
                    <div>
                      <p className="text-xs text-slate-500">{t("Status")}</p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-sm font-medium text-emerald-600">
                        <svg className="h-4 w-4 text-emerald-500" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
                          <path
                            fillRule="evenodd"
                            d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.7-9.3a1 1 0 00-1.4-1.4L9 10.6 7.7 9.3a1 1 0 00-1.4 1.4l2 2a1 1 0 001.4 0l4-4z"
                            clipRule="evenodd"
                          />
                        </svg>
                        {t(profile.status)}
                      </p>
                    </div>
                  </div>
                  {/* <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={pickFile}
                      className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                    >
                      {t("Upload CV")}
                    </button>
                  </div> */}
                  <div className="flex flex-col items-end gap-1">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => cvFile && window.open(cvFile.url, "_blank")}
                        disabled={!cvFile}
                        className="rounded-md border border-slate-300 bg-white px-3.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {t("View CV")}
                      </button>
                      <button
                        type="button"
                        onClick={pickFile}
                        disabled={uploadState === "uploading"}
                        className="rounded-md bg-indigo-600 px-3.5 py-1.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {uploadState === "uploading" ? t("Uploading...") : t("Replace CV")}
                      </button>
                    </div>
                    {uploadState === "done" && (
                      <p className="text-xs font-medium text-emerald-600" role="status">
                        {t("CV sent to n8n")}
                      </p>
                    )}
                    {uploadState === "error" && (
                      <p className="text-xs font-medium text-red-600" role="alert">
                        {t("Could not upload CV")}: {uploadMsg}
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}
          </Card>

          {/* ----- CV Extracted Information ----- */}
          <Card className="p-5">
            <h2 className="text-base font-semibold text-slate-900">{t("CV Extracted Information")}</h2>

            {(
              <>
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
                  {/* column 1 */}
                  <div className="space-y-3">
                    <PersonalSection title={t("Personal Information")} items={cv.personal} onChange={(items) => { setCv((c) => ({ ...c, personal: items })); setSendState("idle"); }} onDone={(items) => sendCv(profile, { ...cv, personal: items })} />
                    <Section title={t("Skills")} items={cv.skills} onChange={setSection("skills")} onDone={doneSection("skills")} variant="chips" />
                  </div>

                  {/* column 2 */}
                  <div className="space-y-3">
                    <Section title={t("Education")} items={cv.education} onChange={setSection("education")} onDone={doneSection("education")} />
                    <Section title={t("Projects")} items={cv.projects} onChange={setSection("projects")} onDone={doneSection("projects")} variant="bullet" />
                  </div>

                  {/* column 3 */}
                  <div className="space-y-3">
                    <Section title={t("Work Experience")} items={cv.experience} onChange={setSection("experience")} onDone={doneSection("experience")} />
                    <Section title={t("Certifications")} items={cv.certifications} onChange={setSection("certifications")} onDone={doneSection("certifications")} />
                    <Section title={t("Languages")} items={cv.languages} onChange={setSection("languages")} onDone={doneSection("languages")} />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={updateInfo}
                  disabled={sendState === "sending"}
                  className="mt-4 w-full rounded-lg bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {sendState === "sending" ? t("Sending...") : t("Update Information")}
                </button>
                {sendState === "sent" && (
                  <p className="mt-2 text-center text-xs font-medium text-emerald-600" role="status">
                    {t("CV PDF sent successfully")}
                  </p>
                )}
                {sendState === "nochange" && (
                  <p className="mt-2 text-center text-xs font-medium text-slate-500" role="status">
                    {t("No changes to save")}
                  </p>
                )}
                {sendState === "error" && (
                  <p className="mt-2 text-center text-xs font-medium text-red-600" role="alert">
                    {t("Could not send CV")}: {sendMsg}
                  </p>
                )}
                {fetchState === "empty" && (
                  <p className="mt-2 text-center text-xs font-medium text-slate-500" role="status">
                    {t("No saved info found for your email")}
                  </p>
                )}
                {fetchState === "error" && (
                  <p className="mt-2 text-center text-xs font-medium text-red-600" role="alert">
                    {t("Could not fetch saved info")}: {fetchMsg}
                  </p>
                )}
              </>
            )}
          </Card>
        </div>
      )}

      {/* ================= RIGHT: CV preview ================= */}
      <aside>
        <Card className="p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="min-w-0 truncate text-xs font-semibold text-slate-600">
              {t("CV Preview")}
              {cvFile && <span className="ml-1.5 font-normal text-slate-400">· {profile.cvFileName}</span>}
            </p>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as PageSize)}
              title={t("Physical page size")}
              aria-label={t("Physical page size")}
              className="shrink-0 rounded-md border border-slate-300 bg-white px-1.5 py-1 text-[10px] font-medium text-slate-600 focus:border-indigo-500 focus:outline-none"
            >
              {(Object.keys(PAGE_SIZES) as PageSize[]).map((k) => (
                <option key={k} value={k}>
                  {k} · {PAGE_SIZES[k].w} × {PAGE_SIZES[k].h} mm
                </option>
              ))}
            </select>
            <IconButton
              onClick={() => setPreviewMax((v) => !v)}
              label={previewMax ? t("Restore preview") : t("Maximize preview")}
            >
              {previewMax ? <RestoreIcon /> : <MaximizeIcon />}
            </IconButton>
          </div>

          {cvFile && (
            <div className="mb-2 flex gap-1 rounded-md bg-slate-100 p-0.5 text-xs font-medium">
              {(["file", "info"] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setPreviewTab(k)}
                  className={`flex-1 rounded px-2 py-1 ${previewTab === k ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"}`}
                >
                  {k === "file" ? t("Uploaded file") : t("Extracted info")}
                </button>
              ))}
            </div>
          )}

          {cvFile && previewTab === "file" ? (
            <CvFileView file={cvFile} heightCls={previewHeight} />
          ) : (
            <div>
              <CvRendered profile={profile} cv={cv} photo={photo} large={previewMax} pageSize={pageSize} />
            </div>
          )}
        </Card>

        {coverMax && <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setCoverMax(false)} />}
        <Card className={coverMax ? "fixed left-1/2 top-1/2 z-50 max-h-[80vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto p-5 shadow-xl" : "mt-4 p-3"}>
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-slate-800">{t("Cover Letter")}</h4>
            <div className="flex items-center gap-3 text-xs font-medium">
              {!coverMax && (coverEditing ? coverDraft : coverLetter) && (
                <span className="text-[11px] font-normal text-slate-400">{countText(coverEditing ? coverDraft : coverLetter)}</span>
              )}
              {coverEditing ? (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      setCoverEditing(false);
                      setCoverState("idle");
                    }}
                    className="text-slate-500 hover:text-slate-700"
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    type="button"
                    onClick={() => saveCover(coverDraft.trim())}
                    disabled={coverState === "saving"}
                    className="text-indigo-600 hover:text-indigo-700 disabled:opacity-60"
                  >
                    {coverState === "saving" ? t("Saving...") : t("Done")}
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setCoverDraft(coverLetter);
                    setCoverState("idle");
                    setCoverEditing(true);
                  }}
                  className="text-slate-500 hover:text-indigo-600"
                >
                  {t("Edit")}
                </button>
              )}
              <button
                type="button"
                onClick={() => setCoverMax((v) => !v)}
                className="text-slate-400 hover:text-indigo-600"
                aria-label={coverMax ? t("Minimize") : t("Maximize")}
                title={coverMax ? t("Minimize") : t("Maximize")}
              >
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  {coverMax ? (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
                  ) : (
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
                  )}
                </svg>
              </button>
            </div>
          </div>

          {coverEditing ? (
            <textarea
              className={`${inputCls} ${coverMax ? "min-h-[50vh]" : "min-h-[260px]"} resize-y leading-relaxed`}
              value={coverDraft}
              onChange={(e) => setCoverDraft(e.target.value)}
              aria-label={t("Cover Letter")}
            />
          ) : coverLetter ? (
            <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-600">{coverLetter}</p>
          ) : (
            <p className="text-[13px] text-slate-400">
              {fetchState === "loading" ? t("Loading...") : t("Your cover letter will appear here once it is written.")}
            </p>
          )}

          {coverMax && (coverEditing ? coverDraft : coverLetter) && (
            <div className="mt-4 flex justify-end border-t border-slate-400 pt-3 text-xs text-slate-500">
              {countText(coverEditing ? coverDraft : coverLetter)}
            </div>
          )}

          {coverState === "saved" && (
            <p className="mt-2 text-xs font-medium text-emerald-600" role="status">
              {t("Cover letter saved")}
            </p>
          )}
          {coverState === "error" && (
            <p className="mt-2 text-xs font-medium text-red-600" role="alert">
              {t("Could not save cover letter")}: {coverMsg}
            </p>
          )}
        </Card>
      </aside>
    </div>
  );
}
