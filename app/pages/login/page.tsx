"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
// Login + registration now go through Supabase.
// n8n is only used to ANALYZE the CV in automated registration.
const WEBHOOK_BASE = "https://n8naurora.duckdns.org/webhook";
const AUTO_REGISTER_URL = `${WEBHOOK_BASE}/register-automated`;

const CV_BUCKET = "cvs";

// Where each type of user lands after login
const MANUAL_HOME = "/pages/Dashboard";
const AUTOMATED_HOME = "/pages/automatic-Dashboard";

const ALLOWED_EXT = [".pdf", ".doc", ".docx"];
const MAX_FILE_MB = 5;

const inputCls =
  "w-full px-3 py-2 text-sm text-slate-800 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 placeholder:text-slate-400";

type Msg = { text: string; type: "success" | "error" } | null;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const validateFile = (file: File): string | null => {
  const name = file.name.toLowerCase();
  if (!ALLOWED_EXT.some((ext) => name.endsWith(ext))) {
    return "Unsupported file type. Upload a PDF, DOC or DOCX file.";
  }
  if (file.size > MAX_FILE_MB * 1024 * 1024) {
    return `File is too large. The maximum size is ${MAX_FILE_MB} MB.`;
  }
  return null;
};

const formatSize = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

function MessageBox({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <div
      className={`p-3 rounded-lg border text-sm font-medium text-center ${
        msg.type === "success"
          ? "bg-emerald-50 border-emerald-200 text-emerald-700"
          : "bg-red-50 border-red-200 text-red-600"
      }`}
    >
      {msg.text}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Small shared components                                             */
/* ------------------------------------------------------------------ */
function PasswordField({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? "text" : "password"}
        required
        minLength={6}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="••••••••"
        className={`${inputCls} pr-10`}
      />
      <button
        type="button"
        onClick={() => setShow((p) => !p)}
        aria-label={show ? "Hide password" : "Show password"}
        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
      >
        {show ? (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 0 0 1.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0 1 12 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 0 1-4.293 5.774M6.228 6.228 3 3m3.228 3.228 3.65 3.65m7.894 7.894L21 21m-3.228-3.228-3.65-3.65m0 0a3 3 0 1 0-4.243-4.243m4.242 4.242L9.88 9.88" />
          </svg>
        ) : (
          <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="1.8" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 0 1 0-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178Z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
          </svg>
        )}
      </button>
    </div>
  );
}

function LanguageSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <select
      required
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${inputCls} bg-white`}
    >
      <option value="">Select language</option>
      <option value="english">English</option>
      <option value="german">Deutsch</option>
    </select>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */
export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();

  const [isRegister, setIsRegister] = useState(false);
  const [regMode, setRegMode] = useState<"manual" | "automated">("manual");

  // Login
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [loginMsg, setLoginMsg] = useState<Msg>(null);
  const [loginLoading, setLoginLoading] = useState(false);

  // Manual registration
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [language, setLanguage] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [regMsg, setRegMsg] = useState<Msg>(null);

  // Automated registration
  const [autoFullName, setAutoFullName] = useState("");
  const [autoEmail, setAutoEmail] = useState("");
  const [autoPassword, setAutoPassword] = useState("");
  const [autoLanguage, setAutoLanguage] = useState("");
  const [autoAgree, setAutoAgree] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [autoMsg, setAutoMsg] = useState<Msg>(null);
  const [cvFile, setCvFile] = useState<File | null>(null);
  const [cvError, setCvError] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  /* ---------------- Reset everything ---------------- */
  const resetAll = () => {
    setRegMode("manual");

    setLoginEmail("");
    setLoginPassword("");
    setLoginMsg(null);

    setFirstName("");
    setLastName("");
    setRegEmail("");
    setRegPassword("");
    setLanguage("");
    setAgree(false);
    setRegMsg(null);

    setAutoFullName("");
    setAutoEmail("");
    setAutoPassword("");
    setAutoLanguage("");
    setAutoAgree(false);
    setAutoMsg(null);
    setCvFile(null);
    setCvError("");
    setDragActive(false);
  };

  const toggle = () => {
    resetAll();
    setIsRegister((p) => !p);
  };

  /** After a successful sign-up, send the user to the login form. */
  const goToLogin = async (email: string, hasSession: boolean) => {
    // Your flow is "register, then log in", so end the auto-created session.
    if (hasSession) await supabase.auth.signOut();
    resetAll();
    setIsRegister(false);
    setLoginEmail(email);
    setLoginMsg(
      hasSession
        ? { text: "Account created. Please sign in.", type: "success" }
        : { text: "Account created. Confirm your email from your inbox, then sign in.", type: "success" }
    );
  };

  /* ---------------- Login ---------------- */
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginLoading(true);
    setLoginMsg(null);

    const { data, error } = await supabase.auth.signInWithPassword({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (error || !data.user) {
      setLoginLoading(false);
      setLoginMsg({ text: error?.message ?? "Login failed. Try again.", type: "error" });
      return;
    }

    // Decide which dashboard to open.
    // 1st choice: the "profiles" table. Fallback: the metadata saved at sign-up.
    let registrationType: string | undefined = data.user.user_metadata?.registration_type;
    const { data: profile } = await supabase
      .from("profiles")
      .select("registration_type")
      .eq("id", data.user.id)
      .single();
    if (profile?.registration_type) registrationType = profile.registration_type;

    setLoginLoading(false);
    setLoginMsg({ text: "Logged in", type: "success" });
    router.replace(registrationType === "automated" ? AUTOMATED_HOME : MANUAL_HOME);
    router.refresh();
  };

  /* ---------------- Manual registration ---------------- */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setRegMsg(null);

    const email = regEmail.trim();
    const { data, error } = await supabase.auth.signUp({
      email,
      password: regPassword,
      options: {
        // Stored in auth metadata; the SQL trigger copies it into "profiles".
        data: {
          first_name: firstName.trim(),
          last_name: lastName.trim(),
          language,
          registration_type: "manual",
        },
      },
    });

    if (error) {
      setRegMsg({ text: error.message, type: "error" });
      setSubmitting(false);
      return;
    }
    // With email confirmation ON, an existing email returns a user with no identities.
    if (data.user && data.user.identities?.length === 0) {
      setRegMsg({ text: "An account with this email already exists.", type: "error" });
      setSubmitting(false);
      return;
    }

    setSubmitting(false);
    await goToLogin(email, !!data.session);
  };

  /* ---------------- Automated registration ---------------- */
  const handleFile = (file: File) => {
    const error = validateFile(file);
    if (error) {
      setCvFile(null);
      setCvError(error);
      return;
    }
    setCvFile(file);
    setCvError("");
    setAutoMsg(null);
  };

  const removeFile = () => {
    setCvFile(null);
    setCvError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(true);
  };

  const onDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
    setDragActive(false);
  };

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragActive(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleAutoRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cvFile) {
      setCvError("Upload your CV to continue.");
      return;
    }
    setAutoSubmitting(true);
    setAutoMsg(null);

    const email = autoEmail.trim();
    const fullName = autoFullName.trim();
    const [first, ...rest] = fullName.split(/\s+/);

    // 1) Create the account in Supabase
    const { data, error } = await supabase.auth.signUp({
      email,
      password: autoPassword,
      options: {
        data: {
          first_name: first || "",
          last_name: rest.join(" "),
          language: autoLanguage,
          registration_type: "automated",
        },
      },
    });

    if (error) {
      setAutoMsg({ text: error.message, type: "error" });
      setAutoSubmitting(false);
      return;
    }
    if (data.user && data.user.identities?.length === 0) {
      setAutoMsg({ text: "An account with this email already exists.", type: "error" });
      setAutoSubmitting(false);
      return;
    }

    const userId = data.user?.id ?? "";
    let cvPath = "";

    // 2) Upload the CV into the user's own folder: cvs/<userId>/<file>
    //    Only possible when sign-up returned a session (email confirmation OFF).
    if (data.session && userId) {
      const safeName = cvFile.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${userId}/${Date.now()}_${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from(CV_BUCKET)
        .upload(path, cvFile, { upsert: true, contentType: cvFile.type || undefined });

      if (uploadError) {
        console.error("CV upload failed:", uploadError.message);
      } else {
        cvPath = path;
        await supabase.from("profiles").update({ cv_path: path }).eq("id", userId);
      }
    }

    // 3) Send the CV to n8n for analysis (no password is sent anymore)
    try {
      const formData = new FormData();
      formData.append("user id", userId);
      formData.append("full name", fullName);
      formData.append("first name", first || "");
      formData.append("last name", rest.join(" "));
      formData.append("email", email);
      formData.append("language", autoLanguage);
      formData.append("registration type", "automated");
      formData.append("cv path", cvPath);
      formData.append("cv", cvFile, cvFile.name);
      await fetch(AUTO_REGISTER_URL, { method: "POST", body: formData });
    } catch (err) {
      // Account is already created, so we don't block the user here.
      console.error("CV analysis request failed:", err);
    }

    setAutoSubmitting(false);
    await goToLogin(email, !!data.session);
  };

  /* ---------------- Render ---------------- */
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-white flex items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-12 h-12 mx-auto rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center mb-4">
            <svg className="w-7 h-7 text-white" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2 3 7v6c0 4.5 3.8 8.3 9 9 5.2-.7 9-4.5 9-9V7l-9-5Zm0 4.2 5 2.8v4c0 3-2.2 5.6-5 6.1-2.8-.5-5-3.1-5-6.1V9l5-2.8Z" />
            </svg>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-800">CareerAI</h1>
          <p className="text-sm text-slate-400 mt-1">
            {isRegister ? "Create your account" : "Sign in to your account"}
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-8">
          {isRegister ? (
            <div className="space-y-5">
              {/* Manual / Automated tabs */}
              <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 rounded-xl" role="tablist">
                {(["manual", "automated"] as const).map((mode) => (
                  <button
                    key={mode}
                    type="button"
                    role="tab"
                    aria-selected={regMode === mode}
                    onClick={() => setRegMode(mode)}
                    className={`py-2 text-sm font-medium rounded-lg transition ${
                      regMode === mode
                        ? "bg-gradient-to-r from-indigo-600 to-blue-600 text-white shadow-sm"
                        : "text-slate-600 hover:text-slate-800"
                    }`}
                  >
                    {mode === "manual" ? "Manual Registration" : "Automated Registration"}
                  </button>
                ))}
              </div>

              {regMode === "manual" ? (
                /* ---------------- Manual form ---------------- */
                <form onSubmit={handleRegister} className="space-y-4">
                  <MessageBox msg={regMsg} />
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">First Name</label>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        placeholder="John"
                        className={inputCls}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Last Name</label>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        placeholder="Doe"
                        className={inputCls}
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={regEmail}
                      onChange={(e) => setRegEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                    <PasswordField value={regPassword} onChange={setRegPassword} />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Which language do you prefer for your CV?</label>
                    <LanguageSelect value={language} onChange={setLanguage} />
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={agree}
                      onChange={(e) => setAgree(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-500 leading-relaxed">
                      I agree to submit all information
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={!agree || submitting}
                    className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition shadow-sm"
                  >
                    {submitting ? "Registering..." : "Register"}
                  </button>
                </form>
              ) : (
                /* ---------------- Automated form ---------------- */
                <form onSubmit={handleAutoRegister} className="space-y-4">
                  <MessageBox msg={autoMsg} />

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      required
                      value={autoFullName}
                      onChange={(e) => setAutoFullName(e.target.value)}
                      placeholder="John Doe"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                    <input
                      type="email"
                      required
                      value={autoEmail}
                      onChange={(e) => setAutoEmail(e.target.value)}
                      placeholder="you@example.com"
                      className={inputCls}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                    <PasswordField value={autoPassword} onChange={setAutoPassword} />
                  </div>

                  {/* CV upload */}
                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">CV Upload</label>
                    <div
                      onDragOver={onDragOver}
                      onDragEnter={onDragOver}
                      onDragLeave={onDragLeave}
                      onDrop={onDrop}
                      className={`flex flex-wrap items-center justify-center gap-3 px-4 py-6 rounded-xl border-2 border-dashed transition ${
                        dragActive
                          ? "border-indigo-400 bg-indigo-50"
                          : cvError
                          ? "border-red-300 bg-red-50/40"
                          : "border-slate-300 bg-white"
                      }`}
                    >
                      <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                      </svg>
                      <span className="text-sm text-slate-600">Drag &amp; drop your CV or</span>
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-3 py-1.5 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition"
                      >
                        Browse File
                      </button>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                        onChange={onFileInputChange}
                        className="hidden"
                      />
                    </div>
                    <p className="mt-1.5 text-xs text-slate-400">
                      PDF, DOC or DOCX, up to {MAX_FILE_MB} MB.
                    </p>
                    {cvError && <p className="mt-1 text-xs text-red-600">{cvError}</p>}
                  </div>

                  {/* Uploaded file row */}
                  {cvFile && (
                    <div>
                      <label className="block text-xs font-medium text-slate-700 mb-1">Uploaded CV</label>
                      <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-slate-100 border border-slate-200">
                        <svg className="w-5 h-5 shrink-0 text-slate-500" fill="none" stroke="currentColor" strokeWidth="1.6" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                        </svg>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-slate-800 truncate">{cvFile.name}</p>
                          <p className="text-xs text-slate-400">{formatSize(cvFile.size)}</p>
                        </div>
                        <span className="flex items-center gap-1 text-xs font-medium text-emerald-600 whitespace-nowrap">
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          Ready to upload
                        </span>
                        {!autoSubmitting && (
                          <button
                            type="button"
                            onClick={removeFile}
                            aria-label="Remove CV"
                            className="text-slate-400 hover:text-slate-600"
                          >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-500 leading-relaxed">
                    Your CV will be analyzed to extract your skills, experience, education and career preferences for automated job matching.
                  </p>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Which language do you prefer for your CV?</label>
                    <LanguageSelect value={autoLanguage} onChange={setAutoLanguage} />
                  </div>

                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoAgree}
                      onChange={(e) => setAutoAgree(e.target.checked)}
                      className="w-4 h-4 mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="text-xs text-slate-500 leading-relaxed">
                      I agree to submit all information
                    </span>
                  </label>

                  <button
                    type="submit"
                    disabled={!autoAgree || !cvFile || autoSubmitting}
                    className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition shadow-sm"
                  >
                    {autoSubmitting ? "Creating account..." : "Create Automated Account"}
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* ---------------- Login form ---------------- */
            <form onSubmit={handleLogin} className="space-y-4">
              <MessageBox msg={loginMsg} />
              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={loginEmail}
                  onChange={(e) => setLoginEmail(e.target.value)}
                  placeholder="you@example.com"
                  className={inputCls}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-700 mb-1">Password</label>
                <PasswordField value={loginPassword} onChange={setLoginPassword} />
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition shadow-sm"
              >
                {loginLoading ? "Signing in..." : "Sign In"}
              </button>
            </form>
          )}

          <div className="mt-6 text-center">
            <p className="text-xs text-slate-400">
              {isRegister ? "Already have an account?" : "Don't have an account?"}{" "}
              <button
                type="button"
                onClick={toggle}
                className="font-medium text-indigo-600 hover:text-indigo-700 transition"
              >
                {isRegister ? "Sign In" : "Register"}
              </button>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}