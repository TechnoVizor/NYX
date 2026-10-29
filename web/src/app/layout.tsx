import type { Metadata, Viewport } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Providers } from "@/providers/providers";
import { bootScript } from "@/lib/theme-pref";
import "./globals.css";

// Dovetail pairing: Inter for the interface, JetBrains Mono for data, ids and numbers.
const inter = Inter({ variable: "--font-inter", subsets: ["latin"], weight: ["400", "500", "600"] });
const mono = JetBrains_Mono({ variable: "--font-jetbrains-mono", subsets: ["latin"], weight: ["400", "500"] });

export const metadata: Metadata = {
  title: { default: "NYX", template: "%s · NYX" },
  description: "NYX workspace: scans, findings, evidence.",
  applicationName: "NYX",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0a0a0c" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} ${mono.variable} dark h-full`} data-theme="nyx" suppressHydrationWarning>
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
