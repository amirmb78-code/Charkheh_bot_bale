import { db } from "@/db";
import { pickupRequests, requestEvents, customers } from "@/db/schema";
import { eq } from "drizzle-orm";
import { deleteLocalPhoto } from "@/lib/photoStorage";

export async function createRequest(params: {
  customerId: number;
  photoFileId: string;
  photoLocalPath: string | null;
}) {
  const [request] = await db
    .insert(pickupRequests)
    .values({
      customerId: params.customerId,
      photoFileId: params.photoFileId,
      photoLocalPath: params.photoLocalPath ?? undefined,
      status: "awaiting_type",
    })
    .returning();
  await logEvent(request.id, "awaiting_type", "عکس دریافت شد");
  return request;
}

export async function getRequestById(id: number) {
  const rows = await db.select().from(pickupRequests).where(eq(pickupRequests.id, id));
  return rows[0] ?? null;
}

export async function getRequestWithCustomer(id: number) {
  // عمداً بدون JOIN: دو کوئری ساده، سریع و مستقل از رفتار درایور
  // (در join، ستون‌های هم‌نام دو جدول ممکن است در بعضی درایورها تداخل کنند)
  const request = await getRequestById(id);
  if (!request) return null;
  const custRows = await db.select().from(customers).where(eq(customers.id, request.customerId));
  const customer = custRows[0];
  if (!customer) return null;
  return { request, customer };
}

export async function updateRequest(
  id: number,
  values: Partial<typeof pickupRequests.$inferInsert>,
) {
  const [updated] = await db
    .update(pickupRequests)
    .set({ ...values, updatedAt: new Date() })
    .where(eq(pickupRequests.id, id))
    .returning();
  return updated;
}

export async function logEvent(requestId: number, status: string, note?: string) {
  await db.insert(requestEvents).values({ requestId, status, note });
}

/**
 * وفای به وعده حریم خصوصیِ پیام خوش‌آمد: پس از پایان سفارش (تکمیل/لغو/رد)،
 * آدرس دقیق و عکس مشتری حذف می‌شود؛ فقط استان/شهر و مختصات تقریبی برای آمار
 * و هماهنگی‌های لجستیک باقی می‌ماند.
 */
export async function purgePrivateData(requestId: number): Promise<void> {
  const request = await getRequestById(requestId);
  if (!request) return;

  if (request.photoLocalPath) {
    await deleteLocalPhoto(request.photoLocalPath);
  }
  await updateRequest(requestId, {
    address: null,
    photoLocalPath: null,
    phone: null,
  });
  await logEvent(
    requestId,
    request.status,
    "اطلاعات حساس (آدرس دقیق، عکس و شماره تماس) مطابق سیاست حریم خصوصی پاک شد",
  );
}
