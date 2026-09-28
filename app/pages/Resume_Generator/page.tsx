"use client";
import { useState, useRef, useEffect } from "react";
import NavAndSidebar from "@/app/components/navAndSidebar";
import FeatureCard from "@/app/components/FeatureCard";
import { useUser } from "@/app/contexts/UserContext";
import { useLanguage, useT } from "@/app/contexts/LanguageContext";
import { useJobDescription } from "@/app/contexts/JobDescriptionContext";
import { useGoogleDrivePicker } from "@/app/hooks/useGoogleDrivePicker";

const WEBHOOK_URL = "https://n8naurora.duckdns.org/webhook/user-info";

/* ---------- CSS ---------- */
const s = {
  page: "w-full",
  dashboard:
    "grid grid-cols-1 gap-[var(--gap-columns)] items-stretch sm:grid-cols-2 lg:grid-cols-3 max-sm:*:min-w-0",
  card:
    "bg-[var(--color-card)] rounded-[var(--radius-card)] p-[var(--space-card-padding)] pb-[var(--space-card-bottom)] shadow-[var(--shadow-card)] max-sm:p-3.5",
  cardTitle:
    "text-[var(--text-card-title)] font-[var(--weight-card-title)] text-[var(--color-text-primary)] mb-0.5",
  cardNum: "text-[var(--color-blue)] mr-1",
  cardDesc:
    "text-[var(--text-card-desc)] font-[var(--weight-card-desc)] text-[var(--color-text-secondary)] mb-[var(--space-heading-content)] leading-tight",
  cardImage: "w-full max-h-[140px] object-contain rounded-lg block",
  cardAction: "flex justify-center mt-[var(--space-heading-content)]",

  /* score-card */
  scoreChartWrap: "relative flex justify-center items-center my-2 mb-3",
  scoreSvg: "w-[120px] h-[120px] block sm:w-[140px] sm:h-[140px]",
  scoreValue:
    "absolute text-[26px] font-bold text-[var(--color-blue)] leading-none sm:text-[32px]",
  scoreCategory: "text-center text-[15px] font-semibold capitalize mb-3.5",
  scoreKeywords: "mb-3.5",
  scoreKeywordsLabel:
    "text-xs font-medium text-[var(--color-text-primary)] mb-1.5",
  scoreKeywordsList: "flex flex-wrap gap-1.5",
  scoreKeyword:
    "text-[11px] text-[var(--color-text-secondary)] border border-[var(--color-input-border)] rounded px-2 py-0.5 leading-[1.4]",
  scoreSummary:
    "text-xs text-[var(--color-text-secondary)] leading-[1.5] break-words",

  /* form */
  formRow2:
    "grid grid-cols-1 gap-[var(--space-form-rows)] mb-[var(--space-form-rows)] sm:grid-cols-2",
  formGroup: "mb-[var(--space-form-rows)]",
  formGroupLast: "mb-0",
  formLabel:
    "block text-xs font-semibold text-slate-400 mb-0.5 after:content-['_*'] after:text-red-500",
  formInput:
    "w-full p-1.5 text-[var(--text-input)] font-[var(--weight-input)] font-[var(--font-family)] text-slate-800 text-[var(--color-text-primary)] bg-[var(--color-card)] border-[1.5px] border-[var(--color-input-border)] rounded-[var(--radius-input)] outline-none transition-[border-color] duration-200 box-border focus:border-[var(--color-blue)] focus:shadow-[0_0_0_2px_rgba(37,99,235,.12)] placeholder:text-xs placeholder:text-slate-400",
  formTextarea:
    "w-full p-1.5 text-[var(--text-input)] font-[var(--weight-input)] font-[var(--font-family)] text-slate-800 text-[var(--color-text-primary)] bg-[var(--color-card)] border-[1.5px] border-[var(--color-input-border)] rounded-[var(--radius-input)] outline-none transition-[border-color] duration-200 box-border resize-y min-h-[55px] focus:border-[var(--color-blue)] focus:shadow-[0_0_0_2px_rgba(37,99,235,.12)] placeholder:text-xs placeholder:text-slate-400",
  inputIcon: "relative",
  inputIconInput:
    "w-full p-1.5 pl-7 text-[var(--text-input)] font-[var(--weight-input)] font-[var(--font-family)] text-slate-800 text-[var(--color-text-primary)] bg-[var(--color-card)] border-[1.5px] border-[var(--color-input-border)] rounded-[var(--radius-input)] outline-none transition-[border-color] duration-200 box-border focus:border-[var(--color-blue)] focus:shadow-[0_0_0_2px_rgba(37,99,235,.12)] placeholder:text-xs placeholder:text-slate-400",
  inputIconIcon:
    "absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-[var(--color-text-secondary)] pointer-events-none flex items-center justify-center",

  /* skills-card */
  skillsSubtitle:
    "text-xs text-[var(--color-text-secondary)] leading-[1.4] mb-3.5",
  skillsTable: "flex flex-col",
  skillsTableHeader:
    "grid grid-cols-3 gap-2 border-b border-[var(--color-divider)] pb-1.5 mb-2",
  skillsTableCol:
    "text-[11px] font-semibold text-[var(--color-text-primary)] uppercase tracking-[0.04em] last:text-right",
  skillsTableRow: "grid grid-cols-3 gap-2 items-center py-1.5",
  skillsTableSkill: "text-xs text-[var(--color-text-primary)] break-words",
  skillsTableJobLevel: "text-xs text-[var(--color-text-secondary)] text-right",
  skillsTableSliderWrap: "flex items-center",
  skillsTableSlider: "relative w-full h-5",
  skillsTableTrack:
    "absolute top-2 left-0 right-0 h-1 bg-[var(--color-input-border)] rounded",
  skillsTableDot: "absolute top-1 left-0 w-3 h-3 bg-[#F97316] rounded-full z-[1]",

  /* edited-cv */
  editedCvCardBorder: "border border-[var(--color-green)] bg-gradient-to-br from-[#f0fdf4] to-white pb-0",
  editedCvIframeWrap: "relative w-full aspect-[210/297] overflow-hidden rounded-b-[6px] bg-white shadow-[inset_0_0_0_1px_rgba(0,0,0,0.06)]",
  editedCvIframe: "w-full h-full border-none bg-white block",
  editedCvThumb: "block w-full h-[200px] object-cover object-top border-none bg-[#f5f5f5] sm:h-[320px]",
  editedCvPlaceholder: "flex items-center justify-center h-[200px] bg-gray-50 text-[var(--color-text-secondary)] text-[13px] sm:h-[320px]",
  editedCvOverlay: "absolute inset-0 flex items-center justify-center opacity-0 transition-opacity duration-200 bg-black/45 rounded-b-[6px] group-hover:opacity-100",
  editedCvDownloadBtn:
    "inline-flex items-center gap-2 px-7 py-2.5 bg-[var(--color-green)] text-white border-none rounded-lg text-[15px] font-semibold cursor-pointer no-underline transition-[background,transform] duration-200 hover:bg-[var(--color-green-hover)] hover:scale-105",

  /* btn */
  btn: "inline-flex items-center justify-center gap-2 w-full max-w-[280px] h-11 border-none rounded-[var(--radius-btn)] text-[var(--text-btn)] font-[var(--weight-btn)] font-[var(--font-family)] cursor-pointer transition-[background,box-shadow,transform] duration-200 disabled:opacity-70 disabled:cursor-not-allowed",
  btnPrimary:
    "bg-[var(--color-green)] text-white shadow-[var(--shadow-btn)] hover:bg-[var(--color-green-hover)] hover:shadow-[var(--shadow-btn-hover)] active:scale-[.97]",
  btnIcon: "w-3.5 h-3.5 flex-shrink-0",
  btnSpinner: "animate-[spin_0.8s_linear_infinite]",
};

