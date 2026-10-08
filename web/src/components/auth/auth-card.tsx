"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { api, ApiError } from "@/lib/api/client";
import { siteUrl } from "@/lib/site";
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
  p ? [p.length >= 10, /[a-z]/.test(p) && /[A-Z]/.test(p), /\d/.test(p), /[^a-zA-Z0-9]/.test(p)].filter(Boolean).length : 0;

type Errors = Partial<Record<"email" | "pw" | "pw2", string>>;

export function AuthCard({ signup, onToggle }: { signup: boolean; onToggle: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [formErr, setFormErr] = useState("");
  const [show, setShow] = useState(false);
  const [f, setF] = useState({ email: "", pw: "", pw2: "" });
  const [err, setErr] = useState<Errors>({});
  const [dir, setDir] = useState(1);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setF({ ...f, [k]: e.target.value });
    setErr({ ...err, [k]: undefined });
  };
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n: Errors = {};
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(f.email.trim())) n.email = "Enter a valid work email address.";
    if (!f.pw) n.pw = "Enter your password.";
    else if (signup && f.pw.length < 10) n.pw = "Use at least 10 characters.";
    if (signup && !f.pw2) n.pw2 = "Repeat your password.";
    else if (signup && f.pw2 !== f.pw) n.pw2 = "Passwords do not match.";
    setErr(n);
    setFormErr("");
    if (Object.keys(n).length) return;
    setBusy(true);
    try {
      await (signup ? api.signup : api.login)({ email: f.email.trim(), password: f.pw });
      router.push("/app/dashboard");
    } catch (x) {
      setFormErr(x instanceof ApiError ? x.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  };
  const flip = () => { setDir(signup ? -1 : 1); onToggle(); setErr({}); setFormErr(""); setF({ ...f, pw: "", pw2: "" }); };
  const sc = score(f.pw);

  const field = (k: keyof typeof f, label: string, type: string, ph: string, auto: string) => (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={k} className={cn(mono, "text-white/50")}>{label}</label>
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

            {field("email", "Email", "email", "you@company.com", "email")}
            {field("pw", "Password", show ? "text" : "password", signup ? "At least 10 characters" : "Your password", signup ? "new-password" : "current-password")}
            {signup && (
              <>
                <div className="-mt-3 flex items-center gap-1.5" aria-hidden>
                  {[0, 1, 2, 3].map((i) => <span key={i} className={cn("h-[2px] flex-1 transition-colors duration-300", i < sc ? (sc <= 1 ? "bg-sev-critical" : sc === 2 ? "bg-sev-medium" : "bg-sev-low") : "bg-white/10")} />)}
                  <span className={cn(mono, "ml-2 min-w-[46px] text-[9.5px] text-white/50")}>{labels[sc]}</span>
                </div>
                {field("pw2", "Repeat password", show ? "text" : "password", "Repeat your password", "new-password")}
              </>
            )}

            {formErr && <p role="alert" className={cn(mono, "text-[10px] text-sev-critical")}>{formErr}</p>}
            <button type="submit" disabled={busy} className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-brand text-[14px] font-medium text-black transition-transform hover:scale-[1.01] disabled:opacity-60">
              {busy ? "One moment…" : signup ? "Create account" : "Log in"}<ArrowRight className="size-4" aria-hidden />
            </button>

            <p className="text-[12.5px] leading-relaxed text-white/40">
              By continuing you confirm you will only scan targets you are authorized to test, and agree to the{" "}
              <a href={`${siteUrl}/legal#privacy`} className="text-white/70 underline underline-offset-2">Terms</a> and <a href={`${siteUrl}/legal#privacy`} className="text-white/70 underline underline-offset-2">Privacy Policy</a>.
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
