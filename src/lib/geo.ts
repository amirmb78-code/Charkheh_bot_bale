// ---------------------------------------------------------------------------
// استان‌های ایران — برای پوشش سراسری بدون محدودیت جغرافیایی
// نوع که «به‌صورت دکمه شیشه‌ای» از مشتری گرفته می‌شود و محدوده پوشش (در صورت
// تعریف در تنظیمات) با آن کنترل می‌شود. خالی بودن فهرست پوشش = سراسر ایران.
// ---------------------------------------------------------------------------

export interface Province {
  key: string;
  label: string;
}

export const PROVINCES: Province[] = [
  { key: "azarbaijan-east", label: "آذربایجان شرقی" },
  { key: "azarbaijan-west", label: "آذربایجان غربی" },
  { key: "ardabil", label: "اردبیل" },
  { key: "isfahan", label: "اصفهان" },
  { key: "alborz", label: "البرز" },
  { key: "ilam", label: "ایلام" },
  { key: "bushehr", label: "بوشهر" },
  { key: "tehran", label: "تهران" },
  { key: "chaharmahal", label: "چهارمحال و بختیاری" },
  { key: "khorasan-south", label: "خراسان جنوبی" },
  { key: "khorasan-razavi", label: "خراسان رضوی" },
  { key: "khorasan-north", label: "خراسان شمالی" },
  { key: "khuzestan", label: "خوزستان" },
  { key: "zanjan", label: "زنجان" },
  { key: "semnan", label: "سمنان" },
  { key: "sistan", label: "سیستان و بلوچستان" },
  { key: "fars", label: "فارس" },
  { key: "qazvin", label: "قزوین" },
  { key: "qom", label: "قم" },
  { key: "kordestan", label: "کردستان" },
  { key: "kerman", label: "کرمان" },
  { key: "kermanshah", label: "کرمانشاه" },
  { key: "kohgiluyeh", label: "کهگیلویه و بویراحمد" },
  { key: "golestan", label: "گلستان" },
  { key: "gilan", label: "گیلان" },
  { key: "lorestan", label: "لرستان" },
  { key: "mazandaran", label: "مازندران" },
  { key: "markazi", label: "مرکزی" },
  { key: "hormozgan", label: "هرمزگان" },
  { key: "hamadan", label: "همدان" },
  { key: "yazd", label: "یزد" },
];

export function provinceLabel(key: string | null | undefined): string {
  if (!key) return "نامشخص";
  return PROVINCES.find((p) => p.key === key)?.label ?? key;
}
