<div dir="rtl">

# 🤖 سند کانتکست پروژه «چرخه» برای هوش مصنوعی توسعه‌دهنده

> این سند را به AI (ChatGPT/Claude/Gemini/...) بدهید تا ساختار، قراردادها و نقشه راه را بفهمد و بدون سوال مقدماتی بتواند پروژه را ارتقا دهد. انتهای سند «قوانین کار» هم نوشته شده.

---

## ۱. پروژه چیست؟

**چرخه (Charkheh)** پلتفرم خرید **پسماند خشک** (کاغذ، پلاستیک، فلز، شیشه) و **کالای دسته‌دوم سالم** از مردم در **سراسر ایران** است — از درب منزل، بدون نصب اپلیکیشن. کانال اصلی ارتباط با مشتری: **ربات پیام‌رسان بله** (نسخه ایرانی، API سازگار با Telegram Bot API روی `https://tapi.bale.ai`). ادمین‌ها هم داخل همان بله و هم در **داشبورد وب** کار می‌کنند.

**مدل کسب‌وکار (پایلوت دستی):**
1. مشتری عکس + نوع + وزن تقریبی می‌فرستد → سیستم **برآورد خودکار قیمت** می‌دهد
2. کارشناس (ادمین) قیمت نهایی پیشنهادی را اعلام می‌کند → مشتری تایید می‌کند
3. استان + لوکیشن نقشه + آدرس + زمان مراجعه هماهنگ می‌شود
4. همکار میدانی مراجعه می‌کند، وزن‌کشی و تسویه حضوری انجام می‌شود
5. مشتری مبلغ نقدی + **پاداش اعتباری (کیف پول)** می‌گیرد، **CO₂ صرفه‌جویی‌شده** محاسبه می‌شود، رضایت ⭐ ثبت می‌شود و **کد دعوت** می‌گیرد
6. سفارش‌های کم‌ارزش به «نوبت جمع‌آوری تجمیعی» محله می‌روند

الهام از مدل‌های جهانی: Recyclebank (پاداش)، Rubicon (لجستیک زباله)، Cashify (خرید دست‌دوم).

---

## ۲. تکنولوژی و نسخه‌ها

| لایه | انتخاب | نسخه |
|---|---|---|
| فریم‌ورک | Next.js (App Router، **proxy.ts** به‌جای middleware — قرارداد Next 16) | 16.2.6 |
| UI | React + Tailwind CSS 4 (RTL، فارسی) | 19.2.6 / 4.1.17 |
| دیتابیس | PostgreSQL + Drizzle ORM + drizzle-kit | 0.45.2 / 0.31.10 |
| زبان | TypeScript strict (`allowJs: false`) | 5.9.3 |
| ربات | Bale Bot API (`tapi.bale.ai`) — بدون SDK، fetch مستقیم | — |
| تست | اسکریپت یکپارچه با **pg-mem** (Postgres درون‌رم) + fetch موک | pg-mem 3.0 |
| اجرا | Docker (Dockerfile + docker-compose.yml با postgres:17) | Node 22 |

**دایرکتوری:**

```
├── Dockerfile, docker-compose.yml, .env.example, README.md, GUIDE.md
├── drizzle.config.ts, drizzle/0000_init.sql      # مایگریشن‌ها
├── scripts/test-bale-flow.mts                    # تست E2E (۴۲ سناریو)
└── src/
    ├── proxy.ts                                  # میدل‌ویر احراز /admin (توکن HMAC)
    ├── db/schema.ts, db/index.ts                 # اسکیما + اتصال lazy
    ├── app/
    │   ├── page.tsx, layout.tsx, globals.css     # لندینگ فارسی
    │   ├── api/bale/webhook/route.ts             # ورودی آپدیت‌های بله (امن)
    │   ├── api/bale/setup/route.ts               # اتصال/قطع/وضعیت وب‌هوک
    │   ├── api/health/route.ts                   # سلامت DB
    │   └── admin/                                # داشبورد: page, requests/[id], settings, login, media/[name], actions.ts
    └── lib/
        ├── bale.ts, baleTypes.ts                 # کلاینت بله + تایپ‌ها (لوکیشن/تماس/کیبوردها)
        ├── baleConversation.ts                   # ⭐ مغز: ماشین گفتگو (مشتری+ادمین)
        ├── session.ts                            # توکن نشست HMAC-SHA256 (WebCrypto — Edge+Node)
        ├── adminAuth.ts                          # ADMIN_COOKIE_NAME + لیست ادمین‌ها
        ├── customers.ts, credits.ts              # مشتری، کد دعوت، تراز کیف پول
        ├── requests.ts                           # CRUD سفارش + purgePrivateData (حذف خودکار داده حساس)
        ├── convState.ts                          # ذخیره state گفتگو در DB
        ├── settings.ts                           # seed نرخ‌ها + تنظیمات کلید-مقدار
        ├── pricing.ts                            # بازه‌های وزنی + برآورد قیمت
        ├── geo.ts                                # ۳۱ استان ایران
        ├── persian.ts                            # ارقام فارسی↔لاتین، برچسب‌ها، toToman
        ├── photoStorage.ts                       # ذخیره خصوصی عکس (خارج از public) + حذف
        └── webhookUrl.ts
```

