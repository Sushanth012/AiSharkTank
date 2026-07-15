import type { Metadata } from "next";
import { Archivo_Black, DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";

const display = Archivo_Black({ weight: "400", subsets: ["latin"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });
const mono = IBM_Plex_Mono({ subsets: ["latin"], variable: "--font-mono", weight: ["400", "500", "600"] });

export const metadata: Metadata = {
  title: "PitchTank | Rehearse the room before it matters",
  description: "Pressure-test your startup pitch with a five-seat AI investor panel."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
