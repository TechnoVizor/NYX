"use client";

import Image from "next/image";
import { useState } from "react";
import { AuthCard } from "@/components/auth/auth-card";
import { cn } from "@/lib/utils";

const mono = "font-mono text-[10.5px] uppercase tracking-[0.14em]";

/** Owns the Log in / Sign up state so the campaign poster can swap with the form. */
export function LoginView() {
  const [signup, setSignup] = useState(false);

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      <div className="relative hidden overflow-hidden lg:block">
        {/* ponytail: unoptimized, the posters are already hand-tuned WebP */}
        <Image src="/brand/login.webp" alt="" fill unoptimized priority sizes="50vw" className={cn("object-cover transition-[opacity,transform] duration-[900ms] ease-out", signup ? "scale-105 opacity-0" : "scale-100 opacity-100")} />
        <Image src="/brand/login-2.webp" alt="" fill unoptimized sizes="50vw" className={cn("object-cover transition-[opacity,transform] duration-[900ms] ease-out", signup ? "scale-100 opacity-100" : "scale-105 opacity-0")} />
        <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-black/80 to-transparent" />
        <div className={cn(mono, "absolute inset-x-6 bottom-6 flex justify-between text-white/75")}>
          <span>{signup ? "Release 01 — NYX 2026" : "Exposure / Defense"}</span>
          <span>Foto: NYX Studio</span>
        </div>
      </div>
      <main className="relative flex items-center px-6 pb-24 pt-28 sm:px-[8vw]">
        <AuthCard signup={signup} onToggle={() => setSignup((s) => !s)} />
        <p className={cn(mono, "absolute inset-x-6 bottom-6 flex justify-between text-white/50 sm:inset-x-[8vw]")}>
          <span>© 2026 NYX</span><span>Scan only what you own</span>
        </p>
      </main>
    </div>
  );
}