---

## ۳. اسکیمای دیتابیس (خلاصه)

- **customers**: id, chatId(unique), firstName, lastName, username, phone, inviteCode(unique), invitedByCode, createdAt
- **pickup_requests**: id, customerId(FK), status(pgEnum ۱۲ حالته), wasteType, photoFileId, photoLocalPath, estimatedWeightBand/Kg, estimatedMin/Max, quotedPrice, province, city, address, locationLat/Lng(numeric 10,7), phone, preferredTime, finalWeightKg, finalPrice, rewardPercent/Amount, co2SavedKg, rating(۱–۵), referralBonusGranted, adminNote + timestamps (quoted/confirmed/scheduled/completedAt)
- **request_events**: دفتر حسابرسی (requestId, status, note, createdAt)
- **conversation_states**: chatId(unique), state, requestId, data(jsonb) — ذخیره مرحله چندمرحله‌ای گفتگو
- **material_rates**: material(unique), label, pricePerKg(تومان), co2PerKg, active — مقادیر default توسط `ensureSeedData` سید می‌شود
- **credit_transactions** (کیف پول): customerId, amount(+واریز/−برداشت), type(reward|referral|adjustment), requestId, note — موجودی = SUM(amount)
- **bot_settings**: key(PK), value — کلیدها: `min_accept_value`(۵۰هزار)، `reward_percent`(۱۲)، `referral_bonus`(۲۰هزار)، `coverage_provinces`(خالی=سراسری)

**enum وضعیت‌ها:** `awaiting_type → awaiting_review → quoted → confirmed → awaiting_address → awaiting_time → scheduled → collected → completed` + انشعاب‌ها: `low_value_queued`(کم‌ارزش)، `rejected`، `cancelled`

---

## ۴. ماشین گفتگوی بله (`baleConversation.ts`) — مهم‌ترین فایل

### جریان مشتری (مرحله‌به‌مرحله + callback_data)
1. `/start` → خوش‌آمد + پاک‌سازی state گیرکرده (+ deep-link `/start CHK-XXXX`)
2. عکس/داکیومنت تصویر → ذخیره خصوصی → سفارش `awaiting_type` + کیبورد نوع → `wt:{id}:{paper|plastic|metal|glass|secondhand|other}`
3. برای ۴ ماده اول: کیبورد وزن → `wb:{id}:{lt5,5to10,10to20,20to50,gt50,unknown}` → محاسبه `estimatedMin/Max = rate×band` → `awaiting_review` (برای secondhand/other مستقیم)
4. ادمین قیمت می‌دهد → `quoted` + کیبورد `confirm:{id}` / `cancel:{id}`
5. تایید → `confirmed` + کیبورد **۳۱ استان** → `prov:{id}:{key}` (کنترل پوشش؛ خالی=سراسری)
6. `awaiting_address` → reply keyboard با `request_location` («📍 ارسال موقعیت روی نقشه») یا متن آدرس → `message.location` ذخیره lat/lng
7. آدرس متنی (شهر+خیابان+پلاک) → reply keyboard با `request_contact` («📱 ارسال شماره تماس») یا skip → `message.contact.phone_number`
8. `awaiting_time` → `time:{id}:{today_evening|tomorrow_morning|tomorrow_evening|custom}` یا متن آزاد → `scheduled` + اعلان همه ادمین‌ها با **دکمه URL نقشه گوگل** + `adm_done:{id}`
9. `adm_done` → `collected` → وزن → مبلغ نهایی → `completed`: محاسبه reward، co2، واریز کیف پول، پاداش دعوت (اولین سفارش تکمیلی)، پیام فاکتور + کیبورد `rate:{id}:{1..5}`، سپس **purgePrivateData** (حذف address/phone/photo)
10. کم‌ارزش: `adm_r:{id}` → `low_value_queued` + پیام مؤدبانه به مشتری

