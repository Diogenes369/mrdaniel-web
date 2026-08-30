import { useCallback, useEffect, useState } from 'react';
import { onValue, ref, update, query as dbQuery, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import { SITE_ORIGIN } from './useDashboardRefresh';
import {
  DEFAULT_AP_CONFIG,
  DEFAULT_SLOTS,
  type AutoPublisherConfig,
  type APFrequency,
  type PublishedPostRecord,
} from './autoPublisherTypes';

const ADMIN_SECRET = import.meta.env.VITE_ADMIN_API_SECRET as string | undefined;

function authHeaders(): HeadersInit {
  return { 'Content-Type': 'application/json', ...(ADMIN_SECRET ? { 'x-admin-secret': ADMIN_SECRET } : {}) };
}

function normalizeConfig(raw: unknown): AutoPublisherConfig {
  const c = (raw ?? {}) as Partial<AutoPublisherConfig>;
  return {
    active: Boolean(c.active),
    frequency: (c.frequency as APFrequency) ?? DEFAULT_AP_CONFIG.frequency,
    slotsUTC: Array.isArray(c.slotsUTC) && c.slotsUTC.length ? c.slotsUTC.filter((n) => Number.isInteger(n) && n >= 0 && n <= 23) : DEFAULT_AP_CONFIG.slotsUTC,
    platform: (c.platform as AutoPublisherConfig['platform']) ?? DEFAULT_AP_CONFIG.platform,
    category: (c.category as AutoPublisherConfig['category']) ?? DEFAULT_AP_CONFIG.category,
    mode: (c.mode as AutoPublisherConfig['mode']) ?? DEFAULT_AP_CONFIG.mode,
    publishWebhookUrl: typeof c.publishWebhookUrl === 'string' ? c.publishWebhookUrl : '',
  };
}

export interface AutoPublisherRun extends PublishedPostRecord {
  id: string;
}

export function useAutoPublisher() {
  const [config, setConfig] = useState<AutoPublisherConfig>(DEFAULT_AP_CONFIG);
  const [runs, setRuns] = useState<AutoPublisherRun[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
      setLoaded(true);
      return;
    }
    const offCfg = onValue(ref(db, 'auto_publish_config'), (snap) => {
      setConfig(normalizeConfig(snap.val()));
      setLoaded(true);
    });
    const offRuns = onValue(dbQuery(ref(db, 'published_posts'), limitToLast(60)), (snap) => {
      const val = (snap.val() ?? {}) as Record<string, PublishedPostRecord>;
      const list = Object.entries(val)
        .map(([id, r]) => ({ id, ...r }))
        .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      setRuns(list);
    });
    return () => {
      offCfg();
      offRuns();
    };
  }, []);

  /** Patch config in RTDB. When `frequency` changes to daily/twice, its slot list is set too. */
  const saveConfig = useCallback((patch: Partial<AutoPublisherConfig>) => {
    if (!db) return;
    const next = { ...patch };
    if (patch.frequency && patch.frequency !== 'custom') {
      next.slotsUTC = DEFAULT_SLOTS[patch.frequency];
    }
    update(ref(db, 'auto_publish_config'), next).catch((err) => console.error('[auto-publish] config save failed:', err));
  }, []);

  /** Fire one cycle immediately, ignoring the active / slot / once-a-day gates (news-id dedup only). */
  const runNow = useCallback(async (): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await fetch(`${SITE_ORIGIN}/api/cron/auto-publish?manual=1&force=1`, { method: 'POST', headers: authHeaders() });
      const data = await res.json();
      if (data.skipped) return { ok: true, message: `דילוג: ${data.skipped}` };
      if (data.ok) return { ok: true, message: `רץ — ${data.newsTitle ?? ''} (${data.mode})` };
      return { ok: false, message: data.error ?? 'הריצה נכשלה' };
    } catch {
      return { ok: false, message: 'שגיאת תקשורת מול השרת' };
    }
  }, []);

  /** Approve a pending draft: forward it to the webhook now, then mark the run success/failed. */
  const approveAndPublish = useCallback(async (run: AutoPublisherRun): Promise<{ ok: boolean; message: string }> => {
    try {
      const res = await fetch(`${SITE_ORIGIN}/api/publish-post`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          platform: run.platform,
          caption: run.caption,
          hashtags: run.hashtags,
          imageUrl: run.imageUrl,
          newsTitle: run.newsTitle,
          newsLink: run.newsLink,
          category: run.category,
        }),
      });
      const data = await res.json();
      const ok = Boolean(data.ok);
      if (db) {
        await update(ref(db, `published_posts/${run.id}`), {
          status: ok ? 'success' : 'failed',
          detail: data.detail ?? data.error ?? (ok ? 'forwarded' : 'failed'),
          mode: 'approved',
        });
      }
      return { ok, message: ok ? 'נשלח לפרסום' : `נכשל: ${data.error ?? data.detail ?? ''}` };
    } catch {
      return { ok: false, message: 'שגיאת תקשורת מול השרת' };
    }
  }, []);

  return { config, runs, loaded, saveConfig, runNow, approveAndPublish };
}
