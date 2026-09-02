# מדריך ארכיטקטורה — IG Growth Intelligence Agent + Playbook לאלגוריתם אינסטגרם (אסטרטגיית 2026)

מסמך זה מתעד את הארכיטקטורה המדויקת של **"סוכן צמיחה ומעורבות לאינסטגרם"** (IG Growth Intelligence Agent) בלוח הבקרה של `mrdaniel.co.il`, ואת אסטרטגיית התוכן העדכנית מול האלגוריתם של Instagram.

- **רכיב UI:** `dashboard/src/components/IgGrowthAgent.tsx` (טאב `ig-growth` — "סוכן צמיחה באינסטגרם")
- **שכבת API בצד לקוח:** `dashboard/src/lib/igGrowthApi.ts`
- **טיפוסים משותפים:** `dashboard/src/lib/igGrowthTypes.ts`
- **מנוע צד־שרת:** `src/agent/SocialAgentEngine.ts` (הפונקציות `analyzeTrendRadar`, `generateEngagementReplies`)
- **נקודת קצה:** `api/agent-generate.ts` (actions: `trend-radar`, `engagement-replies`)
- **מודל:** `gemini-3.6-flash` (Gemini Flash tier) עם `responseMimeType: 'application/json'`

---

## 1. סקירה ארכיטקטונית וזרימת מידע

### 1.1 עקרון־על

הסוכן בנוי משני כלים עצמאיים בתוך טאב אחד, ששניהם עוברים דרך אותו pipeline:

```
UI (IgGrowthAgent.tsx)
   │  קריאה מקומית
   ▼
lib/igGrowthApi.ts  ──POST──►  /api/agent-generate  ──►  SocialAgentEngine.ts  ──►  Gemini Flash
   │                             (auth + validation + sanitize)      (persona synthesis)
   │  ◄───────────── Structured JSON ────────────────────────────────────────────────┘
   ▼
coerce* (הקשחת מבנה)  →  אם נכשל  →  build*Local() (גיבוי דטרמיניסטי)  →  setState + sessionStorage
```

**כלל ברזל:** הפונקציות `fetchTrendRadar()` ו־`generateEngagementReplies()` ב־`igGrowthApi.ts` **לעולם לא זורקות חריגה**. כל כשל (רשת, `401/429/500/503`, JSON פגום, פלט חסר) מתורגם לגיבוי מקומי דטרמיניסטי עם `synthesized: false` ושדה `fallbackReason` שמוצג בבאנר כתום ב־UI.

### 1.2 זרימת "ראדאר טרנדים ויראלי" (Viral Topic Radar)

`RSS Aggregation → Payload Optimization → Gemini Flash → Structured JSON`

