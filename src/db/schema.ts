import {
  pgTable,
  pgEnum,
  serial,
  text,
  integer,
  numeric,
  timestamp,
  jsonb,
  boolean,
} from "drizzle-orm/pg-core";

// ---------------------------------------------------------------------------
// چرخه (Charkheh) — ربات بله برای جمع‌آوری پسماند خشک و کالای دسته‌دوم در سراسر ایران
// ---------------------------------------------------------------------------

export const requestStatusEnum = pgEnum("request_status", [
  "awaiting_type", // منتظر انتخاب نوع کالا توسط مشتری
  "awaiting_review", // منتظر بررسی قیمت توسط ادمین
  "quoted", // قیمت پیشنهادی ارسال شد، منتظر تایید مشتری
  "confirmed", // مشتری تایید کرد؛ در انتخاب استان/آدرس است
  "awaiting_address", // منتظر موقعیت مکانی/آدرس دقیق
  "awaiting_time", // منتظر انتخاب زمان تحویل
  "scheduled", // زمان و آدرس مشخص شد، منتظر مراجعه
  "collected", // جمع‌آوری‌کننده مراجعه کرد (وزن/مبلغ ثبت نشده)
  "completed", // نهایی شد، اعتبار/پاداش پرداخت شد
  "low_value_queued", // ارزش پایین؛ در نوبت جمع‌آوری تجمیعی
  "rejected", // رد شده
  "cancelled", // توسط مشتری لغو شد
]);

export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull().unique(),
  firstName: text("first_name"),
  lastName: text("last_name"),
  username: text("username"),
  phone: text("phone"),
  inviteCode: text("invite_code").unique(),
  invitedByCode: text("invited_by_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const pickupRequests = pgTable("pickup_requests", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  status: requestStatusEnum("status").notNull().default("awaiting_type"),

  wasteType: text("waste_type"), // کاغذ/پلاستیک/فلز/شیشه/کالای دسته‌دوم/سایر
  photoFileId: text("photo_file_id"),
  photoLocalPath: text("photo_local_path"), // خارج از public نگهداری می‌شود

  estimatedWeightBand: text("estimated_weight_band"), // بازه وزنی اعلامی مشتری
  estimatedWeightKg: numeric("estimated_weight_kg", { precision: 10, scale: 2 }),
  estimatedMin: integer("estimated_min"), // برآورد خودکار از روی نرخ × بازه وزنی
  estimatedMax: integer("estimated_max"),
  quotedPrice: integer("quoted_price"),

  province: text("province"), // استان مشتری (پوشش سراسری)
  city: text("city"),
  address: text("address"), // پس از تکمیل/لغو پاک می‌شود (حریم خصوصی)
  locationLat: numeric("location_lat", { precision: 10, scale: 7 }),
  locationLng: numeric("location_lng", { precision: 10, scale: 7 }),
  phone: text("phone"), // شماره تماس برای هماهنگی مراجعه
  preferredTime: text("preferred_time"),

  finalWeightKg: numeric("final_weight_kg", { precision: 10, scale: 2 }),
  finalPrice: integer("final_price"),
  rewardPercent: integer("reward_percent").default(12),
  rewardAmount: integer("reward_amount"),
  co2SavedKg: numeric("co2_saved_kg", { precision: 10, scale: 2 }), // کاهش CO₂ (الهام از مدل‌های جهانی بازیافت)
  rating: integer("rating"), // امتیاز ۱ تا ۵ پس از تکمیل
  referralBonusGranted: boolean("referral_bonus_granted").notNull().default(false),

  adminNote: text("admin_note"),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  quotedAt: timestamp("quoted_at", { withTimezone: true }),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const requestEvents = pgTable("request_events", {
  id: serial("id").primaryKey(),
  requestId: integer("request_id")
    .notNull()
    .references(() => pickupRequests.id, { onDelete: "cascade" }),
  status: text("status").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// وضعیت گفتگوی جاری برای هر چت (مشتری یا ادمین) — برای مدیریت گام‌های چندمرحله‌ای
export const conversationStates = pgTable("conversation_states", {
  id: serial("id").primaryKey(),
  chatId: text("chat_id").notNull().unique(),
  state: text("state").notNull(), // مثال: awaiting_address_detail
  requestId: integer("request_id"),
  data: jsonb("data"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// نرخ خرید هر نوع پسماند (تومان به ازای هر کیلوگرم) + ضریب CO₂ هر کیلوگرم
export const materialRates = pgTable("material_rates", {
  id: serial("id").primaryKey(),
  material: text("material").notNull().unique(),
  label: text("label").notNull(),
  pricePerKg: integer("price_per_kg").notNull(),
  co2PerKg: numeric("co2_per_kg", { precision: 8, scale: 2 }), // کیلوگرم CO₂ صرفه‌جویی‌شده به ازای هر کیلوگرم
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// کیف پول اعتباری مشتریان (دفتر تراکنش؛ موجودی = جمع مبالغ)
export const creditTransactions = pgTable("credit_transactions", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  amount: integer("amount").notNull(), // تومان؛ مثبت=واریز اعتبار، منفی=برداشت
  type: text("type").notNull(), // reward | referral | adjustment
  requestId: integer("request_id"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// تنظیمات کلی ربات (کلید-مقدار)
export const botSettings = pgTable("bot_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
