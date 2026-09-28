# ATS Friendly CV — Web Application Documentation

**Version:** 1.0  
**Last Updated:** July 2026  
**Application Type:** AI-Powered Resume Optimization & Career Assistant  
**Frontend Framework:** Next.js 16 (App Router)  
**Backend Automation:** n8n Workflows  
**Language Support:** English, German (DE/EN)

---

# Part 1: User Manual

## 1. Overview

ATS Friendly CV is an all-in-one career platform that helps job seekers optimize their resumes for Applicant Tracking Systems (ATS), generate cover letters, prepare for interviews, track job applications, and analyze their market competitiveness. The application uses AI (Ollama LLM models) to evaluate resumes against specific job descriptions and provides actionable recommendations.

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Resume Generator** | Upload a resume + job description → receives ATS score, skills gap analysis, and an AI-rewritten CV |
| **Cover Letter Generator** | Upload a resume + paste job description → AI generates a tailored cover letter in EN or DE |
| **Interview Prep AI** | Upload a CV + job description → receives a comprehensive interview preparation guide with technical, behavioral, HR, and project-based questions |
| **Job Tracker** | Tracks all job applications with status (applied, review, interview, offer, reject) and key metrics |
| **Dashboard** | Overview page with analytics and AI-powered suggestions |

---

## 2. Getting Started

### 2.1 Registration

1. Navigate to the **Login** page from the landing page.
2. Click the **"Register"** tab.
3. Fill in:
   - **First Name**
   - **Last Name**
   - **Email Address**
   - **Password**
   - **Preferred Language** (English or German)
4. Click **Register**.
5. On success, you will see a confirmation message. Switch to the **Login** tab to sign in.

### 2.2 Login

1. Enter your **Email** and **Password**.
2. Click **Login**.
3. Upon successful authentication, you are redirected to the **Dashboard**.

### 2.3 Language Toggle

Use the language toggle button (EN/DE) in the top navigation bar or on the landing page to switch between English and German. All UI text and generated cover letters respect this setting.

---

## 3. Feature Walkthrough

### 3.1 Dashboard

The Dashboard provides a high-level overview:

- **Analytics Card** — Summary of job application metrics (Coming Soon)
- **AI Suggestions** — AI-driven career recommendations (Coming Soon)

---

### 3.2 Resume Generator

This is the core feature. It analyzes your resume against a job description and produces an ATS-optimized version.

**Step-by-step:**

1. **Upload Your Resume**
   - Click the upload area to select a file (PDF, DOC, or DOCX; max 10 MB).
   - Alternatively, click **"Import from Google Drive"** to pick a file from your Drive.

2. **Enter Job Details**
   - **Company** — Target company name
   - **Job Title** — Position you are applying for
   - **Location** — Job location
   - **Application Deadline** — Date of submission
   - **Job Description** — Paste the full job description text
   - **Language** — Desired language for the optimized CV (EN or DE)

3. **Analyze**
   - Click **"Analyze"** to start processing.
   - A job ID is generated and results are fetched asynchronously. This may take 30–60 seconds.

4. **Review Results**

   **ATS Score Card (0–100):**
   - Circular gauge showing overall ATS compatibility.
   - **Keyword Match Rate** — Percentage of JD keywords found in your resume.
   - **Match Category** — Excellent (85–100), Good (75–84), Fair (65–74), or Weak (<65).
   - **Keywords to Improve** — 3–4 specific keywords to add.
   - **Summary** — 2–3 sentence plain-language overview of your fit.

   **Score Breakdown:**
   - Keyword Match (0–40)
   - Section Completeness (0–20)
   - Contact Completeness (0–15)
   - Formatting Parseability (0–15)
   - Achievements Quality (0–10)

   **Skills Analysis:**
   - Matched Skills — JD skills your CV already demonstrates.
   - Missing Skills — JD skills absent from your CV.
   - Additional Skills — Your skills not asked for by the JD.

   **German Standard Compliance:**
   - Whether your CV meets German Lebenslauf standards (reverse-chronological, CEFR language levels, clean layout, clear dates).

   **Optimized CV:**
   - AI-rewritten resume preserving all factual information.
   - Preview in an embedded viewer.
   - Download as PDF or DOC, or open in a new tab.

