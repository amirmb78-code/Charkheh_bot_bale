"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { materialRates, pickupRequests, requestStatusEnum } from "@/db/schema";
import { logEvent } from "@/lib/requests";
import { setSetting } from "@/lib/settings";
import { ADMIN_COOKIE_NAME } from "@/lib/adminAuth";
import {
  createSessionToken,
  verifySessionToken,
  passwordEquals,
  SESSION_TTL_SECONDS,
} from "@/lib/session";
import { buildWebhookUrl } from "@/lib/webhookUrl";
import { setWebhook, deleteWebhook } from "@/lib/bale";

// ---------------------------------------------------------------------------
// احراز هویت: ورود با رمز → صدور توکن امضاشده (نه ذخیره خود رمز در کوکی)
// ---------------------------------------------------------------------------

// rate-limit ساده در حافظه برای تلاش‌های ناموفق ورود (اجرای self-hosted)
const loginGuard = { fails: 0, lockedUntil: 0 };

async function requireAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_COOKIE_NAME)?.value;
  if (!(await verifySessionToken(token))) {
    redirect("/admin/login");
  }
}

export async function loginAction(formData: FormData): Promise<void> {
  const password = String(formData.get("password") ?? "");
  const expected = process.env.ADMIN_DASHBOARD_PASSWORD;

  if (Date.now() < loginGuard.lockedUntil) {
    redirect("/admin/login?error=locked");
  }

  if (!expected || !passwordEquals(password, expected)) {
    loginGuard.fails += 1;
    if (loginGuard.fails >= 5) {
      loginGuard.lockedUntil = Date.now() + 60_000; // ۵ تلاش ناموفق = ۱ دقیقه قفل
      loginGuard.fails = 0;
    }
    redirect("/admin/login?error=1");
  }

  loginGuard.fails = 0;
  loginGuard.lockedUntil = 0;

  const token = await createSessionToken();
  const cookieStore = await cookies();
  cookieStore.set(ADMIN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS,
  });

  redirect("/admin");
}

export async function logoutAction(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(ADMIN_COOKIE_NAME);
  redirect("/admin/login");
}

// ---------------------------------------------------------------------------
// اتصال/قطع وب‌هوک بله از داخل داشبورد (بدون نیاز به curl و رمز در URL)
// ---------------------------------------------------------------------------
export async function connectWebhookAction(): Promise<void> {
  await requireAdminSession();
  const url = buildWebhookUrl();
  const secret = process.env.BALE_WEBHOOK_SECRET;
  if (!url || !secret || !process.env.BALE_BOT_TOKEN) {
    redirect("/admin?hook=missing-env");
  }
  try {
    await setWebhook(url, secret);
    redirect("/admin?hook=connected");
  } catch {
    redirect("/admin?hook=failed");
  }
}

export async function disconnectWebhookAction(): Promise<void> {
  await requireAdminSession();
  try {
    await deleteWebhook();
    redirect("/admin?hook=disconnected");
  } catch {
    redirect("/admin?hook=failed");
  }
}

// ---------------------------------------------------------------------------
// تنظیمات نرخ‌ها و کلی
// ---------------------------------------------------------------------------
export async function updateMaterialRateAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = Number(formData.get("id"));
  const pricePerKg = Number(formData.get("pricePerKg"));
  const co2Raw = String(formData.get("co2PerKg") ?? "").trim();
  const co2PerKg = co2Raw === "" ? null : Number(co2Raw);

  if (!id || Number.isNaN(pricePerKg) || pricePerKg < 0) return;
  if (co2PerKg !== null && (Number.isNaN(co2PerKg) || co2PerKg < 0)) return;

  await db
    .update(materialRates)
    .set({
      pricePerKg,
      ...(co2PerKg !== null ? { co2PerKg: String(co2PerKg) } : {}),
      updatedAt: new Date(),
    })
    .where(eq(materialRates.id, id));

  revalidatePath("/admin/settings");
}

export async function updateGeneralSettingsAction(formData: FormData): Promise<void> {
  await requireAdminSession();

  const minAccept = String(formData.get("minAcceptValue") ?? "").trim();
  const rewardPercent = String(formData.get("rewardPercent") ?? "").trim();
  const referralBonus = String(formData.get("referralBonus") ?? "").trim();

  if (minAccept !== "" && Number(minAccept) >= 0) {
    await setSetting("min_accept_value", String(Number(minAccept)));
  }
  if (rewardPercent !== "" && Number(rewardPercent) >= 0 && Number(rewardPercent) <= 100) {
    await setSetting("reward_percent", String(Number(rewardPercent)));
  }
  if (referralBonus !== "" && Number(referralBonus) >= 0) {
    await setSetting("referral_bonus", String(Number(referralBonus)));
  }

  revalidatePath("/admin/settings");
  revalidatePath("/admin");
}

export async function updateCoverageAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  // استان‌های انتخاب‌شده؛ اگر «سراسری» تیک خورده باشد یا چیزی انتخاب نشده باشد → خالی (سراسر ایران)
  const nationwide = formData.get("nationwide") === "on";
  const selected = nationwide
    ? []
    : formData
        .getAll("province")
        .map(String)
        .map((s) => s.trim())
        .filter(Boolean);
  await setSetting("coverage_provinces", selected.join(","));
  revalidatePath("/admin/settings");
}

// ---------------------------------------------------------------------------
// تغییر دستی وضعیت (فقط مواقع استثنایی)
// ---------------------------------------------------------------------------
export async function overrideStatusAction(formData: FormData): Promise<void> {
  await requireAdminSession();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status"));
  const validStatuses = requestStatusEnum.enumValues as readonly string[];
  if (!id || !validStatuses.includes(status)) return;

  await db
    .update(pickupRequests)
    .set({ status: status as (typeof requestStatusEnum.enumValues)[number], updatedAt: new Date() })
    .where(eq(pickupRequests.id, id));

  await logEvent(id, status, "تغییر دستی توسط ادمین از داشبورد");

  revalidatePath(`/admin/requests/${id}`);
  revalidatePath("/admin/requests");
}