### جریان ادمین (چندادمین: `ADMIN_CHAT_IDS` با ویرگول؛ env قدیمی `ADMIN_CHAT_ID` هم سازگار)
- اعلان سفارش جدید با عکس + برآورد + پرچم کم‌ارزش، دکمه `adm_q`/`adm_r`
- حالت‌های چت ادمین: `awaiting_quote`، `awaiting_weight`، `awaiting_final_price`
- **دستورهای سریع** (رفع محدودیت تک‌اسلاتی state): `قیمت <id> <مبلغ>`، `رد <id>`، `انجام <id>`، `وزن <id> <عدد>`، `مبلغ <id> <عدد>`، `/stats`، `/broadcast <متن>`
- ارقام فارسی/عربی همه‌جا با `normalizeDigits` ساپورت می‌شود

### قوانین گارد (مهم برای هر تغییر آینده)
- هر callback: ابتدا `answerCallbackQuery` → بررسی **مالکیت** (`requestBelongsToChat` یا chatId مشتری) → بررسی **وضعیت مجاز** → بعد اکشن
- لغو مشتری فقط در: quoted/confirmed/awaiting_address/awaiting_time
- اکشن‌های adm فقط برای چت‌های ادمین
- ریتینگ فقط یک‌بار، فقط پس از completed، فقط صاحب سفارش

---

## ۵. مدل امنیتی (خدشه‌دار نکنید)

- **نشست داشبورد**: کوکی = توکن `v1.admin.{exp}.{hmac}` امضاشده با `ADMIN_SESSION_SECRET` (fallback: مشتق رمز) — WebCrypto برای کار دو‌طرفه در proxy (Edge) و Server Actions (Node). ورود: ۵ تلاش ناموفق = ۱ دقیقه قفل (در حافظه).
- **proxy.ts**: matcher روی `/admin/:path*` (شامل `/admin/media/*`) — verify توکن، دیگر هدایت به `/admin/login`.
- **وب‌هوک**: بدون `BALE_WEBHOOK_SECRET` → همه آپدیت‌ها رد (۵۰۰/۴۰۱). سکرت با `secret_token` به setWebhook فرستاده می‌شود؛ هر آپدیت باید هدر `x-bale-bot-api-secret-token` یا `x-telegram-bot-api-secret-token` یا query `?secret=` را داشته باشد.
- **عکس‌ها**: خارج از `public/` در `UPLOAD_DIR` (پیش‌فرض `./data/uploads/bale`)، نام تصادفی + sanitize ضد traversal، سرو فقط از `/admin/media/[name]` با چک مجدد نشست + `no-store`.
- **حریم خصوصی**: address/phone/photoLocalPath پس از completed/cancelled پاک و در requestEvents ثبت می‌شود (قول داده‌شده به مشتری در /start).
- رمز در query string مجاز نیست (فقط کوکی نشست یا هدر `x-admin-password`).

---

## ۶. متغیرهای محیطی

`DATABASE_URL` · `BALE_BOT_TOKEN` · `ADMIN_CHAT_IDS` · `ADMIN_DASHBOARD_PASSWORD` · `ADMIN_SESSION_SECRET` · `APP_BASE_URL` · `BALE_WEBHOOK_SECRET` · `UPLOAD_DIR`(اختیاری)

راهنمای کامل استقرار: `GUIDE.md` — قبل از ایجاد تغییر، آن را هم بخوانید.

---

## ۷. تست و کیفیت (الزامی قبل از نهایی‌سازی هر تغییر)

```bash
npm run test:flow   # ⭐ ۴۲ سناریو E2E با pg-mem؛ کل جریان مشتری+ادمین+امنیت+حریم خصوصی
npm run typecheck && npm run lint && npm run build
```

تست `scripts/test-bale-flow.mts`: fetch موک‌شده (پیام‌های بله در آرایه `sentMessages` ثبت)، pg-mem با دو پچ مهم برای drizzle (حذف `types.getTypeParser` و تبدیل `rowMode:"array"` با ترتیب res.fields، چون pg-mem در join ستون‌های هم‌نام را در object می‌پوشاند — به همین دلیل در کد join استفاده نمی‌کنیم و دو کوئری ساده می‌زنیم).