---

### 3.3 Cover Letter Generator

Generates a professional, tailored cover letter.

**Step-by-step:**

1. **Upload Resume** — Same file picker as Resume Generator (local or Google Drive).
2. **Paste Job Description** — Full text of the target role.
3. **Select Language** — English or German (the output respects this setting).
4. **Generate** — Click the button and wait ~15–30 seconds.
5. **Review & Export:**
   - The generated letter appears in an editable text area.
   - Click **Download PDF** to export as PDF.
   - Click **Download DOCX** to export as Word document.

---

### 3.4 Interview Prep AI

Creates a personalized interview preparation guide based on your CV and the target job description.

**Step-by-step:**

1. **Upload CV** — Local file or Google Drive import.
2. **Paste Job Description** — Full text of the role.
3. **Generate** — Click to start. Results arrive in ~30–60 seconds.

**The preparation guide includes (all sections are generated):**

| Section | Content |
|---------|---------|
| **Interview Readiness Overview** | Strengths, weaknesses, overall readiness assessment |
| **Job Analysis** | Required/preferred skills, languages, frameworks, databases, cloud, DevOps, security, responsibilities, qualifications |
| **Key Topics to Study** | Priority-ranked topics with explanations |
| **Technical Questions (25)** | Beginner/Intermediate/Advanced with sample answers |
| **HR Questions (15)** | Career motivation, strengths, teamwork, goals |
| **Behavioral Questions (15)** | Scenario-based STAR-method answers |
| **Viva Questions (20)** | Rapid-fire Q&A for oral exams |
| **Project-Based Questions** | Specific to projects listed in your CV |
| **Coding Preparation** | Topics, algorithms, data structures, practice problems |
| **Missing Skills Preparation** | What to learn before the interview |
| **Practical Tasks** | Realistic assignments (coding, system design, debugging) |
| **Behavioral Preparation** | What interviewers evaluate, tips |
| **Company Expectation Summary** | What the employer wants based on JD |
| **Final Checklist** | Interactive to-do list |
| **Closing Message** | "Best of luck for your interview!" |

Each question section is collapsed by default for easy navigation. You can expand/collapse sections as needed.

---

### 3.5 Job Tracker

A visual dashboard for monitoring all job applications.

**Data Source:** A Google Sheet (shared with the application) stores all applications submitted via the Resume Generator.

**Metrics Displayed:**
- Total Jobs Applied
- Under Review
- Interview Stage
- Offers Received
- Rejected

**Status Badges:**
Each job entry has an interactive dropdown badge. Click to update the status:
- Applied
- Review
- Interview
- Offer
- Reject

**Table View:**
A scrollable table lists every application with columns for company, designation, location, date applied, JD, resume link, ATS score, skills needed, and status. Links to the stored resume (Google Drive) are clickable.

---

### 3.6 Settings

A placeholder page for future account settings and preferences.

### 3.7 About

A simple static page with information about the application.

---

## 4. Tips & Best Practices

- **Use the same language setting** throughout your session for consistent output.
- **Paste the complete job description** for the most accurate ATS analysis.
- **Review the "Keywords to Improve"** section and honestly incorporate those keywords into your resume if you have the corresponding experience.
- **Never fabricate skills** — the AI is instructed to preserve factual accuracy.
- **For German jobs**, ensure your CV uses CEFR language levels (e.g., German C1, English B2).
- **The Resume Generator automatically stores** your application data (job + resume link + ATS score) in the shared sheet visible in Job Tracker.

---

## 5. Troubleshooting

| Issue | Likely Cause | Solution |
|-------|-------------|----------|
| Analysis takes >2 minutes | Server queue / LLM processing delay | Refresh the page and re-submit. Check network connectivity. |
| "Please fill in all required fields" | Missing registration field | Ensure all fields (first name, last name, email, password, language) are filled. |
| "Invalid email or password" | Wrong credentials | Use the email you registered with. Register a new account if needed. |
| File upload fails | File >10 MB or wrong format | Use PDF, DOC, or DOCX under 10 MB. |
| Google Drive import fails | OAuth popup blocked | Allow popups for this site. |
| Optimized CV looks empty | Unparseable resume (scanned image) | Use a text-based PDF (not a scanned image). |

