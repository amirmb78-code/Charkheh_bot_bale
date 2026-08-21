import { db } from "@/db";
import { botSettings, materialRates } from "@/db/schema";
import { eq } from "drizzle-orm";

export const DEFAULT_MIN_ACCEPT_VALUE = 50_000; // تومان — حداقل ارزش برای اعزام فوری
export const DEFAULT_REWARD_PERCENT = 12; // درصد پاداش اعتباری مشتری
export const DEFAULT_REFERRAL_BONUS = 20_000; // تومان — پاداش دعوت دوستان

const DEFAULT_MATERIAL_RATES = [
  { material: "paper", label: "کاغذ", pricePerKg: 3500, co2PerKg: "0.90" },
  { material: "plastic", label: "پلاستیک", pricePerKg: 4000, co2PerKg: "1.50" },
  { material: "metal", label: "فلز", pricePerKg: 9000, co2PerKg: "1.90" },
  { material: "glass", label: "شیشه", pricePerKg: 1500, co2PerKg: "0.30" },
];

const DEFAULT_SETTINGS: [string, string][] = [
  ["min_accept_value", String(DEFAULT_MIN_ACCEPT_VALUE)],
  ["reward_percent", String(DEFAULT_REWARD_PERCENT)],
  ["referral_bonus", String(DEFAULT_REFERRAL_BONUS)],
  // فهرست کلید استان‌های تحت پوشش با ویرگول؛ خالی = سراسر ایران (بدون محدودیت)
  ["coverage_provinces", ""],
];

export async function ensureSeedData(): Promise<void> {
  const existingRates = await db.select().from(materialRates).limit(1);
  if (existingRates.length === 0) {
    await db.insert(materialRates).values(DEFAULT_MATERIAL_RATES).onConflictDoNothing();
  }
  for (const [key, value] of DEFAULT_SETTINGS) {
    const rows = await db.select().from(botSettings).where(eq(botSettings.key, key));
    if (rows.length === 0) {
      await db.insert(botSettings).values({ key, value }).onConflictDoNothing();
    }
  }
}

export async function getSetting(key: string, fallback: string): Promise<string> {
  const rows = await db.select().from(botSettings).where(eq(botSettings.key, key));
  return rows[0]?.value ?? fallback;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await db
    .insert(botSettings)
    .values({ key, value, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: botSettings.key,
      set: { value, updatedAt: new Date() },
    });
}

export async function getMinAcceptValue(): Promise<number> {
  const value = await getSetting("min_accept_value", String(DEFAULT_MIN_ACCEPT_VALUE));
  return Number(value) || DEFAULT_MIN_ACCEPT_VALUE;
}

export async function getRewardPercent(): Promise<number> {
  const value = await getSetting("reward_percent", String(DEFAULT_REWARD_PERCENT));
  const n = Number(value);
  return n >= 0 && n <= 100 ? n : DEFAULT_REWARD_PERCENT;
}

export async function getReferralBonus(): Promise<number> {
  const value = await getSetting("referral_bonus", String(DEFAULT_REFERRAL_BONUS));
  return Number(value) || DEFAULT_REFERRAL_BONUS;
}

/** کلید استان‌های تحت پوشش؛ آرایه خالی یعنی سراسر ایران (بدون محدودیت) */
export async function getCoverageProvinces(): Promise<string[]> {
  const value = await getSetting("coverage_provinces", "");
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function getMaterialRates() {
  await ensureSeedData();
  return db.select().from(materialRates).orderBy(materialRates.material);
}

export async function getActiveMaterialRate(materialKey: string) {
  await ensureSeedData();
  const rows = await db
    .select()
    .from(materialRates)
    .where(eq(materialRates.material, materialKey));
  const row = rows[0];
  return row && row.active ? row : null;
}
