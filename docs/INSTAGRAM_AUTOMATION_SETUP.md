# Instagram Automation Setup — Webhook + Meta Graph

## 1. Architecture
- Dashboard UI: `dashboard/src/components/NewsContentAgent.tsx`
  - New button: **פרסם / שלח לפרסום**
  - Calls `POST /api/agent-generate` with `action: 'publish-social'`
- Backend action: `api/agent-generate.ts`
  - Validates admin secret if configured
  - Delegates to `src/services/socialPublisherService.ts`
- Service: `src/services/socialPublisherService.ts`
  - Primary path: Make.com / n8n webhook
  - Optional path: Instagram Graph API container + publish

## 2. Environment Variables
Add to your Vercel project env and local `.env`:

| Variable | Purpose |
|---|---|
| `SOCIAL_PUBLISH_WEBHOOK_ENABLED` | Set to `true` to enable webhook dispatch |
| `SOCIAL_PUBLISH_WEBHOOK_URL` | Make.com / n8n webhook endpoint |
| `INSTAGRAM_PUBLISH_ENABLED` | Set to `true` to enable Instagram Graph path |
| `INSTAGRAM_GRAPH_ACCESS_TOKEN` | Long-lived Meta Page/Account token |
| `INSTAGRAM_GRAPH_USER_ID` | Instagram Business Account ID |
| `ADMIN_API_SECRET` | Required for POST actions from dashboard |

## 3. Make.com Webhook Setup
1. Create a new Make.com scenario.
2. Add a **Webhook** trigger: **Custom webhook**.
3. Copy the webhook URL into `SOCIAL_PUBLISH_WEBHOOK_URL`.
4. In the scenario, add an action for your target:
   - Instagram: use Instagram Business / Creator account actions.
   - LinkedIn: use LinkedIn organization/page actions.
   - TikTok: use TikTok content actions if available.
5. Map fields:
   - `caption` → post text/caption
   - `hashtags` → tags array
   - `mediaUrls[0]` → media/image attachment
   - `sourceTitle`, `sourceLink`, `category` → metadata/logging
6. Save and set the scenario to **ON**.

## 4. Meta Developer App + Instagram Graph Setup
1. In Meta Developers:
   - Create or open an app
   - Add product: **Instagram Graph API**
   - Connect an Instagram Business/Creator account linked to a Facebook Page
2. Permissions needed:
   - `instagram_basic`
   - `instagram_content_publish`
   - `pages_show_list`
3. Generate a long-lived Page access token.
4. Store in `INSTAGRAM_GRAPH_ACCESS_TOKEN`.
5. Store the Instagram Business Account ID in `INSTAGRAM_GRAPH_USER_ID`.
6. Set `INSTAGRAM_PUBLISH_ENABLED=true`.

### Instagram Posting Rules
- This implementation posts **single-image** posts only.
- Carousel/reels require additional Graph calls and are not in scope.
- Media URL must be publicly reachable by Meta’s servers.

## 5. Cronjob / Automated Trigger
- Existing cron: `vercel.json` daily cron calls `api/agent-generate.ts` GET.
- For Hermes-triggered social posting on viral content:
  - Use a scheduled external job that calls:
    ```
    POST https://mrdaniel.co.il/api/agent-generate
    {
      "action": "publish-social",
      "platform": "instagram",
      "caption": "<HEBREW CAPTION>",
      "hashtags": ["#tag1", "#tag2"],
      "mediaUrls": ["https://...png"],
      "sourceTitle": "...",
      "sourceLink": "https://...",
      "category": "סייבר"
    }
    ```
  - Header: `x-admin-secret: <ADMIN_API_SECRET>`
  - Recurrence: respect Meta rate limits; recommend max every 4–6 hours.

## 6. Rollback
- Revert code changes:
  ```
  git checkout -- src/services/socialPublisherService.ts api/agent-generate.ts dashboard/src/components/NewsContentAgent.tsx docs/INSTAGRAM_AUTOMATION_SETUP.md
  ```
- Disable by env:
  - Set `SOCIAL_PUBLISH_WEBHOOK_ENABLED=false`
  - Set `INSTAGRAM_PUBLISH_ENABLED=false`

## 7. Safety Notes
- No hardcoded secrets.
- All publish paths are opt-in via env flags.
- Failed webhook/Graph calls return `502` with a non-OK result payload; dashboard shows status/provider.
- Keep `ADMIN_API_SECRET` set in production; dashboard uses it for POST actions.
