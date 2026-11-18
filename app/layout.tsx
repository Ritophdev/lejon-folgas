import type { Metadata, Viewport } from "next";
import { withBasePath } from "@/lib/site-path";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lejon Folgas | Portal do colaborador",
  description: "Consulte sua próxima folga no Lejon Atacarejo.",
  applicationName: "Lejon Folgas",
  manifest: withBasePath("/manifest.webmanifest"),
  appleWebApp: {
    capable: true,
    title: "Lejon Folgas",
    statusBarStyle: "default",
  },
  icons: { icon: withBasePath("/icon.svg"), apple: withBasePath("/app-icon-v2-180.png") },
};

export const viewport: Viewport = {
  themeColor: "#142653",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
