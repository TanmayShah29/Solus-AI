import "./globals.css";
import { Geist } from "next/font/google";
import { cn } from "@/lib/utils";
import { Nav } from '@/components/layout/Nav'
import { Analytics } from "@vercel/analytics/next"

const geist = Geist({subsets:['latin'],variable:'--font-sans'});

export const metadata = {
  title: "Solus",
  description: "Personal AI Agent",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={cn("dark", "font-sans", geist.variable)}>
      <body className="font-mono antialiased bg-slate-950 text-slate-100 min-h-screen">
        <Nav />
        <main className="ml-14 min-h-screen">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  );
}
