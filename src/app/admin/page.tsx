import { db } from "@/db";
import { pickupRequests, customers } from "@/db/schema";
import { toToman } from "@/lib/persian";
import { getWebhookInfo } from "@/lib/bale";
import { connectWebhookAction, disconnectWebhookAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

async function loadStats() {
  const requests = await db.select().from(pickupRequests);
  const allCustomers = await db.select().from(customers);

  const total = requests.length;
  const completed = requests.filter((r) => r.status === "completed");
  const lowValue = requests.filter((r) => r.status === "low_value_queued").length;
  const cancelled = requests.filter((r) => r.status === "cancelled" || r.status === "rejected").length;
  const inProgress = total - completed.length - lowValue - cancelled;
  const sumFinal = completed.reduce((s, r) => s + (r.finalPrice ?? 0), 0);
  const sumReward = completed.reduce((s, r) => s + (r.rewardAmount ?? 0), 0);
  const sumCo2 = completed.reduce((s, r) => s + Number(r.co2SavedKg ?? 0), 0);
  const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  const rated = completed.filter((r) => r.rating !== null);
  const avgRating =
    rated.length > 0
      ? (rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length).toFixed(1)
      : null;

  // مخرج نرخ بازگشت: مشتریانی که حداقل یک سفارش دارند (یکسان با /stats ربات)
  const countsByCustomer = new Map<number, number>();
  for (const r of requests) countsByCustomer.set(r.customerId, (countsByCustomer.get(r.customerId) ?? 0) + 1);
  const repeatCustomers = [...countsByCustomer.values()].filter((c) => c >= 2).length;
  const repeatRate =
    countsByCustomer.size > 0 ? Math.round((repeatCustomers / countsByCustomer.size) * 100) : 0;

  return {
    total,
    customers: allCustomers.length,
    completed: completed.length,
    lowValue,
    cancelled,
    inProgress,
    sumFinal,
    sumReward,
    sumCo2,
    avgRating,
    completionRate,
    repeatRate,
  };
}

function Card({ title, value, hint }: { title: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-sm text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-bold text-slate-900">{value}</div>
      {hint && <div className="mt-1 text-xs text-slate-400">{hint}</div>}
    </div>
  );
}

async function WebhookStatusCard({ hookFlag }: { hookFlag?: string }) {
  const envReady = Boolean(
    process.env.BALE_BOT_TOKEN && process.env.APP_BASE_URL && process.env.BALE_WEBHOOK_SECRET,
  );

  let infoText = "—";
  if (process.env.BALE_BOT_TOKEN) {
    try {
      const info = (await getWebhookInfo()) as { url?: string; pending_update_count?: number };
      infoText = info?.url
        ? `متصل به: ${info.url}${info.pending_update_count ? ` (${info.pending_update_count} آپدیت در صف)` : ""}`
        : "وب‌هوک وصل نیست";
    } catch {
      infoText = "خطا در استعلام از سرور بله (توکن را بررسی کنید)";
    }
  }

  return (
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
      <h2 className="font-bold text-amber-900">اتصال ربات بله</h2>
      <p className="mt-1 text-sm text-amber-800">
        وضعیت: <span className="font-medium">{infoText}</span>
      </p>
      {hookFlag === "connected" && <p className="mt-1 text-sm text-emerald-700">✅ وب‌هوک با موفقیت وصل شد.</p>}
      {hookFlag === "disconnected" && <p className="mt-1 text-sm text-slate-600">وب‌هوک قطع شد.</p>}
      {hookFlag === "failed" && (
        <p className="mt-1 text-sm text-red-700">❌ خطا در ارتباط با سرور بله؛ توکن و آدرس را بررسی کنید.</p>
      )}
      {hookFlag === "missing-env" && (
        <p className="mt-1 text-sm text-red-700">
          ❌ متغیرهای BALE_BOT_TOKEN، APP_BASE_URL و BALE_WEBHOOK_SECRET باید تنظیم شوند.
        </p>
      )}
      {!envReady && (
        <p className="mt-2 text-sm text-amber-800">
          برای اتصال، سه متغیر BALE_BOT_TOKEN و APP_BASE_URL و BALE_WEBHOOK_SECRET در محیط لازم است
          (نمونه در <code className="rounded bg-white px-1">.env.example</code>).
        </p>
      )}
      <div className="mt-3 flex gap-2">
        <form action={connectWebhookAction}>
          <button
            type="submit"
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm text-white hover:bg-emerald-700"
          >
            اتصال وب‌هوک
          </button>
        </form>
        <form action={disconnectWebhookAction}>
          <button
            type="submit"
            className="rounded-lg bg-slate-700 px-4 py-1.5 text-sm text-white hover:bg-slate-800"
          >
            قطع وب‌هوک
          </button>
        </form>
      </div>
      <p className="mt-2 text-xs text-amber-700">
        سکرت وب‌هوک به بله اعلام می‌شود تا هر آپدیت با هدر امن امضا شود؛ آپدیت بدون امضای معتبر پردازش نمی‌شود.
      </p>
    </div>
  );
}

export default async function AdminDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ hook?: string }>;
}) {
  const { hook } = await searchParams;
  const stats = await loadStats();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">داشبورد چرخه</h1>
        <p className="mt-1 text-sm text-slate-500">
          شاخص‌های جمع‌آوری پسماند خشک و کالای دسته‌دوم — سراسر ایران
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <Card title="کل سفارش‌ها" value={String(stats.total)} />
        <Card title="مشتریان" value={String(stats.customers)} />
        <Card title="تکمیل‌شده" value={String(stats.completed)} hint={`نرخ تکمیل: ${stats.completionRate}٪`} />
        <Card title="در جریان" value={String(stats.inProgress)} />
        <Card title="کم‌ارزش (نوبت تجمیعی)" value={String(stats.lowValue)} />
        <Card title="لغو/رد شده" value={String(stats.cancelled)} />
        <Card title="نرخ بازگشت مشتری" value={`${stats.repeatRate}٪`} hint="محاسبه: میان مشتریان دارای سفارش" />
        <Card
          title="رضایت مشتری"
          value={stats.avgRating ? `${stats.avgRating} از ۵` : "—"}
          hint="میانگین امتیاز سفارش‌های تکمیل‌شده"
        />
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">مجموع خرید نهایی</div>
          <div className="mt-1 text-xl font-bold text-slate-900">{toToman(stats.sumFinal)} تومان</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">پاداش/اعتبار پرداخت‌شده</div>
          <div className="mt-1 text-xl font-bold text-emerald-700">{toToman(stats.sumReward)} تومان</div>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="text-sm text-slate-500">🌍 کاهش CO₂</div>
          <div className="mt-1 text-xl font-bold text-green-700">{toToman(Math.round(stats.sumCo2))} کیلوگرم</div>
        </div>
      </div>

      <WebhookStatusCard hookFlag={hook} />
    </div>
  );
}
