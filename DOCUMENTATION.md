# תיעוד מערכת — mrdaniel.co.il

תיעוד מלא של הפרויקט: אתר התדמית, דשבורד הניהול, שכבת ה-API, מסד הנתונים,
מנוע הדיוור והאוטומציות. נכון לגרסה הנוכחית (אוגוסט 2026).

---

## 1. סקירה כללית

הפרויקט מורכב משתי אפליקציות Vite נפרדות באותו ריפו, ושתי פריסות Vercel נפרדות:

| רכיב | תיקייה | פרויקט Vercel | דומיין |
|---|---|---|---|
| אתר תדמית (React 19 + R3F) | `/src` | `my-website` | `https://mrdaniel.co.il` |
| דשבורד ניהול (Analytics + סוכן) | `/dashboard` | `dashboard` | `https://dashboard-snowy-psi-94.vercel.app` |
| Serverless Functions | `/api` | נפרסות עם `my-website` | `mrdaniel.co.il/api/*` |
| שרת פיתוח מקומי (Express) | `server.ts` | — (מקומי בלבד) | `localhost:3000` |

- **הדשבורד תמיד מדבר עם ה-API של הפרודקשן** (`mrdaniel.co.il/api/*`) — הוא כלי תפעול על נתונים חיים.
  ניתן לעקוף עם `VITE_SITE_ORIGIN` / `VITE_AGENT_API_BASE`.
- **מסד הנתונים**: Firebase Realtime Database (RTDB) — לא Firestore.
- **פריסה**: `npm run deploy:all` (משתמש בסקריפטים `deploy` + `deploy:dashboard`).

### מגבלות תוכנית Vercel Hobby (חשוב)
- **מקסימום 12 Serverless Functions** לפריסה. אנחנו על הגבול המדויק — כל פיצ'ר חדש
  שדורש endpoint מקופל לתוך פונקציה קיימת (למשל מנוע המייל בתוך `api/leads.ts`,
  והמפרסם האוטונומי בתוך `api/agent-generate.ts`).
- **Cron יומי בלבד** — ביטוי `0 8 * * *` מותר, `0 6-22 * * *` נדחה.

---

## 2. אתר התדמית (`/src`)

### 2.1 טכנולוגיות
- **Vite 6 + React 19 + TypeScript**, Tailwind CSS v4 (`@theme` ב-`src/index.css`, ללא `tailwind.config`).
- **react-router-dom v7** — `BrowserRouter`, ניווט לפי `pathname`, `history.scrollRestoration = 'manual'`.
- **motion (Framer Motion)** לאנימציות UI, **GSAP + ScrollTrigger** לסנכרון גלילה, **Lenis** לגלילה חלקה (דסקטופ בלבד — כבוי ב-`pointer: coarse`).
- **@react-three/fiber + drei + postprocessing** — רקע קוסמי תלת-ממדי (`Scene3D`), נטען ב-`lazy` אחרי idle.
- **@tanstack/react-query v5** — פידים (חדשות, AI pulse).

