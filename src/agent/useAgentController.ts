import { useEffect, useState, useCallback } from 'react';
import { onValue, ref, set, update, query as dbQuery, limitToLast } from 'firebase/database';
import { getDb } from '../lib/firebaseClient';
import type { AgentConfig, AgentMode, AgentWebhookConfig, ContentFormat, Platform, QueueItem, LeadScoreResultShape } from './types';

// The public API base — same-origin in production; in local dev the agent's Vite dev server and
// the Express API mirror both run on the same origin too (server.ts serves both), so this never
// needs to differ per-environment the way the dashboard (a genuinely separate origin/port) does.
const API_BASE = '/api/agent-generate';

async function callAgentApi<T>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(API_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, ...payload }),
  });
  if (!res.ok) throw new Error(`agent api error: ${res.status}`);
  return res.json();
}

/**
 * Client-side controller for the Social Agent — Firebase reads/writes for config + queue, plus
 * the fetch calls into /api/agent-generate for anything that needs the Gemini key (which never
 * ships to the browser). Usable from any authenticated admin surface; the actual shipped admin UI
 * lives in the separate `dashboard/` app (see dashboard/src/lib/useAgentController.ts — a
 * necessary duplicate, not an oversight, since that's a fully separate npm project with no shared
 * module boundary back to this one).
 */
export function useAgentController() {
  const [config, setConfig] = useState<AgentConfig | null>(null);
  const [queue, setQueue] = useState<(QueueItem & { id: string })[]>([]);
  const [configured, setConfigured] = useState(false);

  useEffect(() => {
    const db = getDb();
    if (!db) return;
    setConfigured(true);

    const unsubConfig = onValue(ref(db, 'agent_config'), (snapshot) => {
      const val = snapshot.val();
      setConfig(
        val
          ? { mode: val.mode ?? 'standby', updatedAt: val.updatedAt ?? 0, webhooks: val.webhooks ?? undefined, lastAutoPilotRun: val.lastAutoPilotRun ?? undefined }
          : { mode: 'standby', updatedAt: 0 }
      );
    });

    const unsubQueue = onValue(dbQuery(ref(db, 'agent_queue'), limitToLast(100)), (snapshot) => {
      const val = snapshot.val() ?? {};
      const list = Object.entries(val as Record<string, Omit<QueueItem, 'id'>>)
        .map(([id, item]) => ({ id, ...item }) as QueueItem & { id: string })
        .sort((a, b) => b.createdAt - a.createdAt);
      setQueue(list);
    });

    return () => {
      unsubConfig();
      unsubQueue();
    };
  }, []);

  const setMode = useCallback(async (mode: AgentMode) => {
    const db = getDb();
    if (!db) return;
    await update(ref(db, 'agent_config'), { mode, updatedAt: Date.now() });
  }, []);

  const setWebhooks = useCallback(async (webhooks: AgentWebhookConfig) => {
    const db = getDb();
    if (!db) return;
    await set(ref(db, 'agent_config/webhooks'), webhooks);
  }, []);

  const setQueueItemStatus = useCallback(async (id: string, status: QueueItem['status']) => {
    const db = getDb();
    if (!db) return;
    await update(ref(db, `agent_queue/${id}`), { status });
  }, []);

  const updateQueueItemContent = useCallback(async (id: string, body: string) => {
    const db = getDb();
    if (!db) return;
    await update(ref(db, `agent_queue/${id}`), { body });
  }, []);

  const generateContent = useCallback((platform: Platform, topic: string, format: ContentFormat) => {
    return callAgentApi<{ ok: boolean; id?: string; body?: string; carouselSlides?: string[] }>('generate-content', { platform, topic, format });
  }, []);

  const draftEngagement = useCallback((query: string) => {
    return callAgentApi<{ ok: boolean; id?: string; draftMessage?: string }>('draft-engagement', { query });
  }, []);

  const scoreLead = useCallback((query: string) => {
    return callAgentApi<{ ok: boolean; result: LeadScoreResultShape }>('score-lead', { query });
  }, []);

  return { configured, config, queue, setMode, setWebhooks, setQueueItemStatus, updateQueueItemContent, generateContent, draftEngagement, scoreLead };
}
