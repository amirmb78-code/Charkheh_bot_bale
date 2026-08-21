import type { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/app/admin/actions";

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-100" dir="rtl">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link href="/admin" className="flex items-center gap-2 font-bold text-slate-900">
            <span className="text-2xl">♻️</span>
            <span>چرخه — پنل مدیریت</span>
          </Link>
          <nav className="flex items-center gap-4 text-sm">
            <Link href="/admin" className="text-slate-600 hover:text-emerald-700">
              داشبورد
            </Link>
            <Link href="/admin/requests" className="text-slate-600 hover:text-emerald-700">
              سفارش‌ها
            </Link>
            <Link href="/admin/settings" className="text-slate-600 hover:text-emerald-700">
              تنظیمات
            </Link>
            <form action={logoutAction}>
              <button type="submit" className="text-red-600 hover:text-red-800">
                خروج
              </button>
            </form>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