---

# Part 2: Technical Description

## 1. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        CLIENT (Browser)                             │
│                                                                     │
│  Next.js 16 App (React 19) ─── Tailwind CSS v4 ─── TypeScript       │
│                                                                     │
│  ┌──────────┐  ┌──────────────┐  ┌───────────────┐                  │
│  │ Landing  │  │  Auth Pages  │  │ Feature Pages │                  │
│  │ Page     │  │ (Login/Reg)  │  │ (Resume, CV,  │                  │
│  │          │  │              │  │  Interview,   │                  │
│  │          │  │              │  │  Tracker)     │                  │
│  └──────────┘  └──────────────┘  └───────┬───────┘                  │
│                                          │                          │
│  ┌───────────────────────────────────────┴─────────────────────┐    │
│  │              Next.js API Routes (Route Handlers)             │    │
│  │  /webhook-callback    /job-status/[id]   /submit-resume     │    │
│  │  /start-interview     /api/drive/auth    /api/drive/callback│    │
│  └───────────────────────────────────────┬─────────────────────┘    │
│                                          │                          │
│  ┌───────────────────────────────────────┴─────────────────────┐    │
│  │              External HTTP Requests                          │    │
│  │  n8n Cloud Webhooks    Google OAuth    Google Drive API     │    │
│  │  Google Sheets (CSV)   Ollama (via n8n)                     │    │
│  └─────────────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│                   n8n WORKFLOW AUTOMATION                           │
│                                                                     │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐            │
│  │ Resume   │  │Interview │  │ Auth     │  │ Cover    │            │
│  │ Pipeline │  │ Pipeline │  │ Pipeline │  │ Letter   │            │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘            │
│       │              │              │              │                │
│       ▼              ▼              ▼              ▼                │
│  ┌──────────────────────────────────────────────────────────┐       │
│  │           External Services Layer                        │       │
│  │  Google Drive    Google Sheets    Ollama (qwen2.5:7b)   │       │
│  │                                qwen2.5-coder:7b         │       │
│  └──────────────────────────────────────────────────────────┘       │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Frontend Architecture

### 2.1 Tech Stack

| Technology | Version | Purpose |
|-----------|---------|---------|
| Next.js | 16.2.9 | React framework with App Router |
| React | 19.2.4 | UI library |
| TypeScript | ~5.x | Type safety |
| Tailwind CSS | 4.x | Utility-first styling |
| Papaparse | 5.x | CSV parsing (Job Tracker) |
| jsPDF | 4.x | PDF export (Cover Letter) |
| docx + file-saver | 9.x | DOCX export (Cover Letter) |
| react-icons | ~5.x | Icon library (Job Tracker) |

### 2.2 Directory Structure

```
app/
├── layout.tsx                    # Root server layout
├── ClientLayout.tsx              # Client wrapper (LanguageProvider)
├── page.tsx                      # Landing page
├── globals.css                   # Global Tailwind styles
├── contexts/
│   ├── LanguageContext.tsx        # i18n context + provider
│   └── translations.ts           # EN/DE translation dictionary (~150 keys)
├── hooks/
│   └── useGoogleDrivePicker.ts   # Google Drive file picker integration
├── components/
│   ├── navAndSidebar.tsx         # Primary app layout (sidebar + top nav)
│   ├── FeatureCard.tsx           # Reusable card component
│   ├── GoogleSheetReader.tsx     # CSV fetch + parse for Job Tracker
│   ├── IneractiveBadge.tsx       # Status dropdown for Job Tracker
│   ├── jsPDF.tsx                 # Cover letter PDF export logic
│   ├── DocxGenerator.tsx         # Cover letter DOCX export logic
│   └── ats/
│       ├── NotificationBell.jsx  # Bell icon (unused)
│       ├── ScoreBar.jsx          # Score progress bar (unused)
│       └── ScoreBar.css
├── api/
│   └── drive/
│       ├── auth/route.ts         # PKCE OAuth initiation
│       └── callback/route.ts     # OAuth code exchange + postMessage
└── pages/
    ├── Dashboard/page.tsx
    ├── Resume_Generator/
    │   ├── page.tsx              # Main page component
    │   └── api/
    │       ├── _store.ts         # In-memory job state store
    │       ├── submit-resume/route.ts
    │       ├── job-status/[jobId]/route.ts
    │       ├── webhook-callback/route.ts
    │       └── pdf-proxy/route.ts
    ├── coverLetterGenerator/page.tsx
    ├── Interview_Prep_AI/
    │   ├── page.tsx
    │   └── api/
    │       ├── _store.ts
    │       ├── start-interview/route.ts
    │       ├── job-status/[jobId]/route.ts
    │       └── webhook-callback/route.ts
    ├── Job_Tracker/page.tsx
    ├── login/page.tsx
    ├── about/page.tsx
    └── setting/page.tsx
```