/* ---------- Types ---------- */
interface SkillsAnalysis {
  matched_skills: string[];
  missing_skills: Array<{ skill: string; importance: string }>;
  additional_skills: string[];
}

interface AnalysisResult {
  ats_score?: number;
  "ATS Score"?: number;
  match_category?: string;
  "match category"?: string;
  skills_analysis?: SkillsAnalysis;
  "Skills needed"?: SkillsAnalysis;
  keywords_to_improve_ats?: string[];
  keyword?: string[];
  summary?: string;
  edited_cv?: string;
  "Edited Cv"?: string;
  edited_cv_name?: string;
  [key: string]: unknown;
}

/* ---------- Sub-components ---------- */

function matchColor(category: string) {
  switch ((category ?? "").toLowerCase()) {
    case "excellent":
      return "var(--color-green)";
    case "good match":
      return "#EAB308";
    case "fair match":
      return "#F97316";
    case "weak match":
      return "#EF4444";
    default:
      return "var(--color-text-secondary)";
  }
}

function extractFileId(url: string) {
  return (
    url.match(/[?&]id=([^&]+)/)?.[1] ??
    url.match(/\/d\/([^/]+)/)?.[1] ??
    null
  );
}

function isHtml(str: unknown): str is string {
  if (typeof str !== "string") return false;
  const trimmed = str.trim();
  return (
    trimmed.startsWith("<!DOCTYPE") ||
    trimmed.startsWith("<html") ||
    trimmed.startsWith("<")
  );
}

