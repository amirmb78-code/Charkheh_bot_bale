// ---------------------------------------------------------------------------
// تست یکپارچه جریان گفتگوی ربات چرخه — بدون نیاز به سرور واقعی بله یا Postgres واقعی
// دیتابیس: pg-mem (PostgreSQL داخل‌حافظه‌ای) + اجرای فایل‌های مایگریشن drizzle
// اجرا: npm run test:flow
// ---------------------------------------------------------------------------

import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.BALE_BOT_TOKEN = "TEST_TOKEN";
process.env.ADMIN_CHAT_IDS = "999999,777777";
process.env.DATABASE_URL ??= "postgresql://unused@unused/unused"; // override با pg-mem جایگزین می‌شود
process.env.UPLOAD_DIR = path.join(os.tmpdir(), "charkheh-test-uploads");

const CUSTOMER_CHAT = "555111222";
const REFERRER_CHAT = "555000111";
const ADMIN_CHAT = "999999";
const ADMIN_CHAT_2 = "777777";

const sentMessages: { chatId: string; text: string; hasKeyboard: boolean; markup?: unknown }[] = [];

// موک fetch برای شبیه‌سازی پاسخ‌های API بله بدون تماس شبکه واقعی
const originalFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input.toString();

  if (url.includes("/getFile")) {
    return jsonResponse({ ok: true, result: { file_id: "FAKE", file_path: "photos/fake.jpg" } });
  }
  if (url.includes("/file/bot")) {
    return {
      ok: true,
      status: 200,
      arrayBuffer: async () => new TextEncoder().encode("fake-image-bytes").buffer,
    } as unknown as Response;
  }
  if (url.includes("/sendMessage")) {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push({
      chatId: String(body.chat_id),
      text: String(body.text ?? ""),
      hasKeyboard: Boolean(body.reply_markup),
      markup: body.reply_markup,
    });
    return jsonResponse({ ok: true, result: { message_id: Math.floor(Math.random() * 100000) } });
  }
  if (url.includes("/sendPhoto")) {
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    sentMessages.push({
      chatId: String(body.chat_id),
      text: String(body.caption ?? "[photo]"),
      hasKeyboard: Boolean(body.reply_markup),
      markup: body.reply_markup,
    });
    return jsonResponse({ ok: true, result: { message_id: Math.floor(Math.random() * 100000) } });
  }
  return jsonResponse({ ok: true, result: {} });
}) as typeof fetch;

function jsonResponse(payload: unknown): Response {
  return {
    ok: true,
    status: 200,
    json: async () => payload,
  } as unknown as Response;
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(`❌ FAILED: ${message}`);
  }
  console.log(`✅ ${message}`);
}

