// ---------------------------------------------------------------------------
// بازه‌های وزنی که مشتری با دکمه انتخاب می‌کند + برآورد خودکار قیمت
// (الهام از مدل‌های جهانی مثل Recyclebank/Rubicon: تخمین لحظه‌ای بر اساس نرخ)
// ---------------------------------------------------------------------------

export interface WeightBand {
  key: string;
  label: string;
  minKg: number | null;
  maxKg: number | null;
}

export const WEIGHT_BANDS: WeightBand[] = [
  { key: "lt5", label: "کمتر از ۵ کیلو", minKg: 0, maxKg: 5 },
  { key: "5to10", label: "۵ تا ۱۰ کیلو", minKg: 5, maxKg: 10 },
  { key: "10to20", label: "۱۰ تا ۲۰ کیلو", minKg: 10, maxKg: 20 },
  { key: "20to50", label: "۲۰ تا ۵۰ کیلو", minKg: 20, maxKg: 50 },
  { key: "gt50", label: "بیش از ۵۰ کیلو", minKg: 50, maxKg: null },
  { key: "unknown", label: "وزن دقیقش رو نمی‌دونم", minKg: null, maxKg: null },
];

export function getWeightBand(key: string | null | undefined): WeightBand | null {
  return WEIGHT_BANDS.find((b) => b.key === key) ?? null;
}

/** برای این انواع کالا پرسش وزن/برآورد خودکار معنا ندارد (قیمت موردی است) */
export const NO_WEIGHT_TYPES = new Set(["secondhand", "other"]);

export interface PriceEstimate {
  min: number;
  max: number;
}

/**
 * برآورد خودکار بازه قیمت = نرخ هر کیلو × بازه وزنی انتخابی مشتری.
 * برای بازه «بیش از ۵۰ کیلو» سقف پیش‌فرض ۱۰۰ کیلو، و برای «نمی‌دانم» برآوردی نیست.
 */
export function estimatePriceRange(pricePerKg: number, bandKey: string): PriceEstimate | null {
  const band = getWeightBand(bandKey);
  if (!band || band.minKg === null) return null;
  const min = Math.round(pricePerKg * band.minKg);
  const maxKg = band.maxKg ?? 100;
  const max = Math.round(pricePerKg * maxKg);
  return { min, max };
}
