"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { cn } from "@/lib/utils";

const mono = "font-mono text-[10.5px] uppercase tracking-[0.14em]";
const display = "font-display font-medium tracking-[-0.05em]";

const slide = {
  enter: (d: number) => ({ x: d * 28, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (d: number) => ({ x: d * -28, opacity: 0 }),
};

const labels = ["", "Weak", "Fair", "Good", "Strong"];
const score = (p: string) =>
  p ? [p.length >= 8, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^a-zA-Z0-9]/.test(p)].filter(Boolean).length : 0;

type Errors = Partial<Record<"email" | "pw" | "pw2", string>>;

export function AuthCard({ signup, onToggle }: { signup: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [done, setDone] = useState(false);
  const [google, setGoogle] = useState(false);
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ email: "", pw: "", pw2: "" });
  const [err, setErr] = useState<Errors>({});
  const [dir, setDir] = useState(1);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setErr({ ...err, [k]: undefined });
  };
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const n: Errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) n.email = "Enter a valid work email address.";
    if (!f.pw) n.pw = "Enter your password.";
    else if (signup && f.pw.length < 8) n.pw = "Use at least 8 characters.";
    if (signup && !f.pw2) n.pw2 = "Repeat your password.";
    else if (signup && f.pw2 !== f.pw) n.pw2 = "Passwords do not match.";
    setErr(n);
    // ponytail: no auth backend yet. Login goes straight to the app, signup shows the confirmation.
    if (Object.keys(n).length) return;
    if (signup) setDone(true);
    else router.push("/app/dashboard");
  };
  const flip = () => { setDir(signup ? -1 : 1); onToggle(); setErr({}); setF({ ...f, pw: "", pw2: "" }); };
  const sc = score(f.pw);

  const field = (k: keyof typeof f, label: string, type: string, ph: string, auto: string) => (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={k} className={cn(mono, "text-white/50")}>{label}</label>
        {k === "pw" && !signup && <span className={cn(mono, "text-white/50")}>Forgot password?</span>}
      </div>
      <div className="relative">
        <input
          id={k} type={type} value={f[k]} onChange={set(k)} placeholder={ph} autoComplete={auto}
          aria-invalid={!!err[k]} aria-describedby={err[k] ? `${k}-err` : undefined}
          className={cn("mt-2 h-12 w-full border-b bg-transparent pr-16 text-[18px] outline-none transition-colors placeholder:text-white/20", err[k] ? "border-sev-critical" : "border-white/25 focus:border-white")}
        />
        {k === "pw" && (
          <button type="button" onClick={() => setShow(!show)} className={cn(mono, "absolute bottom-3 right-0 text-white/50 hover:text-white")}>
            {show ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {err[k] && <p id={`${k}-err`} role="alert" className={cn(mono, "mt-2 text-[10px] text-sev-critical")}>{err[k]}</p>}
    </div>
  );

  if (done) {
    return (
      <div className="w-full max-w-[460px] animate-fade-up">
        <div className="-rotate-2 rounded-[4px] bg-[#f2f1ee] p-8 text-black shadow-[0_40px_80px_-25px_rgb(0_0_0/.9)]">
          <p className={cn(mono, "flex justify-between text-[10px] text-black/55")}><span>NYX — Access</span><span>Release 01</span></p>
          <h1 className={cn(display, "mt-8 text-[44px] leading-[0.9]")}>Account created</h1>
          <p className="mt-4 text-[14px] leading-relaxed text-black/65">
            We sent a verification link to <span className="font-mono text-black">{f.email}</span>. The demo workspace is open in the meantime.
          </p>
          <div className={cn(mono, "mt-6 space-y-1.5 border-t border-dashed border-black/30 pt-4 text-[10px]")}>
            <p className="flex justify-between"><span>Workspace</span><span>Demo</span></p>
            <p className="flex justify-between"><span>Scope</span><span>Not set yet</span></p>
            <p className="flex justify-between"><span>Status</span><span>Pending verification</span></p>
          </div>
          <div className="mt-6 h-8 [background:repeating-linear-gradient(90deg,#000_0_2px,transparent_2px_4px,#000_4px_5px,transparent_5px_8px)]" />
        </div>
        <Link href="/app/dashboard" prefetch={false} className="mt-10 flex h-12 items-center justify-center gap-2 rounded-full bg-brand text-[14px] font-medium text-black transition-transform hover:scale-[1.02]">
          Open the demo workspace <ArrowRight className="size-4" aria-hidden />
        </Link>
        <button onClick={() => { setDone(false); setF({ email: "", pw: "", pw2: "" }); }} className={cn(mono, "mt-5 w-full text-center text-white/50 hover:text-white")}>Use a different email</button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-[460px]">
      <div role="tablist" aria-label="Account" className="flex items-baseline gap-6">
        {([[false, "Log in"], [true, "Sign up"]] as const).map(([v, l]) => (
          <button key={l} type="button" role="tab" aria-selected={signup === v} onClick={() => signup !== v && flip()} className={cn(display, "text-[clamp(44px,4.6vw,76px)] leading-[0.9] transition-colors duration-500", signup === v ? "text-white" : "text-white/15 hover:text-white/40")}>
            {l}
          </button>
        ))}
      </div>

      <div className="overflow-hidden">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.form
            key={signup ? "signup" : "login"}
            custom={dir} variants={slide} initial="enter" animate="center" exit="exit"
            transition={{ duration: 0.22, ease: "easeOut" }}
            onSubmit={submit} noValidate
            className="space-y-7 pt-6"
          >
            <h1 className="max-w-sm text-[15px] leading-relaxed text-white/60">
              {signup ? "Create an account and I will map your first attack surface in a few minutes." : "Welcome back. I kept your workspace exactly where your last scan left off."}
            </h1>

            <button
              type="button" disabled={google}
              onClick={() => { setGoogle(true); setTimeout(() => router.push("/app/dashboard"), 1200); }}
              className="flex h-12 w-full items-center justify-center gap-2.5 rounded-full bg-white text-[14px] font-medium text-black transition-transform hover:scale-[1.01] disabled:opacity-80"
            >
              <GoogleG />{google ? "Connecting to Google…" : signup ? "Sign up with Google" : "Continue with Google"}
            </button>
            <div className={cn(mono, "flex items-center gap-4 text-white/50")}><span className="h-px flex-1 bg-white/15" />or with email<span className="h-px flex-1 bg-white/15" /></div>

            {field("email", "Email", "email", "you@company.com", "email")}
            {field("pw", "Password", show ? "text" : "password", signup ? "At least 8 characters" : "Your password", signup ? "new-password" : "current-password")}
            {signup && (
              <>
                <div className="-mt-3 flex items-center gap-1.5" aria-hidden>
                  {[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-[2px] flex-1 transition-colors duration-300", i < sc ? (sc <= 1 ? "bg-sev-critical" : sc === 2 ? "bg-sev-medium" : "bg-sev-low") : "bg-white/10")} />)}
                  <span className={cn(mono, "ml-2 min-w-[46px] text-[9.5px] text-white/50")}>{labels[sc]}</span>
                </div>
                {field("pw2", "Repeat password", show ? "text" : "password", "Repeat your password", "new-password")}
              </>
            )}

            <button type="submit" className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[14px] font-medium text-black transition-transform hover:scale-[1.01]">
              {signup ? "Create account" : "Log in"}<ArrowRight className="size-4" aria-hidden />
            </button>

            <p className="text-[12.5px] leading-relaxed text-white/40">
              By continuing you confirm you will only scan targets you are authorized to test, and agree to the{" "}
              <Link href="/legal#privacy" className="text-white/70 underline underline-offset-2">Terms</Link> and <Link href="/legal#privacy" className="text-white/70 underline underline-offset-2">Privacy Policy</Link>.
            </p>
            <p className="border-t border-white/15 pt-5 text-[14px] text-white/50">
              {signup ? "Already have an account? " : "New to NYX? "}
              <button type="button" onClick={flip} className="text-white underline-offset-4 hover:underline">{signup ? "Log in →" : "Create account →"}</button>
            </p>
          </motion.form>
        </AnimatePresence>
      </div>
    </div>
  );
}

function GoogleG() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7a14.5 14.5 0 0 1 0-9.4l-7.9-6.1a24 24 0 0 0 0 21.6l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}
