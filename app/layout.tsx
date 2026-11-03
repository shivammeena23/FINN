import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { BottomNav } from "@/components/BottomNav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FINN",
  description: "A filtered view of your portfolio. Push what changed, pull what matters.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "FINN" },
};

export const viewport: Viewport = {
  themeColor: "#0b0d10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  maximumScale: 5,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body className="min-h-dvh">
        {/* Mobile-first: a phone-width column that stays centred on larger screens
            rather than stretching into a desktop layout the brief didn't ask for. */}
        <div className="mx-auto min-h-dvh w-full max-w-[460px] pb-[calc(68px+env(safe-area-inset-bottom))]">
          {children}
        </div>
        <BottomNav />
      </body>
    </html>
  );
}