### 2.3 Client-Side Data Flow

#### Pattern A: Synchronous (Direct)
```
User Action → Page Component → fetch(n8n webhook URL) → Response → Render
```
Used for: Login, Registration, Cover Letter, Job Tracker status updates.

#### Pattern B: Asynchronous with Polling
```
User Action → Page Component → fetch(Next.js API Route)
  → API Route creates jobId, stores in Map, forwards to n8n (fire-and-forget)
  → Returns { jobId } to client
  → Client polls GET /api/.../job-status/[jobId] every 3s
  → When status === "completed", client renders result
  → Timeout after 20 minutes
```
Used for: Resume Generator, Interview Prep AI.

#### Pattern C: Google Drive OAuth Flow
```
User clicks "Import from Google Drive"
  → window.open(/api/drive/auth)
  → Server generates PKCE challenge, sets httpOnly cookies
  → Redirects to Google OAuth consent screen
  → Google redirects to /api/drive/callback
  → Server exchanges code for token
  → Server sends token to opener via postMessage
  → Opener receives token, loads Google Picker API
  → User selects file → file downloaded as File object
```

### 2.4 Internationalization

- **Context:** `LanguageContext.tsx` provides `useLanguage()` and `useT()` hooks.
- **Translations:** `translations.ts` exports a plain object keyed by language (`en`, `de`).
- **Default:** English.
- **Persistence:** Language choice is stored in React state (resets on page refresh; persisted via localStorage in the nav component).
- **Scope:** All UI labels, navigation items, and generated cover letter text respect the language setting.

---

## 3. Backend Architecture (n8n Workflows)

### 3.1 Data Store: Google Sheets

**Spreadsheet ID:** `1_Uq1xvIv1HkQ-5OabwIjEVSiKcAOvLNqsy-UjAfJqN4`

| Sheet (Tab) | GID | Purpose |
|-------------|-----|---------|
| `Sheet1` (resume) | `0` | Job applications — metadata, ATS results, edited CV HTML |
| `interview` | `1441719057` | Interview prep requests — JD and generated prep content |
| `login` | `744129216` | User accounts — first name, last name, email, password, language |

### 3.2 Workflow 1: Resume Analysis & Optimization

**Webhook:** `POST /webhook/user-info`

**Input Payload:**
```json
{
  "resume": "<binary PDF/DOCX file>",
  "uniqueId": "<string>",
  "jobTitle": "<string>",
  "location": "<string>",
  "description": "<full job description text>",
  "company": "<string>",
  "deadline": "<date string>",
  "language": "en|de"
}
```

**Pipeline Stages:**

