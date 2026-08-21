import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "چرخه | Charkheh — جمع‌آوری پسماند خشک و کالای دسته‌دوم در سراسر ایران",
  description:
    "چرخه — خرید پسماند خشک و کالای دسته‌دوم از درب منزل در سراسر ایران؛ با ربات بله، موقعیت‌یابی روی نقشه، کیف پول اعتباری و پاداش دعوت.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fa" dir="rtl">
      <body className="bg-slate-100 text-slate-900 antialiased">{children}</body>
    </html>
  );
}
