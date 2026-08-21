import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db";
import { requestEvents, requestStatusEnum } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { getRequestWithCustomer } from "@/lib/requests";
import { statusLabel, wasteTypeLabel, toToman } from "@/lib/persian";
import { getWeightBand } from "@/lib/pricing";
import { mapLink } from "@/lib/bale";
import { getCustomerBalance, getRecentTransactions } from "@/lib/customers";
import { CREDIT_TYPE_LABELS } from "@/lib/credits";
import { overrideStatusAction } from "@/app/admin/actions";

export const dynamic = "force-dynamic";

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium">{value}</dd>
    </div>
  );
}

export default async function RequestDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const requestId = Number(id);
  if (Number.isNaN(requestId)) notFound();

  const full = await getRequestWithCustomer(requestId);
  if (!full) notFound();

  const events = await db
    .select()
    .from(requestEvents)
    .where(eq(requestEvents.requestId, requestId))
    .orderBy(asc(requestEvents.createdAt));

  const { request, customer } = full;
  const lat = request.locationLat ? Number(request.locationLat) : null;
  const lng = request.locationLng ? Number(request.locationLng) : null;
  const balance = await getCustomerBalance(customer.id);
  const txs = await getRecentTransactions(customer.id, 5);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <Link href="/admin/requests" className="text-sm text-emerald-700 hover:underline">
            ← بازگشت به لیست سفارش‌ها
          </Link>
          <h1 className="mt-1 text-2xl font-bold text-slate-900">سفارش #{request.id}</h1>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-sm">{statusLabel(request.status)}</span>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="space-y-4 md:col-span-2">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold text-slate-900">اطلاعات سفارش</h2>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Field label="نوع کالا" value={wasteTypeLabel(request.wasteType)} />
              <Field
                label="وزن تقریبی مشتری"
                value={request.estimatedWeightBand ? (getWeightBand(request.estimatedWeightBand)?.label ?? "-") : "-"}
              />
              <Field
                label="برآورد خودکار سیستم"
                value={
                  request.estimatedMin !== null && request.estimatedMax !== null
                    ? `${toToman(request.estimatedMin)} تا ${toToman(request.estimatedMax)} تومان`
                    : "-"
                }
              />
              <Field label="قیمت توافقی" value={request.quotedPrice ? `${toToman(request.quotedPrice)} تومان` : "-"} />
              <Field label="استان" value={request.province ?? "-"} />
              <Field
                label="موقعیت مکانی"
                value={lat !== null && lng !== null ? `${lat.toFixed(5)}, ${lng.toFixed(5)}` : "-"}
              />
              <Field label="آدرس دقیق" value={request.address ?? (request.completedAt ? "🔒 پاک شد (حریم خصوصی)" : "-")} />
              <Field label="شماره تماس" value={request.phone ?? (request.completedAt ? "🔒 پاک شد (حریم خصوصی)" : "-")} />
              <Field label="زمان درخواستی" value={request.preferredTime ?? "-"} />
              <Field
                label="وزن نهایی"
                value={request.finalWeightKg ? `${toToman(String(request.finalWeightKg))} کیلوگرم` : "-"}
              />
              <Field label="مبلغ نهایی" value={request.finalPrice ? `${toToman(request.finalPrice)} تومان` : "-"} />
              <Field
                label="پاداش پرداختی"
                value={request.rewardAmount ? `${toToman(request.rewardAmount)} تومان (${request.rewardPercent}٪)` : "-"}
              />
              <Field
                label="🌍 کاهش CO₂"
                value={request.co2SavedKg ? `${toToman(String(request.co2SavedKg))} کیلوگرم` : "-"}
              />
              <Field label="امتیاز مشتری" value={request.rating ? `${request.rating} از ۵ ⭐` : "-"} />
              <Field
                label="پاداش دعوت مرتبط"
                value={request.referralBonusGranted ? "واریز شد ✅" : "-"}
              />
              <Field label="تاریخ ثبت" value={new Date(request.createdAt).toLocaleString("fa-IR")} />
            </dl>

            {lat !== null && lng !== null && (
              <a
                href={mapLink(lat, lng)}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-block rounded-lg bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-700"
              >
                🗺 باز کردن موقعیت روی نقشه
              </a>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold text-slate-900">عکس ارسالی مشتری</h2>
            {request.photoLocalPath ? (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img
                src={`/admin/media/${request.photoLocalPath}`}
                alt={`عکس سفارش ${request.id}`}
                className="max-h-96 w-auto rounded-lg border border-slate-200"
              />
            ) : (
              <p className="text-sm text-slate-400">
                {request.completedAt || request.status === "cancelled"
                  ? "🔒 مطابق سیاست حریم خصوصی، پس از پایان سفارش عکس حذف شده است."
                  : "عکسی ذخیره نشده است."}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold text-slate-900">تاریخچه وضعیت</h2>
            <ul className="space-y-2 text-sm">
              {events.map((e) => (
                <li key={e.id} className="flex items-start gap-2 border-r-2 border-emerald-200 pr-3">
                  <div>
                    <div className="font-medium text-slate-800">{statusLabel(e.status)}</div>
                    {e.note && <div className="text-slate-500">{e.note}</div>}
                    <div className="text-xs text-slate-400">{new Date(e.createdAt).toLocaleString("fa-IR")}</div>
                  </div>
                </li>
              ))}
              {events.length === 0 && <li className="text-slate-400">رویدادی ثبت نشده.</li>}
            </ul>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold text-slate-900">اطلاعات مشتری</h2>
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="text-slate-500">نام</dt>
                <dd className="font-medium">
                  {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || "-"}
                </dd>
              </div>
              <div>
                <dt className="text-slate-500">یوزرنیم بله</dt>
                <dd className="font-medium">{customer.username ? `@${customer.username}` : "-"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">چت‌آیدی</dt>
                <dd className="font-medium">{customer.chatId}</dd>
              </div>
              <div>
                <dt className="text-slate-500">کد دعوت</dt>
                <dd className="font-medium">{customer.inviteCode ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">دعوت‌شده با کد</dt>
                <dd className="font-medium">{customer.invitedByCode ?? "-"}</dd>
              </div>
              <div>
                <dt className="text-slate-500">💳 موجودی کیف پول</dt>
                <dd className="font-medium">{toToman(balance)} تومان</dd>
              </div>
            </dl>
            {txs.length > 0 && (
              <div className="mt-3 border-t border-slate-100 pt-2 text-xs text-slate-500">
                <div className="mb-1 font-medium text-slate-600">آخرین تراکنش‌ها:</div>
                {txs.map((t) => (
                  <div key={t.id} className="flex justify-between">
                    <span>{CREDIT_TYPE_LABELS[t.type] ?? t.type}</span>
                    <span className={t.amount >= 0 ? "text-emerald-700" : "text-red-600"}>
                      {t.amount >= 0 ? "+" : "−"}{toToman(Math.abs(t.amount))}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 font-bold text-slate-900">تغییر دستی وضعیت</h2>
            <p className="mb-2 text-xs text-slate-500">
              معمولاً وضعیت از طریق گفتگوی ربات به‌روزرسانی می‌شود؛ این بخش فقط برای مواقع استثنایی است.
            </p>
            <form action={overrideStatusAction} className="flex flex-col gap-2">
              <input type="hidden" name="id" value={request.id} />
              <select
                name="status"
                defaultValue={request.status}
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
              >
                {requestStatusEnum.enumValues.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm text-white hover:bg-slate-900"
              >
                ذخیره
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
