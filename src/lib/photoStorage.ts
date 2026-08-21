import { mkdir, writeFile, unlink, readFile } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { downloadFile } from "@/lib/bale";

// ---------------------------------------------------------------------------
// عکس‌ها دیگر در public/ ذخیره نمی‌شوند (که عمومی و در دسترس بود)؛ بلکه در
// مسیر خصوصی ذخیره و فقط از مسیر احرازشده /admin/media/[name] سرو می‌شوند.
// ---------------------------------------------------------------------------

const UPLOAD_DIR =
  process.env.UPLOAD_DIR ?? path.join(process.cwd(), "data", "uploads", "bale");

const EXT_BY_MIME: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
};

const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // ۱۰ مگابایت

export function sanitizeStoredName(name: string): string | null {
  // جلوگیری از path traversal
  if (!/^[a-zA-Z0-9_-]+\.(jpg|jpeg|png|webp|gif)$/.test(name)) return null;
  return name;
}

/**
 * عکس ارسالی مشتری را از سرور بله دانلود و به‌صورت خصوصی ذخیره می‌کند.
 * مقدار برگشتی فقط «نام فایل» است (نه مسیر عمومی). در صورت شکست null.
 */
export async function savePhotoLocally(
  fileId: string,
  mimeType?: string | null,
): Promise<string | null> {
  try {
    const buffer = await downloadFile(fileId);
    if (buffer.byteLength > MAX_PHOTO_BYTES) {
      console.error("savePhotoLocally: file too large", buffer.byteLength);
      return null;
    }
    await mkdir(UPLOAD_DIR, { recursive: true });
    const ext = (mimeType && EXT_BY_MIME[mimeType]) || ".jpg";
    const filename = `${Date.now()}_${crypto.randomBytes(12).toString("hex")}${ext}`;
    await writeFile(path.join(UPLOAD_DIR, filename), buffer);
    return filename;
  } catch (err) {
    console.error("savePhotoLocally failed:", err);
    return null;
  }
}

/** خواندن عکس برای سرو از مسیر احرازشده (یا null اگر وجود ندارد) */
export async function readLocalPhoto(name: string): Promise<Buffer | null> {
  const safe = sanitizeStoredName(name);
  if (!safe) return null;
  try {
    return await readFile(path.join(UPLOAD_DIR, safe));
  } catch {
    return null;
  }
}

/** حذف عکس — برای رعایت حریم خصوصی پس از پایان سفارش */
export async function deleteLocalPhoto(name: string | null | undefined): Promise<void> {
  if (!name) return;
  const safe = sanitizeStoredName(name);
  if (!safe) return;
  try {
    await unlink(path.join(UPLOAD_DIR, safe));
  } catch {
    // فایل وجود ندارد یا قبلاً حذف شده؛ اشکالی ندارد
  }
}

export function contentTypeFor(name: string): string {
  const ext = path.extname(name).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "image/jpeg";
  }
}
