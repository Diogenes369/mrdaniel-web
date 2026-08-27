import { useEffect, useState } from 'react';
import { onValue, ref, query, limitToLast, update } from 'firebase/database';
import { db } from '../firebase';
import type { PresenceRecord, TrackedEvent, HealthRecord, LeadRecord, NewsletterSignupRecord, LeadStatus } from './types';

/** Persists a pipeline-status change for one lead back to Firebase — requires the same `leads`
 * read/write rule as `useLeads` below. Resolves silently if Firebase isn't configured or the rule
 * hasn't been added yet, matching this file's existing degrade-gracefully convention. */
export function updateLeadStatus(id: string, status: LeadStatus): Promise<void> {
  if (!db) return Promise.resolve();
  return update(ref(db, `leads/${id}`), { status }).catch((err) => {
    console.error('[dashboard] failed to update lead status', err);
  });
}

/** Live map of `sessionId -> PresenceRecord` for everyone currently on the site — each entry is
 * removed automatically via Firebase's `onDisconnect()` the moment that tab closes or loses
 * connection, so this map's size is always the true concurrent-user count without any polling. */
export function usePresence(): Record<string, PresenceRecord> {
  const [presence, setPresence] = useState<Record<string, PresenceRecord>>({});

  useEffect(() => {
    if (!db) return;
    const presenceRef = ref(db, 'presence');
    return onValue(
      presenceRef,
      (snapshot) => setPresence(snapshot.val() ?? {}),
      () => setPresence({})
    );
  }, []);

  return presence;
}

export function useLiveEvents(limit = 300): (TrackedEvent & { id: string })[] {
  const [events, setEvents] = useState<(TrackedEvent & { id: string })[]>([]);

  useEffect(() => {
    if (!db) return;
    const eventsRef = query(ref(db, 'events'), limitToLast(limit));
    return onValue(
      eventsRef,
      (snapshot) => {
        const val = snapshot.val() ?? {};
        const list = Object.entries(val as Record<string, TrackedEvent>)
          .map(([id, event]) => ({ id, ...event }))
          .sort((a, b) => b.ts - a.ts);
        setEvents(list);
      },
      () => setEvents([])
    );
  }, [limit]);

  return events;
}

export function useHealth(): HealthRecord | null {
  const [health, setHealth] = useState<HealthRecord | null>(null);

  useEffect(() => {
    if (!db) return;
    const healthRef = ref(db, 'health/latest');
    return onValue(
      healthRef,
      (snapshot) => setHealth(snapshot.val() ?? null),
      () => setHealth(null)
    );
  }, []);

  return health;
}

/** Requires a `leads` read/write rule in the Firebase console (see README) — resolves to an empty
 * list, not an error, if that rule hasn't been added yet or Firebase isn't configured. */
export function useLeads(limit = 200): (LeadRecord & { id: string })[] {
  const [leads, setLeads] = useState<(LeadRecord & { id: string })[]>([]);

  useEffect(() => {
    if (!db) return;
    const leadsRef = query(ref(db, 'leads'), limitToLast(limit));
    return onValue(
      leadsRef,
      (snapshot) => {
        const val = snapshot.val() ?? {};
        const list = Object.entries(val as Record<string, LeadRecord>)
          .map(([id, lead]) => ({ id, ...lead }))
          .sort((a, b) => b.ts - a.ts);
        setLeads(list);
      },
      () => setLeads([])
    );
  }, [limit]);

  return leads;
}

export function useNewsletterSignups(limit = 200): (NewsletterSignupRecord & { id: string })[] {
  const [signups, setSignups] = useState<(NewsletterSignupRecord & { id: string })[]>([]);

  useEffect(() => {
    if (!db) return;
    const signupsRef = query(ref(db, 'newsletter_signups'), limitToLast(limit));
    return onValue(
      signupsRef,
      (snapshot) => {
        const val = snapshot.val() ?? {};
        const list = Object.entries(val as Record<string, NewsletterSignupRecord>)
          .map(([id, signup]) => ({ id, ...signup }))
          .sort((a, b) => b.ts - a.ts);
        setSignups(list);
      },
      () => setSignups([])
    );
  }, [limit]);

  return signups;
}