### 2.2 מבנה תיקיות
```
src/
├── App.tsx                 # שורש: NewsTicker → Header → <main> (Routes) → Footer + מודלים
├── main.tsx                # QueryClientProvider + BrowserRouter
├── index.css               # @theme (צבעי brand), utilities, keyframes (ticker, marquee, roi-range)
├── pages/                  # דף לכל route
│   ├── HomePage             # Hero → WordRotator → 3× OfferSection → RoiCalculator → PricingSection
│   │                        #   → TechMarquee → CyberNewsGrid → ContactPortal
│   ├── AIPage / JarvisPage / CyberPage / DigitalPage
│   ├── ArchitecturePage / CapabilitiesPage / MagazinesPage
│   ├── NewsPage / NewsArticlePage
│   └── AboutPage / PrivacyPage / TermsPage / AccessibilityPage
├── components/
│   ├── Header / Footer / NewsTicker / Hero / WordRotator / ContactPortal
│   ├── home/               # OfferSection, PricingSection, RoiCalculator
│   ├── content/            # ContentPrimitives (SectionHeading, ServiceGrid…), AgentFinder,
│   │                        #   AIPulseWidget, CaseStudies, EnterpriseServicesSection, VideoEmbed,
│   │                        #   JarvisShowcaseVideo, ProjectEstimator, TermTooltip
│   ├── mobile/             # ScrollLockRail (native overflow-x, touch-action: pan-x), SwipeRow
│   ├── seo/                # Seo (upsert של תגי head), RouteSeo
│   ├── TechMarquee.tsx     # מרקיזה CSS אינסופית + פופאובר פורטל / מודל מובייל
│   ├── Reveal.tsx          # reveal בגלילה — קופץ מיידית ב-mobile (ללא observer)
│   ├── LeadForm / AgentQualificationModal / AIAssistantWidget / AccessibilityWidget
│   └── CyberNewsGrid.tsx   # לוח חדשות בעמוד הבית
├── hooks/
│   ├── useLenis.ts          # גשר Lenis↔ScrollTrigger; scrollToInstant / smoothScrollTo וכו'
│   ├── useScrollRestoration.ts  # זיכרון גלילה גלובלי לפי route (sessionStorage), back/forward
│   ├── useDeviceTier.ts / useDeferredMount.ts / usePointer.ts
├── lib/
│   ├── tracker.ts           # Firebase analytics client — כותב presence/events/leads/health
│   ├── gsap.ts / debugConsole.ts (eruda ל-?debug=true) / leadWebhook.ts (Apps Script גיבוי)
│   ├── seo/pageSeo.ts       # קונפיג SEO לכל route
│   └── structuredData.ts    # בוני JSON-LD
├── services/
│   ├── newsService.ts       # useNewsFeed → /api/news (Geektime, TechTime, גלובס, ynet, Israel Defense, Google News)
│   ├── aiNewsService.ts     # useAINewsFeed → /api/ai-news (YouTube AI)
│   └── aiPulseService.ts    # useAIPulse → rss2json (TechCrunch/VentureBeat/HN)
├── server/                  # קוד שרת משותף (לא React) — נצרך מ-/api ומ-server.ts
│   ├── newsFeed.ts          # אגרגציית RSS רב-מקורית: SOURCES עם priority/timeoutMs/onlyTopics,
│   │                        #   withTimeout לכל פיד, extractImage (enclosure/media:*/itunes/<img>),
│   │                        #   classifyTopic (cyber/ai/cloud/general) + deriveCategory (תג עברי:
│   │                        #   סייבר/בינה מלאכותית/ענן ותשתיות/כלכלה/טכנולוגיה), dedupe חוצה-מקורות
│   │                        #   (לפי קישור קנוני + כותרת מנורמלת, שומר את המקור בעדיפות הגבוהה).
│   │                        #   Calcalist מגיע רק דרך Google News (ה-RSS שלו מחזיר 403).
│   ├── aiNewsFeed.ts
│   ├── newsPostComposer.ts  # מחבר קופי ארוך (Hook→מה קרה→למה חשוב→עיקרי הדברים→מומחה→#→footer)
│   ├── storySlides.ts       # פירוק פריט חדשות ל-4 שקופיות סטורי (טקסט בלבד)
│   ├── autoPublish.ts       # מנוע המפרסם האוטונומי (runAutoPublishCycle, dispatchPublish)
│   └── emailEngine.ts       # Nodemailer + תבניות מייל ממותגות + sendCampaign/sendOne
├── agent/                   # מנוע הסוכן החברתי (Gemini): SocialAgentEngine, AgentSecurityGuard,
│   │                        #   MediaTemplateRenderer (spec בלבד), WeeklyPlanEngine, WhatsAppDispatcher
│   └── firebaseServer.ts    # כל הגישה ל-RTDB מצד השרת (client SDK, לא firebase-admin)
├── three/                  # Scene3D, SceneObjects (R3F)
└── archive/               # canvas-motion-v2 — גרסה נסיונית שהוקפאה
```

### 2.3 שיקולי מובייל / ביצועים
- אין `position: sticky` ואין GSAP `pin: true` ברמת section (נגרם stacking ב-webview של אינסטגרם/פייסבוק).
- כל ה-`min-h-screen` נדרס ל-`100dvh` ב-`index.css`.
- `overflow-x: clip` (לא `hidden`) ברמת עמוד — לא יוצר scroll container.
- מסועי כרטיסים אופקיים: `overflow-x: auto` נייטיב + `touch-action: pan-x` (גלילה אנכית עוברת לדף).

