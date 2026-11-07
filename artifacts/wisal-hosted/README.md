# وصال — مراسلة خاصة بين الضيف وصاحب الموقع

هذا هو التطبيق المستضاف داخل مشروع وصال الحالي. الواجهة السابقة محفوظة للمدير على `/classic`، والنسخة المحلية الحالية تستخدم المكونات نفسها والخادم نفسه من المشروع الأساسي.

## المسارات

- `/`: ينشئ جلسة ضيف آمنة تلقائيًا، ويفتح محادثة واحدة مع صاحب الموقع دون حساب أو تسجيل.
- `/admin`: يطلب تسجيل الدخول بحساب ChatGPT المعتمد، ويتحقق الخادم من بريد المدير ثم يربطه بمعرّف المنصة الثابت في قاعدة البيانات. وجود الرابط أو إخفاؤه لا يمنح صلاحيات.
- `/classic`: الواجهة السابقة والمجموعات، متاحة للمدير فقط. كل طلب API يحافظ على التحقق نفسه.

قاعدة البيانات D1 واحدة لكل المسارات. الملفات في R2 خاصة، ولا تُقدّم عبر روابط عامة مباشرة. الرسائل وحالة الاتصال والكتابة والقراءة تتحدث عبر SSE، مع مزامنة مستقرة بين نسخ الخادم باستخدام قاعدة البيانات.

## صلاحيات الضيوف

هوية الضيف رمز عشوائي من 256 بت داخل ملف ارتباط HttpOnly وSecure وSameSite، وصلاحيتها سنة. تُحفظ بصمة الرمز فقط في قاعدة البيانات. يرتبط كل ضيف بمحادثة واحدة وعضوين فقط: الضيف والمدير. تغيير معرف المحادثة أو المرفق أو طلبات API لا يمنح الوصول إلى غيرها. لا توجد قائمة زوار أو بحث عن أشخاص للضيف.

تظهر المحادثة السابقة عند العودة من المتصفح نفسه. حذف ملفات الارتباط أو استعمال متصفح آخر ينشئ هوية جديدة؛ لا نستنتج هوية الشخص من بصمة جهازه أو عنوانه. رقم الهاتف اختياري يكتبه الضيف ويظهر للمدير في محادثته فقط؛ ليس رقمًا مُتحققًا بـSMS ولا يُكتشف تلقائيًا من المتصفح.

## صلاحيات المدير

تسجيل دخول المنصة يثبت الهوية، ثم يتحقق التطبيق من `ADMIN_EMAIL` في الخادم ومن ربط `admin_principal` داخل قاعدة البيانات. لا تستطيع جلسة ضيف ترقية دورها، ولا يقبل التطبيق ترويسات هوية مصطنعة من عميل عادي. المتغير خاص ببيئة الاستضافة، ولا يضمّن البريد في المتصفح أو المصدر.

تعرض اللوحة محادثات الزوار، والعدد غير المقروء، والبحث بالاسم أو الرقم الاختياري، والتثبيت والأرشفة. حذف محادثة من قائمة المدير يمسح عرض رسائلها لديه فقط، ويبقى تاريخ الزائر كما هو؛ تعود المحادثة عند وصول رسالة جديدة. يوضح مربع الحذف هذا السلوك قبل التنفيذ.

## الميزات

- نصوص وصور وفيديوهات وتسجيلات صوتية ومستندات PDF وملفات نصية. حد الملف 20 ميجابايت، وحد التسجيل دقيقتان.
- فحص نوع الملف من محتواه، ورفض HTML وSVG والملفات التنفيذية والملفات المضغوطة والأنواع المضللة أو الكبيرة. ترويسات تمنع تفسير المرفقات كصفحات قابلة للتنفيذ، وصلاحيات على كل قراءة بما فيها طلبات نطاق الفيديو.
- حدود طلبات ورسائل ورفع لكل جلسة، وحد إنشاء ضيوف لكل مصدر بصيغة مُعمّاة.
- الاتصال «متصل الآن» يعتمد على قناة حية فعلية، وليس مجرد إنشاء الحساب. يغلق عند المغادرة، وتوجد مهلة اكتشاف تصل إلى 20 ثانية عند انقطاع مفاجئ. آخر ظهور محفوظ، ومؤشر الكتابة ينتهي تلقائيًا.
- حالات نصية وصور وفيديو ينشرها المدير، وتُحجب تلقائيًا في الخادم وواجهة العرض بعد 24 ساعة، بما فيها الوصول المباشر للمرفق.
- وضع ليلي ونهاري متجاوب، وتغيير الاسم والصورة، وبحث داخل الرسائل وتحميل التاريخ الأقدم.
- صوت وصول اختياري للرسائل الجديدة من الطرف الآخر فقط. يتطلب تفعيله من الإعدادات أو تفاعلًا يوافق عليه المتصفح، ويعمل والصفحة مفتوحة. لا يصدر صوت عند تحميل التاريخ القديم أو عند إرسال رسالتك.

## التشغيل المحلي لهذا التطبيق

```bash
npm ci
npm run build
```

شغّل كل ترحيل محلي مرة واحدة بالترتيب، باستخدام إعدادات الخادم المبني:

```bash
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_nasty_hairball.sql
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0001_regular_lady_bullseye.sql
npm run dev
```

