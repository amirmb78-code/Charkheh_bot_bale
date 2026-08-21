import { processBaleUpdate } from "@/lib/baleConversation";
import type { BaleUpdate } from "@/lib/baleTypes";

export const dynamic = "force-dynamic";

// بله سکرت وب‌هوک را در این هدرها می‌فرستد (سازگاری با نام‌های رایج)
const SECRET_HEADERS = ["x-bale-bot-api-secret-token", "x-telegram-bot-api-secret-token"];

function isAuthorized(req: Request): boolean {
  const secret = process.env.BALE_WEBHOOK_SECRET;

  // بدون سکرت پیکربندی‌شده، آپدیت‌ها پردازش نمی‌شوند (رفع حفره امنیتی قبلی:
  // وب‌هوکِ بدون سکرت قبلاً برای هرکسی باز بود).
  if (!secret) {
    console.error(
      "BALE_WEBHOOK_SECRET تنظیم نشده است؛ آپدیت‌ها پردازش نمی‌شوند. یک رشته تصادفی بسازید (openssl rand -hex 24) و وب‌هوک را از داشبورد دوباره وصل کنید.",
    );
    return false;
  }

  for (const h of SECRET_HEADERS) {
    if (req.headers.get(h) === secret) return true;
  }
  // fallback برای کلاینت‌هایی که هدر را پشتیبانی نمی‌کنند
  const url = new URL(req.url);
  return url.searchParams.get("secret") === secret;
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  if (!process.env.BALE_BOT_TOKEN) {
    console.error("BALE_BOT_TOKEN تنظیم نشده است — وب‌هوک نادیده گرفته شد.");
    return Response.json({ ok: true });
  }

  let update: BaleUpdate | null = null;
  try {
    update = (await req.json()) as BaleUpdate;
  } catch {
    return Response.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  if (!update || typeof update.update_id !== "number") {
    return Response.json({ ok: false, error: "invalid update" }, { status: 400 });
  }

  try {
    await processBaleUpdate(update);
  } catch (err) {
    console.error("خطا در پردازش وب‌هوک بله:", err);
  }

  return Response.json({ ok: true });
}

export async function GET() {
  return Response.json({ ok: true, service: "charkheh-bale-webhook" });
}