---

## 3. דשבורד הניהול (`/dashboard`)

Vite 6 + React 19 + Tailwind v4. **אין react-query** — `onValue` של Firebase + `useState`.
מאובטח ב-`LoginGate` (Firebase Auth). כל טאב עטוף ב-`ErrorBoundary`.

### 3.1 טאבים (`src/App.tsx`)
| טאב | קומפוננטה | תיאור |
|---|---|---|
| סקירה כללית | LiveCounter / HealthGauge / TrafficChart / EventFeed | מבקרים חיים, בריאות, תעבורה |
| מבקרים | VisitorBreakdown / DeviceBreakdown | פילוח נוכחות |
| אירועים ותוכן | ContentHeatmap / EventFeed | |
| לידים וניוזלטר | LeadPipeline / LeadsLog (NewsletterLog) | קריאה מ-`leads` / `newsletter_signups` |
| אבטחה ופעילות סוכן | AgentActivityLog / ThreatAuditPanel | |
| סוכן AI חברתי | AgentControlPanel | מצב auto-pilot, יצירת תוכן ידנית, תור אישורים |
| מחולל תוכן מחדשות | NewsContentAgent | פוסט בודד מכתבה: קופי + תמונה ממותגת (canvas) |
| מחולל סטורי | InstagramStoryCanvas | 4 שקופיות 9:16, קרוסלה, "הורד את כל השקופיות" |
| אוטונומיה | AutoPublisherPanel | מתג ראשי, תדירות, פלטפורמה, קטגוריה, מצב, webhook, לוג ריצות |
| **מערכת דיוור ומיילים** | **EmailManagerPanel** | בונה תבניות, שליחת קמפיין, welcome אוטומטי, היסטוריה |
| לוח תוכן שבועי | WeeklyPlanCalendar | |

### 3.2 hooks / lib עיקריים
- `useLiveEvents.ts` — `usePresence`, `useLiveEvents`, `useHealth`, `useLeads`, `useNewsletterSignups`, `useFirebaseConnection`.
- `useAgentController.ts` — קונפיג הסוכן + תור (`agent_queue`) + קריאות ל-`/api/agent-generate`.
- `useAutoPublisher.ts` — `auto_publish_config` + `published_posts` + `runNow` (`action:auto-publish-run`) + `approveAndPublish` (`action:auto-publish-dispatch`).
- `useEmailManager.ts` — `email_templates` + `email_config` + `email_campaigns` + `newsletter_signups`/`leads` counts + `sendTest`/`sendCampaign` (POST ל-`/api/leads`).
- `useCarouselImages.ts` / `useVideoGeneration.ts` / `useWeeklyPlan.ts`.
- **רנדרינג canvas בצד לקוח בלבד**: `newsImageComposer.ts` (פוסט בודד), `instagramStoryRenderer.ts` (סטורי 9:16), `carouselTemplateRenderer.ts` (קרוסלה). אין רנדור תמונה בצד שרת — טקסט עברי על canvas בשרת אינו אמין.
- `pexelsBackground.ts` — תמונות רקע: `/api/pexels-search` (מפתח בשרת) → מאגר Pexels קבוע (CORS פתוח).

### 3.3 עיצוב
- **רוחב מלא** — אין `max-w-*`/`mx-auto` שמצמצם; רק `p-5 md:p-8` על השורש.
- טאבים ב-`flex-wrap` (ללא scrollbar אופקי). קבוצות כפתורים ב-`flex-wrap`. טבלאות נתונים
  (LeadsLog, ThreatAuditPanel, VisitorBreakdown) שומרות `overflow-x-auto` — לגיטימי.
- `.dash-card` — משטח כרטיס אחיד (ראו `dashboard/src/index.css`).

---

## 4. שכבת ה-API (`/api`, 12 פונקציות)

כולן Vercel Serverless (Node). `server.ts` הוא מראה מקומית (Express, מריץ את אותם handlers).
אימות אדמין: header `x-admin-secret` מול `ADMIN_API_SECRET` (fail-open אם לא הוגדר).
Cron: header `Authorization: Bearer ${CRON_SECRET}`.