async function main() {
  // ۰) دیتابیس داخل‌حافظه‌ای + مایگریشن‌ها، قبل از import هر ماژول پروژه
  const { newDb } = await import("pg-mem");
  const mem = newDb();
  const pgAdapter = mem.adapters.createPg();

  // pg-mem دو قابلیت queryConfig که drizzle همیشه می‌فرستد را ندارد:
  //   - types.getTypeParser  → چون مقادیر pg-mem ذاتاً native هستند، حذفش می‌کنیم
  //   - rowMode: "array"     → خودمان با ترتیب res.fields به آرایه تبدیل می‌کنیم
  const BasePool = pgAdapter.Pool as any;
  class MemPool extends BasePool {
    adaptQuery(query: any, values: any) {
      if (query && typeof query === "object" && query.types?.getTypeParser) {
        query = { ...query };
        delete query.types;
      }
      return super.adaptQuery(query, values);
    }
    adaptResults(query: any, res: any) {
      if (query && query.rowMode === "array") {
        const fieldNames = res.fields.map((f: any) => f.name);
        return {
          ...res,
          rows: res.rows.map((row: any) => fieldNames.map((n: string) => row[n])),
        };
      }
      return super.adaptResults(query, res);
    }
  }
  const pool = new MemPool();
  (globalThis as Record<string, unknown>).__charkhehPoolOverride = pool;

  const drizzleDir = path.join(process.cwd(), "drizzle");
  const sqlFiles = fs
    .readdirSync(drizzleDir)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  if (sqlFiles.length === 0) {
    throw new Error("فایل مایگریشن یافت نشد؛ اول اجرا کنید: npm run db:generate");
  }
  for (const file of sqlFiles) {
    const sql = fs.readFileSync(path.join(drizzleDir, file), "utf8");
    for (const stmt of sql.split("--> statement-breakpoint")) {
      const trimmed = stmt.trim();
      if (trimmed) await pool.query(trimmed);
    }
  }
  console.log("✅ دیتابیس تست (pg-mem) با مایگریشن‌ها آماده شد");

  const { processBaleUpdate } = await import("../src/lib/baleConversation");
  const { db } = await import("../src/db");
  const { customers, pickupRequests, conversationStates, creditTransactions } = await import(
    "../src/db/schema"
  );
  const { eq } = await import("drizzle-orm");

  let updateId = 1;
  const msg = (chat: string, text: string, extra?: Record<string, unknown>) =>
    processBaleUpdate({
      update_id: updateId++,
      message: { message_id: updateId, chat: { id: Number(chat) }, text, ...extra },
    });
  const cb = (chat: string, data: string) =>
    processBaleUpdate({
      update_id: updateId++,
      callback_query: {
        id: `cbq${updateId}`,
        from: { id: Number(chat) },
        message: { message_id: updateId, chat: { id: Number(chat) } },
        data,
      },
    });
  const getRequests = async () =>
    db.select().from(pickupRequests).orderBy(pickupRequests.id);

  // ۱) معرف (referrer) /start می‌زند تا کد دعوت بگیرد
  await msg(REFERRER_CHAT, "/start");
  const [referrer] = await db.select().from(customers).where(eq(customers.chatId, REFERRER_CHAT));
  assert(referrer, "معرف ساخته شد");
  assert(/^CHK-[A-Z0-9]{6}$/.test(referrer.inviteCode!), `کد دعوت تصادفی و غیرترتیبی است (${referrer.inviteCode})`);

  // ۲) مشتری /start و سپس کد دعوت را می‌فرستد
  await msg(CUSTOMER_CHAT, "/start");
  const [customer] = await db.select().from(customers).where(eq(customers.chatId, CUSTOMER_CHAT));
  assert(customer, "مشتری ساخته شد");

  await msg(CUSTOMER_CHAT, referrer.inviteCode!.toLowerCase()); // حروف کوچک هم باید کار کند
  let [custRow] = await db.select().from(customers).where(eq(customers.chatId, CUSTOMER_CHAT));
  assert(custRow.invitedByCode === referrer.inviteCode, "کد دعوت (حتی با حروف کوچک) ثبت شد");
  assert(
    sentMessages.some((m) => m.chatId === REFERRER_CHAT && m.text.includes("پیوست")),
    "معرف از پیوستن فرد دعوت‌شده مطلع شد",
  );

  // ۳) مشتری عکس می‌فرستد
  await processBaleUpdate({
    update_id: updateId++,
    message: {
      message_id: updateId,
      chat: { id: Number(CUSTOMER_CHAT) },
      photo: [{ file_id: "FAKE_PHOTO_1", width: 800, height: 600 }],
    },
  });
  let reqs = await getRequests();
  assert(reqs.length === 1 && reqs[0].status === "awaiting_type", "سفارش پس از عکس ساخته شد");
  assert(reqs[0].photoLocalPath, "عکس به‌صورت خصوصی (خارج از public) ذخیره شد");
  const r1 = reqs[0].id;

  // ۴) انتخاب نوع (پلاستیک) → باید سوال وزن بیاید
  await cb(CUSTOMER_CHAT, `wt:${r1}:plastic`);
  reqs = await getRequests();
  assert(reqs[0].wasteType === "plastic", "نوع کالا ثبت شد");
  assert(
    sentMessages.some((m) => m.chatId === CUSTOMER_CHAT && m.text.includes("وزن تقریبی")),
    "پرسش وزن تقریبی با دکمه نمایش داده شد",
  );

  // ۵) انتخاب بازه وزنی → برآورد خودکار + اطلاع به هر دو ادمین
  await cb(CUSTOMER_CHAT, `wb:${r1}:5to10`);
  reqs = await getRequests();
  assert(reqs[0].status === "awaiting_review", "وضعیت awaiting_review شد");
  assert(
    reqs[0].estimatedMin === 20_000 && reqs[0].estimatedMax === 40_000,
    `برآورد خودکار درست است (${reqs[0].estimatedMin} تا ${reqs[0].estimatedMax})`,
  );
  assert(
    sentMessages.some((m) => m.chatId === ADMIN_CHAT && m.text.includes(`#${r1}`)) &&
      sentMessages.some((m) => m.chatId === ADMIN_CHAT_2 && m.text.includes(`#${r1}`)),
    "اطلاع‌رسانی به هر دو ادمین انجام شد",
  );
  assert(
    sentMessages.some((m) => m.chatId === ADMIN_CHAT && m.text.includes("کم‌ارزش")),
    "پرچم کم‌ارزش بودن (برآورد < حد اعزام) به ادمین نشان داده شد",
  );

  // ۶) ادمین با دستور سریع و «ارقام فارسی» قیمت می‌دهد (رفع باگ پارس ارقام)
  await msg(ADMIN_CHAT, `قیمت ${r1} ۸۵۰۰۰`);
  reqs = await getRequests();
  assert(reqs[0].status === "quoted" && reqs[0].quotedPrice === 85_000, "قیمت با ارقام فارسی ثبت شد");
  assert(
    sentMessages.some((m) => m.chatId === CUSTOMER_CHAT && m.hasKeyboard && m.text.includes("قیمت پیشنهادی")),
    "پیام قیمت با دکمه تایید/انصراف برای مشتری ارسال شد",
  );

  // ۷) تایید مشتری → انتخاب استان
  await cb(CUSTOMER_CHAT, `confirm:${r1}`);
  reqs = await getRequests();
  assert(reqs[0].status === "confirmed", "مشتری تایید کرد");
  assert(
    sentMessages.some((m) => m.chatId === CUSTOMER_CHAT && m.text.includes("کدوم استان")),
    "سوال استان (۳۱ استان - پوشش سراسری) نمایش داده شد",
  );

  // ۸) استان تهران → پرسش لوکیشن با دکمه نقشه
  await cb(CUSTOMER_CHAT, `prov:${r1}:tehran`);
  reqs = await getRequests();
  assert(reqs[0].status === "awaiting_address" && reqs[0].province === "تهران", "استان ثبت شد");
  const locPrompt = sentMessages.filter((m) => m.chatId === CUSTOMER_CHAT && m.text.includes("نقشه")).at(-1);
  assert(
    locPrompt && JSON.stringify(locPrompt.markup).includes("request_location"),
    "دکمه «ارسال موقعیت روی نقشه» (request_location) ارسال شد",
  );

  // ۹) مشتری لوکیشن می‌فرستد، بعد آدرس دقیق
  await msg(CUSTOMER_CHAT, "", { location: { latitude: 35.7219, longitude: 51.3347 } });
  reqs = await getRequests();
  assert(Number(reqs[0].locationLat) === 35.7219, "لوکیشن روی نقشه ذخیره شد");

  await msg(CUSTOMER_CHAT, "تهران، خیابان آزادی، کوچه گلها، پلاک ۱۲، واحد ۳");
  reqs = await getRequests();
  const phonePrompt = sentMessages.filter((m) => m.chatId === CUSTOMER_CHAT && m.text.includes("شماره")).at(-1);
  assert(phonePrompt && JSON.stringify(phonePrompt.markup).includes("request_contact"), "دکمه ارسال شماره تماس ارسال شد");

  // ۱۰) مشتری شماره تماس را با دکمه می‌فرستد
  await msg(CUSTOMER_CHAT, "", { contact: { phone_number: "+989123456789" } });
  reqs = await getRequests();
  assert(reqs[0].status === "awaiting_time" && reqs[0].phone === "+989123456789", "شماره تماس ثبت و وضعیت awaiting_time شد");

  // ۱۱) انتخاب زمان → هماهنگی + اطلاع ادمین با دکمه نقشه
  await cb(CUSTOMER_CHAT, `time:${r1}:tomorrow_morning`);
  reqs = await getRequests();
  assert(reqs[0].status === "scheduled", "سفارش زمان‌بندی شد");
  const adminSchedMsg = sentMessages.filter((m) => m.chatId === ADMIN_CHAT && m.text.includes("آماده است")).at(-1);
  assert(
    adminSchedMsg && JSON.stringify(adminSchedMsg.markup).includes("maps.google.com"),
    "دکمه «باز کردن روی نقشه» برای ادمین/پیک ارسال شد",
  );

  // ۱۲) جمع‌آوری → وزن با ارقام فارسی → مبلغ نهایی
  await cb(ADMIN_CHAT, `adm_done:${r1}`);
  reqs = await getRequests();
  assert(reqs[0].status === "collected", "وضعیت collected شد");

  await msg(ADMIN_CHAT, `وزن ${r1} ۴.۵`);
  let [adminState] = await db.select().from(conversationStates).where(eq(conversationStates.chatId, ADMIN_CHAT));
  assert(adminState?.state === "awaiting_final_price", "وزن با ارقام فارسی (۴.۵) ثبت شد");

  await msg(ADMIN_CHAT, `مبلغ ${r1} ۹۲۰۰۰`);
  reqs = await getRequests();
  const r1final = reqs[0];
  assert(r1final.status === "completed", "سفارش تکمیل شد");
  assert(r1final.rewardAmount === Math.round((92_000 * 12) / 100), "پاداش ۱۲٪ درست محاسبه شد");
  assert(Number(r1final.co2SavedKg) === Number((1.5 * 4.5).toFixed(2)), `کاهش CO₂ محاسبه شد (${r1final.co2SavedKg})`);

  // ۱۳) کیف پول، پاداش دعوت، و پاک‌سازی حریم خصوصی
  const txs = await db.select().from(creditTransactions);
  assert(
    txs.some((t) => t.customerId === customer.id && t.type === "reward" && t.amount === r1final.rewardAmount),
    "پاداش به کیف پول اعتباری مشتری واریز شد",
  );
  assert(
    txs.some((t) => t.customerId === referrer.id && t.type === "referral" && t.amount === 20_000),
    "پاداش دعوت به معرف واریز شد (اولین سفارش تکمیلی)",
  );
  assert(r1final.referralBonusGranted === true, "پرچم جلوگیری از پاداش دعوت تکراری زده شد");
  assert(r1final.address === null && r1final.phone === null && r1final.photoLocalPath === null,
    "🔒 پاک‌سازی حریم خصوصی (آدرس/تلفن/عکس) پس از تکمیل انجام شد");

  // ۱۴) امتیازدهی ۵ ستاره و جلوگیری از امتیاز تکراری
  await cb(CUSTOMER_CHAT, `rate:${r1}:5`);
  reqs = await getRequests();
  assert(reqs[0].rating === 5, "امتیاز ۵ ستاره ثبت شد");
  await cb(CUSTOMER_CHAT, `rate:${r1}:3`);
  reqs = await getRequests();
  assert(reqs[0].rating === 5, "امتیاز تکراری ثبت نشد");

  // ۱۵) گارد لغو: کلیک روی دکمه انصرافِ یک سفارش تکمیل‌شده نباید آن را لغو کند
  await cb(CUSTOMER_CHAT, `cancel:${r1}`);
  reqs = await getRequests();
  assert(reqs[0].status === "completed", "گارد لغو: سفارش تکمیل‌شده قابل لغو نیست (رفع باگ قبلی)");

  // ۱۶) جریان لغوی معتبر: سفارش دوم پس از قیمت توسط مشتری لغو می‌شود
  await processBaleUpdate({
    update_id: updateId++,
    message: { message_id: updateId, chat: { id: Number(CUSTOMER_CHAT) }, photo: [{ file_id: "FAKE_PHOTO_2" }] },
  });
  reqs = await getRequests();
  const r2 = reqs.at(-1)!.id;
  await cb(CUSTOMER_CHAT, `wt:${r2}:paper`);
  await cb(CUSTOMER_CHAT, `wb:${r2}:lt5`);
  await msg(ADMIN_CHAT, `قیمت ${r2} 30000`);
  await cb(CUSTOMER_CHAT, `confirm:${r2}`);
  await cb(CUSTOMER_CHAT, `cancel:${r2}`);
  reqs = await getRequests();
  assert(reqs.at(-1)!.status === "cancelled", "لغوی معتبر در وضعیت مجاز کار می‌کند");

  // ۱۷) مسیر کم‌ارزش: رد سریع ادمین → نوبت تجمیعی
  await processBaleUpdate({
    update_id: updateId++,
    message: { message_id: updateId, chat: { id: Number(CUSTOMER_CHAT) }, photo: [{ file_id: "FAKE_PHOTO_3" }] },
  });
  reqs = await getRequests();
  const r3 = reqs.at(-1)!.id;
  await cb(CUSTOMER_CHAT, `wt:${r3}:glass`);
  await cb(CUSTOMER_CHAT, `wb:${r3}:unknown`); // وزن نامشخص → بدون برآورد
  reqs = await getRequests();
  assert(reqs.at(-1)!.status === "awaiting_review" && reqs.at(-1)!.estimatedMax === null, "وزن نامشخص بدون برآورد ثابت ماند");
  await msg(ADMIN_CHAT, `رد ${r3}`);
  reqs = await getRequests();
  assert(reqs.at(-1)!.status === "low_value_queued", "مسیر کم‌ارزش (نوبت تجمیعی) کار می‌کند");

  // ۱۸) کیف پول و دستور /balance
  await msg(CUSTOMER_CHAT, "/balance");
  assert(
    sentMessages.some((m) => m.chatId === CUSTOMER_CHAT && m.text.includes("کیف پول") && m.text.includes("پاداش سفارش")),
    "دستور /balance موجودی و تراکنش‌ها را نشان می‌دهد",
  );

  // ۱۹) محافظت از ادمین: مشتری نمی‌تواند اکشن ادمین بزند
  await cb(CUSTOMER_CHAT, `adm_r:${r2}`);
  assert(
    !sentMessages.some((m) => m.chatId === CUSTOMER_CHAT && m.text.includes("تجمیعی قرار گرفت")),
    "اکشن ادمین توسط مشتری اجرا نمی‌شود",
  );

  // پاک‌سازی فایل‌های عکس تستی
  fs.rmSync(process.env.UPLOAD_DIR!, { recursive: true, force: true });

  globalThis.fetch = originalFetch;
  console.log("\n🎉 همه تست‌های جریان چرخه با موفقیت پاس شدند.");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