function openPreview(html: string, lang = "en") {
  const win = window.open("", "_blank");
  if (!win) return;
  const withLang = html.includes("lang=") ? html : html.replace("<html", `<html lang="${lang}"`).replace("<HTML", `<HTML lang="${lang}"`);
  win.document.write(withLang);
  win.document.close();
}

function downloadAsDoc(html: string, lang = "en") {
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*)<\/body>/i);
  const bodyContent = bodyMatch ? bodyMatch[1] : html;
  const docHtml = `<!DOCTYPE html>
<html lang="${lang}" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
<head><meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
<style>body{font-family:Arial,Helvetica,sans-serif;font-size:12pt;color:#1a1a1a;line-height:1.5;margin:0;padding:0}</style>
</head><body>${bodyContent}</body></html>`;
  const blob = new Blob([docHtml], {
    type: "application/msword;charset=UTF-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "Optimized_Resume.doc";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function downloadPdf(html: string, lang = "en") {
  const withLang = html.includes("lang=") ? html : html.replace("<html", `<html lang="${lang}"`).replace("<HTML", `<HTML lang="${lang}"`);
  const printHtml = withLang
    .replace(
      "</head>",
      '<style>@page{margin:0;size:A4}body{margin:0;padding:0}</style></head>'
    )
    .replace("<title>", "<title> ");
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.top = "-9999px";
  iframe.style.left = "-9999px";
  iframe.style.width = "210mm";
  iframe.style.height = "297mm";
  document.body.appendChild(iframe);
  iframe.contentWindow!.document.open();
  iframe.contentWindow!.document.write(printHtml);
  iframe.contentWindow!.document.close();
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => document.body.removeChild(iframe), 1000);
}

