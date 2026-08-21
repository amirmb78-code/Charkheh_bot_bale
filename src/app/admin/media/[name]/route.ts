import { cookies } from "next/headers";
import { readLocalPhoto, contentTypeFor } from "@/lib/photoStorage";
import { verifySessionToken } from "@/lib/session";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * سرو امن عکس‌های خصوصی مشتریان. علاوه بر proxy، این‌جا هم نشست دوباره
 * بررسی می‌شود (defense in depth). پس از تکمیل سفارش فایل‌ها فیزیکی حذف
 * می‌شوند و این مسیر 404 برمی‌گرداند.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(token))) {
    return new Response("unauthorized", { status: 401 });
  }

  const { name } = await params;
  const buffer = await readLocalPhoto(name);
  if (!buffer) {
    return new Response("not found", { status: 404 });
  }

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": contentTypeFor(name),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
