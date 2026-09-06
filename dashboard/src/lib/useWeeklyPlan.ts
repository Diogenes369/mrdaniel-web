import { useEffect, useState, useCallback } from 'react';
import { onValue, ref, update } from 'firebase/database';
import { db } from '../firebase';
import type { WeeklyPlan, DailyContentPlan, ContentStatus } from './weeklyPlanTypes';
import { getAdminSecret } from './adminSecret';

// Same production-API-by-default reasoning as useAgentController.ts — this dashboard has no
// deployed origin of its own, so it talks to the live main site by default.
const API_BASE = import.meta.env.VITE_AGENT_API_BASE
  ? import.meta.env.VITE_AGENT_API_BASE.replace('/agent-generate', '/generate-weekly-plan')
  : 'https://mrdaniel.co.il/api/generate-weekly-plan';

/**
 * Firebase Realtime Database does not store empty arrays (or `null`/`undefined` values) — writing
 * `{ flags: [] }` round-trips as the `flags` key being absent entirely on the next read. Most
 * generated days/items have EMPTY `security.flags` (that's the common "passed cleanly" case), so
 * this isn't a rare edge case — it hits on nearly every refresh. Every array/object field this
 * component tree touches gets defaulted here, once, at the data boundary, rather than scattering
 * `?? []` through every render site (and inevitably missing one, which is exactly what caused the
 * dark-screen crash this function exists to fix — see DayCard's `day.security.flags.length`).
 */
function normalizeDay(raw: unknown, fallbackIndex: number): DailyContentPlan {
  const d = (raw ?? {}) as Partial<DailyContentPlan> & { videoScript?: Partial<DailyContentPlan['videoScript']> };
  return {
    dayIndex: typeof d.dayIndex === 'number' ? d.dayIndex : fallbackIndex,
    day: d.day ?? '',
    topic: d.topic ?? 'ai-agents',
    platform: d.platform ?? 'linkedin',
    postText: d.postText ?? '',
    hashtags: Array.isArray(d.hashtags) ? d.hashtags : [],
    videoScript: {
      hook: d.videoScript?.hook ?? '',
      body: d.videoScript?.body ?? '',
      cta: d.videoScript?.cta ?? '',
      visualCues: Array.isArray(d.videoScript?.visualCues) ? d.videoScript!.visualCues : [],
    },
    status: d.status ?? 'draft',
    security: {
      passed: d.security?.passed ?? true,
      badge: d.security?.badge ?? '',
      flags: Array.isArray(d.security?.flags) ? d.security!.flags : [],
    },
  };
}

function normalizePlan(raw: unknown): WeeklyPlan | null {
  const val = raw as Partial<WeeklyPlan> | null | undefined;
  if (!val || !Array.isArray(val.days)) return null;
  return {
    id: val.id ?? `week-${val.generatedAt ?? Date.now()}`,
    generatedAt: val.generatedAt ?? Date.now(),
    days: val.days.map((d, i) => normalizeDay(d, i)),
  };
}

export function useWeeklyPlan() {
  const [plan, setPlan] = useState<WeeklyPlan | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rateLimit, setRateLimit] = useState<{ retryAfterSeconds: number } | null>(null);

  useEffect(() => {
    if (!db) return;
    const unsub = onValue(
      ref(db, 'weekly_plan'),
      (snapshot) => {
        setPlan(normalizePlan(snapshot.val()));
      },
      () => {
        // Permission-denied or any other read error — degrade to "no plan yet" instead of leaving
        // the previous render in a stuck/unknown state.
        setPlan(null);
      }
    );
    return () => unsub();
  }, []);

  const generateNewPlan = useCallback(async () => {
    setGenerating(true);
    setError(null);
    setRateLimit(null);
    try {
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
        },
      });
      const data = await res.json();
      if (data.status === 'rate_limited') {
        setRateLimit({ retryAfterSeconds: data.retryAfterSeconds });
        return false;
      }
      if (!data.ok) {
        setError(data.error || 'היצירה נכשלה');
        return false;
      }
      // Firebase's live listener above will pick up the write almost immediately, but setting it
      // directly too means the UI updates instantly even if `saved` came back false (Firebase not
      // configured) rather than waiting on a subscription that will never fire in that case.
      setPlan(normalizePlan(data.plan));
      return true;
    } catch {
      setError('שגיאת תקשורת מול השרת.');
      return false;
    } finally {
      setGenerating(false);
    }
  }, []);

  const setDayStatus = useCallback(async (dayIndex: number, status: ContentStatus) => {
    if (!db || !plan) return;
    const days = plan.days.map((d) => (d.dayIndex === dayIndex ? { ...d, status } : d));
    await update(ref(db, 'weekly_plan'), { days });
  }, [plan]);

  const setDayPostText = useCallback(async (dayIndex: number, postText: string) => {
    if (!db || !plan) return;
    const days = plan.days.map((d) => (d.dayIndex === dayIndex ? { ...d, postText } : d));
    await update(ref(db, 'weekly_plan'), { days });
  }, [plan]);

  return { plan, generating, error, rateLimit, generateNewPlan, setDayStatus, setDayPostText };
}