/* ---------- Upload sub-component ---------- */
function UploadCard({
  file,
  onFileChange,
}: {
  file: File | null;
  onFileChange: (f: File | null) => void;
}) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { openDrivePicker } = useGoogleDrivePicker({
    onFilePicked: (f) => {
      if (f.size > 10 * 1024 * 1024) {
        alert(t("File size must be less than 10 MB."));
        return;
      }
      onFileChange(f);
    },
  });

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept=".pdf,.doc,.docx"
        className="hidden"
        onChange={(e) => {
          const selected = e.target.files?.[0];
          if (!selected) return;
          const maxSize = 10 * 1024 * 1024;
          const allowed = [
            "application/pdf",
            "application/msword",
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          ];
          if (!allowed.includes(selected.type)) {
            alert(t("Please upload a PDF or DOC file."));
            e.target.value = "";
            return;
          }
          if (selected.size > maxSize) {
            alert(t("File size must be less than 10 MB."));
            e.target.value = "";
            return;
          }
          onFileChange(selected);
        }}
      />
      <FeatureCard
        number={1}
        title={t("Upload Resume")}
        subtitle={t("Upload your resume in PDF or DOCX format to get started.")}
        bodyClassName="flex flex-col"
      >
        <button
          onClick={() => fileInputRef.current?.click()}
          className="w-full flex items-center gap-3 px-4 py-3 mb-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition text-left"
        >
          <svg className="w-6 h-6 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 24 24">
            <path d="M6 2a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6H6Zm7 1.5L18.5 9H14a1 1 0 0 1-1-1V3.5Z" />
          </svg>
          <span className="flex-1 min-w-0">
            <span className="block text-sm font-semibold text-slate-700 truncate">
              {file ? file.name : t("Upload from Computer")}
            </span>
            <span className="block text-xs text-slate-400">
              {file ? `${(file.size / 1024).toFixed(0)} KB` : t("PDF, DOCX \u2014 Max 10 MB")}
            </span>
          </span>
          {file && (
            <button
              onClick={(e) => { e.stopPropagation(); onFileChange(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
              className="shrink-0 text-slate-400 hover:text-red-500 text-base leading-none p-1"
            >
              &times;
            </button>
          )}
        </button>
        <button
          onClick={openDrivePicker}
          className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition text-left"
        >
          <svg className="w-6 h-6 shrink-0" viewBox="0 0 24 24">
            <path fill="#0066da" d="M4.5 19.5 7 15h10l-2.5 4.5z" />
            <path fill="#00ac47" d="M9.5 4 4.5 12.5 7 17l5-8.5z" />
            <path fill="#ffba00" d="M14.5 4h-5l5 8.5L19.5 17 14.5 4z" />
          </svg>
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-slate-700 truncate">{t("Import from Google Drive")}</span>
            <span className="block text-xs text-slate-400 truncate">{t("Select files directly from Drive")}</span>
          </span>
        </button>
        <p className="mt-auto pt-4 flex items-center gap-1.5 text-xs text-slate-400">
          <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 0h10.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5H6.75a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5Z" />
          </svg>
          {t("Your files are secure and private.")}
        </p>
      </FeatureCard>
    </>
  );
}

/* ---------- Job Description form sub-component ---------- */
function JobDescriptionForm({
  values,
  onChange,
}: {
  values: {
    company: string;
    jobTitle: string;
    location: string;
    deadline: string;
    description: string;
  };
  onChange: (field: string, value: string) => void;
}) {
  const t = useT();
  const handle = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    onChange(field, e.target.value);

  return (
    <FeatureCard
      number={2}
      title={t("Job Description")}
      subtitle={t("Enter the job details so we can match your resume against the requirements.")}
    >
      <div className={s.formRow2}>
        <div className={s.formGroup}>
          <label className={s.formLabel} htmlFor="company">{t("Company")}</label>
          <input
            className={s.formInput}
            id="company"
            type="text"
            placeholder={t("Company name")}
            required
            value={values.company}
            onChange={handle("company")}
          />
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel} htmlFor="job-title">{t("Job Title")}</label>
          <div className={s.inputIcon}>
            <span className={s.inputIconIcon}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="6" r="3" />
                <path d="M3 14c0-3.314 2.239-6 5-6s5 2.686 5 6" />
              </svg>
            </span>
            <input
              className={s.inputIconInput}
              id="job-title"
              type="text"
              placeholder={t("e.g. Software Engineer")}
              required
              value={values.jobTitle}
              onChange={handle("jobTitle")}
            />
          </div>
        </div>
      </div>

      <div className={s.formRow2}>
        <div className={s.formGroup}>
          <label className={s.formLabel} htmlFor="location">{t("Location")}</label>
          <div className={s.inputIcon}>
            <span className={s.inputIconIcon}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="8" cy="6" r="3.5" />
                <path d="M8 14c4-3.5 6-6 6-8a6 6 0 0 0-12 0c0 2 2 4.5 6 8z" />
              </svg>
            </span>
            <input
              className={s.inputIconInput}
              id="location"
              type="text"
              placeholder={t("City, Country")}
              required
              value={values.location}
              onChange={handle("location")}
            />
          </div>
        </div>
        <div className={s.formGroup}>
          <label className={s.formLabel} htmlFor="date">{t("Date Applied")}</label>
          <div className={s.inputIcon}>
            <span className={s.inputIconIcon}>
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="12" height="11" rx="1.5" />
                <path d="M5 1v3M11 1v3M2 7h12" />
              </svg>
            </span>
            <input
              className={s.inputIconInput}
              id="date"
              type="date"
              required
              value={values.deadline}
              onChange={handle("deadline")}
            />
          </div>
        </div>
      </div>

      <div className={`${s.formGroup} ${s.formGroupLast}`}>
        <label className={s.formLabel} htmlFor="description">{t("Description")}</label>
        <textarea
          className={s.formTextarea}
          id="description"
          placeholder={t("Paste the job description here\u2026")}
          required
          value={values.description}
          onChange={handle("description")}
        />
      </div>
    </FeatureCard>
  );
}

/* ---------- Analysis card sub-component ---------- */
function AnalysisCard({
  onSubmit,
  loading,
}: {
  onSubmit: () => void;
  loading: boolean;
}) {
  const t = useT();
  return (
    <FeatureCard
      number={3}
      title={t("Analysis")}
      subtitle={t("Review how well your resume matches the job requirements.")}
    >
      <img
        src="/images/ats/images.jpeg"
        alt={t("Analysis")}
        className={s.cardImage}
      />
      <div className="divider" />
      <div className={s.cardAction}>
        <button
          className={`${s.btn} ${s.btnPrimary}`}
          onClick={onSubmit}
          disabled={loading}
        >
          {loading ? (
            <svg className={`${s.btnIcon} ${s.btnSpinner}`} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="7" strokeDasharray="30" strokeLinecap="round" />
            </svg>
          ) : (
            <svg className={s.btnIcon} viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 1l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" />
              <path d="M14 12l3 3M15 14l-1 1" />
            </svg>
          )}
          {loading ? t("Optimizing...") : t("Optimize Resume")}
        </button>
      </div>
    </FeatureCard>
  );
}

