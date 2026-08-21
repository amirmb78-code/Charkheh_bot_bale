import Link from "next/link";

const steps = [
  {
    title: "۱. عکس بفرست 📷",
    text: "در چت بله، یک عکس واضح از پسماند خشک یا کالای دسته‌دوم برای ربات چرخه می‌فرستی و نوع و وزن تقریبی را با دکمه انتخاب می‌کنی.",
  },
  {
    title: "۲. برآورد لحظه‌ای 💡",
    text: "چرخه بر اساس تعرفه روز و وزن تقریبی، بازه قیمت را همان‌جا برآورد می‌کند و کارشناس ما قیمت نهایی پیشنهادی را اعلام می‌کند.",
  },
  {
    title: "۳. استان و موقعیت روی نقشه 📍",
    text: "پس از تایید قیمت، استان‌ات را انتخاب می‌کنی و موقعیت دقیق را از روی نقشه می‌فرستی؛ پوشش چرخه سراسری است.",
  },
  {
    title: "۴. جمع‌آوری از درب منزل 🚚",
    text: "همکار چرخه سر وقت مراجعه می‌کند؛ وزن‌کشی حضوری انجام و مبلغ نهایی همان‌جا تسویه می‌شود.",
  },
  {
    title: "۵. پاداش، کیف پول و زمین 🌍",
    text: "درصدی از مبلغ به کیف پول اعتباری‌ات واریز می‌شود، کاهش CO₂ هر سفارش بهت گزارش می‌شود و با کد دعوت، دوستانت هم جایزه می‌گیرند.",
  },
];

const features = [
  { title: "🇮🇷 پوشش سراسری", text: "بدون محدودیت جغرافیایی؛ هر ۳۱ استان ایران." },
  { title: "🗺 موقعیت‌یابی نقشه‌ای", text: "ارسال پین دقیق روی نقشه + آدرس متنی برای مراجعه سریع." },
  { title: "💳 کیف پول اعتباری", text: "پاداش هر سفارش و پاداش دعوت، شفاف در کیف پول شما." },
  { title: "🎁 دعوت از دوستان", text: "کد دعوت اختصاصی؛ با اولین سفارش دوستت، اعتبار می‌گیری." },
  { title: "🌍 گزارش اثر زیست‌محیطی", text: "کاهش CO₂ هر سفارش محاسبه و اعلام می‌شود." },
  { title: "🔒 حریم خصوصی واقعی", text: "عکس، آدرس دقیق و شماره تماس پس از پایان سفارش خودکار پاک می‌شود — نه فقط شعار." },
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-gradient-to-b from-emerald-50 to-slate-100">
      <div className="mx-auto max-w-4xl px-4 py-16">
        <div className="text-center">
          <div className="mb-4 text-5xl">♻️</div>
          <h1 className="text-3xl font-extrabold text-slate-900 sm:text-4xl">چرخه</h1>
          <p className="mt-1 text-sm font-medium tracking-widest text-emerald-700" dir="ltr">
            CHARKHEH
          </p>
          <p className="mx-auto mt-3 max-w-xl text-slate-600">
            پلتفرم جمع‌آوری پسماند خشک و کالای دسته‌دوم از درب منزل — در سراسر ایران، با ربات بله،
            بدون نیاز به نصب هیچ اپلیکیشنی.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/admin"
              className="rounded-lg bg-emerald-600 px-5 py-2.5 font-medium text-white shadow hover:bg-emerald-700"
            >
              ورود به داشبورد مدیریت
            </Link>
          </div>
        </div>

        <div className="mt-14 grid gap-4 sm:grid-cols-2">
          {steps.map((s) => (
            <div key={s.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <h2 className="font-bold text-slate-900">{s.title}</h2>
              <p className="mt-2 text-sm text-slate-600">{s.text}</p>
            </div>
          ))}
        </div>

        <h2 className="mt-14 text-center text-xl font-bold text-slate-900">چرا چرخه؟</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          {features.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900">{f.title}</h3>
              <p className="mt-1 text-xs text-slate-600">{f.text}</p>
            </div>
          ))}
        </div>

        <div className="mt-10 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="font-bold text-slate-900">راه‌اندازی سریع</h2>
          <ol className="mt-3 list-inside list-decimal space-y-2 text-sm text-slate-600">
            <li>
              متغیرهای محیطی را مطابق <code className="rounded bg-slate-100 px-1">.env.example</code> تنظیم کنید
              (<code className="rounded bg-slate-100 px-1">DATABASE_URL</code>،{" "}
              <code className="rounded bg-slate-100 px-1">BALE_BOT_TOKEN</code>،{" "}
              <code className="rounded bg-slate-100 px-1">ADMIN_CHAT_IDS</code>،{" "}
              <code className="rounded bg-slate-100 px-1">ADMIN_DASHBOARD_PASSWORD</code>،{" "}
              <code className="rounded bg-slate-100 px-1">APP_BASE_URL</code> و{" "}
              <code className="rounded bg-slate-100 px-1">BALE_WEBHOOK_SECRET</code>).
            </li>
            <li>
              جداول را بسازید: <code className="rounded bg-slate-100 px-1">npm run db:push</code>
            </li>
            <li>وارد داشبورد شوید و «اتصال وب‌هوک» را بزنید.</li>
            <li>در بله به ربات /start بفرستید و یک عکس آزمایشی ارسال کنید.</li>
          </ol>
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          چرخه (Charkheh) — الهام‌گرفته از مدل‌های موفق جهانی بازیافت از درب منزل
        </p>
      </div>
    </main>
  );
}
