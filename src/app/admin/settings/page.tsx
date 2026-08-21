import { getMaterialRates, getMinAcceptValue, getRewardPercent, getReferralBonus, getSetting } from "@/lib/settings";
import {
  updateMaterialRateAction,
  updateGeneralSettingsAction,
  updateCoverageAction,
} from "@/app/admin/actions";
import { wasteTypeLabel } from "@/lib/persian";
import { PROVINCES } from "@/lib/geo";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const rates = await getMaterialRates();
  const minAccept = await getMinAcceptValue();
  const rewardPercent = await getRewardPercent();
  const referralBonus = await getReferralBonus();
  const coverage = (await getSetting("coverage_provinces", "")).split(",").map((s) => s.trim()).filter(Boolean);
  const nationwide = coverage.length === 0;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">تنظیمات چرخه</h1>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-900">نرخ خرید هر نوع پسماند (تومان به ازای کیلوگرم)</h2>
        <p className="mb-3 text-xs text-slate-500">
          این نرخ‌ها برای «برآورد خودکار قیمت» به مشتری و پیشنهاد به ادمین استفاده می‌شوند. ضریب CO₂
          برای گزارش اثر زیست‌محیطی به مشتری (کیلوگرم CO₂ صرفه‌جویی‌شده به ازای هر کیلوگرم) است.
        </p>
        <div className="space-y-2">
          {rates.map((rate) => (
            <form
              key={rate.id}
              action={updateMaterialRateAction}
              className="flex flex-wrap items-center gap-3 rounded-lg border border-slate-100 p-2"
            >
              <input type="hidden" name="id" value={rate.id} />
              <span className="w-32 text-sm text-slate-700">{wasteTypeLabel(rate.material) || rate.label}</span>
              <input
                type="number"
                name="pricePerKg"
                defaultValue={rate.pricePerKg}
                min={0}
                className="w-28 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-slate-400">تومان/کیلو</span>
              <input
                type="number"
                name="co2PerKg"
                defaultValue={rate.co2PerKg ?? ""}
                min={0}
                step="0.01"
                placeholder="CO₂"
                className="w-24 rounded-lg border border-slate-300 px-2 py-1 text-sm"
              />
              <span className="text-xs text-slate-400">کیلو CO₂/کیلو</span>
              <button
                type="submit"
                className="mr-auto rounded-lg bg-emerald-600 px-3 py-1 text-sm text-white hover:bg-emerald-700"
              >
                ذخیره
              </button>
            </form>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-3 font-bold text-slate-900">تنظیمات کلی</h2>
        <form action={updateGeneralSettingsAction} className="space-y-3">
          <div>
            <label className="mb-1 block text-sm text-slate-700">
              حداقل ارزش سفارش برای اعزام فوری (تومان) — برآوردهای کمتر از این، به ادمین «کم‌ارزش» پیشنهاد می‌شوند
            </label>
            <input
              type="number"
              name="minAcceptValue"
              defaultValue={minAccept}
              min={0}
              className="w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-700">درصد پاداش اعتباری مشتری</label>
            <input
              type="number"
              name="rewardPercent"
              defaultValue={rewardPercent}
              min={0}
              max={100}
              className="w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm text-slate-700">
              پاداش دعوت دوستان (تومان) — پس از تکمیل اولین سفارشِ فرد دعوت‌شده به دعوت‌کننده واریز می‌شود
            </label>
            <input
              type="number"
              name="referralBonus"
              defaultValue={referralBonus}
              min={0}
              className="w-48 rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            />
          </div>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700"
          >
            ذخیره تنظیمات
          </button>
        </form>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="mb-1 font-bold text-slate-900">محدوده پوشش جغرافیایی</h2>
        <p className="mb-3 text-xs text-slate-500">
          پیش‌فرض: سراسر ایران (بدون محدودیت). اگر فقط چند استان را انتخاب کنید، سفارش‌های خارج از آن
          استان‌ها با پیام مؤدبانه رد می‌شوند.
        </p>
        <form action={updateCoverageAction} className="space-y-3">
          <label className="flex items-center gap-2 text-sm font-medium text-slate-800">
            <input type="checkbox" name="nationwide" defaultChecked={nationwide} className="h-4 w-4" />
            سراسر ایران 🇮🇷 (بدون محدودیت)
          </label>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-3 md:grid-cols-4">
            {PROVINCES.map((p) => (
              <label key={p.key} className="flex items-center gap-1.5 text-xs text-slate-600">
                <input
                  type="checkbox"
                  name="province"
                  value={p.key}
                  defaultChecked={!nationwide && coverage.includes(p.key)}
                  className="h-3.5 w-3.5"
                />
                {p.label}
              </label>
            ))}
          </div>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700"
          >
            ذخیره محدوده پوشش
          </button>
        </form>
      </div>
    </div>
  );
}
