import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI Shark Tank",
  description: "Practice investor pitches with an AI investor panel."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
