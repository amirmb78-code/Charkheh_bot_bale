export const ADMIN_COOKIE_NAME = "charkheh_admin_session";

/**
 * فهرست چت‌آیدی ادمین‌ها. از متغیر ADMIN_CHAT_IDS (با ویرگول) خوانده می‌شود؛
 * برای سازگاری با نسخه‌های قبلی، ADMIN_CHAT_ID تکی هم پشتیبانی می‌شود.
 */
export function getAdminChatIds(): string[] {
  const raw = process.env.ADMIN_CHAT_IDS ?? process.env.ADMIN_CHAT_ID ?? "";
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isAdminChat(chatId: string | number): boolean {
  const admins = getAdminChatIds();
  return admins.length > 0 && admins.includes(String(chatId));
}
