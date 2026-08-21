import crypto from "crypto";
import { db } from "@/db";
import { customers, creditTransactions } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import type { BaleUser } from "@/lib/baleTypes";

/**
 * کد دعوت تصادفی و غیرقابل‌حدس (در نسخه قبلی ترتیبی NMK1001 بود که enumerable بود).
 * قالب: CHK-AB3DE7
 */
export function generateInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // بدون حروف مشابه (I/O/0/1)
  let code = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) code += alphabet[bytes[i] % alphabet.length];
  return `CHK-${code}`;
}

export async function getOrCreateCustomer(chatId: string, from?: BaleUser) {
  const existing = await db.select().from(customers).where(eq(customers.chatId, chatId));
  if (existing.length > 0) {
    return existing[0];
  }

  const [created] = await db
    .insert(customers)
    .values({
      chatId,
      firstName: from?.first_name,
      lastName: from?.last_name,
      username: from?.username,
      inviteCode: generateInviteCode(),
    })
    .onConflictDoNothing({ target: customers.chatId })
    .returning();

  if (created) return created;
  // race: هم‌زمان ساخته شده؛ دوباره بخوان
  const [row] = await db.select().from(customers).where(eq(customers.chatId, chatId));
  return row;
}

export async function getCustomerById(id: number) {
  const rows = await db.select().from(customers).where(eq(customers.id, id));
  return rows[0] ?? null;
}

export async function getCustomerByInviteCode(code: string) {
  const rows = await db
    .select()
    .from(customers)
    .where(eq(customers.inviteCode, code.toUpperCase().trim()));
  return rows[0] ?? null;
}

export async function getCustomerBalance(customerId: number): Promise<number> {
  const rows = await db
    .select({ total: sql<number>`coalesce(sum(${creditTransactions.amount}), 0)::int` })
    .from(creditTransactions)
    .where(eq(creditTransactions.customerId, customerId));
  return rows[0]?.total ?? 0;
}

export async function getRecentTransactions(customerId: number, limit = 5) {
  const rows = await db
    .select()
    .from(creditTransactions)
    .where(eq(creditTransactions.customerId, customerId));
  return rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()).slice(0, limit);
}
