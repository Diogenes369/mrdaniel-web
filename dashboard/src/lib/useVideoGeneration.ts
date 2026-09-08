import { useCallback, useRef, useState } from 'react';
import type { VideoJobStatus, VideoProvider } from './agentTypes';
import { getAdminSecret, reportAuthFailure } from './adminSecret';

/** Mirrors src/agent/VideoGenerationEngine.ts's VideoScriptInput — accepts either the agent
 * queue's scene-by-scene script or the weekly plan's flatter body+visualCues script, since both
 * cards in the dashboard (QueueCard and WeeklyPlanCalendar's DayCard) call this same hook. */
export interface VideoScriptInput {
  hook: string;
  cta: string;
  scenes?: { onScreenText: string; voiceover?: string }[];
  body?: string;
  visualCues?: string[];
  estimatedSeconds?: number;
}

// Same reasoning as useAgentController.ts's API_BASE — this dashboard has no deployed origin of its
// own, so it talks to the production site's API directly by default.
const VIDEO_API_BASE = import.meta.env.VITE_VIDEO_API_BASE || 'https://mrdaniel.co.il/api/generate-video';

const POLL_INTERVAL_MS = 4000;

export interface VideoGenState {
  status: VideoJobStatus;
  videoDataUrl?: string;
  mimeType?: string;
  error?: string;
}

function authHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
    ...(getAdminSecret() ? { 'x-admin-secret': getAdminSecret() } : {}),
  };
}

/** One video-generation-with-polling flow per arbitrary caller-chosen `key` (a queue item id, or a
 * `${day}-${platform}` composite for weekly-plan cards) — used identically by AgentControlPanel's
 * QueueCard and WeeklyPlanCalendar's DayCard so the "צור וידאו AI" button behaves the same in both
 * places. Polling lives entirely client-side (setInterval) since the underlying job itself is
 * server/Firebase-persisted — see api/generate-video.ts and VideoGenerationEngine.ts. */
export function useVideoGeneration() {
  const [jobs, setJobs] = useState<Record<string, VideoGenState>>({});
  const timers = useRef<Record<string, ReturnType<typeof setInterval>>>({});

  const stopPolling = useCallback((key: string) => {
    const timer = timers.current[key];
    if (timer) {
      clearInterval(timer);
      delete timers.current[key];
    }
  }, []);

  const poll = useCallback(
    (key: string, id: string) => {
      timers.current[key] = setInterval(async () => {
        try {
          const res = await fetch(`${VIDEO_API_BASE}?id=${encodeURIComponent(id)}`, { headers: authHeaders() });
          const data = await res.json();
          if (!res.ok || !data.ok) {
            setJobs((prev) => ({ ...prev, [key]: { status: 'error', error: data?.error || `poll failed (${res.status})` } }));
            stopPolling(key);
            return;
          }
          setJobs((prev) => ({ ...prev, [key]: { status: data.status, videoDataUrl: data.videoDataUrl, mimeType: data.mimeType, error: data.error } }));
          if (data.status === 'done' || data.status === 'error') {
            stopPolling(key);
          }
        } catch (err) {
          setJobs((prev) => ({ ...prev, [key]: { status: 'error', error: err instanceof Error ? err.message : 'poll failed' } }));
          stopPolling(key);
        }
      }, POLL_INTERVAL_MS);
    },
    [stopPolling]
  );

  const generate = useCallback(
    async (
      key: string,
      script: VideoScriptInput | null | undefined,
      topic: string,
      aspectRatio: '9:16' | '16:9' = '9:16',
      provider?: VideoProvider,
      visualPrompt?: string
    ) => {
      stopPolling(key);
      setJobs((prev) => ({ ...prev, [key]: { status: 'processing' } }));
      try {
        // visualPrompt (the card's own written post/slide text) always rides along as a fallback —
        // the API builds a usable script from it if `script` turns out to be missing or blank, so a
        // thin/empty script here never hard-fails the request client-side either.
        const res = await fetch(VIDEO_API_BASE, {
          method: 'POST',
          headers: authHeaders(),
          body: JSON.stringify({ script, topic, aspectRatio, provider, visualPrompt }),
        });
        const data = await res.json();
        if (res.status === 401) reportAuthFailure('agent-generate');
        if (!res.ok || !data.ok) {
          setJobs((prev) => ({ ...prev, [key]: { status: 'error', error: data?.error || `request failed (${res.status})` } }));
          return;
        }
        if (data.status === 'error') {
          setJobs((prev) => ({ ...prev, [key]: { status: 'error', error: data.error || 'video generation failed to start' } }));
          return;
        }
        poll(key, data.id);
      } catch (err) {
        setJobs((prev) => ({ ...prev, [key]: { status: 'error', error: err instanceof Error ? err.message : 'request failed' } }));
      }
    },
    [poll, stopPolling]
  );

  return { jobs, generate };
}
