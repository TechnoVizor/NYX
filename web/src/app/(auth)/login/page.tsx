import type { Metadata } from "next";
import { Logo } from "@/components/layout/logo";
import { Grain } from "@/components/auth/grain";
import { LoginView } from "@/components/auth/login-view";
import { siteUrl } from "@/lib/site";

export const metadata: Metadata = { title: "Sign in" };

export default function LoginPage() {
  return (
    <div className="relative min-h-dvh">
      <header className="fixed inset-x-0 top-0 z-50 flex h-16 items-center justify-between px-6 text-white mix-blend-difference">
        <Logo />
        <p className="hidden font-mono text-[10.5px] uppercase leading-[1.35] tracking-[0.14em] md:block">Release 01<br />Access</p>
        <a href={siteUrl} className="flex h-9 items-center rounded-full border border-current px-4 font-mono text-[11px] uppercase tracking-[0.12em] transition-colors hover:bg-white hover:text-black">← Back to site</a>
      </header>
      <LoginView />
      <Grain />
    </div>
  );
}