| Endpoint | תפקיד |
|---|---|
| `GET /api/health` | `{ ok, ts }` — ping latency |
| `GET /api/news` | פיד חדשות מצטבר (`getNewsItems`). CORS `*`. כולל `image` אופציונלי. |
| `GET /api/news/item/:slug` | כתבה בודדת |
| `GET /api/ai-news` | פיד וידאו AI (YouTube) |
| `POST /api/leads` | **לידים + מנוע המייל** — ראו §6 |
| `POST /api/chat` | עוזר AI (Gemini) |
| `GET/POST /api/agent-generate` | **הסוכן החברתי + המפרסם האוטונומי** — ראו §7. `maxDuration: 60` |
| `POST /api/agent-whatsapp-webhook` | Webhook נכנס של גשר WhatsApp |
| `POST /api/generate-weekly-plan` | לוח תוכן שבועי (Gemini) |
| `GET/POST /api/generate-video` | יצירת וידאו (מושבת זמנית) |
| `GET /api/pexels-search` | פרוקסי חיפוש Pexels (מפתח בשרת) |
| `GET /api/img-proxy` | ממסר תמונות CORS: מושך תמונת חדשות מרוחקת ומגיש עם `Access-Control-Allow-Origin: *`. הגנות SSRF: https בלבד, חסימת hosts פרטיים/loopback, אכיפת `image/*`, תקרת 8MB / 8s. |

---

## 5. Firebase Realtime Database — סכמה וכללים

### 5.1 סכמה (paths)
| Path | נכתב על ידי | נקרא על ידי | מבנה |
|---|---|---|---|
| `presence/` | tracker (אתר) | דשבורד | `{ <sessionId>: { device, path, startedAt, lastSeen, browser, screen, lang, timezone, referrer, ip (ממוסך), countryCode, region, city } }`. `writePresence()` כותב את הרשומה המלאה ב-init, בכל route change, ב-heartbeat כל 25 שניות, וב-`visibilitychange` — וכל פעם מזיין מחדש `onDisconnect().remove()`. ה-IP והגאו נלכדים פעם אחת דרך `/api/health` (headers `x-vercel-ip-*`), ה-IP ממוסך. **הדשבורד סופר "פעיל" רק רשומה תקינה (device מוכר + startedAt מספרי) שה-`lastSeen`/`startedAt` שלה בטווח 60 שניות** (`dashboard/src/lib/presence.ts`) — כך הספירה הכוללת תמיד שווה לפירוט המכשירים, ורשומות "רפאים" (partial write ישן) או תקועות (onDisconnect שנכשל) נושרות תוך ≤5ש׳. |
| `events/` | tracker (אתר) | דשבורד | אירועי גלישה/המרה |
| `health/latest` | tracker | דשבורד | מדדי בריאות |
| `leads/` | `api/leads` (טפסי האתר, שאלון ההתאמה, ManyChat) | דשבורד, `api/leads` (איסוף נמענים) | `{ <id>: { name, email, phone, sourceSection, status, ts } }` |
| `newsletter_signups/` | `api/leads` (`action:newsletter-signup`) | דשבורד, `api/leads` | `{ <id>: { email, name, source, ts } }` |
| `agent_config/` | דשבורד | `api/agent-generate` | `{ mode, webhooks, strategicContext, … }` |
| `agent_queue/` | `api/agent-generate` | דשבורד | טיוטות תוכן/פנייה לאישור |
| `weekly_plan` | `api/generate-weekly-plan` | דשבורד | |
| `video_jobs/` | `api/generate-video` | דשבורד | |
| `auto_publish_config` | דשבורד (`AutoPublisherPanel`) | `api/agent-generate` (autoPublish) | `{ active, slotsUTC[], platform, category, mode, publishWebhookUrl }` |
| `published_posts/` | `api/agent-generate` (autoPublish), דשבורד (עדכון סטטוס) | דשבורד | `{ <id>: { newsId, newsTitle, newsLink, category, topic, platform, imageUrl, caption, hashtags, storySlides[], status, mode, slotKey, createdAt } }` |
| `story_drafts/<newsId>` | `api/agent-generate` (autoPublish) | דשבורד (Story Studio) | `StoryPayload`: `{ newsId, newsTitle, newsLink, topic, imageUrl, slides[4], createdAt }` |
| `email_templates/<id>` | דשבורד (`EmailManagerPanel`) | `api/leads` (welcome), דשבורד | `{ name, subject, html, updatedAt }` |
| `email_config` | דשבורד | `api/leads` | `{ autoWelcome, welcomeTemplateId, fromName }` |
| `email_campaigns/` | `api/leads` (`action:send-campaign`) | דשבורד | `{ <id>: { subject, audience, total, sent, failed, status, ts } }` |

