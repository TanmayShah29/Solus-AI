import "./globals.css";

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
    <html lang="en" className="dark">
      <body className="font-mono antialiased bg-slate-950 text-slate-100">
        {children}
      </body>
    </html>
  );
}