| Step | Node | Description |
|------|------|-------------|
| 1 | **Webhook** | Receives incoming POST request |
| 2 | **Google Drive (Upload)** | Saves the uploaded resume file to folder `15xTxiniQlxgHY9PSwj-6u__TRoMoYUe5` (ATS Friendly CV) with filename `old resume- {deadline}` |
| 3 | **Google Sheets (Append/Update)** | Records job metadata: uniqueId, jobTitle, location, JD, resume link (from Drive), company, date applied. Matching column: `uniqueId` |
| 4 | **Google Drive (Download)** | Downloads the file back using the uploaded file ID |
| 5 | **Extract from File (PDF)** | Extracts raw text content from the PDF |
| 6 | **Code (JavaScript)** | Pre-analyzes the CV text: detects email, phone, LinkedIn, GitHub, sections (experience/education/skills), quantifies action verbs, computes formatting quality flags, calculates a deterministic baseline ATS score (0–100) |
| 7 | **Basic LLM Chain** | Sends to Ollama `qwen2.5:7b` with the CV text, job description, and parser flags. The LLM evaluates using a structured prompt producing a JSON object with: `ats_score`, `match_category`, `score_breakdown`, `keyword_match_rate`, `german_standard_compliance`, `skills_analysis`, `keywords_to_improve_ats`, `top_recommendations`, `summary` |
| 8 | **AI Agent** | Sends to Ollama `qwen2.5-coder:7b` with the LLM evaluation output + original resume + JD. The agent rewrites the resume into an ATS-optimized version, preserving all facts, and outputs a strict JSON schema (name, title, location, contact, experience, education, skills, certifications, projects, languages, awards, publications, volunteer). Language rules: if language=`de`, all descriptive fields are in German; if `en`, all in English |
| 9 | **Code (JavaScript) 1** | Transforms the AI Agent JSON output into clean ATS-friendly HTML with embedded CSS. Responsive, no tables/graphics/emojis. All fields rendered with proper formatting |
| 10 | **Google Sheets (Append/Update) 1** | Updates the same row (matched by `uniqueId`) with: ATS Score, Skills needed, Edited CV (HTML), match category, keywords |
| 11 | **Respond to Webhook** | Returns final result |

### 3.3 Workflow 2: Interview Preparation

**Webhook:** `POST /webhook/interview`

**Input Payload:**
```json
{
  "cv": "<binary PDF/DOCX file>",
  "uniqueId": "<string>",
  "jobDescription": "<full job description text>"
}
```

**Pipeline Stages:**

| Step | Node | Description |
|------|------|-------------|
| 1 | **Webhook1** | Receives incoming POST |
| 2 | **Google Drive (Upload) 2** | Saves CV to same folder with filename `old resume- {uniqueId}` |
| 3 | **Google Sheets (Append/Update) 2** | Records uniqueId + JD in `interview` sheet |
| 4 | **Google Drive (Download) 1** | Downloads file |
| 5 | **Extract from File 1** | Extracts text from PDF |
| 6 | **Basic LLM Chain 1** | Sends CV text + JD to Ollama `qwen2.5:7b` with a comprehensive interview prep prompt. Produces a large JSON object containing: readiness overview, job analysis, key topics, technical questions (25), HR questions (15), behavioral questions (15), viva questions (20), project questions, coding prep, missing skills, practical tasks, behavioral prep, company expectations, final checklist |
| 7 | **Respond to Webhook 1** | Returns the generated JSON |
| 8 | **Google Sheets (Append/Update) 3** | Updates the `interview` sheet row (matched by uniqueId) with the full Prep JSON |

### 3.4 Workflow 3: User Registration

**Webhook:** `POST /webhook/register-button`

**Input Payload:**
```json
{
  "firstName": "<string>",
  "lastName": "<string>",
  "email": "<string>",
  "password": "<string>",
  "language": "en|de"
}
```

**Pipeline:**

| Step | Node | Description |
|------|------|-------------|
| 1 | **Webhook3** | Receives POST |
| 2 | **Check Required Fields (IF)** | Validates that all 5 fields are non-empty |
| 3a | **Append row in sheet1** (if all fields present) | Appends a new row to `login` sheet |
| 4a | **Edit Fields2** | Sets `{"status": "successfully registered"}` |
| 5a | **Respond to Webhook3** | Returns success response |
| 3b | **Edit Fields3** (if fields missing) | Sets `{"status": "Error! Please register again"}` |
| 4b | **Respond Missing Fields** | Returns error response |

### 3.5 Workflow 4: User Login

**Webhook:** `POST /webhook/login-page`

**Input Payload:**
```json
{
  "email": "<string>",
  "password": "<string>"
}
```

**Pipeline:**