### 5.2 כללי אבטחה (Rules)
צד השרת משתמש ב-**client SDK** של Firebase. החריגים הם `leads`, `newsletter_signups`, `email_config` ו-`email_templates`, שעוברים דרך `privilegedDb()` ב-`src/agent/firebaseServer.ts`: firebase-admin כש-`FIREBASE_SERVICE_ACCOUNT` מוגדר, וה-client SDK עד אז (עד נעילת הכללים, PROJECT_STATE.md §6). לכן כל path אחר שהשרת כותב אליו
חייב כלל read/write שמאפשר זאת. תבנית מינימלית (להתאים לצרכים):

```json
{
  "rules": {
    "presence":            { ".read": true, ".write": true },
    "events":              { ".read": true, ".write": true },
    "health":              { ".read": true, ".write": true },
    "leads":               { ".read": true, ".write": true },
    "newsletter_signups":  { ".read": true, ".write": true },
    "agent_config":        { ".read": true, ".write": true },
    "agent_queue":         { ".read": true, ".write": true },
    "weekly_plan":         { ".read": true, ".write": true },
    "video_jobs":          { ".read": true, ".write": true },
    "auto_publish_config": { ".read": true, ".write": true },
    "published_posts":     { ".read": true, ".write": true },
    "story_drafts":        { ".read": true, ".write": true },
    "email_templates":     { ".read": true, ".write": true },
    "email_config":        { ".read": true, ".write": true },
    "email_campaigns":     { ".read": true, ".write": true }
  }
}
```

> הערה: כללים פתוחים מתאימים לפרויקט בו הכתיבה מגיעה מ-endpoints מאומתים (`x-admin-secret`) ומ-tracker
> אנונימי בלבד. לחיזוק — להגביל `.write` ל-`auth != null` על paths שרק הדשבורד המחובר כותב אליהם
> (`email_*`, `auto_publish_config`, `agent_config`), ולהשאיר פתוחים רק את `presence`/`events`/`leads`/`newsletter_signups`.

---

## 6. מנוע המייל והדיוור

מאוחד לתוך `POST /api/leads` (בגלל תקרת 12 הפונקציות). לוגיקה: `src/server/emailEngine.ts` +
helpers ב-`src/agent/firebaseServer.ts`. UI: `dashboard/src/components/EmailManagerPanel.tsx`.

### 6.1 הגדרות SMTP (ImprovMX / מותאם)
משתני סביבה על פרויקט Vercel **`my-website`**:

| משתנה | ברירת מחדל | הסבר |
|---|---|---|
| `SMTP_HOST` | `smtp.improvmx.com` | שרת ה-SMTP |
| `SMTP_PORT` | `587` | 587 = STARTTLS · 465 = TLS מלא |
| `SMTP_USER` | — (חובה) | כתובת השליחה, למשל `daniel@mrdaniel.co.il` |
| `SMTP_PASS` | — (חובה) | סיסמת SMTP מ-ImprovMX (Account → SMTP) |
| `SMTP_FROM` | `SMTP_USER` | כתובת "מאת" תצוגתית (אופציונלי) |
| `LEAD_EMAIL_TO` | `danihell3039@gmail.com` | לאן נשלחת התראת ליד חדש |

**הגדרת ImprovMX**: מוסיפים את הדומיין `mrdaniel.co.il`, מגדירים alias
`daniel@ → <inbox היעד>`, ובלשונית SMTP מפיקים סיסמת שליחה. רשומות ה-MX/SPF של ImprovMX
חייבות להיות מוגדרות ב-DNS של הדומיין (אחרת מיילים יחזרו/יסומנו כספאם).

