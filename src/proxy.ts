import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { verifySessionToken } from "@/lib/session";

/**
 * Next.js 16 proxy (جانشین middleware): محافظت از تمام مسیرهای /admin/*
 * از جمله /admin/media/* (عکس‌های خصوصی مشتریان).
 * نشست = توکن امضاشده HMAC با تاریخ انقضا (نه خودِ رمز عبور).
 */
export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (pathname === "/admin/login") {
    return NextResponse.next();
  }
  if (!pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  const token = req.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (await verifySessionToken(token)) {
    return NextResponse.next();
  }

  const url = req.nextUrl.clone();
  url.pathname = "/admin/login";
  url.search = "";
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/admin/:path*"],
};