| שלב | קובץ / פונקציה | פעולה |
|---|---|---|
| **1. RSS Aggregation** | `fetchNewsList(category, 40)` (`lib/newsFeedClient.ts`) → `GET ${SITE_ORIGIN}/api/news` | מושך עד 40 כותרות עדכניות מהפיד המקצועי המצרפי (`~16` מקורות RSS סייבר / AI / ענן / טכנולוגיה). ה־feed כבר ממוין newest-first ומסונן לפי `topic`. |
| **2. Normalization** | `newsItemsToTrendSources(items, 24)` | ממפה `NewsItem` → `TrendSource { title, source, topic, summary }`. ה־`summary` נחתך ל־320 תווים ונשמר **רק** עבור הגיבוי המקומי — לא נשלח ל־Gemini. |
| **3. Payload Optimization** | `fetchTrendRadar()` — קבוע `TREND_RADAR_SEND_LIMIT = 14` | חותך ל־14 פריטים ומכווץ כל אחד ל־`{ title (≤180), source (≤60), category }` בלבד. **בלי `summary`, בלי URL.** (payload גדול של 36 פריטים גרם ל־HTTP 500 חולף מ־Flash.) |
| **4. POST** | `post('trend-radar', { items: slim })` | timeout קשיח של 75s (`AbortController`), retry אחד: על `429` לפי `retryAfterSeconds` (3–12s), על `≥500` אחרי `800ms`. |
| **5. Server validation** | `api/agent-generate.ts · action === 'trend-radar'` | דורש `items` array עם `≥ 3` פריטים; `isEngineConfigured()` → אחרת `503`. חותך שוב ל־15 וממפה ל־`{ title, source, category }`. |
| **6. Gemini synthesis** | `analyzeTrendRadar()` (`SocialAgentEngine.ts`), קבוע `TREND_RADAR_MAX_ITEMS = 14` | בונה `digest` בפורמט `N. [category · source] title`, שולח עם `TREND_RADAR_SYSTEM_INSTRUCTION` (טון מותג מ־`BRAND_KNOWLEDGE_BASE` + `HEBREW_COPY_RULES`), `temperature: 0.6`, `topP: 0.95`, `responseMimeType: 'application/json'`. עטוף ב־`generateContentWithRetry()` — retry אחד אחרי `800ms` על שגיאת `5xx` / `INTERNAL` / `UNAVAILABLE` / `overloaded` / `deadline` (לא על `429`). |
| **7. Structured JSON Output** | `stripCodeFence` → `JSON.parse` → `sanitizeDeep` (רקורסיבי: `stripMetaFraming` + `stripSourceCredits` + `sanitizeHebrewText` על כל string) | דורש `trends.length ≥ 2` ו־`blueprints.length ≥ 1`, אחרת זורק (נתפס ב־outer catch של ה־API). |
| **8. Client coercion** | `coerceRadar(raw, sentCount)` | חותך אורכי שדות, מנרמל `momentum` (`rising`/`hot`/`steady`), מנרמל `format` (`reel`/`story`/`carousel`, ברירת מחדל `carousel`). דורש `trends ≥ 2` ו־`blueprints ≥ 1`, אחרת → גיבוי מקומי. |
| **9. Persist** | `sessionStorage['ig:radar_v1']` | ראו §1.5. |

**מבנה ה־JSON שמוחזר** (`TrendRadar`):

```jsonc
{
  "trends": [
    { "title": "…", "momentum": "rising|hot|steady", "why": "…", "audiencePainPoint": "…" }
  ],
  "viralHeadlines": [ { "headline": "…", "angle": "…" } ],
  "blueprints": [
    { "format": "reel|story|carousel", "hook": "…", "outline": ["…"], "cta": "…" }
  ],
  "synthesized": true,
  "sourceCount": 14,
  "createdAt": 1730000000000
}
```

### 1.3 זרימת "מחולל תגובות חכם" (Smart Response Assistant)

`Jina Reader / Direct Text → Gemini Persona Synthesis → 3-Option Reply Engine`

| שלב | קובץ / פונקציה | פעולה |
|---|---|---|
| **1a. Direct Text** | `<textarea>` ב־`IgGrowthAgent.tsx` (state `postText`) | המשתמש מדביק את גוף הפוסט של מוביל הדעה. |
| **1b. Jina Reader (אופציונלי)** | כפתור "ייבא מקישור" → `importUrl(url)` (`lib/repurposeApi.ts`) → `POST /api/agent-generate · action:"import-url"` → `importUrlContent()` (`src/server/contentImport.ts`) | fetch ישיר עם User-Agent דפדפני; אם נחסם — נפילה ל־`r.jina.ai` (Jina Reader). `cleanExtractedBody()` מסיר UI chrome, bylines, כותרת כפולה. הכותרת + הגוף ממוזגים ל־`postText`. |
| **2. Validation** | `generateEngagementReplies()` | דורש `postText.trim().length ≥ 20`, אחרת גיבוי מקומי מיידי. חותך ל־4000 תווים. |
| **3. POST** | `post('engagement-replies', { postText, sourceUrl, lang })` | אותו helper עם timeout + retry כמו הראדאר. |
| **4. Server validation** | `api/agent-generate.ts · action === 'engagement-replies'` | דורש `postText` string באורך `≥ 20`; `isEngineConfigured()` → אחרת `503`. |
| **5. Persona Synthesis** | `generateEngagementReplies()` (`SocialAgentEngine.ts`) | `sanitizeInput()` על הקלט; `ENGAGEMENT_REPLIES_SYSTEM_INSTRUCTION` מגדיר את הפרסונה: "דניאל בן ברוך — מומחה מערכות IT, סייבר ו-AI". `temperature: 0.75`, `topP: 0.95`, JSON mode, עטוף ב־`generateContentWithRetry()`. |
| **6. 3-Option Reply Engine** | פלט: `[{ style: "expert", text }, { style: "question", text }, { style: "concise", text }]` | כל טקסט עובר `stripMetaFraming` + `stripSourceCredits` + `sanitizeHebrewText`, נחתך ל־600 תווים. דורש `≥ 3` תגובות תקינות. |
| **7. Client coercion** | `coerceReplies(raw)` | ממפה `style` לא־ידוע לפי סדר קנוני `['expert','question','concise']`, שומר אחת מכל סוג, דורש בדיוק 3. |
| **8. Persist** | `sessionStorage['ig:replies_v1']` | ראו §1.5. |

