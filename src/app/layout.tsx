import type { Metadata } from "next";
import Script from "next/script";
import { ThemeProvider } from "@/components/theme";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "EVERSHINE ERP", template: "%s · EVERSHINE" },
  description: "EVERSHINE ERP — local foundation review",
  robots: { index: false, follow: false },
};
const themeScript = `(function(){try{var t=localStorage.getItem('evershine:theme');if(!['light','dark','system'].includes(t))t='system';document.documentElement.dataset.theme=t==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):t;}catch(e){}})()`;
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>
        <Script
          id="theme-script"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{ __html: themeScript }}
        />
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