### 6.2 זרימת לידים והרשמות
1. **ליד מהאתר** — `LeadForm` / `AIAssistantWidget` שולחים `POST /api/leads` (name, email…).
   - השרת שולח התראת טקסט ל-`LEAD_EMAIL_TO`.
   - השרת שומר את הליד ב-`leads` לפני שליחת המייל, כך שליד נשמר גם כש-SMTP נופל. הדפדפן כבר לא כותב ל-`leads`.
   - `src/lib/leadWebhook.ts` יורה גם ל-Google Apps Script (גיבוי fire-and-forget).
   - אם `email_config.autoWelcome` פעיל — נשלח מייל "ברוכים הבאים" ממותג לכתובת הליד.
2. **הרשמת ניוזלטר** — `POST /api/leads` עם `{ action: 'newsletter-signup', email, name?, source? }`.
   - כתיבה ל-`newsletter_signups`.
   - `autoWelcome` פעיל → מייל welcome (תבנית מ-`welcomeTemplateId` או המובנית).
   - זהו ה-endpoint שטופס ניוזלטר עתידי באתר יקרא לו.

### 6.3 בונה תבניות + קמפיינים (דשבורד)
- **בונה תבניות** — שם (פנימי), נושא, גוף HTML. הגוף נעטף אוטומטית ב-`wrapBrandedEmail`
  (header כהה עם MR. DANIEL, גוף קריא, footer עם קישור לאתר). תצוגה מקדימה חיה ב-`iframe srcDoc`.
  שמירה/מחיקה ישירות ל-`email_templates` ב-RTDB.
- **שליחת קמפיין** — POST `{ action: 'send-campaign', subject, html, audience }`:
  - `audience`: `newsletter` (רק `newsletter_signups`) / `leads` (רק `leads`) / `all` (איחוד, ללא כפילויות).
  - השרת אוסף כתובות, עוטף את ה-HTML, שולח ב-batches של 40 עם **BCC** (`to` = כתובת השולח).
  - התוצאה (`{ total, sent, failed, batches }`) נרשמת ל-`email_campaigns`.
  - כפתור השליחה דורש אישור שני (מונע blast בטעות).
- **שליחת בדיקה** — POST `{ action: 'send-test', to, subject, html }` — נמען בודד, נושא עם `[בדיקה]`.
- **welcome אוטומטי** — מתג + בורר תבנית ב-UI; נשמר ל-`email_config`.

### 6.4 פעולות ה-API של המייל (סיכום)
```
POST /api/leads
  { action: "newsletter-signup", email, name?, source? }          # פתוח
  { action: "send-test",     to, subject, html, wrap? }            # x-admin-secret
  { action: "send-welcome",  to, name? }                           # x-admin-secret
  { action: "send-campaign", subject, html, audience, extraRecipients?, wrap? }  # x-admin-secret
  { name, email, phone, ... }  (ללא action)                        # ליד רגיל
```

---

## 7. Cron ואוטומציות

### 7.1 ה-Cron היחיד — `GET /api/agent-generate` @ `0 8 * * *` (08:00 UTC)
מפעיל **שתי משימות עצמאיות** באותה ריצה יומית (כי Hobby מאפשר cron יומי אחד לפונקציה):

1. **סוכן תוכן חברתי (auto-pilot)** — רק אם `agent_config/mode === 'auto-pilot'`.
   מייצר 2–3 טיוטות תוכן (Gemini) ל-`agent_queue` לאישור אדמין; שולח התראת webhook/WhatsApp.
   **לא** מפרסם לרשתות בפועל.

2. **מפרסם חדשות אוטונומי** (`src/server/autoPublish.ts` → `runAutoPublishCycle`) — רק אם
   `auto_publish_config/active`. הזרימה:
   - שער תדירות: פעם ביום (cron). מזהה יעד קטגוריה (`cyber`/`ai`/`tech`/`auto` → רוטציה לפי יום בשנה).
   - dedup מול `published_posts` (לפי `newsId` + כותרת מנורמלת) — בוחר את הפריט החדש ביותר שטרם פורסם.
   - `composeNewsPost` → קופי ארוך ומובנה לכל פלטפורמה שנבחרה.
   - `publishImageUrl` → תמונת הפריט דרך `/api/img-proxy`, או תמונת סטוק לפי נושא.
   - `buildStorySlides` → 4 שקופיות סטורי (טקסט) → נשמר ל-`published_posts.storySlides` **וגם** ל-`story_drafts/<newsId>`.
   - **מצב `full-auto`**: POST ל-`publishWebhookUrl` (Make.com / n8n / Buffer / Zapier) עם
     `{ platform, caption, hashtags, imageUrl, newsTitle, newsLink, category }` → רישום `success`/`failed`.
   - **מצב `drafts`**: רישום `pending_approval` בלבד; אישור ידני מהדשבורד ("אשר ופרסם" → `action:auto-publish-dispatch`).

