import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Inter_Tight } from "next/font/google";
import { Providers } from "@/providers/providers";
import { bootScript } from "@/lib/theme-pref";
import "./globals.css";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });
const display = Inter_Tight({ variable: "--font-inter-tight", subsets: ["latin"], weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: { default: "NYX", template: "%s · NYX" },
  description: "NYX workspace: scans, findings, evidence.",
  applicationName: "NYX",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a0a0c" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} ${display.variable} dark h-full`} data-theme="nyx" suppressHydrationWarning>
      <head>
        {/* Applies the saved theme before first paint; see bootScript(). */}
        <script dangerouslySetInnerHTML={{ __html: bootScript() }} />
      </head>
      <body className="min-h-full">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
