import { db } from "@/db";
import { customers, pickupRequests, materialRates } from "@/db/schema";
import { eq, desc, and } from "drizzle-orm";
import {
  sendMessage,
  sendPhotoByFileId,
  answerCallbackQuery,
  editMessageReplyMarkup,
  broadcastToChats,
  mapLink,
  type InlineKeyboard,
  type ReplyMarkup,
} from "@/lib/bale";
import type { BaleUpdate, BaleMessage, BaleCallbackQuery } from "@/lib/baleTypes";
import {
  getOrCreateCustomer,
  getCustomerById,
  getCustomerByInviteCode,
  getCustomerBalance,
  getRecentTransactions,
} from "@/lib/customers";
import { addCreditTransaction, CREDIT_TYPE_LABELS } from "@/lib/credits";
import {
  createRequest,
  getRequestById,
  getRequestWithCustomer,
  updateRequest,
  logEvent,
  purgePrivateData,
} from "@/lib/requests";
import { getConversationState, setConversationState, clearConversationState } from "@/lib/convState";
import { savePhotoLocally } from "@/lib/photoStorage";
import {
  ensureSeedData,
  getRewardPercent,
  getMinAcceptValue,
  getReferralBonus,
  getCoverageProvinces,
  getActiveMaterialRate,
} from "@/lib/settings";
import {
  toToman,
  statusLabel,
  wasteTypeLabel,
  normalizeDigits,
  WASTE_TYPES,
  TIME_SLOTS,
  timeSlotLabel,
} from "@/lib/persian";
import { PROVINCES, provinceLabel } from "@/lib/geo";
import {
  WEIGHT_BANDS,
  NO_WEIGHT_TYPES,
  getWeightBand,
  estimatePriceRange,
} from "@/lib/pricing";
import { isAdminChat, getAdminChatIds } from "@/lib/adminAuth";

// وضعیت‌هایی از گفتگو که ارسال عکس در میانه آن‌ها نباید سفارش جدید بسازد
const BUSY_STATES = new Set([
  "awaiting_province",
  "awaiting_location",
  "awaiting_address_detail",
  "awaiting_phone",
  "awaiting_custom_time",
]);

const SKIP_LOCATION_TEXT = "✍️ بدون لوکیشن، آدرس متنی";
const SKIP_PHONE_TEXT = "⏭ بدون شماره، ادامه";

// وضعیت‌هایی که مشتری اجازه دارد سفارش را در آن‌ها لغو کند
const CUSTOMER_CANCELLABLE = new Set(["quoted", "confirmed", "awaiting_address", "awaiting_time"]);

const INVITE_CODE_REGEX = /^CHK-[A-Z0-9]{4,8}$/i;

// ---------------------------------------------------------------------------
// ابزارهای کمکی
// ---------------------------------------------------------------------------

function appBaseUrl(): string | null {
  const url = process.env.APP_BASE_URL;
  return url ? url.replace(/\/$/, "") : null;
}

function detailUrl(id: number): string {
  const base = appBaseUrl();
  return base ? `🔗 جزئیات: ${base}/admin/requests/${id}` : "";
}