### 1.4 גיבויים דטרמיניסטיים (Offline Fallbacks)

| כלי | פונקציית גיבוי | לוגיקה |
|---|---|---|
| Trend Radar | `buildTrendRadarLocal(sources, reason)` | מקבץ (`cluster`) את הפיד לפי `topic`, מדרג לפי נפח, מחשב `momentum` לפי נתח יחסי (`≥0.4` → `hot`, `≥0.2` → `rising`). מחלץ מילות מפתח (`keywords()` — bag-of-words עם `STOP` list עברית+אנגלית). כותרות ו־3 blueprints (reel/story/carousel) לפי תבניות קבועות עם הזרקת `topicHint`. |
| Smart Response | `buildRepliesLocal(postText, reason, sourceUrl)` | מזהה `topic` לפי regex על הטקסט (`cyber`/`ai`/`cloud`/`general`), בוחר `angle` תואם, מחזיר 3 תגובות תבניתיות בטון המותג. |

הגיבוי מופעל אוטומטית ושקוף — ה־UI מציג באנר כתום עם `fallbackReason` אבל הכלי נשאר שמיש במלואו. גם ניתוק רשת מוחלט מ־`/api/agent-generate` משאיר את הטאב פעיל.

### 1.5 שמירת מצב (Data Persistence)

| מפתח `sessionStorage` | תוכן | נכתב ע"י | נקרא ע"י |
|---|---|---|---|
| `ig:radar_v1` | אובייקט `TrendRadar` המלא (trends + headlines + blueprints + `synthesized` + `fallbackReason`) | `useEffect([radar])` | `useState(() => loadJson<TrendRadar>(RADAR_KEY))` בעת mount |
| `ig:replies_v1` | אובייקט `EngagementReplySet` המלא | `useEffect([replySet])` | `useState(() => loadJson<EngagementReplySet>(REPLIES_KEY))` בעת mount |
| `ig:reply_input_v1` | מחרוזת ה־`postText` (טיוטת הקלט) | `useEffect([postText])` | `useState(() => loadJson<string>(...) ?? '')` בעת mount |

- `loadJson` / `saveJson` עטופים ב־`try/catch` — מצב פרטי / חסימת אחסון לא מפילים את הרכיב.
- אין `localStorage` ואין persistence חוצה־מכשירים: המידע חי רק בטאב הדפדפן הפעיל של המשתמש.
- החלפת טאב בלוח הבקרה או remount משחזרים את המצב האחרון מיד — אין צורך להריץ מחדש את הניתוח.

### 1.6 אבטחה, אימות ו־Headers

| היבט | מימוש |
|---|---|
| **Client → API auth** | `igGrowthApi.ts` מוסיף header `x-admin-secret: <VITE_ADMIN_API_SECRET>` לכל בקשה (build-time env var בבאנדל של ה־dashboard). |
| **Server-side gate** | `isAdminAuthorized(req)` ב־`api/agent-generate.ts` משווה `req.headers['x-admin-secret'] === process.env.ADMIN_API_SECRET`. אם `ADMIN_API_SECRET` **לא** מוגדר — fail-open (רק בסטייט הלא־מוגדר, לגבי checkout טרי); ברגע שהוגדר, כל בקשה חייבת להציג אותו, אחרת `401`. |
| **Engine gate** | כל action בודק `isEngineConfigured()` (כלומר `GEMINI_API_KEY` קיים) — אחרת `503` והלקוח נופל לגיבוי מקומי. |
| **Prompt-injection defense** | קלט: `sanitizeInput()` (`AgentSecurityGuard.ts`) לפני שליחה ל־Gemini. פלט: `sanitizeOutput()` ברמת ה־API — אם `!passed` מוחזר `{ ok: true, blocked: true }` והלקוח נופל לגיבוי. בנוסף `stripMetaFraming` / `stripSourceCredits` / `sanitizeHebrewText` מנקים תוויות מסגור והפניות מקור. |
| **Rate limit** | `detectGeminiRateLimit(err)` ב־outer catch → `429` עם `retryAfterSeconds`. הלקוח מכבד את זה ב־retry היחיד. |
| **CORS** | `setCors()` — `Access-Control-Allow-Headers: Content-Type, x-admin-secret`. |
| **סודות** | `ADMIN_API_SECRET` ו־`GEMINI_API_KEY` הם env vars ב־Vercel בלבד — לא מודפסים, לא ב־repo. `VITE_ADMIN_API_SECRET` נכנס לבאנדל הלקוח (זו הגבלה מובנית — הדשבורד מאחורי `LoginGate` של Firebase Auth). |

