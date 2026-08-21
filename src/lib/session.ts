// ---------------------------------------------------------------------------
// نشست ادمین: توکن امضاشده با HMAC-SHA256 (WebCrypto — هم در Edge/proxy و هم
// در Node/Server Actions کار می‌کند). برخلاف نسخه قبلی، رمز عبور دیگر مستقیماً
// داخل کوکی قرار نمی‌گیرد و توکن تاریخ انقضا دارد.
// ---------------------------------------------------------------------------

export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 14; // ۱۴ روز

function getSessionSecret(): string {
  return (
    process.env.ADMIN_SESSION_SECRET ||
    (process.env.ADMIN_DASHBOARD_PASSWORD
      ? `${process.env.ADMIN_DASHBOARD_PASSWORD}::charkheh-session-v1`
      : "")
  );
}

function base64UrlEncode(input: ArrayBuffer | Uint8Array): string {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(input: string): Uint8Array {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const binary = atob(b64 + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function hmacSha256(secret: string, data: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return base64UrlEncode(sig);
}

/** مقایسه در زمان ثابت برای جلوگیری از timing attack */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function createSessionToken(): Promise<string> {
  const exp = Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS;
  const payload = `v1.admin.${exp}`;
  const sig = await hmacSha256(getSessionSecret(), payload);
  return `${payload}.${sig}`;
}

export async function verifySessionToken(token: string | undefined | null): Promise<boolean> {
  if (!token) return false;
  const secret = getSessionSecret();
  if (!secret) return false;

  const parts = token.split(".");
  if (parts.length !== 4 || parts[0] !== "v1" || parts[1] !== "admin") return false;
  const exp = Number(parts[2]);
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return false;

  const payload = parts.slice(0, 3).join(".");
  const expected = await hmacSha256(secret, payload);
  return timingSafeEqual(expected, parts[3]);
}

/** بررسی رمز ورود با مقایسه زمان‌ثابت */
export function passwordEquals(provided: string, expected: string | undefined): boolean {
  if (!expected) return false;
  return timingSafeEqual(provided, expected);
}