/** عدد صحیح از متن؛ ارقام فارسی/عربی هم پشتیبانی می‌شود (رفع باگ قبلی) */
function parseIntLoose(text: string): number | null {
  const normalized = normalizeDigits(text);
  const digits = normalized.replace(/[^\d]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}

/** عدد اعشاری از متن؛ «۴.۵» و «۴/۵» هم درست خوانده می‌شود */
function parseFloatLoose(text: string): number | null {
  const normalized = normalizeDigits(text);
  const match = normalized.match(/\d+(?:\.\d+)?/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** شماره تماس: فقط ارقام و + اختیاری، ۸ تا ۱۵ رقم پس از نرمال‌سازی */
function parsePhone(raw: string): string | null {
  const normalized = normalizeDigits(raw).replace(/[\s-]/g, "");
  if (!/^\+?\d{8,15}$/.test(normalized)) return null;
  return normalized;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function customerDisplayName(customer: {
  firstName: string | null;
  lastName: string | null;
  username: string | null;
}): string {
  const name = [customer.firstName, customer.lastName].filter(Boolean).join(" ").trim();
  if (name) return name;
  if (customer.username) return `@${customer.username}`;
  return "مشتری";
}

/** آیا این سفارش متعلق به صاحب همین چت است؟ (برای callbackهای مشتری) */
async function requestBelongsToChat(chatId: string, customerId: number): Promise<boolean> {
  const customer = await getCustomerById(customerId);
  return customer?.chatId === chatId;
}

// ---------------------------------------------------------------------------
// نقطه ورود اصلی
// ---------------------------------------------------------------------------
export async function processBaleUpdate(update: BaleUpdate): Promise<void> {
  await ensureSeedData();

  try {
    if (update.callback_query) {
      await handleCallbackQuery(update.callback_query);
      return;
    }
    if (update.message) {
      await handleMessage(update.message);
      return;
    }
  } catch (err) {
    console.error("خطای پردازش آپدیت بله:", err);
  }
}

// ---------------------------------------------------------------------------
// پیام‌های مشتری/ادمین
// ---------------------------------------------------------------------------
function extractImage(message: BaleMessage): { fileId: string; mime: string | null } | null {
  if (message.photo && message.photo.length > 0) {
    // بزرگ‌ترین سایز (آخر آرایه)
    return { fileId: message.photo[message.photo.length - 1].file_id, mime: "image/jpeg" };
  }
  if (message.document?.mime_type?.startsWith("image/")) {
    return { fileId: message.document.file_id, mime: message.document.mime_type };
  }
  return null;
}

async function handleMessage(message: BaleMessage): Promise<void> {
  const chatId = String(message.chat.id);
  const text = (message.text ?? "").trim();

  if (isAdminChat(chatId)) {
    await handleAdminMessage(chatId, text);
    return;
  }

  const customer = await getOrCreateCustomer(chatId, message.from);

  // دستورهای مشتری
  if (text.startsWith("/start")) {
    await handleStart(chatId, customer.id, text);
    return;
  }
  if (text === "/status" || text === "/سفارش") {
    await sendCustomerStatus(chatId, customer.id);
    return;
  }
  if (text === "/prices" || text === "/تعرفه" || text === "/تعرفه‌ها") {
    await sendPriceList(chatId);
    return;
  }
  if (text === "/balance" || text === "/اعتبار") {
    await sendBalance(chatId, customer.id);
    return;
  }
  if (text === "/invite" || text === "/دعوت") {
    await sendInviteInfo(chatId, customer.id);
    return;
  }
  if (text === "/help" || text === "/راهنما") {
    await sendCustomerHelp(chatId);
    return;
  }
  if (text === "/cancel" || text === "/لغو") {
    await clearConversationState(chatId);
    await sendMessage(
      chatId,
      "حالت گفتگوی قبلی پاک شد. برای سفارش جدید کافیه دوباره عکس بفرستی 📷",
      { remove_keyboard: true },
    );
    return;
  }

  const state = await getConversationState(chatId);

  // دریافت موقعیت مکانی (از روی نقشه)
  if (message.location) {
    await handleLocationInput(chatId, state, message.location.latitude, message.location.longitude);
    return;
  }

  // دریافت شماره تماس (دکمه request_contact)
  if (message.contact) {
    await handleContactInput(chatId, state, message.contact.phone_number);
    return;
  }

  // ثبت کد دعوت
  if (text && INVITE_CODE_REGEX.test(normalizeDigits(text).toUpperCase())) {
    await handleInviteCode(chatId, customer.id, normalizeDigits(text).toUpperCase());
    return;
  }

  const image = extractImage(message);
  if (image) {
    if (state && BUSY_STATES.has(state.state)) {
      await sendMessage(
        chatId,
        "الان وسط هماهنگی سفارش قبلی هستیم 🙏 اول این مرحله رو کامل کن؛ اگر می‌خوای از اول شروع کنی دستور /لغو رو بفرست و دوباره عکس بده.",
      );
      return;
    }
    await handleCustomerPhoto(customer.id, chatId, image.fileId, image.mime);
    return;
  }

  if (state && text) {
    await handleCustomerStateInput(chatId, state, text);
    return;
  }

  if (text) {
    await sendMessage(
      chatId,
      "برای دریافت قیمت فقط کافیه عکس واضحی از کالا یا پسماندت رو همینجا بفرستی 📷\n\nدستورها:\n/status — وضعیت سفارش‌ها\n/prices — تعرفه خرید\n/balance — کیف پول اعتباری\n/invite — کد دعوت و پاداش معرفی\n/help — راهنما و حریم خصوصی",
    );
  }
}

// ---------------------------------------------------------------------------
// دستورهای مشتری
// ---------------------------------------------------------------------------
async function handleStart(chatId: string, customerId: number, text: string): Promise<void> {
  await clearConversationState(chatId); // شروع تازه: هر حالت گیرکرده‌ای پاک می‌شود

  // deep link: /start CHK-XXXX → ثبت کد دعوت
  const param = normalizeDigits(text.replace("/start", "").trim()).toUpperCase();
  if (param && INVITE_CODE_REGEX.test(param)) {
    await handleInviteCode(chatId, customerId, param, { silent: true });
  }

  const welcome = [
    "سلام 👋 به «چرخه» خوش اومدی!",
    "",
    "ما پسماند خشک (کاغذ، پلاستیک، فلز، شیشه) و کالای دسته‌دوم سالم رو در سراسر ایران ازت می‌خریم و در ازاش اعتبار یا وجه نقد پرداخت می‌کنیم ♻️",
    "",
    "📷 برای شروع فقط کافیه یک عکس واضح از کالا/پسماندت رو بفرستی.",
    "📍 در مرحله آدرس می‌تونی موقعیتت رو دقیق از روی نقشه بفرستی.",
    "",
    "🔒 حریم خصوصی:",
    "• فقط از خودِ کالا عکس بگیر، نه از فضای داخلی خانه یا افراد.",
    "• عکس، آدرس دقیق و شماره تماست فقط تا پایان جمع‌آوری نزد ما می‌ماند و بعد به‌صورت خودکار پاک می‌شود.",
    "",
    "دستورها: /prices تعرفه‌ها • /status وضعیت سفارش • /balance کیف پول • /invite کد دعوت • /help راهنما",
  ].join("\n");
  await sendMessage(chatId, welcome, { remove_keyboard: true });
}

async function sendCustomerStatus(chatId: string, customerId: number): Promise<void> {
  const rows = await db
    .select()
    .from(pickupRequests)
    .where(eq(pickupRequests.customerId, customerId))
    .orderBy(desc(pickupRequests.createdAt))
    .limit(5);

  if (rows.length === 0) {
    await sendMessage(chatId, "هنوز سفارشی ثبت نکردی. یک عکس از کالات بفرست تا شروع کنیم 📷");
    return;
  }

  const lines = rows.map((r) => {
    const parts = [`#${r.id} — ${statusLabel(r.status)}`];
    if (r.quotedPrice) parts.push(`قیمت: ${toToman(r.quotedPrice)} تومان`);
    if (r.finalPrice) parts.push(`نهایی: ${toToman(r.finalPrice)} تومان`);
    return parts.join(" | ");
  });

  await sendMessage(chatId, ["📋 آخرین سفارش‌های تو:", "", ...lines].join("\n"));
}

async function sendPriceList(chatId: string): Promise<void> {
  const rates = await db.select().from(materialRates).where(eq(materialRates.active, true));

  const minAccept = await getMinAcceptValue();
  const lines = rates.map(
    (r) => `• ${wasteTypeLabel(r.material)}: هر کیلو ${toToman(r.pricePerKg)} تومان`,
  );

  await sendMessage(
    chatId,
    [
      "💰 تعرفه‌های امروز خرید پسماند خشک:",
      "",
      ...lines,
      "",
      "👕 قیمت کالای دسته‌دوم بر اساس عکس و سلامت کالا موردی اعلام می‌شود.",
      `🚚 حداقل ارزش سفارش برای اعزام فوری: ${toToman(minAccept)} تومان (سفارش‌های کوچک‌تر در نوبت جمع‌آوری تجمیعی محله قرار می‌گیرند).`,
      "📍 پوشش: سراسر ایران",
    ].join("\n"),
  );
}

async function sendBalance(chatId: string, customerId: number): Promise<void> {
  const balance = await getCustomerBalance(customerId);
  const txs = await getRecentTransactions(customerId, 5);

  const lines = [`💳 موجودی کیف پول اعتباری تو: ${toToman(balance)} تومان`];
  if (txs.length > 0) {
    lines.push("", "آخرین تراکنش‌ها:");
    for (const t of txs) {
      const sign = t.amount >= 0 ? "+" : "−";
      lines.push(
        `• ${sign}${toToman(Math.abs(t.amount))} تومان — ${CREDIT_TYPE_LABELS[t.type] ?? t.type}${t.note ? ` (${t.note})` : ""}`,
      );
    }
  }
  await sendMessage(chatId, lines.join("\n"));
}

async function sendInviteInfo(chatId: string, customerId: number): Promise<void> {
  const customer = await getCustomerById(customerId);
  if (!customer) return;
  const bonus = await getReferralBonus();

  await sendMessage(
    chatId,
    [
      "🎁 دعوت از دوستان — هر دو جایزه می‌گیرید!",
      "",
      `کد دعوت اختصاصی تو: ${customer.inviteCode}`,
      "",
      `کافیه دوستت این کد رو داخل همین ربات بفرسته؛ بعد از تکمیل اولین سفارشش، ${toToman(bonus)} تومان اعتبار به کیف پول تو واریز می‌شه.`,
      "محدودیتی در تعداد دعوت نیست — دورهمی به چرخه بپیوندون ♻️",
    ].join("\n"),
  );
}

async function sendCustomerHelp(chatId: string): Promise<void> {
  await sendMessage(
    chatId,
    [
      "❓ راهنمای چرخه",
      "",
      "۱) عکس کالا/پسماند رو بفرست",
      "۲) نوع و وزن تقریبی رو انتخاب کن",
      "۳) قیمت پیشنهادی رو تایید کن",
      "۴) استان، موقعیت روی نقشه/آدرس و زمان مراجعه رو مشخص کن",
      "۵) همکار ما مراجعه می‌کنه؛ وزن و مبلغ نهایی اونجا ثبت و تسویه می‌شه",
      "",
      "دستورها:",
      "/status — آخرین سفارش‌ها",
      "/prices — تعرفه‌ها",
      "/balance — کیف پول اعتباری",
      "/invite — کد دعوت و پاداش",
      "/cancel — شروع دوباره گفتگو",
      "",
      "🔒 حریم خصوصی: عکس، آدرس دقیق و شماره تماس فقط تا پایان سفارش نزد ما می‌ماند و بعد خود به خود پاک می‌شود. استان و شهر فقط برای آمار نگه‌داری می‌شوند.",
    ].join("\n"),
  );
}

async function handleInviteCode(
  chatId: string,
  customerId: number,
  code: string,
  options?: { silent?: boolean },
): Promise<void> {
  const customer = await getCustomerById(customerId);
  if (!customer) return;

  if (customer.inviteCode === code) {
    await sendMessage(chatId, "این کدِ خودته 😊 کدِ یکی از دوستانت رو بفرست.");
    return;
  }
  if (customer.invitedByCode) {
    await sendMessage(chatId, "قبلاً یک کد دعوت برات ثبت شده ✅");
    return;
  }
  const referrer = await getCustomerByInviteCode(code);
  if (!referrer) {
    if (!options?.silent) {
      await sendMessage(chatId, "این کد دعوت معتبر نیست. از دوستت دوباره بپرس 🙏");
    }
    return;
  }

  await db.update(customers).set({ invitedByCode: code }).where(eq(customers.id, customerId));
  const bonus = await getReferralBonus();
  await sendMessage(
    chatId,
    `کد دعوت ثبت شد ✅ بعد از تکمیل اولین سفارشت، ${toToman(bonus)} تومان اعتبار به کیف پول دوستت واریز می‌شه. حالا یک عکس از کالاهات بفرست 📷`,
  );
  await sendMessage(
    referrer.chatId,
    `🎉 یک نفر با کد دعوت تو به چرخه پیوست! بعد از تکمیل اولین سفارشش ${toToman(bonus)} تومان به کیف پولت واریز می‌شه.`,
  );
}

// ---------------------------------------------------------------------------
// عکس و انتخاب نوع/وزن
// ---------------------------------------------------------------------------
async function handleCustomerPhoto(
  customerId: number,
  chatId: string,
  fileId: string,
  mime: string | null,
): Promise<void> {
  const localName = await savePhotoLocally(fileId, mime);
  const request = await createRequest({ customerId, photoFileId: fileId, photoLocalPath: localName });

  const keyboard: InlineKeyboard = chunk(
    WASTE_TYPES.map((w) => ({ text: w.label, callback_data: `wt:${request.id}:${w.key}` })),
    2,
  );

  await sendMessage(
    chatId,
    "عکس دریافت شد ✅\nنوع کالا/پسماند رو مشخص کن تا سریع‌تر بررسی بشه:",
    { inline_keyboard: keyboard },
  );
}

async function onWasteTypeSelected(
  chatId: string,
  messageId: number,
  requestId: number,
  typeKey: string,
): Promise<void> {
  const request = await getRequestById(requestId);
  if (!request || request.status !== "awaiting_type") return;
  if (!(await requestBelongsToChat(chatId, request.customerId))) return;

  await updateRequest(requestId, { wasteType: typeKey, estimatedWeightBand: null });

  // انواعی که برآورد وزنی ندارند (دسته‌دوم/سایر) مستقیم برای بررسی قیمت می‌روند
  if (NO_WEIGHT_TYPES.has(typeKey)) {
    await updateRequest(requestId, { status: "awaiting_review" });
    await logEvent(requestId, "awaiting_review", `نوع انتخابی: ${wasteTypeLabel(typeKey)}`);
    await editMessageReplyMarkup(chatId, messageId, []);
    await sendMessage(
      chatId,
      `ثبت شد ✅ نوع: ${wasteTypeLabel(typeKey)}\nدرخواستت برای بررسی قیمت به تیم چرخه ارسال شد. معمولاً تا ۳۰ دقیقه بازه قیمت رو اعلام می‌کنیم ⏱`,
    );
    await notifyAdminsNewRequest(requestId);
    return;
  }

  await logEvent(requestId, "awaiting_type", `نوع انتخابی: ${wasteTypeLabel(typeKey)} — در انتظار وزن تقریبی`);
  await editMessageReplyMarkup(chatId, messageId, []);

  const keyboard: InlineKeyboard = [
    ...chunk(
      WEIGHT_BANDS.filter((b) => b.key !== "unknown").map((b) => ({
        text: b.label,
        callback_data: `wb:${requestId}:${b.key}`,
      })),
      2,
    ),
    [{ text: getWeightBand("unknown")!.label, callback_data: `wb:${requestId}:unknown` }],
  ];
  await sendMessage(
    chatId,
    `نوع: ${wasteTypeLabel(typeKey)} ✅\nوزن تقریبی کالاها رو انتخاب کن تا بازه قیمت دقیق‌تر برآورد بشه:`,
    { inline_keyboard: keyboard },
  );
}

async function onWeightBandSelected(
  chatId: string,
  messageId: number,
  requestId: number,
  bandKey: string,
): Promise<void> {
  const request = await getRequestById(requestId);
  if (!request || request.status !== "awaiting_type" || !request.wasteType) return;
  if (!(await requestBelongsToChat(chatId, request.customerId))) return;

  const band = getWeightBand(bandKey);
  if (!band) return;

  // برآورد خودکار قیمت بر اساس نرخ × بازه وزنی
  let estimatedMin: number | null = null;
  let estimatedMax: number | null = null;
  let estimatedWeightKg: string | null = null;
  const rate = await getActiveMaterialRate(request.wasteType);
  if (rate) {
    const est = estimatePriceRange(rate.pricePerKg, bandKey);
    if (est) {
      estimatedMin = est.min;
      estimatedMax = est.max;
    }
    if (band.minKg !== null) {
      const mid = band.maxKg ? (band.minKg + band.maxKg) / 2 : band.minKg;
      estimatedWeightKg = String(mid);
    }
  }

  await updateRequest(requestId, {
    estimatedWeightBand: bandKey,
    estimatedWeightKg,
    estimatedMin,
    estimatedMax,
    status: "awaiting_review",
  });
  await logEvent(
    requestId,
    "awaiting_review",
    `وزن تقریبی: ${band.label}${estimatedMax ? ` — برآورد سیستم: ${estimatedMin}–${estimatedMax} تومان` : ""}`,
  );
  await editMessageReplyMarkup(chatId, messageId, []);

  const estLine =
    estimatedMin !== null && estimatedMax !== null
      ? `\n💡 برآورد اولیه بر اساس تعرفه امروز: حدود ${toToman(estimatedMin)} تا ${toToman(estimatedMax)} تومان (قیمت نهایی بعد از بررسی عکس و وزن‌کشی حضوری مشخص می‌شه).`
      : "";
  await sendMessage(
    chatId,
    `حله ✅ درخواستت برای بررسی قیمت به تیم چرخه ارسال شد.${estLine}\nمعمولاً تا ۳۰ دقیقه بازه قیمت رو اعلام می‌کنیم ⏱`,
  );
  await notifyAdminsNewRequest(requestId);
}

async function notifyAdminsNewRequest(requestId: number): Promise<void> {
  const admins = getAdminChatIds();
  if (admins.length === 0) return;

  const full = await getRequestWithCustomer(requestId);
  if (!full) return;
  const { request, customer } = full;

  const minAccept = await getMinAcceptValue();
  const isLikelyLowValue =
    request.estimatedMax !== null && request.estimatedMax < minAccept;

  const caption = [
    `📸 درخواست جدید #${request.id}`,
    `مشتری: ${customerDisplayName(customer)} (${customer.chatId})`,
    `نوع کالا: ${wasteTypeLabel(request.wasteType)}`,
    request.estimatedWeightBand
      ? `وزن تقریبی: ${getWeightBand(request.estimatedWeightBand)?.label ?? "-"}`
      : "",
    request.estimatedMin !== null && request.estimatedMax !== null
      ? `💡 برآورد سیستم: ${toToman(request.estimatedMin)} تا ${toToman(request.estimatedMax)} تومان`
      : "",
    isLikelyLowValue
      ? `⚠️ برآورد سیستم: کم‌ارزش (کمتر از حد اعزام ${toToman(minAccept)} تومان) — پیشنهاد: نوبت جمع‌آوری تجمیعی`
      : "",
    detailUrl(request.id),
    "",
    "برای اعلام قیمت روی دکمه بزن یا سریع بنویس: قیمت " + request.id + " مبلغ",
  ]
    .filter(Boolean)
    .join("\n");

  const keyboard: InlineKeyboard = [
    [{ text: "💰 ثبت قیمت پیشنهادی", callback_data: `adm_q:${requestId}` }],
    [{ text: "🚫 کم‌ارزش (نوبت تجمیعی)", callback_data: `adm_r:${requestId}` }],
  ];

  for (const admin of admins) {
    if (request.photoFileId) {
      await sendPhotoByFileId(admin, request.photoFileId, caption, keyboard);
    } else {
      await sendMessage(admin, caption, { inline_keyboard: keyboard });
    }
  }
}

// ---------------------------------------------------------------------------
// ورودی‌های چندمرحله‌ای مشتری (استان، لوکیشن، آدرس، تماس، زمان)
// ---------------------------------------------------------------------------
async function handleLocationInput(
  chatId: string,
  state: { state: string; requestId: number | null } | null,
  lat: number,
  lng: number,
): Promise<void> {
  if (!state || state.state !== "awaiting_location" || !state.requestId) {
    await sendMessage(chatId, "الان نیازی به لوکیشن نداریم 🙏 اگر سفارش فعالی داری، مراحلش رو از همین‌جا ادامه بده.");
    return;
  }

  await updateRequest(state.requestId, {
    locationLat: String(lat),
    locationLng: String(lng),
  });
  await logEvent(state.requestId, "awaiting_address", `موقعیت مکانی ثبت شد (${lat.toFixed(5)}, ${lng.toFixed(5)})`);

  await setConversationState(chatId, "awaiting_address_detail", state.requestId);
  await sendMessage(
    chatId,
    "📍 لوکیشن روی نقشه دریافت شد ✅\nحالا نام شهر و آدرس دقیق رو بنویس (خیابان، کوچه، پلاک، واحد):",
    { remove_keyboard: true },
  );
}

async function handleContactInput(
  chatId: string,
  state: { state: string; requestId: number | null } | null,
  phone: string,
): Promise<void> {
  if (!state || state.state !== "awaiting_phone" || !state.requestId) {
    await sendMessage(chatId, "الان نیازی به شماره تماس نداریم 🙏");
    return;
  }
  const parsed = parsePhone(phone);
  if (!parsed) {
    await sendMessage(chatId, "شماره معتبر نیست. دوباره با همون دکمه بفرست یا تایپ کن (مثلاً 09123456789):");
    return;
  }
  await finishPhoneStep(chatId, state.requestId, parsed);
}

async function finishPhoneStep(chatId: string, requestId: number, phone: string | null): Promise<void> {
  if (phone) {
    await updateRequest(requestId, { phone });
    const full = await getRequestWithCustomer(requestId);
    if (full) {
      await db.update(customers).set({ phone }).where(eq(customers.id, full.customer.id));
    }
    await logEvent(requestId, "awaiting_time", "شماره تماس دریافت شد");
  } else {
    await logEvent(requestId, "awaiting_time", "مشتری بدون ثبت شماره ادامه داد");
  }

  await updateRequest(requestId, { status: "awaiting_time" });
  await setConversationState(chatId, "awaiting_time", requestId);

  await sendTimeSlotMessage(chatId, requestId);
}

async function sendTimeSlotMessage(chatId: string, requestId: number): Promise<void> {
  const keyboard: InlineKeyboard = [
    ...chunk(
      TIME_SLOTS.filter((t) => t.key !== "custom").map((t) => ({
        text: t.label,
        callback_data: `time:${requestId}:${t.key}`,
      })),
      2,
    ),
    [{ text: TIME_SLOTS.find((t) => t.key === "custom")!.label, callback_data: `time:${requestId}:custom` }],
  ];
  await sendMessage(chatId, "عالی 🙌 حالا زمان مناسب برای مراجعه رو انتخاب کن:", {
    inline_keyboard: keyboard,
  });
}

async function handleCustomerStateInput(
  chatId: string,
  state: { state: string; requestId: number | null },
  text: string,
): Promise<void> {
  if (!state.requestId) {
    await clearConversationState(chatId);
    return;
  }
  const request = await getRequestById(state.requestId);
  if (!request) {
    await clearConversationState(chatId);
    return;
  }

  if (state.state === "awaiting_province") {
    await sendMessage(chatId, "لطفاً استان رو از روی دکمه‌های پیام قبلی انتخاب کن 👆");
    return;
  }

  if (state.state === "awaiting_location") {
    // متن در این مرحله یعنی کاربر لوکیشن نمی‌فرستد و مستقیم آدرس را می‌نویسد
    if (text === SKIP_LOCATION_TEXT) {
      await setConversationState(chatId, "awaiting_address_detail", request.id);
      await sendMessage(
        chatId,
        "باشه 👌 نام شهر و آدرس دقیق رو بنویس (خیابان، کوچه، پلاک، واحد):",
        { remove_keyboard: true },
      );
      return;
    }
    // متن آزاد = خودِ آدرس
    await saveAddressAndAskPhone(chatId, request.id, text);
    return;
  }

  if (state.state === "awaiting_address_detail") {
    await saveAddressAndAskPhone(chatId, request.id, text);
    return;
  }

  if (state.state === "awaiting_phone") {
    if (text === SKIP_PHONE_TEXT) {
      await finishPhoneStep(chatId, request.id, null);
      return;
    }
    const parsed = parsePhone(text);
    if (!parsed) {
      await sendMessage(
        chatId,
        "شماره معتبر نیست 🙏 شماره موبایل رو بنویس (مثلاً 09123456789) یا روی «📱 ارسال شماره تماس» بزن:",
      );
      return;
    }
    await finishPhoneStep(chatId, request.id, parsed);
    return;
  }

  if (state.state === "awaiting_time") {
    await sendMessage(chatId, "زمان مراجعه رو از روی دکمه‌های پیام قبلی انتخاب کن 👆 (یا «زمان دیگر» رو بزن و تایپ کن)");
    return;
  }

  if (state.state === "awaiting_custom_time") {
    const cleaned = text.slice(0, 120);
    await scheduleRequest(chatId, request.id, cleaned);
    await clearConversationState(chatId);
    return;
  }

  // وضعیت ناشناخته: پاکش کن تا گیر نکند
  await clearConversationState(chatId);
}

async function saveAddressAndAskPhone(chatId: string, requestId: number, address: string): Promise<void> {
  if (address.length < 6) {
    await sendMessage(chatId, "لطفاً آدرس رو کامل‌تر بنویس (شهر، خیابان، کوچه، پلاک، واحد) 🙏");
    return;
  }
  await updateRequest(requestId, { address: address.slice(0, 500) });
  await logEvent(requestId, "awaiting_address", "آدرس متنی دریافت شد");
  await setConversationState(chatId, "awaiting_phone", requestId);
  await sendMessage(
    chatId,
    "آدرس ثبت شد ✅\nبرای هماهنگی مراجعه، شماره تماست رو بفرست (اختیاری):",
    {
      keyboard: [
        [{ text: "📱 ارسال شماره تماس", request_contact: true }],
        [{ text: SKIP_PHONE_TEXT }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  );
}

// ---------------------------------------------------------------------------
// استان و پوشش سراسری
// ---------------------------------------------------------------------------
async function askProvince(chatId: string, requestId: number): Promise<void> {
  const keyboard: InlineKeyboard = chunk(
    PROVINCES.map((p) => ({ text: p.label, callback_data: `prov:${requestId}:${p.key}` })),
    3,
  );
  await sendMessage(chatId, "برای اعزام، اول بگو کدوم استان هستی؟ 🗺 (پوشش چرخه سراسری است)", {
    inline_keyboard: keyboard,
  });
}

async function onProvinceSelected(
  chatId: string,
  messageId: number,
  requestId: number,
  provinceKey: string,
): Promise<void> {
  const request = await getRequestById(requestId);
  if (!request || (request.status !== "confirmed" && request.status !== "awaiting_address")) return;
  if (!(await requestBelongsToChat(chatId, request.customerId))) return;

  const province = PROVINCES.find((p) => p.key === provinceKey);
  if (!province) return;

  // کنترل پوشش: لیست خالی = سراسر ایران (بدون محدودیت)
  const coverage = await getCoverageProvinces();
  if (coverage.length > 0 && !coverage.includes(provinceKey)) {
    await updateRequest(requestId, { province: province.label, status: "cancelled" });
    await logEvent(requestId, "cancelled", `خارج از محدوده پوشش (${province.label})`);
    await editMessageReplyMarkup(chatId, messageId, []);
    await clearConversationState(chatId);
    await sendMessage(
      chatId,
      `متأسفانه فعلاً در استان ${province.label} سرویس اعزام فعال نیست 🙏 به‌محض فعال‌سازی بهت خبر می‌دیم.`,
    );
    return;
  }

  await updateRequest(requestId, { province: province.label, status: "awaiting_address" });
  await logEvent(requestId, "awaiting_address", `استان: ${province.label}`);
  await editMessageReplyMarkup(chatId, messageId, []);
  await setConversationState(chatId, "awaiting_location", requestId);

  await sendMessage(
    chatId,
    `استان ${province.label} ✅\nحالا موقعیتت رو دقیق روی نقشه بفرست (بهترین روش برای پیداکردن آدرست) یا آدرس رو تایپ کن:`,
    {
      keyboard: [
        [{ text: "📍 ارسال موقعیت روی نقشه", request_location: true }],
        [{ text: SKIP_LOCATION_TEXT }],
      ],
      resize_keyboard: true,
      one_time_keyboard: true,
    },
  );
}

// ---------------------------------------------------------------------------
// هماهنگی نهایی (زمان) + اطلاع به ادمین‌ها
// ---------------------------------------------------------------------------
async function scheduleRequest(chatId: string, requestId: number, preferredTime: string): Promise<void> {
  await updateRequest(requestId, {
    preferredTime,
    status: "scheduled",
    scheduledAt: new Date(),
  });
  await logEvent(requestId, "scheduled", `زمان: ${preferredTime}`);

  const full = await getRequestWithCustomer(requestId);
  if (!full) return;

  await sendMessage(
    chatId,
    [
      "✅ جمع‌آوری با موفقیت هماهنگ شد!",
      "",
      `استان: ${full.request.province ?? "-"}`,
      `آدرس: ${full.request.address ?? "-"}`,
      `زمان: ${preferredTime}`,
      full.request.quotedPrice ? `قیمت تقریبی: ${toToman(full.request.quotedPrice)} تومان` : "",
      "",
      "همکار ما سر ساعت مراجعه می‌کنه. مبلغ نهایی بعد از وزن‌کشی حضوری همون‌جا بهت اعلام و پرداخت می‌شه 🙌",
    ]
      .filter(Boolean)
      .join("\n"),
    { remove_keyboard: true },
  );

  const admins = getAdminChatIds();
  if (admins.length === 0) return;

  const lat = full.request.locationLat ? Number(full.request.locationLat) : null;
  const lng = full.request.locationLng ? Number(full.request.locationLng) : null;

  const caption = [
    `📦 سفارش #${full.request.id} برای جمع‌آوری آماده است`,
    `مشتری: ${customerDisplayName(full.customer)} (${full.customer.chatId})`,
    `نوع کالا: ${wasteTypeLabel(full.request.wasteType)}`,
    `استان: ${full.request.province ?? "-"}`,
    `آدرس: ${full.request.address ?? "-"}`,
    full.request.phone ? `تماس: ${full.request.phone}` : "تماس: ثبت نشده",
    `زمان درخواستی: ${preferredTime}`,
    full.request.quotedPrice ? `قیمت توافقی: ${toToman(full.request.quotedPrice)} تومان` : "",
    detailUrl(full.request.id),
  ]
    .filter(Boolean)
    .join("\n");

  const buttons = [
    ...(lat !== null && lng !== null
      ? [[{ text: "🗺 باز کردن روی نقشه", url: mapLink(lat, lng) }]]
      : []),
    [{ text: "📦 جمع‌آوری انجام شد، ثبت وزن و مبلغ", callback_data: `adm_done:${requestId}` }],
  ] as InlineKeyboard;

  await broadcastToChats(admins, caption, { inline_keyboard: buttons });
}

// ---------------------------------------------------------------------------
// پیام‌های ادمین
// ---------------------------------------------------------------------------
async function handleAdminMessage(chatId: string, text: string): Promise<void> {
  if (text === "/start" || text === "/help") {
    await sendMessage(
      chatId,
      [
        "🛠 پنل مدیریت چرخه (از طریق چت)",
        "",
        "وقتی مشتری عکس بفرسته و نوع/وزن رو مشخص کنه، درخواستش با دکمه‌های عملیاتی برای همه ادمین‌ها میاد.",
        "",
        "دستورها:",
        "/stats — آمار کلی",
        "/broadcast متن — ارسال پیام به همه مشتریان",
        "",
        "دستورهای سریع (بدون نیاز به دکمه، حتی چند سفارش هم‌زمان):",
        "قیمت <شناسه> <مبلغ> — مثلاً: قیمت 12 ۸۵۰۰۰",
        "رد <شناسه> — کم‌ارزش/نوبت تجمیعی",
        "انجام <شناسه> — جمع‌آوری انجام شد",
        "وزن <شناسه> <کیلوگرم> — مثلاً: وزن 12 ۴.۵",
        "مبلغ <شناسه> <تومان> — مثلاً: مبلغ 12 ۹۲۰۰۰",
      ].join("\n"),
    );
    return;
  }

  if (text === "/stats") {
    await sendAdminStats(chatId);
    return;
  }

  if (text.startsWith("/broadcast")) {
    await handleBroadcast(chatId, text);
    return;
  }

  // دستورهای سریع چندمرحله‌ای‌گریز: «قیمت 12 ۸۵۰۰۰» و امثال آن
  const fastQuote = text.match(/^(?:قیمت|price)\s+(\S+)\s+(.+)$/u);
  if (fastQuote) {
    const id = parseIntLoose(fastQuote[1]);
    const amount = parseIntLoose(fastQuote[2]);
    if (id === null || amount === null || amount <= 0) {
      await sendMessage(chatId, "قالب درست: قیمت <شناسه> <مبلغ> — مثلاً قیمت 12 85000");
      return;
    }
    const request = await getRequestById(id);
    if (!request || request.status !== "awaiting_review") {
      await sendMessage(chatId, `سفارش #${id} در وضعیت بررسی قیمت نیست (${statusLabel(request?.status ?? "?")}).`);
      return;
    }
    await sendQuoteToCustomer(chatId, id, amount);
    await clearConversationState(chatId);
    return;
  }

  const fastReject = text.match(/^(?:رد)\s+(\S+)$/u);
  if (fastReject) {
    const id = parseIntLoose(fastReject[1]);
    if (id === null) {
      await sendMessage(chatId, "قالب درست: رد <شناسه>");
      return;
    }
    await adminRejectRequest(chatId, id);
    return;
  }

  const fastDone = text.match(/^(?:انجام)\s+(\S+)$/u);
  if (fastDone) {
    const id = parseIntLoose(fastDone[1]);
    if (id === null) {
      await sendMessage(chatId, "قالب درست: انجام <شناسه>");
      return;
    }
    await adminStartCompletion(chatId, id);
    return;
  }

  const fastWeight = text.match(/^(?:وزن)\s+(\S+)\s+(.+)$/u);
  if (fastWeight) {
    const id = parseIntLoose(fastWeight[1]);
    const weight = parseFloatLoose(fastWeight[2]);
    if (id === null || weight === null) {
      await sendMessage(chatId, "قالب درست: وزن <شناسه> <کیلوگرم> — مثلاً وزن 12 4.5");
      return;
    }
    const request = await getRequestById(id);
    if (!request || request.status !== "collected") {
      await sendMessage(chatId, `سفارش #${id} هنوز «جمع‌آوری‌شده» نشده است.`);
      return;
    }
    // وزن روی رکورد هم ذخیره می‌شود تا دستور «مبلغ <id> <قیمت>» مستقل از state کار کند
    await updateRequest(id, { finalWeightKg: String(weight) });
    await logEvent(id, "collected", `وزن ثبت شد: ${weight} کیلوگرم`);
    await setConversationState(chatId, "awaiting_final_price", id, { weight });
    await sendMessage(chatId, `وزن ${weight} کیلوگرم برای #${id} ثبت شد.\nحالا مبلغ نهایی پرداختی به مشتری (تومان) رو بفرست:`);
    return;
  }

  const fastFinal = text.match(/^(?:مبلغ)\s+(\S+)\s+(.+)$/u);
  if (fastFinal) {
    const id = parseIntLoose(fastFinal[1]);
    const price = parseIntLoose(fastFinal[2]);
    if (id === null || price === null || price <= 0) {
      await sendMessage(chatId, "قالب درست: مبلغ <شناسه> <تومان> — مثلاً مبلغ 12 92000");
      return;
    }
    const request = await getRequestById(id);
    if (!request || request.status !== "collected") {
      await sendMessage(chatId, `سفارش #${id} در وضعیت ثبت مبلغ نیست (${statusLabel(request?.status ?? "?")}).`);
      return;
    }
    const weight = Number(request.finalWeightKg ?? 0) || null;
    if (weight === null) {
      await sendMessage(chatId, `اول وزن سفارش #${id} رو بفرست: وزن ${id} <کیلوگرم>`);
      return;
    }
    await completeRequest(chatId, id, weight, price);
    await clearConversationState(chatId);
    return;
  }

  const state = await getConversationState(chatId);
  if (!state) {
    await sendMessage(chatId, "دستور نامشخص. برای راهنما /help رو بفرست.");
    return;
  }

  if (state.state === "awaiting_quote" && state.requestId) {
    const amount = parseIntLoose(text);
    if (amount === null || amount <= 0) {
      await sendMessage(chatId, "مبلغ نامعتبره. فقط عدد بفرست (مثلاً 85000 یا ۸۵۰۰۰).");
      return;
    }
    const request = await getRequestById(state.requestId);
    if (!request || request.status !== "awaiting_review") {
      await sendMessage(chatId, "این سفارش دیگر در وضعیت بررسی قیمت نیست (احتمالاً ادمین دیگری رسیدگی کرده).");
      await clearConversationState(chatId);
      return;
    }
    await sendQuoteToCustomer(chatId, state.requestId, amount);
    await clearConversationState(chatId);
    return;
  }

  if (state.state === "awaiting_weight" && state.requestId) {
    const weight = parseFloatLoose(text);
    if (weight === null || weight <= 0) {
      await sendMessage(chatId, "وزن نامعتبره. فقط عدد بفرست (مثلاً 4.5 یا ۴.۵).");
      return;
    }
    await updateRequest(state.requestId, { finalWeightKg: String(weight) });
    await logEvent(state.requestId, "collected", `وزن ثبت شد: ${weight} کیلوگرم`);
    await setConversationState(chatId, "awaiting_final_price", state.requestId, { weight });
    await sendMessage(chatId, `وزن ${weight} کیلوگرم ثبت شد.\nحالا مبلغ نهایی پرداختی به مشتری (تومان) رو بفرست:`);
    return;
  }

  if (state.state === "awaiting_final_price" && state.requestId) {
    const finalPrice = parseIntLoose(text);
    if (finalPrice === null || finalPrice <= 0) {
      await sendMessage(chatId, "مبلغ نامعتبره. فقط عدد بفرست (مثلاً 92000 یا ۹۲۰۰۰).");
      return;
    }
    const weight = Number((state.data as { weight?: number } | null)?.weight ?? 0);
    await completeRequest(chatId, state.requestId, weight, finalPrice);
    await clearConversationState(chatId);
    return;
  }
}

async function handleBroadcast(chatId: string, text: string): Promise<void> {
  const body = text.replace("/broadcast", "").trim();
  if (!body) {
    await sendMessage(chatId, "قالب درست: /broadcast متن پیام");
    return;
  }
  const allCustomers = await db.select().from(customers);
  let sent = 0;
  for (const c of allCustomers) {
    try {
      await sendMessage(c.chatId, `📢 ${body}`);
      sent++;
    } catch (err) {
      console.error(`broadcast to ${c.chatId} failed:`, err);
    }
  }
  await sendMessage(chatId, `📢 پیام برای ${sent} از ${allCustomers.length} مشتری ارسال شد.`);
}

async function sendAdminStats(chatId: string): Promise<void> {
  const all = await db.select().from(pickupRequests);
  const total = all.length;
  const completed = all.filter((r) => r.status === "completed");
  const lowValue = all.filter((r) => r.status === "low_value_queued").length;
  const cancelled = all.filter((r) => r.status === "cancelled" || r.status === "rejected").length;
  const sumFinal = completed.reduce((s, r) => s + (r.finalPrice ?? 0), 0);
  const sumReward = completed.reduce((s, r) => s + (r.rewardAmount ?? 0), 0);
  const sumCo2 = completed.reduce((s, r) => s + Number(r.co2SavedKg ?? 0), 0);
  const completionRate = total > 0 ? Math.round((completed.length / total) * 100) : 0;

  const rated = completed.filter((r) => r.rating !== null);
  const avgRating =
    rated.length > 0
      ? (rated.reduce((s, r) => s + (r.rating ?? 0), 0) / rated.length).toFixed(1)
      : null;

  const countsByCustomer = new Map<number, number>();
  for (const r of all) countsByCustomer.set(r.customerId, (countsByCustomer.get(r.customerId) ?? 0) + 1);
  const customersWithRequest = countsByCustomer.size;
  const repeatCustomers = [...countsByCustomer.values()].filter((c) => c >= 2).length;
  const repeatRate =
    customersWithRequest > 0 ? Math.round((repeatCustomers / customersWithRequest) * 100) : 0;

  await sendMessage(
    chatId,
    [
      "📊 آمار کلی چرخه",
      "",
      `کل سفارش‌ها: ${total}`,
      `مشتریان دارای سفارش: ${customersWithRequest}`,
      `تکمیل‌شده: ${completed.length}`,
      `کم‌ارزش (نوبت تجمیعی): ${lowValue}`,
      `لغو/رد شده: ${cancelled}`,
      `نرخ تکمیل: ${completionRate}٪`,
      `نرخ بازگشت مشتری: ${repeatRate}٪${avgRating ? `\nرضایت مشتری: ${toToman(avgRating)} از ۵ ⭐` : ""}`,
      "",
      `مجموع خرید نهایی: ${toToman(sumFinal)} تومان`,
      `مجموع پاداش پرداختی: ${toToman(sumReward)} تومان`,
      `🌍 کاهش CO₂: ${toToman(Math.round(sumCo2))} کیلوگرم`,
    ].join("\n"),
  );
}

// ---------------------------------------------------------------------------
// قیمت‌گذاری و اکشن‌های ادمین
// ---------------------------------------------------------------------------
async function onAdminStartQuote(chatId: string, messageId: number, requestId: number): Promise<void> {
  const request = await getRequestById(requestId);
  if (!request) return;
  if (request.status !== "awaiting_review") {
    await sendMessage(chatId, `سفارش #${requestId} دیگر در وضعیت «بررسی قیمت» نیست (${statusLabel(request.status)}).`);
    await editMessageReplyMarkup(chatId, messageId, []);
    return;
  }
  await editMessageReplyMarkup(chatId, messageId, []);
  await setConversationState(chatId, "awaiting_quote", requestId);
  await sendMessage(chatId, `مبلغ پیشنهادی برای سفارش #${requestId} رو به تومان بفرست (فقط عدد):`);
}

async function sendQuoteToCustomer(adminChat: string, requestId: number, amount: number): Promise<void> {
  const full = await getRequestWithCustomer(requestId);
  if (!full) return;

  await updateRequest(requestId, { status: "quoted", quotedPrice: amount, quotedAt: new Date() });
  await logEvent(requestId, "quoted", `قیمت پیشنهادی: ${amount}`);

  const keyboard: InlineKeyboard = [
    [
      { text: "✅ تایید می‌کنم", callback_data: `confirm:${requestId}` },
      { text: "❌ انصراف", callback_data: `cancel:${requestId}` },
    ],
  ];

  await sendMessage(
    full.customer.chatId,
    [
      `قیمت پیشنهادی چرخه برای کالای تو: ${toToman(amount)} تومان 💰`,
      "این مبلغ تقریبی است و بعد از وزن‌کشی حضوری ممکن است کمی تغییر کند.",
      "آیا این پیشنهاد رو تایید می‌کنی؟",
    ].join("\n"),
    { inline_keyboard: keyboard },
  );

  await sendMessage(adminChat, `✅ قیمت ${toToman(amount)} تومان برای مشتری سفارش #${requestId} ارسال شد.`);
}

async function adminRejectRequest(adminChat: string, requestId: number): Promise<void> {
  const request = await getRequestById(requestId);
  if (!request || request.status !== "awaiting_review") {
    await sendMessage(adminChat, `سفارش #${requestId} در وضعیت بررسی نیست.`);
    return;
  }

  await updateRequest(requestId, { status: "low_value_queued" });
  await logEvent(requestId, "low_value_queued", "توسط ادمین به نوبت جمع‌آوری تجمیعی منتقل شد");
  await sendMessage(adminChat, `سفارش #${requestId} به‌عنوان کم‌ارزش در نوبت جمع‌آوری تجمیعی قرار گرفت.`);

  const full = await getRequestWithCustomer(requestId);
  if (full) {
    await sendMessage(
      full.customer.chatId,
      "با بررسی اولیه، ارزش این کالا کمتر از حد اعزام فوری چرخه است 🙏\nنگران نباش؛ سفارشت در نوبت جمع‌آوری تجمیعی محله‌ات ثبت شد و به‌محض نزدیک‌شدن برنامه اعزام بهت خبر می‌دیم.",
    );
  }
}

async function onAdminReject(chatId: string, messageId: number, requestId: number): Promise<void> {
  const request = await getRequestById(requestId);
  if (!request || request.status !== "awaiting_review") {
    await editMessageReplyMarkup(chatId, messageId, []);
    return;
  }
  await editMessageReplyMarkup(chatId, messageId, []);
  await adminRejectRequest(chatId, requestId);
}

async function onAdminStartCompletion(chatId: string, messageId: number, requestId: number): Promise<void> {
  const request = await getRequestById(requestId);
  if (!request) return;
  if (request.status !== "scheduled") {
    await editMessageReplyMarkup(chatId, messageId, []);
    await sendMessage(chatId, `سفارش #${requestId} در وضعیت «زمان‌بندی‌شده» نیست (${statusLabel(request.status)}).`);
    return;
  }
  await editMessageReplyMarkup(chatId, messageId, []);
  await adminStartCompletion(chatId, requestId);
}

async function adminStartCompletion(chatId: string, requestId: number): Promise<void> {
  const request = await getRequestById(requestId);
  if (!request || request.status !== "scheduled") {
    await sendMessage(chatId, `سفارش #${requestId} در وضعیت «زمان‌بندی‌شده» نیست.`);
    return;
  }

  await updateRequest(requestId, { status: "collected" });
  await logEvent(requestId, "collected", "جمع‌آوری‌کننده مراجعه کرد");
  await setConversationState(chatId, "awaiting_weight", requestId);
  await sendMessage(chatId, `وزن نهایی کالای سفارش #${requestId} (کیلوگرم) رو بفرست (فقط عدد، مثلاً 4.5):`);
}

// ---------------------------------------------------------------------------
// تکمیل سفارش: پاداش، کد دعوت، CO₂، کیف پول، امتیاز، پاک‌سازی حریم خصوصی
// ---------------------------------------------------------------------------
async function completeRequest(
  adminChat: string,
  requestId: number,
  weight: number,
  finalPrice: number,
): Promise<void> {
  const full = await getRequestWithCustomer(requestId);
  if (!full) return;
  if (full.request.status !== "collected") {
    await sendMessage(adminChat, `سفارش #${requestId} در وضعیت «ثبت نهایی» نیست (${statusLabel(full.request.status)}).`);
    return;
  }

  const rewardPercent = await getRewardPercent();
  const rewardAmount = Math.round((finalPrice * rewardPercent) / 100);

  // کاهش CO₂ بر اساس ضریب ماده
  let co2Saved: string | null = null;
  if (full.request.wasteType) {
    const rate = await getActiveMaterialRate(full.request.wasteType);
    if (rate?.co2PerKg) {
      co2Saved = (Number(rate.co2PerKg) * weight).toFixed(2);
    }
  }

  await updateRequest(requestId, {
    finalWeightKg: String(weight),
    finalPrice,
    rewardPercent,
    rewardAmount,
    co2SavedKg: co2Saved,
    status: "completed",
    completedAt: new Date(),
  });
  await logEvent(requestId, "completed", `وزن: ${weight}کیلوگرم، مبلغ نهایی: ${finalPrice}، پاداش: ${rewardAmount}`);

  // واریز پاداش به کیف پول اعتباری مشتری
  await addCreditTransaction({
    customerId: full.customer.id,
    amount: rewardAmount,
    type: "reward",
    requestId,
    note: `سفارش #${requestId}`,
  });

  // پاداش دعوت: اگر این اولین سفارش تکمیل‌شده مشتری است و با کد دعوت آمده
  let referralGranted = false;
  if (full.customer.invitedByCode && !full.request.referralBonusGranted) {
    const completedCount = (
      await db
        .select()
        .from(pickupRequests)
        .where(and(eq(pickupRequests.customerId, full.customer.id), eq(pickupRequests.status, "completed")))
    ).length;

    if (completedCount === 1) {
      const referrer = await getCustomerByInviteCode(full.customer.invitedByCode);
      if (referrer && referrer.id !== full.customer.id) {
        const bonus = await getReferralBonus();
        await addCreditTransaction({
          customerId: referrer.id,
          amount: bonus,
          type: "referral",
          requestId,
          note: `دعوت: سفارش #${requestId}`,
        });
        await updateRequest(requestId, { referralBonusGranted: true });
        await sendMessage(
          referrer.chatId,
          `🎁 دوستت اولین سفارشش رو با چرخه تکمیل کرد! ${toToman(bonus)} تومان اعتبار به کیف پولت اضافه شد. موجودی فعلی: ${toToman(await getCustomerBalance(referrer.id))} تومان`,
        );
        referralGranted = true;
      }
    }
  }

  const newBalance = await getCustomerBalance(full.customer.id);

  await sendMessage(
    adminChat,
    [
      `✅ سفارش #${requestId} تکمیل شد.`,
      `وزن: ${weight} کیلوگرم`,
      `مبلغ نهایی: ${toToman(finalPrice)} تومان`,
      `پاداش اعتباری (${rewardPercent}٪): ${toToman(rewardAmount)} تومان`,
      co2Saved ? `🌍 کاهش CO₂: ${toToman(co2Saved)} کیلوگرم` : "",
      referralGranted ? "🎁 پاداش دعوت هم واریز شد." : "",
    ]
      .filter(Boolean)
      .join("\n"),
  );

  // پیام نهایی + دکمه امتیاز ۱ تا ۵ (مدل جهانی: رضایت پس از سرویس)
  const ratingKeyboard: InlineKeyboard = [
    [1, 2, 3, 4, 5].map((n) => ({
      text: `${n}⭐`,
      callback_data: `rate:${requestId}:${n}`,
    })),
  ];

  await sendMessage(
    full.customer.chatId,
    [
      "🎉 معامله با موفقیت تکمیل شد!",
      "",
      `وزن نهایی: ${toToman(weight)} کیلوگرم`,
      `مبلغ خرید: ${toToman(finalPrice)} تومان`,
      `پاداش چرخه (${rewardPercent}٪): ${toToman(rewardAmount)} تومان`,
      `جمع قابل دریافت: ${toToman(finalPrice + rewardAmount)} تومان`,
      co2Saved ? `🌍 با بازیافت این ${toToman(weight)} کیلوگرم، حدود ${toToman(co2Saved)} کیلوگرم CO₂ کمتر وارد جو شد.` : "",
      "",
      `💳 موجودی کیف پول اعتباری تو: ${toToman(newBalance)} تومان`,
      `کد دعوت تو: ${full.customer.inviteCode} — با دوستات به اشتراک بذار تا هر دو جایزه بگیرید.`,
      "",
      "🔒 مطابق قولی که داده بودیم، آدرس دقیق، عکس و شماره تماست همین الان از سرورهای ما پاک شد.",
      "",
      "به این تجربه از ۱ تا ۵ امتیاز بده 👇",
    ]
      .filter(Boolean)
      .join("\n"),
    { inline_keyboard: ratingKeyboard },
  );

  // وفای به وعده حریم خصوصی
  await purgePrivateData(requestId);
}

async function onRating(
  chatId: string,
  messageId: number,
  requestId: number,
  rating: number,
): Promise<void> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return;
  const full = await getRequestWithCustomer(requestId);
  if (!full || full.customer.chatId !== chatId) return;
  if (full.request.status !== "completed" || full.request.rating !== null) {
    await sendMessage(chatId, "این امتیاز قبلاً ثبت شده است.");
    await editMessageReplyMarkup(chatId, messageId, []);
    return;
  }

  await updateRequest(requestId, { rating });
  await logEvent(requestId, "completed", `امتیاز مشتری: ${rating} از ۵`);
  await editMessageReplyMarkup(chatId, messageId, []);
  await sendMessage(chatId, "ممنون از نظرت 🌟 به چرخه کمک می‌کنی بهتر شیم.");
}

// ---------------------------------------------------------------------------
// تایید/لغو مشتری
// ---------------------------------------------------------------------------
async function onCustomerConfirm(chatId: string, messageId: number, requestId: number): Promise<void> {
  const full = await getRequestWithCustomer(requestId);
  if (!full || full.customer.chatId !== chatId) return;
  if (full.request.status !== "quoted") {
    await sendMessage(chatId, "این سفارش قبلاً پردازش شده است.");
    await editMessageReplyMarkup(chatId, messageId, []);
    return;
  }

  await updateRequest(requestId, { status: "confirmed", confirmedAt: new Date() });
  await logEvent(requestId, "confirmed", "مشتری قیمت را تایید کرد");
  await editMessageReplyMarkup(chatId, messageId, []);
  await setConversationState(chatId, "awaiting_province", requestId);

  await askProvince(chatId, requestId);
}

async function onCustomerCancel(chatId: string, messageId: number, requestId: number): Promise<void> {
  const full = await getRequestWithCustomer(requestId);
  if (!full || full.customer.chatId !== chatId) return;

  // گارد وضعیت (رفع باگ قبلی: لغو بدون بررسی وضعیت سفارش‌های نهایی را خراب می‌کرد)
  if (!CUSTOMER_CANCELLABLE.has(full.request.status)) {
    await sendMessage(
      chatId,
      `این سفارش در وضعیت «${statusLabel(full.request.status)}» است و دیگر از داخل ربات قابل لغو نیست. اگر مشکلی هست با پشتیبانی در تماس باش.`,
    );
    await editMessageReplyMarkup(chatId, messageId, []);
    return;
  }

  await updateRequest(requestId, { status: "cancelled" });
  await logEvent(requestId, "cancelled", "مشتری لغو کرد");
  await editMessageReplyMarkup(chatId, messageId, []);
  await clearConversationState(chatId);
  await purgePrivateData(requestId); // اگر آدرس ثبت شده بود پاک شود

  await sendMessage(
    chatId,
    "باشه، این سفارش لغو شد 🙏 هر وقت خواستی می‌تونی دوباره عکس بفرستی.",
    { remove_keyboard: true },
  );

  for (const admin of getAdminChatIds()) {
    await sendMessage(admin, `ℹ️ مشتری سفارش #${requestId} رو لغو کرد.`);
  }
}

async function onTimeSlotSelected(
  chatId: string,
  messageId: number,
  requestId: number,
  slotKey: string,
): Promise<void> {
  const full = await getRequestWithCustomer(requestId);
  if (!full || full.customer.chatId !== chatId) return;
  if (full.request.status !== "awaiting_time") return;

  await editMessageReplyMarkup(chatId, messageId, []);

  if (slotKey === "custom") {
    await setConversationState(chatId, "awaiting_custom_time", requestId);
    await sendMessage(chatId, "باشه، زمان موردنظرت رو بنویس (مثلاً: سه‌شنبه ساعت ۵ عصر).");
    return;
  }

  await scheduleRequest(chatId, requestId, timeSlotLabel(slotKey));
  await clearConversationState(chatId);
}

// ---------------------------------------------------------------------------
// Callback Query ها (دکمه‌های شیشه‌ای)
// ---------------------------------------------------------------------------
async function handleCallbackQuery(cq: BaleCallbackQuery): Promise<void> {
  await answerCallbackQuery(cq.id);
  if (!cq.data || !cq.message) return;

  const chatId = String(cq.message.chat.id);
  const messageId = cq.message.message_id;
  const [action, idStr, extra] = cq.data.split(":");
  const requestId = Number(idStr);
  if (Number.isNaN(requestId)) return;

  switch (action) {
    case "wt":
      await onWasteTypeSelected(chatId, messageId, requestId, extra);
      return;
    case "wb":
      await onWeightBandSelected(chatId, messageId, requestId, extra);
      return;
    case "confirm":
      await onCustomerConfirm(chatId, messageId, requestId);
      return;
    case "cancel":
      await onCustomerCancel(chatId, messageId, requestId);
      return;
    case "prov":
      await onProvinceSelected(chatId, messageId, requestId, extra);
      return;
    case "time":
      await onTimeSlotSelected(chatId, messageId, requestId, extra);
      return;
    case "rate":
      await onRating(chatId, messageId, requestId, Number(extra));
      return;
  }

  // اکشن‌های زیر فقط برای ادمین مجاز است
  if (!isAdminChat(chatId)) return;

  switch (action) {
    case "adm_q":
      await onAdminStartQuote(chatId, messageId, requestId);
      return;
    case "adm_r":
      await onAdminReject(chatId, messageId, requestId);
      return;
    case "adm_done":
      await onAdminStartCompletion(chatId, messageId, requestId);
      return;
  }
}