---

## 2. יכולות מפורטות ו־Specs של קלט/פלט

### 2.1 שימוש ב־Trend Radar

**מיקום:** הפאנל העליון בטאב, כותרת "ראדאר טרנדים ויראלי".

1. **בחירת קטגוריית מקור** — צ'יפים `הכל / סייבר / בינה מלאכותית / טכנולוגיה` (`NewsCategory`, מיפוי `CATEGORY_TOPICS` ב־`newsAgentTypes.ts`). הבחירה קובעת אילו `topic` נמשכים מ־`/api/news`.
2. **"נתח טרנדים מהפיד"** / **"רענון ניתוח"** — מריץ את הזרימה מ־§1.2. spinner בזמן ריצה; אם כבר קיים ניתוח שמור — הכפתור הופך ל"רענון ניתוח" והתוצאה הישנה נשארת גלויה עד שהחדשה מוכנה.
3. **תצוגת "טרנדים וכאבי קהל"** — גריד של עד 5 כרטיסים, כל אחד עם:
   - `title` — שם הטרנד.
   - **תג momentum** — `חם עכשיו` (🔥 ענבר) / `במגמת עלייה` (↗ תכלת) / `יציב` (– אפור) לפי `MOMENTUM_META`.
   - `why` — משפט אחד: למה זה זז עכשיו.
   - `audiencePainPoint` — הכאב הקונקרטי של הקהל (מנהלי IT, בעלי עסקים, אנשי אבטחה).
4. **תצוגת "כותרות בסגנון hook"** — עד 6 שורות `headline` + `angle`, לכל אחת כפתור **"העתק"** נקודתי.
5. **תצוגת "תבנית תוכן מוכנה"** — טאבים `ריל / סטורי / קרוסלה` (`BLUEPRINT_META`). כל blueprint מציג:
   - `hook` — משפט פתיחה חד.
   - `outline` — רשימה ממוספרת של 3–6 שלבים (סצנות לריל / פריימים לסטורי / שקופיות לקרוסלה).
   - `cta` — קריאה לפעולה לא מכירתית.
   - כפתור **"העתק תבנית"** — מעתיק את כל ה־blueprint כטקסט מפורמט (`פורמט: … / Hook: … / 1. … / CTA: …`).

**קלט:** `TrendSource[]` (title, source, topic, summary) — נגזר אוטומטית מהפיד.
**פלט:** `TrendRadar` (ראו §1.2). `sourceCount` = מספר הפריטים שנשלחו בפועל ל־Gemini (עד 14) בנתיב ה־AI, או מלוא הפיד בנתיב הגיבוי.

### 2.2 שימוש ב־Smart Response (מחולל תגובות)

**מיקום:** הפאנל התחתון, כותרת "מחולל תגובות חכם ומקדם מעורבות".

1. **שדה קישור (אופציונלי)** — הדבקת URL לפוסט. כפתור **"ייבא מקישור"** מפעיל את Jina Reader (§1.3, שלב 1b) וממלא את ה־textarea. ה־URL נשמר גם עבור פעולת "העתק ופתח".
2. **textarea** — הדבקת גוף הפוסט של מוביל הדעה (מינימום 20 תווים).
3. **"נסח 3 תגובות"** — מריץ את הזרימה מ־§1.3. מונה תווים מוצג ליד הכפתור.
4. **3 כרטיסי תגובה** (גריד `md:grid-cols-3`), לפי `REPLY_META`:

