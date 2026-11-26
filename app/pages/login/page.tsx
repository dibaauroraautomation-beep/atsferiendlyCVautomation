"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/* Config                                                              */
/* ------------------------------------------------------------------ */
// Login + registration go through Supabase.
// n8n is only notified after an automated registration.
const WEBHOOK_BASE = "https://n8naurora.duckdns.org/webhook";
const AUTO_REGISTER_URL = `${WEBHOOK_BASE}/info-extract`;

// Where each type of user lands after login
const MANUAL_HOME = "/pages/Dashboard";
const AUTOMATED_HOME = "/pages/automatic-Dashboard";

const inputCls =
  "w-full px-3 py-2 text-sm text-slate-800 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 placeholder:text-slate-400";

type Msg = { text: string; type: "success" | "error" } | null;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
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
  const [regConfirm, setRegConfirm] = useState("");
  const [language, setLanguage] = useState("");
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [regMsg, setRegMsg] = useState<Msg>(null);

  // Automated registration
  const [autoFullName, setAutoFullName] = useState("");
  const [autoEmail, setAutoEmail] = useState("");
  const [autoPassword, setAutoPassword] = useState("");
  const [autoConfirm, setAutoConfirm] = useState("");
  const [autoLanguage, setAutoLanguage] = useState("");
  const [autoAgree, setAutoAgree] = useState(false);
  const [autoSubmitting, setAutoSubmitting] = useState(false);
  const [autoMsg, setAutoMsg] = useState<Msg>(null);

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
    setRegConfirm("");
    setLanguage("");
    setAgree(false);
    setRegMsg(null);

    setAutoFullName("");
    setAutoEmail("");
    setAutoPassword("");
    setAutoConfirm("");
    setAutoLanguage("");
    setAutoAgree(false);
    setAutoMsg(null);
  };

  const toggle = () => {
    resetAll();
    setIsRegister((p) => !p);
  };

  /** After a successful sign-up, send the user to the login form. */
  const goToLogin = async (email: string, hasSession: boolean) => {
    // Flow is "register, then log in", so end the auto-created session.
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

    // Which section did this user register from?
    // 1st choice: the "profiles" table. Fallback: the metadata saved at sign-up.
    let registrationType: string | undefined = data.user.user_metadata?.registration_type;
    const { data: profile } = await supabase
      .from("profiles")
      .select("registration_type")
      .eq("id", data.user.id)
      .single();
    if (profile?.registration_type) registrationType = profile.registration_type;

    // Save the type so the sidebar/layout can show only that section's pages
    const type = registrationType === "automated" ? "automated" : "manual";
    try {
      localStorage.setItem("registrationType", type);
      document.cookie = `registration_type=${type}; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`;
    } catch {
      /* storage blocked: the layout can still read user_metadata */
    }

    setLoginLoading(false);
    setLoginMsg({ text: "Logged in", type: "success" });
    router.replace(type === "automated" ? AUTOMATED_HOME : MANUAL_HOME);
    router.refresh();
  };

  /* ---------------- Manual registration ---------------- */
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (regPassword !== regConfirm) {
      setRegMsg({ text: "Passwords do not match.", type: "error" });
      return;
    }
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

  /* ---------------- Automated registration (no CV needed) ---------------- */
  const handleAutoRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (autoPassword !== autoConfirm) {
      setAutoMsg({ text: "Passwords do not match.", type: "error" });
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

    // 2) Notify n8n (account is already created, so a failure here does not block the user)
    try {
      const formData = new FormData();
      formData.append("user id", userId);
      formData.append("full name", fullName);
      formData.append("first name", first || "");
      formData.append("last name", rest.join(" "));
      formData.append("email", email);
      formData.append("password", autoPassword);
      formData.append("language", autoLanguage);
      formData.append("registration type", "automated");
      await fetch(AUTO_REGISTER_URL, { method: "POST", body: formData });
    } catch (err) {
      console.error("Automated registration request failed:", err);
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
                    <label className="block text-xs font-medium text-slate-700 mb-1">Confirm Password</label>
                    <PasswordField value={regConfirm} onChange={setRegConfirm} />
                    {regConfirm && regPassword !== regConfirm && (
                      <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Which language do you prefer for your CV?
                    </label>
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
                    disabled={!agree || submitting || regPassword !== regConfirm}
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

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">Confirm Password</label>
                    <PasswordField value={autoConfirm} onChange={setAutoConfirm} />
                    {autoConfirm && autoPassword !== autoConfirm && (
                      <p className="mt-1 text-xs text-red-600">Passwords do not match</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-700 mb-1">
                      Which language do you prefer for your CV?
                    </label>
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
                    disabled={!autoAgree || autoSubmitting || autoPassword !== autoConfirm}
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