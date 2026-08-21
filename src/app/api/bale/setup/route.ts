import { setWebhook, getWebhookInfo, deleteWebhook } from "@/lib/bale";
import { verifySessionToken } from "@/lib/session";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import { buildWebhookUrl } from "@/lib/webhookUrl";

export const dynamic = "force-dynamic";

/**
 * احراز: یا کوکی نشست معتبر داشبورد، یا هدر x-admin-password.
 * عمداً رمز در query string پذیرفته نمی‌شود تا در لاگ پراکسی‌ها/تاریخچه مرورگر
 * ثبت نشود (رفع مشکل قبلی). روش توصیه‌شده: دکمه «اتصال وب‌هوک» در داشبورد.
 */
async function isAuthorized(req: Request): Promise<boolean> {
  const cookieHeader = req.headers.get("cookie") ?? "";
  const match = cookieHeader
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${ADMIN_COOKIE_NAME}=`));
  const token = match ? decodeURIComponent(match.slice(ADMIN_COOKIE_NAME.length + 1)) : null;
  if (await verifySessionToken(token)) return true;

  const password = process.env.ADMIN_DASHBOARD_PASSWORD;
  if (password && req.headers.get("x-admin-password") === password) return true;

  return false;
}

function requireEnv(): { ok: true } | { ok: false; status: number; error: string } {
  if (!process.env.BALE_BOT_TOKEN) {
    return { ok: false, status: 400, error: "BALE_BOT_TOKEN تنظیم نشده است" };
  }
  if (!process.env.APP_BASE_URL) {
    return { ok: false, status: 400, error: "APP_BASE_URL تنظیم نشده است" };
  }
  if (!process.env.BALE_WEBHOOK_SECRET) {
    return {
      ok: false,
      status: 400,
      error: "BALE_WEBHOOK_SECRET تنظیم نشده است؛ برای امنیت وب‌هوک الزامی است",
    };
  }
  return { ok: true };
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const env = requireEnv();
  if (!env.ok) {
    return Response.json({ ok: false, error: env.error }, { status: env.status });
  }

  const secret = process.env.BALE_WEBHOOK_SECRET!;
  const webhookUrl = buildWebhookUrl();

  try {
    // سکرت به بله اعلام می‌شود تا در هدر هر آپدیت بیاید (نه فقط در URL)
    await setWebhook(webhookUrl, secret);
    return Response.json({ ok: true, webhookUrl });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  if (!(await isAuthorized(req))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  try {
    await deleteWebhook();
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}

export async function GET(req: Request) {
  if (!(await isAuthorized(req))) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.BALE_BOT_TOKEN) {
    return Response.json({ ok: false, error: "BALE_BOT_TOKEN تنظیم نشده است" }, { status: 400 });
  }
  try {
    const info = await getWebhookInfo();
    return Response.json({ ok: true, info });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
