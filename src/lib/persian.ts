// ---------------------------------------------------------------------------
// ابزارهای فارسی: تبدیل ارقام فارسی/عربی به لاتین، فرمت تومان، برچسب‌ها
// ---------------------------------------------------------------------------

const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹"; // U+06F0..U+06F9
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩"; // U+0660..U+0669

/** تبدیل ارقام فارسی و عربی به لاتین؛ جداکننده اعشار فارسی (٫) و «/» هم به نقطه تبدیل می‌شود */
export function normalizeDigits(input: string): string {
  let out = "";
  for (const ch of input) {
    const fa = FA_DIGITS.indexOf(ch);
    if (fa !== -1) {
      out += String(fa);
      continue;
    }
    const ar = AR_DIGITS.indexOf(ch);
    if (ar !== -1) {
      out += String(ar);
      continue;
    }
    out += ch === "٫" ? "." : ch;
  }
  return out.replace(/\//g, ".");
}

export function toToman(amount: number | string | null | undefined): string {
  if (amount === null || amount === undefined || amount === "") return "۰";
  const n = typeof amount === "string" ? Number(amount) : amount;
  if (Number.isNaN(n)) return "۰";
  return n.toLocaleString("fa-IR");
}

export const STATUS_LABELS: Record<string, string> = {
  awaiting_type: "منتظر انتخاب نوع کالا",
  awaiting_review: "در انتظار بررسی قیمت",
  quoted: "قیمت پیشنهاد شد",
  confirmed: "تایید شد، در انتظار آدرس",
  awaiting_address: "در انتظار دریافت آدرس",
  awaiting_time: "در انتظار انتخاب زمان",
  scheduled: "زمان تحویل هماهنگ شد",
  collected: "جمع‌آوری انجام شد",
  completed: "تکمیل شد",
  low_value_queued: "در نوبت جمع‌آوری تجمیعی (کم‌ارزش)",
  rejected: "رد شده",
  cancelled: "لغو شده",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export const WASTE_TYPES: { key: string; label: string }[] = [
  { key: "paper", label: "کاغذ 📄" },
  { key: "plastic", label: "پلاستیک ♻️" },
  { key: "metal", label: "فلز 🥫" },
  { key: "glass", label: "شیشه 🍾" },
  { key: "secondhand", label: "کالای دسته‌دوم 👕" },
  { key: "other", label: "سایر" },
];

export function wasteTypeLabel(key: string | null | undefined): string {
  return WASTE_TYPES.find((w) => w.key === key)?.label ?? key ?? "نامشخص";
}

export const TIME_SLOTS: { key: string; label: string }[] = [
  { key: "today_evening", label: "امروز عصر" },
  { key: "tomorrow_morning", label: "فردا صبح" },
  { key: "tomorrow_evening", label: "فردا عصر" },
  { key: "custom", label: "زمان دیگر (خودم تایپ می‌کنم)" },
];

export function timeSlotLabel(key: string): string {
  return TIME_SLOTS.find((t) => t.key === key)?.label ?? key;
}