/* ---------- ATS Score sub-component ---------- */
function AtsScoreCard({ result }: { result: AnalysisResult | null }) {
  const t = useT();
  if (!result) return null;

  const score = result.ats_score ?? result["ATS Score"] ?? 0;
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - score / 100);

  const category = result.match_category ?? result["match category"] ?? "";
  const catColor = matchColor(category);
  const keywords = result.keywords_to_improve_ats ?? result.keyword ?? [];

  return (
    <section className={`${s.card} border border-[var(--color-input-border)]`}>
      <h2 className={s.cardTitle}>{t("ATS Score")}</h2>
      <div className={s.scoreChartWrap}>
        <svg className={s.scoreSvg} viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#e5e7eb" strokeWidth="10" />
          <circle
            cx="80" cy="80" r={radius}
            fill="none"
            strokeWidth="10"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform="rotate(-90 80 80)"
            style={{ stroke: catColor, transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div className={s.scoreValue} style={{ color: catColor }}>
          {score}%
        </div>
      </div>
      <p className={s.scoreCategory} style={{ color: catColor }}>
        {category}
      </p>
      {keywords.length > 0 && (
        <div className={s.scoreKeywords}>
          <p className={s.scoreKeywordsLabel}>{t("Keywords to improve ATS:")}</p>
          <div className={s.scoreKeywordsList}>
            {keywords.map((kw: string) => (
              <span key={kw} className={s.scoreKeyword}>{kw}</span>
            ))}
          </div>
        </div>
      )}
      <p className={s.scoreSummary}>{result.summary}</p>
    </section>
  );
}

/* ---------- Skills sub-component ---------- */
function SkillsCard({ result }: { result: AnalysisResult | null }) {
  const t = useT();
  if (!result) return null;

  const skills = result.skills_analysis ?? result["Skills needed"];
  if (!skills) return null;

  const missing = (skills.missing_skills ?? []) as Array<{ skill: string; importance: string } | string>;
  const additional = (skills.additional_skills ?? []) as string[];
  const items = [...missing.map((s) => (typeof s === "string" ? s : s.skill)), ...additional];

  if (items.length === 0) return null;

  return (
    <section className={`${s.card} border border-[var(--color-input-border)]`}>
      <h2 className={s.cardTitle}>{t("Skills to Improve")}</h2>
      <p className={s.skillsSubtitle}>
        {t("There are important skills mentioned in the job description that are missing in your resume")}
      </p>
      <div className="overflow-x-auto">
      <div className={s.skillsTable}>
        <div className={s.skillsTableHeader}>
          <span className={s.skillsTableCol}>{t("Missing Skills")}</span>
          <span className={s.skillsTableCol}>{t("Your Level")}</span>
          <span className={s.skillsTableCol}>{t("Job Level")}</span>
        </div>
        {items.map((item: string) => (
          <div key={item} className={s.skillsTableRow}>
            <span className={s.skillsTableSkill}>{item}</span>
            <div className={s.skillsTableSliderWrap}>
              <div className={s.skillsTableSlider}>
                <div className={s.skillsTableTrack} />
                <div className={s.skillsTableDot} />
              </div>
            </div>
            <span className={s.skillsTableJobLevel}>{t("Advanced")}</span>
          </div>
        ))}
      </div>
      </div>
    </section>
  );
}

/* ---------- Edited CV sub-component ---------- */
function EditedCvCard({ result }: { result: AnalysisResult | null }) {
  const { language } = useLanguage();
  const t = useT();
  if (!result) return null;

  const editedCv = result.edited_cv ?? result["Edited Cv"];
  if (!editedCv) return null;

  const isHtmlContent = isHtml(editedCv);

  const translations: Record<string, Record<string, string>> = {
    de: {
      "PROFESSIONAL SUMMARY": "BERUFLICHE ZUSAMMENFASSUNG",
      "WORK EXPERIENCE": "BERUFSERFAHRUNG",
      "EDUCATION": "AUSBILDUNG",
      "SKILLS": "FÄHIGKEITEN",
      "CERTIFICATIONS": "ZERTIFIZIERUNGEN",
      "Professional Summary": "Berufliche Zusammenfassung",
      "Mobile Repair Technician": "Handy-Reparaturtechniker",
      "Laser Cutting Operator": "Laserschneidanlagenbediener",
      "Mehedi Hasan, Dhaka, Bangladesh": "Mehedi Hasan, Dhaka, Bangladesch",
      "Nur Electronics, Dhaka, Bangladesh": "Nur Electronics, Dhaka, Bangladesch",
    },
  };

  const displayHtml = isHtmlContent
    ? (() => {
        let h = editedCv.includes("lang=")
          ? editedCv.replace(/lang="[^"]*"/, `lang="${language}"`)
          : editedCv.replace("<html", `<html lang="${language}"`);
        if (language !== "en" && translations[language]) {
          const dict = translations[language];
          for (const [en, de] of Object.entries(dict)) {
            h = h.replaceAll(en, de);
          }
        }
        return h;
      })()
    : editedCv;

  if (isHtmlContent) {
    return (
      <FeatureCard
        title={t("Optimized Resume")}
        divided
        actions={
          <button
            onClick={() => openPreview(editedCv, language)}
            className="px-3 py-1.5 text-sm text-slate-600 border border-slate-200 rounded-lg hover:bg-slate-50 transition"
          >
            {t("Preview")}
          </button>
        }
        footer={
          <>
            <button
              onClick={() => downloadAsDoc(editedCv, language)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-blue-600 border border-blue-200 rounded-lg hover:bg-blue-50 transition"
            >
              {t("Export as DOC")}
            </button>
            <button
              onClick={() => downloadPdf(editedCv, language)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 border border-red-200 rounded-lg hover:bg-red-50 transition"
            >
              {t("Export as PDF")}
            </button>
          </>
        }
      >
        <div className={s.editedCvIframeWrap}>
          <iframe
            key={language}
            srcDoc={displayHtml}
            title={t("Optimized Resume")}
            className={s.editedCvIframe}
            sandbox="allow-same-origin"
            loading="lazy"
          />
        </div>
      </FeatureCard>
    );
  }

  const fileName = result.edited_cv_name ?? "Optimized_Resume.pdf";
  const fileId = extractFileId(editedCv);
  const thumbUrl = fileId
    ? `https://drive.google.com/thumbnail?id=${fileId}&sz=w1000`
    : null;

  return (
    <section className={`${s.card} ${s.editedCvCardBorder}`}>
      <h2 className={s.cardTitle}>{t("Optimized Resume")}</h2>
      <div className="relative w-full overflow-hidden rounded-b-[6px] group">
        {thumbUrl ? (
          <img src={thumbUrl} alt={t("Optimized Resume")} className={s.editedCvThumb} />
        ) : (
          <div className={s.editedCvPlaceholder}>
            <p>{t("Preview not available")}</p>
          </div>
        )}
        <div className={s.editedCvOverlay}>
          <a
            href={editedCv}
            target="_blank"
            rel="noopener noreferrer"
            className={s.editedCvDownloadBtn}
            download={fileName}
          >
            <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 1v12M5 8l5 5 5-8M3 16v2a1 1 0 001 1h12a1 1 0 001-1v-2" />
            </svg>
            {t("Download")}
          </a>
        </div>
      </div>
    </section>
  );
}

/* ---------- Main Page ---------- */
export default function Resume_Generator() {
  const { user } = useUser();
  const pageWebHookUrl = user.WebHook_Url["Resume_Generator"];
  const t = useT();
  const { language } = useLanguage();
  const { resumeJobDescription, setResumeJobDescription } = useJobDescription();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    company: "",
    jobTitle: "",
    location: "",
    deadline: "",
    description: resumeJobDescription || "",
  });

  // Sync shared description to form
  useEffect(() => {
    setFormData((prev) => ({ ...prev, description: resumeJobDescription }));
  }, []);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [result, setResult] = useState<AnalysisResult | null>(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      if (params.get("demo") === "true") {
        return {
          ats_score: 75,
          match_category: "good match",
          score_breakdown: {
            keyword_match: 16,
            section_completeness: 20,
            contact_completeness: 10,
            formatting_parseability: 15,
            achievements_quality: 4,
          },
          keyword_match_rate: 80,
          german_standard_compliance: {
            compliant: false,
            issues: [
              "Lack of reverse-chronological work history",
              "No mention of German language proficiency",
            ],
            neutral_observations: [],
          },
          skills_analysis: {
            matched_skills: ["Python", "openCode", "chatGPT", "openCV", "Grok"],
            missing_skills: [{ skill: "tech knowledge", importance: "required" }],
            additional_skills: [
              "Microsoft Excel",
              "Microsoft Powerpoint",
              "Microsoft Word",
              "3uTools",
            ],
          },
          keywords_to_improve_ats: ["Python", "openCode", "chatGPT"],
          top_recommendations: [
            "Ensure your work experience is presented in reverse-chronological order.",
            "Include a statement of German language proficiency, e.g., C1 or B2.",
          ],
          summary:
            "The candidate has relevant technical and AI skills but lacks direct alignment with the job description's required 'tech knowledge'. Improvements are needed in work history presentation and language proficiency.",
          edited_cv:
            "https://drive.google.com/uc?id=1nG6V8RDVxt1hLrLSAimOUsa6M4tu-G47&export=download",
        } satisfies AnalysisResult;
      }
      if (params.get("demo") === "real") {
        return {
          uniqueId: "CV_23_03_2026_pdf_aurrora_19670",
          "ATS Score": 72,
          "Skills needed": {
            matched_skills: ["Python", "Microsoft Excel", "Problem-solving abilities"],
            missing_skills: [{ skill: "openCode", importance: "required" }],
            additional_skills: [
              "mql5",
              "chatGPT",
              "openCV",
              "Grok",
              "Microsoft Powerpoint",
              "Microsoft Word",
              "3uTools",
            ],
          },
          "Edited Cv": `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>MEHEDI HASAN - Resume</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: Arial, Helvetica, sans-serif;
    color: #1a1a1a;
    background: #ffffff;
    line-height: 1.45;
    font-size: 14px;
  }
  .resume {
    max-width: 800px;
    margin: 0 auto;
    padding: 40px 48px;
    background: #fff;
  }
  .name {
    text-align: center;
    font-size: 40px;
    font-weight: 800;
    letter-spacing: 2px;
    text-transform: uppercase;
    margin-bottom: 10px;
  }
  .headline {
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    margin-bottom: 8px;
  }
  .contact {
    text-align: center;
    font-size: 13px;
    color: #333;
    margin-bottom: 6px;
  }
  .section { margin-top: 22px; }
  .section h2 {
    font-size: 20px;
    font-weight: 700;
    text-transform: uppercase;
    border-bottom: 2px solid #333;
    padding-bottom: 4px;
    margin-bottom: 12px;
  }
  .summary { text-align: justify; }
  .entry { margin-bottom: 16px; }
  .entry-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .entry-title { font-weight: 700; font-size: 15px; }
  .entry-sub { font-weight: 700; font-size: 13px; margin-top: 2px; }
  .entry-date { font-weight: 700; font-size: 13px; white-space: nowrap; padding-left: 12px; }
  ul { list-style: disc; padding-left: 22px; margin-top: 6px; }
  li { margin-bottom: 4px; }
</style>
</head>
<body>
  <div class="resume">
    <div class="name">MEHEDI HASAN</div>
    <div class="headline">Python | mql5 | openCode | chatGPT</div>
    <div class="contact">Dhaka, Bangladesh | nfrutikf@gmail.com | +880 01623100268</div>

    
    <div class="section">
      <h2>PROFESSIONAL SUMMARY</h2>
      <p class="summary">Detail-oriented and innovative Computer Technology Diploma student with experience in process optimisation and technical support. Proven ability to design and manage practical AI automation workflows that enhance business efficiency and streamline operations. Recognised for strong communication, quick learning, and problem-solving skills.</p>
    </div>
    
    <div class="section">
      <h2>WORK EXPERIENCE</h2>
      
      <div class="entry">
        <div class="entry-header">
          <div class="entry-left">
            <div class="entry-title">Mobile Repair Technician</div>
            <div class="entry-sub">Mehedi Hasan, Dhaka, Bangladesh</div>
          </div>
          <div class="entry-date">01.03.2024 \u2013 01.04.2025</div>
        </div>
        <ul><li>Provided phone/email troubleshooting when in-person repair was not possible.</li><li>Built client trust through high-quality repairs and device longevity.</li><li>Streamlined parts ordering to reduce downtime and out-of-stock issues.</li></ul>
      </div>
      <div class="entry">
        <div class="entry-header">
          <div class="entry-left">
            <div class="entry-title">Laser Cutting Operator</div>
            <div class="entry-sub">Nur Electronics, Dhaka, Bangladesh</div>
          </div>
          <div class="entry-date">01.04.2025 \u2013 Present</div>
        </div>
        <ul><li>Optimizes machine performance through precise parameter tuning and efficiency monitoring to meet strict quality standards.</li><li>Specialises in material processing, using laser tech to transform digital designs into engineered components.</li></ul>
      </div>
    </div>
    
    <div class="section">
      <h2>EDUCATION</h2>
      
      <div class="entry">
        <div class="entry-header">
          <div class="entry-left">
            <div class="entry-title">Diploma In Engineering</div>
            <div class="entry-sub">National Institute of Engineering And Technology, Hatirpool, Dhaka, Bangladesh</div>
          </div>
          <div class="entry-date"></div>
        </div>
      </div>
      <div class="entry">
        <div class="entry-header">
          <div class="entry-left">
            <div class="entry-title">Secondary School Certificate</div>
            <div class="entry-sub">Rahmatulla Model High School, Hatirpool, Dhaka, Bangladesh</div>
          </div>
          <div class="entry-date"></div>
        </div>
      </div>
    </div>
    
    <div class="section">
      <h2>SKILLS</h2>
      <ul><li>Python, mql5, openCode</li><li>chatGPT, openCV, Grok</li><li>Microsoft Excel, Microsoft Powerpoint, Microsoft Word</li><li>3uTools</li></ul>
    </div>
    
    <div class="section">
      <h2>CERTIFICATIONS</h2>
      <ul><li>National Skills Certificate on Mobile Phone Servicing</li></ul>
    </div>
    
    
    <div class="section">
      <h2>LANGUAGES</h2>
      <ul><li> (C1)</li></ul>
    </div>
    
  </div>
</body>
</html>`,
          Status: "Completed",
          "match category": "good match",
          keyword: ["openCode", "Kubernetes", "AI Tools"],
        } satisfies AnalysisResult;
      }
    }
    return null;
  });

  useEffect(() => {
    return () => {
      if (pollingRef.current) {
        clearInterval(pollingRef.current);
        pollingRef.current = null;
      }
    };
  }, []);

  const handleFieldChange = (field: string, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Sync description to shared context
    if (field === "description") {
      setResumeJobDescription(value);
    }
  };

  const startPolling = (jobId: string) => {
    const startTime = Date.now();
    const maxWait = 1_200_000;

    pollingRef.current = setInterval(async () => {
      if (Date.now() - startTime > maxWait) {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        alert(t("Analysis is taking longer than expected. Please try again."));
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/drive?action=job-status&jobId=${jobId}`);
        const status = await res.json();
        if (status.status === "completed") {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          setResult(status.result);
          setLoading(false);
        } else if (status.status === "error") {
          clearInterval(pollingRef.current!);
          pollingRef.current = null;
          alert(t("Analysis failed: ") + (status.error || t("Unknown error")));
          setLoading(false);
        }
      } catch (err: any) {
        clearInterval(pollingRef.current!);
        pollingRef.current = null;
        alert(t("Failed to check analysis status: ") + err.message);
        setLoading(false);
      }
    }, 3000);
  };

  const handleSubmit = async () => {
    if (!file) {
      alert(t("Please upload a resume file first."));
      return;
    }
    const { company, jobTitle, location, deadline, description } = formData;
    if (!company || !jobTitle || !location || !deadline || !description) {
      alert(t("Please fill in all job description fields."));
      return;
    }
    setLoading(true);
    setResult(null);

    try {
      const sanitize = (s: string) =>
        s.replace(/[^a-zA-Z0-9]/g, "_").replace(/_+/g, "_").replace(/^_|_$/g, "");
      const uniqueId = `${sanitize(file.name)}_${sanitize(company)}_${Math.floor(Math.random() * 100000)}`;

      const body = new FormData();
      body.append("resume", file);
      body.append("company", company);
      body.append("jobTitle", jobTitle);
      body.append("location", location);
      body.append("deadline", deadline);
      body.append("description", description);
      body.append("uniqueId", uniqueId);
      body.append("language", language);

      const email = typeof window !== "undefined" ? localStorage.getItem("userEmail") ?? "" : "";
      const now = new Date();
      const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
      const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}${String(now.getSeconds()).padStart(2, "0")}`;
      const whUniqueId = `${dateStr}_${timeStr}_${email.replace(/[^a-zA-Z0-9]/g, "_")}`;

      const whBody = new FormData();
      whBody.append("resume", file);
      whBody.append("company", company);
      whBody.append("jobTitle", jobTitle);
      whBody.append("location", location);
      whBody.append("deadline", deadline);
      whBody.append("description", description);
      whBody.append("language", language);
      whBody.append("email", email);
      whBody.append("uniqueId", whUniqueId);

      const whRes = await fetch(WEBHOOK_URL, { method: "POST", body: whBody });
      if (whRes.ok) {
        const data = await whRes.json();
        setResult(data as AnalysisResult);
        setLoading(false);
      } else {
        const res = await fetch("/api/drive?action=submit-resume", {
          method: "POST",
          body,
        });
        if (!res.ok) throw new Error("Failed to submit resume for analysis");
        const { jobId } = await res.json();
        startPolling(jobId);
      }
    } catch (err: any) {
      alert(t("Failed to send data: ") + err.message);
      console.error(err);
      setLoading(false);
    }
  };

  return (
    <div>
      <NavAndSidebar
        pageInfo={["Resume Generator", "", "Resume_Generator"]}
        user={[
        user.name,
        user.profilePic,
        user.notificationNumber,
        user.purchasePlan,
        pageWebHookUrl,
      ]}
      >
        <div className={s.page}>
          <div className={s.dashboard}>
            <UploadCard file={file} onFileChange={setFile} />
            <JobDescriptionForm values={formData} onChange={handleFieldChange} />
            <AnalysisCard onSubmit={handleSubmit} loading={loading} />
            <AtsScoreCard result={result} />
            <SkillsCard result={result} />
            <EditedCvCard result={result} />
          </div>
        </div>
      </NavAndSidebar>
    </div>
  );
}