---

## ۸. قراردادهای کدنویسی پروژه

1. همه UI و پیام‌های ربات **فارسی RTL**؛ اعداد با `toLocaleString("fa-IR")`؛ ورودی عددی با `normalizeDigits` قبل از parse.
2. وضعیت گفتگو **در دیتابیس** (نه حافظه)؛ هر تغییر وضعیت با `logEvent` ثبت شود.
3. بدون JOIN دوتایی با ستون هم‌نام — دو کوئری ساده (سازگاری درایور/pg-mem).
4. اتصال DB lazy است (`db/index.ts` با Proxy) — تزریق pool تست با `globalThis.__charkhehPoolOverride`.
5. ارسال پیام بله هرگز exception به بیرون ندهد (داخل lib/bale.ts catch می‌شود)؛ callback_guard اول.
6. caption عکس ≤1024 و متن ≤4096 (تابع clamp).
7. هیچ secret/توکنی در کد یا لاگ یا URL قرار نگیرد.
8. برای API بله از set موجود در `src/lib/bale.ts` استفاده کنید؛ متد جدید در همان فایل اضافه شود.

---

## ۹. وضعیت فعلی و نقشه راه پیشنهادی برای ارتقا

**انجام‌شده:** کل جریان بالا + کیف پول + دعوت + امتیاز + CO₂ + چندادمین + پوشش سراسری + تست ۴۲ سناریویی + Docker.

**ایده‌های توسعه (به ترتیب ارزش):**
1. **مدیریت پیک/جمع‌آوری‌کننده**: جدول couriers + انتساب سفارش بر اساس استان/شهر + نمایش سفارش‌های امروز هر پیک
2. **نوبت جمع‌آوری تجمیعی هوشمند**: گروه‌بندی سفارش‌های `low_value_queued` بر اساس استان/شهر و پیشنهاد مسیر بهینه
3. **نقشه تعاملی در داشبورد** (نمایش پین سفارش‌های scheduled روی Leaflet/OSM)
4. **تسویه/برداشت کیف پول**: درخواست واریز به کارت (شبا) + تایید ادمین + تراکنش منفی
5. **اعلان زمان‌بندی‌شده** (cron): یادآوری به ادمین برای مراجعه‌های امروز + پیگیری سفارش‌های ماندگار >۲۴ساعت
6. **پرداخت آنلاین/کارت‌به‌کارت** + شماره شبا مشتری در فلو
7. **گزارش اکسل/CSV خروجی** از سفارش‌ها و تراکنش‌ها
8. **i18n** اگر به بازارهای عربی/کردی برسد
9. انتقال به **queue** (مثل BullMQ) برای broadcastهای بزرگ و retry
10. **OAuth/رمز یک‌بارمصرف** برای داشبورد به‌جای رمز ثابت

---

## ۱۰. قوانین کار برای AI مقصد (خواندن الزامی)

هنگام ارتقای این پروژه:
- ✅ اول `scripts/test-bale-flow.mts` را بخوان؛ جریان را نشن — هر فیچر جدید باید به آن سناریو اضافه کند و همه ۴۲+ تست باید پاس بماند.
- ✅ `typecheck` + `lint` + `build` باید بدون خطا بماند.
- ✅ تغییر اسکیما → `npx drizzle-kit generate` و مایگریشن جدید (رابط Old Migration حذف نشود).
- ✅ رعایت گاردها، امنیت بخش ۵ و قراردادهای بخش ۸ الزامی است. حذف/ضعیف‌سازی چک احراز، گاردها یا پاک‌سازی حریم خصوصی ممنوع.
- ✅ پیام‌های کاربر را فارسی بچسب و طبیعی نگه‌داری (لحن دوستانه-مؤدب فعلی).
- ❌ SDK سنگین تلگرام اضافه نکن؛ لایه `bale.ts` سبک عمدی است.
- ❌ بدون دلیل، ساختار پوشه‌ها را جابه‌جا نکن.

**شروع به‌کار:** بگو بنابراین بریف، کدام آیتم نقشه راه را با کد کامل (فایل‌به‌فایل + تست) پیاده کنی، با اولویت سازگاری با تست‌های موجود.

</div>
