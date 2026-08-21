/** ساخت URL وب‌هوک از APP_BASE_URL (بدون اسلش انتهایی تکراری) */
export function buildWebhookUrl(): string | "" {
  const base = (process.env.APP_BASE_URL ?? "").replace(/\/$/, "");
  if (!base) return "";
  return `${base}/api/bale/webhook`;
}
