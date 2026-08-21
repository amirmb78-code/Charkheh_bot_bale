// ---------------------------------------------------------------------------
// کلاینت سبک برای API ربات پیام‌رسان بله (سازگار با Telegram Bot API)
// مستندات: https://tapi.bale.ai/ و https://dev.bale.ai/
// ---------------------------------------------------------------------------

export interface InlineKeyboardButton {
  text: string;
  callback_data?: string;
  url?: string;
}

export type InlineKeyboard = InlineKeyboardButton[][];

export interface ReplyKeyboardButton {
  text: string;
  request_location?: boolean; // دکمه «ارسال موقعیت مکانی روی نقشه»
  request_contact?: boolean; // دکمه «ارسال شماره تماس»
}

export type ReplyMarkup =
  | { inline_keyboard: InlineKeyboard }
  | { keyboard: ReplyKeyboardButton[][]; resize_keyboard?: boolean; one_time_keyboard?: boolean }
  | { remove_keyboard: true };

const MAX_TEXT = 4096;
const MAX_CAPTION = 1024;

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function getToken(): string {
  const token = process.env.BALE_BOT_TOKEN;
  if (!token) {
    throw new Error("BALE_BOT_TOKEN تنظیم نشده است");
  }
  return token;
}

function apiUrl(method: string): string {
  return `https://tapi.bale.ai/bot${getToken()}/${method}`;
}

function fileUrl(filePath: string): string {
  return `https://tapi.bale.ai/file/bot${getToken()}/${filePath}`;
}

async function callApi<T = unknown>(
  method: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(apiUrl(method), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload ?? {}),
    // جلوگیری از گیرکردن درخواست به‌صورت نامحدود
    signal: AbortSignal.timeout(20_000),
  });

  const json = (await res.json().catch(() => null)) as {
    ok?: boolean;
    result?: T;
    description?: string;
  } | null;

  if (!res.ok || !json || json.ok === false) {
    const description = json?.description ?? `HTTP ${res.status}`;
    throw new Error(`خطای Bale API در ${method}: ${description}`);
  }

  return json.result as T;
}

/** ارسال پیام متنی؛ کیبورد می‌تواند شیشه‌ای، معمولی یا حذف‌کننده کیبورد باشد */
export async function sendMessage(
  chatId: string | number,
  text: string,
  markup?: ReplyMarkup,
): Promise<void> {
  try {
    await callApi("sendMessage", {
      chat_id: chatId,
      text: clamp(text, MAX_TEXT),
      ...(markup ? { reply_markup: markup } : {}),
    });
  } catch (err) {
    console.error("sendMessage failed:", err);
  }
}

/** ارسال عکس با استفاده از file_id موجود (بدون آپلود مجدد) */
export async function sendPhotoByFileId(
  chatId: string | number,
  fileId: string,
  caption?: string,
  keyboard?: InlineKeyboard,
): Promise<void> {
  try {
    await callApi("sendPhoto", {
      chat_id: chatId,
      photo: fileId,
      ...(caption ? { caption: clamp(caption, MAX_CAPTION) } : {}),
      ...(keyboard ? { reply_markup: { inline_keyboard: keyboard } } : {}),
    });
  } catch (err) {
    console.error("sendPhotoByFileId failed:", err);
  }
}

/** ارسال پین موقعیت مکانی (برای اطلاع ادمین/پیک) */
export async function sendLocation(
  chatId: string | number,
  latitude: number,
  longitude: number,
): Promise<void> {
  try {
    await callApi("sendLocation", { chat_id: chatId, latitude, longitude });
  } catch (err) {
    console.error("sendLocation failed:", err);
  }
}

/** ارسال یک پیام به چند چت (طلاع‌رسانی به همه ادمین‌ها) با جداکردن خطای هرکدام */
export async function broadcastToChats(
  chatIds: (string | number)[],
  text: string,
  markup?: ReplyMarkup,
): Promise<void> {
  for (const id of chatIds) {
    await sendMessage(id, text, markup);
  }
}

export async function answerCallbackQuery(
  callbackQueryId: string,
  text?: string,
): Promise<void> {
  try {
    await callApi("answerCallbackQuery", {
      callback_query_id: callbackQueryId,
      ...(text ? { text: clamp(text, 200) } : {}),
    });
  } catch (err) {
    console.error("answerCallbackQuery failed:", err);
  }
}

export async function editMessageReplyMarkup(
  chatId: string | number,
  messageId: number,
  keyboard?: InlineKeyboard,
): Promise<void> {
  try {
    await callApi("editMessageReplyMarkup", {
      chat_id: chatId,
      message_id: messageId,
      reply_markup: { inline_keyboard: keyboard ?? [] },
    });
  } catch (err) {
    // ویرایش ممکن است شکست بخورد (مثلاً پیام قدیمی)؛ خطای بحرانی نیست
    console.warn("editMessageReplyMarkup failed:", err);
  }
}

interface BaleFile {
  file_id: string;
  file_path: string;
}

export async function getFilePath(fileId: string): Promise<string> {
  const result = await callApi<BaleFile>("getFile", { file_id: fileId });
  return result.file_path;
}

export async function downloadFile(fileId: string): Promise<Buffer> {
  const filePath = await getFilePath(fileId);
  const res = await fetch(fileUrl(filePath), {
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) {
    throw new Error(`دانلود فایل ناموفق بود: HTTP ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

/**
 * اتصال وب‌هوک. اگر سکرت تنظیم شده باشد با پارامتر secret_token ارسال می‌شود
 * تا بله آن را در هدر X-Bale-Bot-Api-Secret-Token هر آپدیت قرار دهد.
 */
export async function setWebhook(url: string, secretToken?: string): Promise<void> {
  await callApi("setWebhook", {
    url,
    ...(secretToken ? { secret_token: secretToken } : {}),
  });
}

export async function deleteWebhook(): Promise<void> {
  await callApi("deleteWebhook", {});
}

export async function getWebhookInfo(): Promise<unknown> {
  return callApi("getWebhookInfo", {});
}

/** لینک نقشه گوگل برای مختصات */
export function mapLink(lat: number, lng: number): string {
  return `https://maps.google.com/?q=${lat},${lng}`;
}
