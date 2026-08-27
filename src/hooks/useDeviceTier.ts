import { useEffect, useState } from 'react';

export type DeviceTier = 'high' | 'low';

/** True on iOS/iPadOS regardless of browser chrome (Safari, Chrome-on-iOS, Edge-on-iOS all embed
 * WebKit — Apple requires it). Deliberately separate from `DeviceTier`: this is a *platform*
 * limitation (WebKit's GPU driver is a well-documented weak point specifically for multi-pass
 * WebGL post-processing), not a hardware-capability one — it applies equally to an old and a
 * brand-new iPhone, so it must never be folded into the hardware-based tier check below in a way
 * that would also cap DPI/antialiasing, which iOS actually handles fine. iPadOS 13+ spoofs a
 * desktop Safari UA, hence the `maxTouchPoints` fallback (a real Mac has none). */
export function isIOSWebKit(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iPad|iPhone|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

function computeTier(): DeviceTier {
  if (typeof window === 'undefined') return 'high';

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData === true;
  if (reducedMotion || saveData) return 'low';

  // On-device telemetry confirmed `navigator.hardwareConcurrency` reads as a low value (≤4) on a
  // real modern iPhone — WebKit is documented to cap/normalize this for anti-fingerprinting
  // purposes rather than report the true core count, so it's not a trustworthy weak-hardware
  // signal there (unlike on desktop/Android Chrome, where it reports accurately). Every iPhone
  // capable of running current iOS has more than enough GPU power for this scene, so iOS always
  // resolves to 'high' here — the *separate* isIOSWebKit() gate in Scene3D.tsx/SceneObjects.tsx
  // still independently turns off bloom/extra bodies there for its own (platform, not hardware)
  // reason, so this doesn't re-enable the expensive post-processing pass on iOS.
  if (isIOSWebKit()) return 'high';

  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const lowCores = (navigator.hardwareConcurrency ?? 8) <= 4;
  const lowMemory = ((navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 8) <= 2;
  // Viewport width alone is NOT a performance signal — most phones are narrow but plenty capable
  // of the full effect (particle field, extra bodies, bloom). Only genuinely weak hardware (few
  // CPU cores or little RAM) on a touch device downgrades the tier, so a mid/high-end phone gets
  // the same visual density as desktop, and only real low-end devices degrade gracefully.
  if (coarsePointer && (lowCores || lowMemory)) return 'low';
  return 'high';
}

/** Rough, one-time device capability heuristic used to gate expensive 3D features (bloom, instance counts, dpr). */
export function useDeviceTier(): DeviceTier {
  const [tier, setTier] = useState<DeviceTier>(computeTier);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = () => setTier(computeTier());
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return tier;
}
