import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import GlobalSidebar from "@/components/GlobalSidebar";
import GlobalChrome from "@/components/GlobalChrome";
import TechnicianAvailabilityManagerSafe from "@/components/TechnicianAvailabilityManagerSafe";
import TechnicianDashboardExpander from "@/components/TechnicianDashboardExpander";
import PwaInstaller from "./_components/pwa-installer";
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
  applicationName: "Výtahy DC",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Výtahy DC",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      {
        url: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        url: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "/icons/apple-touch-icon.png",
        sizes: "180x180",
        type: "image/png",
      },
    ],
  },
};

export const viewport: Viewport = {
  themeColor: "#f8fafc",
  colorScheme: "light",
  viewportFit: "cover",
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
        <PwaInstaller />
      </body>
    </html>
  );
}
