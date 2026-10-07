import { useSyncExternalStore } from 'react';
import type { IntakeField, IntakeFields } from './intakeFields';

/**
 * The chat agent's conversation in the browser: one store shared by /chat and the floating chat,
 * so a visitor who starts in the drawer and opens the full page keeps talking in the same thread.
 * It lives in sessionStorage (this tab, this visit) and talks to two endpoints:
 *
 *   /api/chat   one turn: the reply, what the visitor has told the agent, the next question
 *   /api/leads  `chat-lead`: the conversation handed to Daniel as a lead
 *
 * The lead goes out once, the moment the agent has a need, a name and an email. If the visitor keeps
 * talking, or leaves mid-conversation after giving an email, the rest follows from `pagehide` and
 * `visibilitychange` through sendBeacon, so what they said reaches Daniel even when they close the
 * tab instead of saying goodbye.
 *
 * Replies are paced to read like someone typing: a short pause that grows with the length of the
 * answer, and a long answer split at its paragraph breaks into separate messages.
 */

export type ChatRole = 'user' | 'assistant' | 'note';
export interface ChatMsg {
  id: string;
  role: ChatRole;
  content: string;
  at: number;
}

export interface IntakeState {
  id: string;
  messages: ChatMsg[];
  fields: IntakeFields;
  ask: IntakeField | null;
  suggestions: string[];
  complete: boolean;
  typing: boolean;
  lead: 'none' | 'sending' | 'sent' | 'error';
  /** How many visitor messages the last successful hand-off carried. */
  sentAt: number;
}

export const CONTACT_EMAIL = 'daniel@mrdaniel.co.il';
const KEY = 'mrd-chat-v1';
const GREETING =
  'היי, אני הסוכן של דניאל. אפשר לשאול אותי כל דבר על AI, על סוכנים או על מה שהייתם רוצים לבנות, ומה שצריך אני מעביר לדניאל. מה מביא אתכם לכאן?';
const OPENERS = ['לבנות סוכן AI', 'ללמוד AI מאפס', 'מה זה JARVIS?', 'כמה זה עולה?'];

const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const sleep = (ms: number) => new Promise((r) => window.setTimeout(r, ms));

function fresh(): IntakeState {
  return {
    id: uid(),
    messages: [{ id: uid(), role: 'assistant', content: GREETING, at: Date.now() }],
    fields: {},
    ask: null,
    suggestions: OPENERS,
    complete: false,
    typing: false,
    lead: 'none',
    sentAt: 0,
  };
}

function load(): IntakeState {
  if (typeof window === 'undefined') return fresh();
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw) as IntakeState;
      if (s && Array.isArray(s.messages) && s.messages.length) return { ...s, typing: false, lead: s.lead === 'sending' ? 'none' : s.lead };
    }
  } catch {
    /* private mode or a corrupt entry: start over */
  }
  return fresh();
}

let state: IntakeState | null = null;
const listeners = new Set<() => void>();
const get = () => (state ??= load());

function set(patch: Partial<IntakeState>) {
  state = { ...get(), ...patch };
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked: the conversation still works for this page */
  }
  listeners.forEach((l) => l());
}

function addMessage(role: ChatRole, content: string) {
  set({ messages: [...get().messages, { id: uid(), role, content, at: Date.now() }] });
}

const userCount = () => get().messages.filter((m) => m.role === 'user').length;
const apiMessages = () =>
  get()
    .messages.filter((m) => m.role !== 'note')
    .map((m) => ({ role: m.role, content: m.content }));

function leadPayload(update: boolean) {
  const s = get();
  return { action: 'chat-lead', conversationId: s.id, messages: apiMessages(), fields: s.fields, update };
}

/** Hands the conversation to Daniel. Fire-and-forget from the page's point of view. */
async function submitLead(update: boolean) {
  set({ lead: 'sending' });
  try {
    const res = await fetch('/api/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(leadPayload(update)) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    set({ lead: 'sent', sentAt: userCount() });
    if (!update) addMessage('note', `השיחה עברה לדניאל. אישור נשלח ל-${get().fields.email}.`);
  } catch {
    // Tried again on the next complete turn, and from pagehide.
    set({ lead: 'error' });
  }
}

/** The rest of the conversation, when the visitor leaves without a goodbye. */
function flush(minNew: number) {
  const s = get();
  if (!s.fields.email || s.lead === 'sending' || userCount() - s.sentAt < minNew) return;
  const body = new Blob([JSON.stringify(leadPayload(s.lead === 'sent'))], { type: 'application/json' });
  if (navigator.sendBeacon?.('/api/leads', body)) set({ lead: 'sent', sentAt: userCount() });
}

let installed = false;
function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('pagehide', () => flush(1));
  // Phones often never fire pagehide; a tab put away with two or more new messages counts as leaving.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(2);
  });
}

interface Turn {
  reply?: string;
  fields?: IntakeFields;
  ask?: IntakeField | null;
  suggestions?: string[];
  complete?: boolean;
}

/** A long answer reads better as two or three messages, the way people type. */
function splitReply(reply: string): string[] {
  const parts = reply
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length <= 1) return [reply.trim()];
  return parts.length <= 3 ? parts : [parts[0], parts[1], parts.slice(2).join('\n\n')];
}

const typingFor = (text: string) => Math.min(2400, 600 + text.length * 14);

export async function sendChat(raw: string) {
  install();
  const text = raw.trim().slice(0, 1200);
  if (!text || get().typing) return;
  addMessage('user', text);
  set({ typing: true, suggestions: [] });

  const started = performance.now();
  let turn: Turn;
  try {
    const s = get();
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: apiMessages(), fields: s.fields, ask: s.ask }),
    });
    turn = (await res.json()) as Turn;
    if (!turn.reply) throw new Error('empty turn');
  } catch {
    turn = { reply: `החיבור נפל לי לרגע. אפשר לשלוח שוב, או לכתוב ישירות ל-${CONTACT_EMAIL}.`, suggestions: [] };
  }

  const parts = splitReply(turn.reply!);
  for (let i = 0; i < parts.length; i++) {
    const wait = typingFor(parts[i]) - (i === 0 ? performance.now() - started : 0);
    if (wait > 0) await sleep(wait);
    addMessage('assistant', parts[i]);
    if (i < parts.length - 1) await sleep(250);
  }

  const prev = get();
  set({
    typing: false,
    fields: turn.fields ?? prev.fields,
    ask: turn.ask ?? null,
    suggestions: Array.isArray(turn.suggestions) ? turn.suggestions.slice(0, 3) : [],
    complete: Boolean(turn.complete),
  });
  const now = get();
  if (now.complete && (now.lead === 'none' || now.lead === 'error')) void submitLead(now.lead === 'error' && now.sentAt > 0);
}

/** A new conversation. Anything unsent from the old one goes to Daniel first. */
export function resetChat() {
  flush(1);
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  state = fresh();
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function useIntakeChat(): IntakeState {
  return useSyncExternalStore(subscribe, get, fresh);
}