| Step | Node | Description |
|------|------|-------------|
| 1 | **Webhook2** | Receives POST |
| 2 | **Google Sheets (Get rows)** | Looks up the `login` sheet filtering by email |
| 3 | **IF (password check)** | Compares stored password vs. submitted password |
| 4a | **Edit Fields** (match) | Sets `{"status": "successfully logged in"}` |
| 5a | **Respond to Webhook2** | Returns success |
| 4b | **Edit Fields1** (no match) | Sets `{"status": "Invalid email or password"}` |
| 5b | **Respond to Webhook4** | Returns error |

---

## 4. AI / LLM Integration

### 4.1 Models

| Model | Node(s) | Purpose |
|-------|---------|---------|
| `qwen2.5:7b` | Ollama Chat Model, Ollama Chat Model2 | ATS evaluation, Interview prep generation (both prompt-based LLM chains) |
| `qwen2.5-coder:7b` | Ollama Chat Model1 | Resume rewriting (used as a LangChain agent with a complex system prompt) |

### 4.2 Prompt Architecture

**ATS Evaluation Prompt:**
- Defines a systematic method: extract JD skills → classify as required/preferred → match against CV → compute scores → produce match category → generate recommendations.
- Enforces skill synonym normalization (JS=JavaScript, k8s=Kubernetes, etc.).
- Output schema is strict JSON with no markdown, no extra text.

**Resume Rewriting Prompt:**
- Uses system override for language control (EN vs DE).
- Enforces strict fact preservation — never invent companies, degrees, skills, or metrics.
- Generates HTML-friendly JSON schema output.
- Includes validation rules before returning.

**Interview Prep Prompt:**
- Two-message interaction: first the user message with CV+JD, then an AI acknowledgment message with detailed method instructions.
- Generates ~75+ questions across 7 categories plus coding prep, missing skills, practical tasks, checklist.
- Output is a 20+ field JSON object.

### 4.3 Context Window

All Ollama model nodes use `numCtx: 16384` (16K context window), formatted as JSON.

---

## 5. External API Dependencies

| Service | Authentication | Usage |
|---------|---------------|-------|
| **n8n Cloud** (`hasan123a.app.n8n.cloud`) | None (public webhooks) | All workflow triggers |
| **Google Drive API** | OAuth 2.0 (PKCE flow) | Upload/download resume files |
| **Google Sheets API** | OAuth 2.0 | Read/write application data, auth data |
| **Google OAuth 2.0** | OAuth 2.0 | User identity for Drive access |
| **Ollama** (local server via n8n) | API key `tawwgOZ4UHMlBY7p` | LLM inference |

### OAuth Configuration

- **Client ID:** The frontend initiates PKCE OAuth via the Next.js route handler.
- **Scopes:** `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/drive.readonly`
- **Token Storage:** Access token is returned to browser via `postMessage`; managed client-side (not persisted).

---

## 6. Security Considerations

- **Authentication:** Password-based with plain-text storage in Google Sheets. No hashing, salts, or sessions. This is the current implementation and should be upgraded to a proper auth provider (Auth0, Firebase Auth, NextAuth.js) for production.
- **No JWT or Session Tokens:** The "session" is simulated via `localStorage` containing the user's email. This is trivially spoofed.
- **n8n Webhooks:** Publicly accessible without authentication. Anyone who knows the webhook URL can submit data.
- **Google OAuth:** Implemented correctly with PKCE and httpOnly cookies for the code verifier.
- **Plain-text passwords:** Google Sheets stores passwords in plain text. **Critical security issue** that must be addressed before production use.
- **n8n credential IDs:** Exposed in the workflow JSON. These should be kept confidential.

---

## 7. Performance Considerations

- **LLM latency:** Each resume analysis requires two sequential LLM calls (evaluation + rewriting) plus JS processing. Typical response time: 30–90 seconds.
- **Polling mechanism:** Client polls every 3 seconds with a 20-minute timeout. Suitable for low-traffic usage.
- **In-memory job store:** The `_store.ts` modules use a plain JavaScript `Map`. All jobs are lost on server restart. No persistence.
- **File size limit:** 10 MB for uploads. PDF text extraction works best with text-based PDFs (not scanned images).

---

## 8. Data Model

### 8.1 Google Sheet: Sheet1 (resume) — GID=0

