import type { Metadata } from "next";
import { Architects_Daughter, Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { Navbar } from "@/components/navbar";
import { Footer } from "@/components/footer";
import { GraphiteFilter } from "@/components/graphite-filter";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

/**
 * The hand for drawn headings.
 *
 * Architects Daughter is drafting-hand printing: every letter stands on its
 * own, nothing joins, and it reads as lettering rather than script. That is
 * what keeps it out of cursive territory while still being unmistakably
 * written by a person.
 */
const hand = Architects_Daughter({
  variable: "--font-hand",
  subsets: ["latin"],
  weight: "400",
});

/**
 * Which surface the site is drawn on: "dark" or "paper".
 *
 * Kept as one switch while the paper treatment is being evaluated, so both
 * themes stay in the stylesheet and swapping back is a one-word change.
 */
const THEME = (process.env.NEXT_PUBLIC_THEME ?? "paper") as "dark" | "paper";

export const metadata: Metadata = {
  title: "Austen DeWolf | Let's Talk",
  description: "I build things for the internet.",
  metadataBase: new URL("https://austendewolf.com"),
  openGraph: {
    title: "Austen DeWolf",
    description: "I build things for the internet.",
    url: "https://austendewolf.com",
    siteName: "austendewolf.com",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${hand.variable} ${THEME} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <GraphiteFilter />
        <Navbar />
        <main className="flex-1">{children}</main>
        <Footer />
        <Toaster richColors theme="dark" />
      </body>
    </html>
  );
}