| `style` | תווית (`label`) | רמז (`hint`) | אופי |
|---|---|---|---|
| `expert` | **תוספת ערך מקצועית** | תובנה טכנית עמוקה שמוסיפה לדיון | 2–4 משפטים. תובנה או ניסיון מהשטח שמעמיק — לא מתנשא, לא "בעצם אתה טועה". |
| `question` | **שאלה מעוררת דיון** | שאלה שמזמינה תגובות והמשך שיחה | 1–2 משפטים. שאלה חדה שמזמינה את המחבר והקוראים להמשיך את השרשור. |
| `concise` | **חד וזכיר** | משפט קצר, חד ובלתי נשכח — נראות גבוהה | משפט אחד ממוקד ובלתי נשכח. |

   כל כרטיס: כפתור **"העתק"** + כפתור **"העתק ופתח"** (ברנד אינסטגרם — גרדיאנט).
5. **כללי הפרסונה** (מתוך `ENGAGEMENT_REPLIES_SYSTEM_INSTRUCTION`): הסתמכות על תוכן הפוסט בלבד, בלי המצאות; טון של ביטחון טכני מבוסס ניסיון; **בלי קישורים, בלי "עקבו אחריי", בלי תיוג חשבונות**; פוסט באנגלית → תגובה עדיין בעברית (אלא אם `lang="en"`).

**קלט:** `{ postText: string, sourceUrl?: string, lang?: 'he'|'en' }`.
**פלט:** `EngagementReplySet { replies: EngagementReply[3], synthesized, fallbackReason?, sourceUrl?, createdAt }`.

### 2.3 אינטגרציית Quick Publish — `@mrdaniel.ai`

- **קבוע יחיד:** `INSTAGRAM_PROFILE_URL = 'https://www.instagram.com/mrdaniel.ai/'` ב־`dashboard/src/lib/socialPublish.ts`. כל קישור אינסטגרם בדשבורד מפנה אליו.
- **`copyAndOpen(url, text)`** (`socialPublish.ts`): `await navigator.clipboard.writeText(text)` (best-effort, לא זורק) ואז `window.open(url, '_blank', 'noopener,noreferrer')`. הטאב נפתח גם אם ההעתקה נחסמה.
- **ב־Smart Response:** כפתור "העתק ופתח" בכל כרטיס תגובה קורא `copyAndOpen(igOpenUrl, r.text)`, כאשר:
  ```ts
  const igOpenUrl = replySet?.sourceUrl && /^https?:\/\//i.test(replySet.sourceUrl)
    ? replySet.sourceUrl          // הפוסט המקורי שאליו מגיבים
    : INSTAGRAM_PROFILE_URL;      // אחרת — הפרופיל @mrdaniel.ai
  ```
  כלומר: אם הודבק קישור לפוסט — נפתח הפוסט עצמו (מוכן להדבקת התגובה); אחרת נפתח הפרופיל.
- **`QuickPublishBar` (רכיב נפרד, מוצג ליד כל תוצר בדשבורד):** `SOCIAL_TARGETS` → אינסטגרם = `INSTAGRAM_PROFILE_URL`, לינקדאין = `linkedin.com/feed/?shareActive=true`, טיקטוק = `tiktok.com/tiktokstudio/upload`. לחיצה מעתיקה את הכיתוב (`deckToCaption(payload)` — cover → פסקאות תוכן → CTA + `mrdaniel.co.il`) ופותחת את היעד.
- **הערת מובייל:** פתיחת הפרופיל `@mrdaniel.ai` אמינה יותר מ־`instagram.com/create/style/` (שהוא desktop-only ולעתים מפנה מחדש).

---

## 3. חוקי האלגוריתם של Instagram ו־Best Practices (אסטרטגיית 2026)

> החלק הזה הוא ה"אמת התוכנית" שעל בסיסה מנוסחים ה־system prompts של הסוכן. עדכנו את הקבצים `TREND_RADAR_SYSTEM_INSTRUCTION` ו־`ENGAGEMENT_REPLIES_SYSTEM_INSTRUCTION` ב־`SocialAgentEngine.ts` אם המדיניות משתנה.

### 3.1 דינמיקת מעורבות מודרנית — Saves ו־Shares ו־DMs מעל Likes

האלגוריתם ב־2026 מדרג הפצה לפי **עוצמת אות** (signal strength), לא כמות. סדר העדיפויות בפועל לנישת B2B טכני:

