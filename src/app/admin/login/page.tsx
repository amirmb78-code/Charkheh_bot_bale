import { loginAction } from "@/app/admin/actions";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const hasError = params.error === "1";
  const isLocked = params.error === "locked";

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-950 p-4" dir="rtl">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mb-2 text-3xl">♻️</div>
          <h1 className="text-xl font-bold text-slate-900">چرخه — پنل مدیریت</h1>
          <p className="mt-1 text-sm text-slate-500">برای ورود، رمز عبور را وارد کنید</p>
        </div>

        <form action={loginAction} className="space-y-4">
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              رمز عبور
            </label>
            <input
              id="password"
              name="password"
              type="password"
              required
              autoFocus
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-200"
            />
          </div>

          {hasError && (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
              رمز عبور اشتباه است یا تنظیم نشده است.
            </p>
          )}
          {isLocked && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
              به دلیل تلاش‌های ناموفق مکرر، ورود موقتاً قفل شده است. یک دقیقه دیگر تلاش کنید.
            </p>
          )}

          <button
            type="submit"
            className="w-full rounded-lg bg-emerald-600 px-4 py-2 font-medium text-white transition hover:bg-emerald-700"
          >
            ورود
          </button>
        </form>
      </div>
    </main>
  );
}
