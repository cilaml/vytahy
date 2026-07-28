import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import GlobalSidebar from "@/components/GlobalSidebar";
import GlobalChrome from "@/components/GlobalChrome";
import TechnicianAvailabilityManagerSafe from "@/components/TechnicianAvailabilityManagerSafe";
import TechnicianDashboardExpander from "@/components/TechnicianDashboardExpander";
import "./globals.css";
import "./modern-overrides.css";
import "./chrome-fixes.css";
import "./contrast-fixes.css";
import "./mobile-card-polish.css";
import "./technician-availability.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Výtahy DC – servisní systém",
  description: "Plánování, servis, výtahy a evidence nářadí",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="cs" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full">
        <GlobalSidebar />
        <GlobalChrome />
        <TechnicianDashboardExpander />
        <TechnicianAvailabilityManagerSafe />
        <div className="app-content-root">{children}</div>
      </body>
    </html>
  );
}