1. **Sends / Shares to DM** — האות החזק ביותר. תוכן ש"שולחים לחבר" מסמן ערך גבוה. → כל blueprint צריך "טריגר שיתוף": צ'קליסט שאפשר לשלוח לקולגה, השוואה, אזהרה רלוונטית.
2. **Saves** — האות השני. תוכן reference/how-to. → קרוסלות "מדריך מהיר", "5 בדיקות לפני החלטה", "הגדרות שכדאי לוודא". CTA מפורש: **"שמרו את זה לפני הפגישה הבאה"**.
3. **DM replies מ־triggers** — סטיקר שאלה בסטורי, "כתבו לי X בתגובות ואשלח", "רוצים את הצ'קליסט המלא? הודעה". DM פותח שיחה = אות כוונה + מקדם lead.
4. **Comments (איכותיים, לא אימוג'ים)** — שרשור שיחה אמיתי. תגובות באורך משפט+ שוקלות יותר.
5. **Watch time / Retention** — לריל, אחוז הצפייה המלאה וה־replays.
6. **Likes** — אות חלש, כמעט רק tie-breaker.

**מסקנה תפעולית:** ה־`cta` בכל blueprint שהסוכן מפיק חייב לדחוף לפחות אחד מ־{Save, Send, DM} — לא "עשו לייק".

### 3.2 SEO ומילות מפתח

Instagram Search הפך למנוע חיפוש. הדירוג מסתמך על טקסט, לא רק hashtags:

- **כיתוב עשיר במילות מפתח** — 3–5 מונחי הנישה בתוך משפטים טבעיים ב־125 התווים הראשונים: `אבטחת סייבר לעסקים`, `סוכני AI לארגון`, `Zero-Trust`, `הטמעת AI`, `תשתיות רשת`, `Wi-Fi 7`.
- **טקסט על המסך (on-screen text) בריל** — Instagram מבצע OCR. הכותרת הראשונה בריל צריכה להכיל את המונח (`"ככה סוכן AI נפרץ דרך Prompt Injection"`), לא רק דקורציה.
- **Alt text** — למלא ידנית לכל פוסט תמונה/קרוסלה עם תיאור שכולל מונח.
- **שם התצוגה והביו** — `@mrdaniel.ai` · שם תצוגה עם מילת מפתח ("דניאל — סייבר · סוכני AI · IT"). Instagram מדרג את שדה השם בחיפוש.
- **Hashtags** — 3–5 ספציפיים (`#אבטחת_סייבר #סוכני_AI #zerotrust`), לא 30 גנריים. חבילת hashtags ענקית וחוזרת נקראת כספאם.
- **Topics / קטגוריית תוכן** — לשייך את החשבון ל־Technology בהגדרות.

### 3.3 מדע ה־Hook — 2 השניות הראשונות

**ריל:**
- **0–2 שניות** = הכל. אם אין עצירת גלילה עד השנייה השנייה, ההפצה מתה. פותחים על התנועה/הפאנץ', לא על אינטרו.
- דפוסי hook עובדים: שאלה חדה · סתירה לאינטואיציה ("רוב האנשים חושבים X, בפועל Y") · סיכון קונקרטי ("הטעות שעולה לארגון...") · תוצאה לפני התהליך.
- **אסור** לפתוח ב"בעולם של היום" / "בעידן הדיגיטלי" — קלישאות (חסומות אוטומטית ב־`HEBREW_COPY_RULES`).
- טקסט על המסך מיד, קצר, קריא. loop נקי (השנייה האחרונה מתחברת לראשונה) מגדיל replays.
- אורך אופטימלי לנישה: 15–35 שניות עם צפיפות מידע גבוהה.

**קרוסלה — שקופית שער ממירה:**
- השער עושה 90% מה־CTR. כותרת אחת גדולה + ניגודיות גבוהה + הבטחת ערך מפורשת ("5 בדיקות", "המדריך לפני החלטה").
- שקופית 2 חייבת לתת ערך מיד (לא "הקדמה") כדי לייצר swipe — Instagram מודד את שיעור המעבר לשקופית 2.
- 5–7 שקופיות. שקופית אחרונה = CTA יחיד וברור (Save / Follow / DM) + `mrdaniel.co.il`.
- יחס 4:5 (1080×1350) — תופס הכי הרבה מסך בפיד.

> ה־blueprints שהסוכן מפיק כבר בנויים לפי הכללים האלה: `hook` ראשון, `outline` שממפה סצנות/שקופיות, `cta` שדוחף Save/Follow/DM.

### 3.4 אסטרטגיית מעורבות בטוחה (Anti-Shadowban)

מחולל התגובות נועד ל**סיוע בניסוח**, לא לאוטומציה. כללי שימוש בטוח:

- **קצב אנושי** — עד ~15–25 תגובות ביום, מפוזרות על פני שעות, לא רצף מהיר. הדבקה מיידית של 30 תגובות זהות = דפוס בוט.
- **גיוון** — להשתמש בשלוש האופציות (expert / question / concise) לסירוגין, ולערוך ידנית כל תגובה כך שתתאים לפוסט הספציפי. תגובה זהה מילה־במילה על עשרות פוסטים מסומנת.
- **רלוונטיות** — להגיב רק בנישה (סייבר / AI / ענן / IT). תגובות off-topic על חשבונות גדולים כדי "להיתפס" = spam signal.
- **בלי קישורים בתגובות** — הפרסונה בקוד כבר אוסרת זאת. קישור בתגובה על פוסט של אחר מוריד reach ויכול להוביל ל־shadowban.
- **בלי תיוג המוני** ובלי "עקבו אחריי / ראו את הפרופיל שלי" — ה־system prompt חוסם. הערך של התגובה הוא מה שמושך את הקליק לפרופיל.
- **DM** — לא לשלוח הודעות יזומות המוניות. להגיב ל־DM שמגיע מ־trigger, כן.
- **סימני shadowban לבדוק** — צניחה פתאומית ב־reach, הפוסטים לא מופיעים ב־hashtags למי שלא עוקב, ירידה חדה ב־non-followers. במקרה כזה: להפסיק כל פעילות "אגרסיבית" ל־48–72 שעות, למחוק תגובות/פוסטים חשודים, לפרסם תוכן אורגני איכותי.
- **בניית סמכות אותנטית** — עקביות (3–5 פוסטים בשבוע), נוכחות בתגובות תוך השעה הראשונה אחרי פרסום, מענה לכל תגובה על הפוסטים שלך, שיתופי סטורי של תוכן רלוונטי. סמכות בנישה נבנית מ־consistency + ערך אמיתי, לא מ־hacks.

---

## 4. Audit & Deploy

- מיקום הקובץ: `docs/IG_GROWTH_AGENT_GUIDE.md`. Markdown בלבד — לא מיובא לשום build graph, אין השפעה על `tsc` / `vite build` / הפלט הפרוס.
- שפה: עברית + מונחים טכניים באנגלית, נתיבים וקטעי קוד כפי שהם ב־repo.
- אימות: `npx tsc --noEmit` (root + `dashboard/`) — נקי. `npx vite build` (root + `dashboard/`) — נקי.
- פריסה: `npm run deploy:all` → `mrdaniel.co.il` + `dashboard-snowy-psi-94.vercel.app`.

### קבצים רלוונטיים (מפת התמצאות)

| תחום | קובץ |
|---|---|
| UI | `dashboard/src/components/IgGrowthAgent.tsx` |
| API client + fallbacks | `dashboard/src/lib/igGrowthApi.ts` |
| טיפוסים + מטא (`REPLY_META`, `MOMENTUM_META`, `BLUEPRINT_META`) | `dashboard/src/lib/igGrowthTypes.ts` |
| מנוע Gemini + system prompts | `src/agent/SocialAgentEngine.ts` (`analyzeTrendRadar`, `generateEngagementReplies`, `generateContentWithRetry`) |
| נתיב API + auth + validation | `api/agent-generate.ts` (`action: 'trend-radar' | 'engagement-replies'`) |
| Quick Publish + `INSTAGRAM_PROFILE_URL` | `dashboard/src/lib/socialPublish.ts` |
| פיד RSS מצרפי | `dashboard/src/lib/newsFeedClient.ts` → `/api/news` (`src/server/newsFeed.ts`) |
| Jina Reader import | `dashboard/src/lib/repurposeApi.ts` → `src/server/contentImport.ts` |
| ניקוי קלט/פלט | `src/agent/AgentSecurityGuard.ts`, `src/agent/hebrewTextSanitizer.ts` |