في المعاينة المحلية فقط، محاكاة دخول المنصة من القالب تستعمل `seedy@sites.test`. يمكن ضبطه في `.dev.vars` للاختبار المحلي. المحاكاة لا تدخل في بناء الإنتاج، ولا تُرسل ملفات `.dev.vars` للنشر.

للتشغيل المحلي الأصلي من جذر المشروع: `pnpm setup:account` ثم `pnpm dev`؛ يستعمل SQLite وملفات خاصة على القرص، وتبقى كلمة مرور المدير المحلية مستقلة عن دخول المنصة في الاستضافة.

## النشر

يُحفظ `project_id` وإسما الربط `DB` و`BUCKET` في `.openai/hosting.json`. تخزن الاستضافة `ADMIN_EMAIL` و`IP_HASH_KEY` كقيم سرية مستقلة عن المستودع. يجب نشر نسخة مبنية من المصدر نفسه بواسطة مسار Sites. لا تُنشر قواعد المعاينة أو ملفات الارتباط أو مفاتيح أو بيانات الاختبارات.

## التحقق وحدود النسخة

فحص TypeScript وبناء الواجهتين واختبارات الخادم في المشروع الأساسي. تغطي اختبارات الضيوف مديرًا وثلاثة زوار، والعزل ورفع الملفات والهوية والحفظ والقراءة والحالات والاتصال وحدود الاستخدام والرقم الاختياري. اختُبرت أيضًا واجهة D1/R2 الفعلية محليًا بتسجيل دخول المدير وثلاث هويات مستقلة.

الرسائل محمية بصلاحيات الخادم وHTTPS وتخزين الاستضافة، وليست مشفرة من طرف إلى طرف. الشارة والصورة والاسم الافتراضيان محفوظة من المشروع الأصلي، ولا تمثل الشارة توثيقًا صادرًا من واتساب أو إنستغرام. وصال هو اسم التطبيق المستقل. لا يتم ربطه بحساب واتساب الحقيقي ولا يرسل SMS ولا يجري مكالمات.

## Receipts and guest account info

Apply every Drizzle migration including additive `0002_previous_ego.sql`. SSE sends pending message payloads; only a recipient-authenticated ACK records delivery. Visible rows in the open conversation submit explicit IDs for reading. Online presence alone never marks read. Existing historical receipt times are not fabricated. Guests can open owner info/photo/statuses read-only; no administration link or owner editor is rendered for guests.

## النص أسفل اسم الحساب

يعدّل المدير الحقل من الإعدادات والملف الشخصي. تحفظ `wisal_settings` القيمة كنص تحت المفتاح `owner_account_subtitle`؛ لا يحتاج التغيير إلى ترحيل أو إعادة إنشاء القاعدة. يظهر السطر المحفوظ كما هو، ويمكن إفراغه. تبقى القيمة السابقة `@hhshklatifa` إلى أول تعديل. يُرفض تعديل الحقل من الضيف على الخادم، وتصل التغييرات عبر أحداث تحديث الملف إلى جميع جلسات الزوار.

## Send responsiveness

Outgoing messages enter a per-user, per-conversation in-memory outbox immediately, leaving the composer available. A clock means pending, and sent/delivered/read checks still require server data. Failed requests expose a retry using the same client ID. History reconciles confirmations without duplicate bubbles. Unconfirmed messages remain in the current window until the server saves them; reload restores server-saved history. D1 batches return the saved message with the write, while authentication and membership are validated for every request. Only owner bootstrapping and the database adapter are reused within an isolate. Message refreshes do not refetch owner profile/status data; account-wide events still update them immediately.

The administrator can select all visitor conversations beside the archive button, including matching conversations beyond the current page, adjust individual selections, and confirm bulk removal from the owner inbox. Selection respects search/archive/unread filters. Server endpoints require the authenticated owner, reject groups and legacy member threads, and preserve guest history; a new incoming message brings the conversation back.

## Visitor reply notifications

Guest-only `/push/config` and `/push/subscription` routes bind Web Push subscriptions to the HttpOnly guest session. Only a newly saved owner reply triggers a notification for its actual guest recipient. A request-scoped Worker `waitUntil` keeps delivery alive after the save response; transient failures get up to three attempts and the push TTL is 24 hours. Expired subscriptions are removed on 404/410. Provider URLs are allowlisted to Apple, Mozilla and FCM; redirects are rejected. Endpoints are never returned in lists or profile data.

The VAPID ES256 signing key is server-only (`VAPID_PRIVATE_JWK`), with `VAPID_PUBLIC_KEY` and a HTTPS or mailto `VAPID_SUBJECT`. Generate once using `node ../../scripts/generate-push-keys.mjs` for an independent new deployment, and preserve the key across updates. Keep private output in server secrets. No third-party push account or chat-content payload is required. The standards-compliant empty push displays a generic notice via `/sw.js`; receipt timestamps are unaffected.

Visitors explicitly opt in; blocked permission needs browser settings. iOS/iPadOS require a supported version and installation on the Home Screen before opting in. A manifest and PNG app icons are included. Browser/OS permissions, connectivity and notification policies still govern delivery. Browser-owned subscription renewal is reconciled when the visitor returns. Tests verify VAPID signatures, recipient isolation, opt-in, retry/expiry/unsubscribe and service-worker click behavior using a fake provider transport; they do not establish a successful physical-device push delivery.