| Column | Source | Description |
|--------|--------|-------------|
| uniqueId | Webhook body | Unique identifier for the job application |
| Company | Webhook body | Employer name |
| Designation | Webhook body | Job title |
| Location | Webhook body | Job location |
| JD | Webhook body | Full job description text |
| Date Applied | Webhook body | Submission date/deadline |
| Resume Link | Upload file node | Google Drive webViewLink to uploaded resume |
| ATS Score | LLM Chain output | Integer 0–100 |
| match category | LLM Chain output | excellent/good/fair/weak match |
| keyword | LLM Chain output | Keywords to improve ATS (JSON array) |
| Skills needed | LLM Chain output | Skills analysis JSON object |
| Edited Cv | Code node HTML output | ATS-optimized resume as HTML string |

### 8.2 Google Sheet: interview — GID=1441719057

| Column | Source | Description |
|--------|--------|-------------|
| UniqueId | Webhook body | Unique identifier |
| JD | Webhook body | Job description text |
| Prep | Basic LLM Chain1 output | Full interview prep JSON object |

### 8.3 Google Sheet: login — GID=744129216

| Column | Source | Description |
|--------|--------|-------------|
| first name | Registration form | User's first name |
| last name | Registration form | User's last name |
| email | Registration form | User's email (used as login ID) |
| password | Registration form | Plain-text password |
| language | Registration form | Preferred language (en/de) |

---

## 9. Deployment

### 9.1 Frontend (Next.js)

The application is configured for deployment on **Vercel** (`.vercel` directory present).

**Build command:** `npm run build`  
**Dev command:** `npm run dev`  
**Start command:** `npm start`

### 9.2 Backend (n8n)

The workflows run on **n8n Cloud** at `https://hasan123a.app.n8n.cloud`. Workflow definitions can be imported via the n8n UI using the provided JSON.

### 9.3 Environment Variables

Required variables (from `next.config.ts` and code):
- `NEXT_PUBLIC_N8N_BASE_URL` (or similar) — currently hardcoded to the n8n cloud URL
- Google OAuth client credentials (embedded in route handler code)

---

## 10. Implementation Checklist (for reproducing this system)

To re-implement this application from scratch:

**Frontend:**
1. Initialize a Next.js 16 project with TypeScript and Tailwind CSS v4
2. Implement LanguageContext with EN/DE translations
3. Build the NavAndSidebar layout with mobile responsiveness
4. Create FeatureCard reusable component
5. Implement pages: Landing, Login/Register, Dashboard, Resume Generator, Cover Letter Generator, Interview Prep AI, Job Tracker, About, Settings
6. For Resume Generator and Interview Prep: implement async job submission with polling
7. For Job Tracker: implement Google Sheet CSV fetching with PapaParse
8. For Cover Letter: implement jsPDF and docx export
9. Implement Google Drive OAuth PKCE flow via Next.js API routes
10. Implement `useGoogleDrivePicker` hook

**Backend (n8n):**
1. Create three Google Sheets tabs: resume (GID=0), interview (GID=1441719057), login (GID=744129216)
2. Create a Google Drive folder for resume storage
3. Set up Ollama with `qwen2.5:7b` and `qwen2.5-coder:7b` models
4. Configure Google Drive and Google Sheets OAuth 2.0 credentials in n8n
5. Import and configure the four workflows
6. Set up webhook endpoints and point the frontend to them

---

## 11. Known Issues & Future Improvements

| Issue | Impact | Suggested Fix |
|-------|--------|---------------|
| Plain-text passwords in Google Sheets | Critical security | Use bcrypt hashing + proper auth provider |
| No session management | Spoofable identity | Implement JWT + httpOnly cookies |
| Public n8n webhooks | Unauthorized access | Add API key validation or IP whitelisting |
| In-memory job store | Lost data on restart | Use Redis or database-backed store |
| No rate limiting | Abuse potential | Add rate limiting on Next.js API routes |
| Cover letter uses GET with query params | URL length limits | Convert to POST request |
| Missing error boundaries | Poor UX on crash | Add React error boundaries |
| No loading skeletons | Janky UX | Add skeleton loading states |
| ScoreBar and NotificationBell are unused | Dead code | Remove or integrate into UI |
| n8n cloud URL hardcoded in multiple files | Deployment friction | Centralize in environment variable |
