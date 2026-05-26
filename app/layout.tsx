import type { Metadata, Viewport } from "next";
import { Fraunces, Inter_Tight } from "next/font/google";
import "./globals.css";
import SwRegister from "./sw-register";

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  style: ["normal", "italic"],
  weight: ["400", "500", "600", "700"],
});

const interTight = Inter_Tight({
  variable: "--font-inter-tight",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Keldra · See. Solve. Scale.",
  description:
    "The construction accountability layer. Built on 20 years of finding millions in data that nobody else could see.",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "Keldra",
  },
};

export const viewport: Viewport = {
  themeColor: "#8a3dd6",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${interTight.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        {children}
        <SwRegister />
      </body>
    </html>
  );
}