### 7.2 הפעלה ידנית / תדירות גבוהה יותר
- **דשבורד "הפעל מחזור עכשיו"** → `POST /api/agent-generate { action:"auto-publish-run", force:true }` — עוקף את כל השערים (רק dedup לפי `newsId`).
- **2× ביום / שעות מותאמות** — Hobby לא מאפשר cron תת-יומי. יש לכוון scheduler חיצוני
  (Make.com / n8n / cron-job.org) שיקרא `POST /api/agent-generate { action:"auto-publish-run" }` עם
  `x-admin-secret` בשעות הרצויות (רק שעות שסומנו ב-`slotsUTC` יפרסמו). לחלופין — שדרוג ל-Vercel Pro.

### 7.3 רנדור תמונות/סטורי
- **צד לקוח בלבד** (דשבורד): `<canvas>` 1080×1080 / 1080×1350 (פוסט) ו-1080×1920 (סטורי, 4 שקופיות).
- כל שקופית: רקע מותג (תמונת חדשות בשער / מוכהה כטקסטורה בשאר) + גרדיאנט, פס התקדמות 4 מקטעים,
  תווית נושא, לוגו MR. DANIEL מימין-למטה. טקסט הדומיין `mrdaniel.co.il` מופיע **רק בשקופית 4** (CTA).
- ה-cron שומר רק **טקסט** של השקופיות; הרנדור מתבצע ב-Story Studio כשאדמין פותח.

---

## 8. פריסה

```bash
# חד-פעמי: התחברות
vercel login

# פריסת שני הפרויקטים ברצף
npm run deploy:all        # = npm run deploy (אתר) && npm run deploy:dashboard

# בנפרד
npm run deploy            # אתר: vercel --prod
npm run deploy:dashboard  # דשבורד: cd dashboard && vercel --prod
```

- שני פרויקטים נפרדים ב-Vercel: `my-website` ו-`dashboard` (כל אחד עם `.vercel/` משלו, gitignored).
- הדשבורד לא מובנה על ידי ה-`build` של השורש; יש לו `vite build` משלו.
- **בדיקות לפני פריסה**: `npx tsc --noEmit` + `npx vite build` — לכל אחד מהפרויקטים בנפרד.

---

## 9. משתני סביבה (סיכום)

### פרויקט `my-website` (Vercel)
| משתנה | לשם מה |
|---|---|
| `VITE_FIREBASE_*` (7) | קונפיג Firebase — נגיש גם ב-`process.env` בפונקציות השרת (הקידומת `VITE_` לא חוסמת שרת) |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SMTP_FROM` | מנוע המייל |
| `LEAD_EMAIL_TO` | יעד התראת ליד |
| `ADMIN_API_SECRET` | אימות פעולות אדמין (`x-admin-secret`) |
| `CRON_SECRET` | נעילת ה-cron ל-Vercel בלבד |
| `GEMINI_API_KEY` | הסוכן החברתי + הצ'אט |
| `PEXELS_API_KEY` | חיפוש תמונות רקע (אופציונלי — יש fallback) |

### פרויקט `dashboard` (Vercel)
| משתנה | לשם מה |
|---|---|
| `VITE_FIREBASE_*` (7) | חיבור RTDB + Auth (זהה לאתר) |
| `VITE_ADMIN_API_SECRET` | נשלח כ-`x-admin-secret` לפעולות אדמין; חייב להיות זהה ל-`ADMIN_API_SECRET` של האתר |
| `VITE_SITE_ORIGIN` | לעקיפת `https://mrdaniel.co.il` (אופציונלי) |
| `VITE_PEXELS_SEARCH_BASE` / `VITE_AGENT_API_BASE` | עקיפות בסיס API (אופציונלי) |

---

## 10. פתיחת סביבת העבודה מחדש

```powershell
cd "C:\Projects\My Website"
claude --continue     # המשך השיחה האחרונה
# claude              # שיחה חדשה בפרויקט
# claude --resume     # בחירה מרשימת שיחות
```
