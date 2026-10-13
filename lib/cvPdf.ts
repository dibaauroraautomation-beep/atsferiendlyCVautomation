// Builds a real (text-based, selectable, ATS-readable) PDF of the profile CV.
// Same dark-sidebar design as the on-screen preview, drawn with jsPDF.
import { jsPDF } from "jspdf";

export type CvPdfInput = {
  profile: {
    fullName: string;
    email: string;
    location: string;
    targetJobs: string;
    experienceLevel: string;
  };
  cv: {
    personal: { label: string; value: string }[];
    education: string[];
    experience: string[];
    skills: string[];
    projects: string[];
    certifications: string[];
    languages: string[];
  };
  photoDataUrl: string | null; // already a circular PNG, or null
  page: { w: number; h: number }; // mm
};

type RGB = [number, number, number];
const DARK: RGB = [24, 24, 27];
const ORANGE: RGB = [245, 158, 11];
const ZINC_LABEL: RGB = [161, 161, 170];
const ZINC_LINE: RGB = [113, 113, 122];
const WHITE: RGB = [255, 255, 255];
const BODY: RGB = [71, 85, 105];
const TITLE: RGB = [30, 41, 59];

const PT = 0.3528; // 1pt in mm

export function buildCvPdf(input: CvPdfInput): Blob {
  const { profile, cv, photoDataUrl, page } = input;
  const W = page.w;
  const H = page.h;
  const doc = new jsPDF({ unit: "mm", format: [W, H], orientation: "portrait" });

  const sideW = W * 0.36;
  const pad = Math.max(6, W * 0.045);

  const paintSide = () => {
    doc.setFillColor(...DARK);
    doc.rect(0, 0, sideW, H, "F");
  };
  paintSide();

  type Col = { page: number; y: number };
  const ensure = (col: Col, need: number) => {
    if (col.y + need > H - pad) {
      col.page += 1;
      col.y = pad;
    }
    while (doc.getNumberOfPages() < col.page) {
      doc.addPage([W, H]);
      paintSide();
    }
    doc.setPage(col.page);
  };

  const write = (
    col: Col,
    x: number,
    maxW: number,
    text: string,
    o: { size: number; bold?: boolean; color: RGB; gapAfter?: number; space?: number },
  ) => {
    doc.setFont("helvetica", o.bold ? "bold" : "normal");
    doc.setFontSize(o.size);
    doc.setTextColor(...o.color);
    doc.setCharSpace(o.space ?? 0);
    const lineH = o.size * PT * 1.4;
    const lines: string[] = doc.splitTextToSize(text, maxW);
    for (const line of lines) {
      ensure(col, lineH);
      doc.setFont("helvetica", o.bold ? "bold" : "normal");
      doc.setFontSize(o.size);
      doc.setTextColor(...o.color);
      doc.setCharSpace(o.space ?? 0);
      doc.text(line, x, col.y + o.size * PT);
      col.y += lineH;
    }
    doc.setCharSpace(0);
    col.y += o.gapAfter ?? 0;
  };

  const name = cv.personal.find((x) => x.label === "Name")?.value || profile.fullName;
  const phone = cv.personal.find((x) => x.label === "Contact number")?.value || "";
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  /* ---------------- sidebar ---------------- */
  const side: Col = { page: 1, y: pad };
  const sx = pad;
  const sw = sideW - pad * 2;

  const d = sideW * 0.45;
  if (photoDataUrl) {
    doc.addImage(photoDataUrl, "PNG", sx, side.y, d, d);
  } else {
    doc.setFillColor(...ORANGE);
    doc.circle(sx + d / 2, side.y + d / 2, d / 2, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(d * 1.1);
    doc.setTextColor(...DARK);
    doc.text(initials, sx + d / 2, side.y + d / 2 + d * 0.13, { align: "center" });
  }
  side.y += d + 5;

  write(side, sx, sw, name.toUpperCase(), { size: 13, bold: true, color: WHITE, gapAfter: 1 });
  write(side, sx, sw, profile.targetJobs, { size: 8, bold: true, color: ORANGE, gapAfter: 5 });

  write(side, sx, sw, profile.email || "Not on file", { size: 7.5, bold: true, color: WHITE, gapAfter: 1.5 });
  write(side, sx, sw, phone || "Not on file", { size: 7.5, bold: true, color: WHITE, gapAfter: 1.5 });
  write(side, sx, sw, profile.location || "Not on file", { size: 7.5, bold: true, color: WHITE, gapAfter: 3 });

  const sideHead = (t: string) => {
    side.y += 4;
    write(side, sx, sw, t.toUpperCase(), { size: 6.5, bold: true, color: ZINC_LABEL, gapAfter: 1.5, space: 0.6 });
  };

  sideHead("Skills");
  {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    const rowH = 5.4;
    let x = sx;
    ensure(side, rowH);
    for (const sk of cv.skills) {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7);
      const tw = doc.getTextWidth(sk) + 4;
      if (x > sx && x + tw > sx + sw) {
        x = sx;
        side.y += rowH + 1.2;
        ensure(side, rowH);
      }
      doc.setDrawColor(...ZINC_LINE);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, side.y, tw, rowH, rowH / 2, rowH / 2, "S");
      doc.setTextColor(228, 228, 231);
      doc.text(sk, x + 2, side.y + 3.7);
      x += tw + 1.5;
    }
    side.y += rowH + 1;
  }

  sideHead("Education");
  for (const e of cv.education) write(side, sx, sw, e, { size: 7.5, bold: true, color: WHITE, gapAfter: 1.5 });

  sideHead("Certifications");
  if (cv.certifications.length) {
    for (const c of cv.certifications) write(side, sx, sw, c, { size: 7.5, bold: true, color: WHITE, gapAfter: 1.5 });
  } else {
    write(side, sx, sw, "Not on file", { size: 7.5, bold: true, color: WHITE });
  }

  /* ---------------- main column ---------------- */
  const main: Col = { page: 1, y: pad + 2 };
  const mx = sideW + pad;
  const mw = W - sideW - pad * 2;

  const mainHead = (t: string) => {
    main.y += 4;
    write(main, mx, mw, t.toUpperCase(), { size: 7, bold: true, color: ORANGE, gapAfter: 1.5, space: 0.7 });
  };

  const summary = `${name} is a ${profile.experienceLevel.toLowerCase()}-level candidate targeting ${profile.targetJobs}${
    profile.location ? `, based in ${profile.location}` : ""
  }.${cv.skills.length ? ` Listed strengths: ${cv.skills.join(", ")}.` : ""}`;

  mainHead("Profile");
  write(main, mx, mw, summary, { size: 8.5, color: BODY, gapAfter: 2 });

  if (cv.experience.length) {
    mainHead("Experience");
    for (const e of cv.experience) write(main, mx, mw, e, { size: 10, bold: true, color: TITLE, gapAfter: 2 });
  }
  if (cv.projects.length) {
    mainHead("Projects");
    for (const p of cv.projects) write(main, mx, mw, p, { size: 8.5, color: BODY, gapAfter: 1 });
  }
  if (cv.languages.length) {
    mainHead("Languages");
    for (const l of cv.languages) write(main, mx, mw, l, { size: 8.5, color: BODY, gapAfter: 1 });
  }

  return doc.output("blob");
}

/** Crop an image (blob/object URL) to a centered circle -> PNG data URL. */
export function photoToCircleDataUrl(src: string, size = 400): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) return reject(new Error("canvas unavailable"));
      const s = Math.min(img.width, img.height);
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("could not load photo"));
    img.src = src;
  });
}
