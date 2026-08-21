import Link from "next/link";
import { db } from "@/db";
import { pickupRequests, customers } from "@/db/schema";
import { desc, inArray } from "drizzle-orm";
import { statusLabel, wasteTypeLabel, toToman, STATUS_LABELS } from "@/lib/persian";

export const dynamic = "force-dynamic";

async function loadRequests(status?: string) {
  const requests = await db
    .select()
    .from(pickupRequests)
    .orderBy(desc(pickupRequests.createdAt))
    .limit(200);

  const customerIds = [...new Set(requests.map((r) => r.customerId))];
  const customerRows =
    customerIds.length > 0
      ? await db.select().from(customers).where(inArray(customers.id, customerIds))
      : [];
  const byId = new Map(customerRows.map((c) => [c.id, c]));

  const rows = requests
    .map((request) => ({ request, customer: byId.get(request.customerId) }))
    .filter((r): r is { request: (typeof requests)[number]; customer: (typeof customerRows)[number] } =>
      Boolean(r.customer),
    );

  if (!status) return rows;
  const valid = Object.keys(STATUS_LABELS);
  if (!valid.includes(status)) return rows;
  return rows.filter((r) => r.request.status === status);
}

export default async function RequestsListPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const params = await searchParams;
  const rows = await loadRequests(params.status);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">سفارش‌ها</h1>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        <Link
          href="/admin/requests"
          className={`rounded-full px-3 py-1 ${!params.status ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
        >
          همه
        </Link>
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <Link
            key={key}
            href={`/admin/requests?status=${key}`}
            className={`rounded-full px-3 py-1 ${params.status === key ? "bg-emerald-600 text-white" : "bg-white text-slate-600 border border-slate-200"}`}
          >
            {label}
          </Link>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="px-3 py-2 text-right">شناسه</th>
              <th className="px-3 py-2 text-right">مشتری</th>
              <th className="px-3 py-2 text-right">نوع کالا</th>
              <th className="px-3 py-2 text-right">استان</th>
              <th className="px-3 py-2 text-right">وضعیت</th>
              <th className="px-3 py-2 text-right">قیمت پیشنهادی</th>
              <th className="px-3 py-2 text-right">مبلغ نهایی</th>
              <th className="px-3 py-2 text-right">امتیاز</th>
              <th className="px-3 py-2 text-right">تاریخ ثبت</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ request, customer }) => (
              <tr key={request.id} className="border-t border-slate-100 hover:bg-slate-50">
                <td className="px-3 py-2">
                  <Link href={`/admin/requests/${request.id}`} className="font-medium text-emerald-700 hover:underline">
                    #{request.id}
                  </Link>
                </td>
                <td className="px-3 py-2">
                  {[customer.firstName, customer.lastName].filter(Boolean).join(" ") || customer.username || customer.chatId}
                </td>
                <td className="px-3 py-2">{wasteTypeLabel(request.wasteType)}</td>
                <td className="px-3 py-2">{request.province ?? "-"}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs">{statusLabel(request.status)}</span>
                </td>
                <td className="px-3 py-2">{request.quotedPrice ? `${toToman(request.quotedPrice)} تومان` : "-"}</td>
                <td className="px-3 py-2">{request.finalPrice ? `${toToman(request.finalPrice)} تومان` : "-"}</td>
                <td className="px-3 py-2">{request.rating ? `${request.rating}⭐` : "-"}</td>
                <td className="px-3 py-2 text-xs text-slate-500">
                  {new Date(request.createdAt).toLocaleString("fa-IR")}
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  سفارشی یافت نشد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
