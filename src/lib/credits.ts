import { db } from "@/db";
import { creditTransactions } from "@/db/schema";

export type CreditType = "reward" | "referral" | "adjustment";

export const CREDIT_TYPE_LABELS: Record<string, string> = {
  reward: "پاداش سفارش",
  referral: "پاداش دعوت",
  adjustment: "تعدیل دستی",
};

/** افزودن یک تراکنش به کیف پول اعتباری مشتری (مبلغ مثبت یا منفی) */
export async function addCreditTransaction(params: {
  customerId: number;
  amount: number;
  type: CreditType;
  requestId?: number | null;
  note?: string;
}) {
  const [row] = await db
    .insert(creditTransactions)
    .values({
      customerId: params.customerId,
      amount: params.amount,
      type: params.type,
      requestId: params.requestId ?? null,
      note: params.note,
    })
    .returning();
  return row;
}
