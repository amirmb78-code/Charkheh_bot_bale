import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

// ---------------------------------------------------------------------------
// اتصال دیتابیس به‌صورت «تنبل» (lazy) ساخته می‌شود تا:
//  ۱) `next build` بدون DATABASE_URL هم کار کند (ماژول‌ها import می‌شوند ولی query نمی‌زنند)
//  ۲) تست‌های یکپارچه بتوانند pool جایگزین (مثل pg-mem) تزریق کنند
// ---------------------------------------------------------------------------

type Schema = Record<string, unknown>;
type Db = NodePgDatabase<Schema>;

const globalForDb = globalThis as typeof globalThis & {
  __charkhehDbPool?: Pool;
  __charkhehPoolOverride?: Pool; // فقط برای تست (pg-mem)
};

function createPool(): Pool {
  if (globalForDb.__charkhehPoolOverride) {
    return globalForDb.__charkhehPoolOverride;
  }
  if (globalForDb.__charkhehDbPool) {
    return globalForDb.__charkhehDbPool;
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL تنظیم نشده است. آن را در فایل .env مقداردهی کنید (نمونه در .env.example).",
    );
  }
  const pool = new Pool({ connectionString: databaseUrl });
  if (process.env.NODE_ENV !== "production") {
    globalForDb.__charkhehDbPool = pool; // جلوگیری از ساخت pool تکراری در HMR
  } else {
    globalForDb.__charkhehDbPool = pool;
  }
  return pool;
}

let cachedDb: Db | null = null;

function getDb(): Db {
  if (!cachedDb) {
    cachedDb = drizzle(createPool());
  }
  return cachedDb;
}

/** Pool واقعی (برای تست‌ها و اسکریپت‌ها) */
export function getPool(): Pool {
  return createPool();
}

/**
 * شیء db با دسترسی تنبل: تا اولین query، connection ساخته نمی‌شود.
 * این یعنی import کردن ماژول در زمان build هیچ خطایی نمی‌دهد.
 */
export const db = new Proxy({} as Db, {
  get(_target, prop, receiver) {
    const real = getDb() as unknown as Record<PropertyKey, unknown>;
    const value = Reflect.get(real, prop, receiver);
    return typeof value === "function" ? (value as (...a: unknown[]) => unknown).bind(real) : value;
  },
});
