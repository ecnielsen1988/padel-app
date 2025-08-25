import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { SupabaseListener } from "./supabase-listener";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Padel App",
    template: "%s | Padel App",
  },
  description: "Padelhuset",
  manifest: "/manifest.webmanifest",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fce7f3" },
    { media: "(prefers-color-scheme: dark)",  color: "#4a0416" }
  ],
  appleWebApp: {
    capable: true,
    title: "Padel",
    statusBarStyle: "black-translucent",
  },
  icons: {
    icon: [
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="da">
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <SupabaseListener />
        {children}
      </body>
    </html>
  );
}
