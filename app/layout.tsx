import type { Metadata, Viewport } from "next";
import MobileNavigation from "./components/MobileNavigation";
import MuseumPortalButton from "./components/MuseumPortalButton";
import IntelligencePortalButton from "./components/IntelligencePortalButton";
import "./globals.css";
import "./mobile-cleanup.css";

export const metadata: Metadata = {
  title: {
    default: "Wizard OS",
    template: "%s · Wizard OS",
  },
  description: "Private business operations console for ventures, work, and recurring income.",
  applicationName: "Wizard OS",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Wizard OS",
    statusBarStyle: "black-translucent",
  },
};

export const viewport: Viewport = {
  themeColor: "#0b1118",
  colorScheme: "dark",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        <MobileNavigation />
        {children}
        <IntelligencePortalButton />
        <MuseumPortalButton />
      </body>
    </html>
  );
}
