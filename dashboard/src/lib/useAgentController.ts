import { useEffect, useState, useCallback } from 'react';
import { onValue, ref, set, update, query as dbQuery, limitToLast } from 'firebase/database';
import { db } from '../firebase';
import type { AgentConfig, AgentMode, AgentWebhookConfig, ContentFormat, Platform, QueueItem, LeadIntent, VideoScript } from './agentTypes';
import { getAdminSecret } from './adminSecret';

// Unlike the main site (where the API and the page serving it are always same-origin), this
// dashboard runs on its own dev-server origin (localhost:5174) with no deployed origin of its own
// — see the earlier session note that the dashboard has never had its own Vercel project. It talks
// to the *production* site's API by default, since this tool is built to operate on live data.
// Override via VITE_AGENT_API_BASE if you're running the main site's `server.ts` locally too.
const API_BASE = import.meta.env.VITE_AGENT_API_BASE || 'https://mrdaniel.co.il/api/agent-generate';

export interface RateLimitedResponse {
  ok: false;
  status: 'rate_limited';
  message: string;
  retryAfterSeconds: number;
}

async function callAgentApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T | RateLimitedResponse> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
    },
    body: JSON.stringify({ action, ...payload }),
  });
  // A 429 carries a structured { status: 'rate_limited', ... } body the caller should read, not a
  // generic thrown error — see api/agent-generate.ts's detectGeminiRateLimit for where this comes
  // from. Every other non-OK status still throws, matching the existing "catch → show a generic
  // error" behavior at every call site.
  if (res.status === 429) return res.json();
  if (!res.ok) throw new Error(`agent api error: ${res.status}`);
  return res.json();
}

/** Firebase Realtime Database does not store empty arrays — `security.flags: []` (the common
 * "passed cleanly" case) round-trips as the key being absent entirely. Every array field the
 * QueueCard/MediaPreviewCard render tree touches gets defaulted here, once, so a refresh can never
 * hand a component `undefined` where it expects an array (that's what caused the dark-screen
 * render crash this normalizer exists to fix — see QueueCard's `item.security.flags.length`). */
function normalizeQueueItem(id: string, raw: unknown): QueueItem & { id: string } {
  const item = (raw ?? {}) as Record<string, unknown>;
  const security = (item.security as { passed?: boolean; badge?: string; flags?: unknown }) ?? {};
  const normalizedSecurity = {
    passed: security.passed ?? true,
    badge: security.badge ?? '',
    flags: Array.isArray(security.flags) ? security.flags : [],
  };

  if (item.kind === 'engagement') {
    return {
      id,
      kind: 'engagement',
      query: (item.query as string) ?? '',
      intent: (item.intent as LeadIntent) ?? 'low',
      intentScore: (item.intentScore as number) ?? 0,
      intentReasons: Array.isArray(item.intentReasons) ? (item.intentReasons as string[]) : [],
      draftMessage: (item.draftMessage as string) ?? '',
      status: (item.status as QueueItem['status']) ?? 'pending_approval',
      security: normalizedSecurity,
      createdAt: (item.createdAt as number) ?? 0,
    };
  }

  return {
    id,
    kind: 'content',
    platform: (item.platform as Platform) ?? 'linkedin',
    format: (item.format as ContentFormat) ?? 'post',
    topic: (item.topic as string) ?? '',
    body: (item.body as string) ?? '',
    carouselSlides: Array.isArray(item.carouselSlides) ? (item.carouselSlides as string[]) : undefined,
    videoScript: item.videoScript as VideoScript | undefined,
    mediaPreview: Array.isArray(item.mediaPreview) ? item.mediaPreview : [],
    imageGenerationPrompt: (item.imageGenerationPrompt as string) ?? '',
    status: (item.status as QueueItem['status']) ?? 'pending_approval',
    security: normalizedSecurity,
    createdAt: (item.createdAt as number) ?? 0,
  } as QueueItem & { id: string };
}

export function useAgentController() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [queue, setQueue] = useState<(QueueItem & { id: string })[]>([]);

  useEffect(() => {
    if (!db) return;

    const unsubConfig = onValue(
      ref(db, 'agent_config'),
      (snapshot) => {
        const val = snapshot.val();
        setConfig(
          val
            ? { mode: val.mode ?? 'standby', updatedAt: val.updatedAt ?? 0, webhooks: val.webhooks ?? undefined, lastAutoPilotRun: val.lastAutoPilotRun ?? undefined }
            : { mode: 'standby', updatedAt: 0 }
        );
      },
      () => setConfig({ mode: 'standby', updatedAt: 0 })
    );

    const unsubQueue = onValue(
      dbQuery(ref(db, 'agent_queue'), limitToLast(100)),
      (snapshot) => {
        const val = snapshot.val() ?? {};
        const list = Object.entries(val as Record<string, unknown>)
          .map(([id, item]) => normalizeQueueItem(id, item))
          .sort((a, b) => b.createdAt - a.createdAt);
        setQueue(list);
      },
      () => setQueue([])
    );

    return () => {
      unsubConfig();
      unsubQueue();
    };
  }, []);

  const setMode = useCallback(async (mode: AgentMode) => {
    if (!db) return;
    await update(ref(db, 'agent_config'), { mode, updatedAt: Date.now() });
  }, []);

  const setWebhooks = useCallback(async (webhooks: AgentWebhookConfig) => {
    if (!db) return;
    await set(ref(db, 'agent_config/webhooks'), webhooks);
  }, []);

  const setQueueItemStatus = useCallback(async (id: string, status: QueueItem['status']) => {
    if (!db) return;
    await update(ref(db, `agent_queue/${id}`), { status });
  }, []);

  const updateQueueItemContent = useCallback(async (id: string, body: string) => {
    if (!db) return;
    await update(ref(db, `agent_queue/${id}`), { body });
  }, []);

  const generateContent = useCallback((platform: Platform, topic: string, format: ContentFormat) => {
    return callAgentApi<{ ok: boolean; blocked?: boolean; id?: string }>('generate-content', { platform, topic, format });
  }, []);

  const draftEngagement = useCallback((query: string) => {
    return callAgentApi<{ ok: boolean; blocked?: boolean; id?: string }>('draft-engagement', { query });
  }, []);

  const scoreLead = useCallback((query: string) => {
    return callAgentApi<{ ok: boolean; result: { intent: LeadIntent; score: number; reasons: string[] } }>('score-lead', { query });
  }, []);

  const isRateLimited = (res: unknown): res is RateLimitedResponse => Boolean(res) && (res as { status?: string }).status === 'rate_limited';

  return { config, queue, setMode, setWebhooks, setQueueItemStatus, updateQueueItemContent, generateContent, draftEngagement, scoreLead, isRateLimited };
}
