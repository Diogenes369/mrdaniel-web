import { transcribeAudio } from '../src/agent/SocialAgentEngine.js';
import {
  findLatestPendingQueueItem,
  updateQueueItemStatus,
  updateQueueItemBody,
  readAwaitingEditFor,
  setAwaitingEditFor,
  appendStrategicContext,
  agentFirebaseConfigured,
} from '../src/agent/firebaseServer.js';
import { sendAdminMessage } from '../src/agent/WhatsAppDispatcher.js';
import { containsPromptInjection } from '../src/agent/AgentSecurityGuard.js';

/**
 * Receives forwarded incoming WhatsApp messages from the self-hosted bridge (whatsapp-server/) —
 * that service holds the actual Baileys connection and simply relays "Daniel sent a message" here
 * as plain JSON. This endpoint never talks to WhatsApp directly; replies go back out through
 * WhatsAppDispatcher.ts → the same bridge's /send endpoint.
 *
 * Two-step "edit" flow: replying "2"/"ערוך" to a pending item doesn't carry the new text in the
 * same message (a WhatsApp reply is just a string, no structured form) — it sets
 * `agent_config/awaitingEditFor` to that item's id, and the *next* message that ISN'T itself an
 * action shortcut is treated as the replacement text for that item rather than a strategic note.
 */

function setCors(res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-webhook-secret');
}

function isBridgeAuthorized(req: any): boolean {
  const configured = process.env.WHATSAPP_WEBHOOK_SECRET;
  if (!configured) return true; // fails open only when unset — see .env.example
  return req.headers?.['x-webhook-secret'] === configured;
}

const APPROVE_WORDS = ['1', 'אשר', 'אישור', 'מאשר'];
const EDIT_WORDS = ['2', 'ערוך', 'עריכה'];
const REJECT_WORDS = ['3', 'דחה', 'דחייה', 'לדחות'];

export default async function handler(req: any, res: any) {
  setCors(res);
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }
  if (!isBridgeAuthorized(req)) {
    res.status(401).json({ ok: false, error: 'unauthorized' });
    return;
  }
  if (!agentFirebaseConfigured) {
    res.status(200).json({ ok: true, skipped: true, reason: 'firebase-not-configured' });
    return;
  }

  const { from, text, audioBase64, audioMimeType } = req.body ?? {};

  try {
    let effectiveText: string = typeof text === 'string' ? text.trim() : '';

    if (!effectiveText && audioBase64 && audioMimeType) {
      effectiveText = (await transcribeAudio(audioBase64, audioMimeType)).trim();
    }

    if (!effectiveText) {
      res.status(200).json({ ok: true, skipped: true, reason: 'empty message' });
      return;
    }

    if (containsPromptInjection(effectiveText)) {
      await sendAdminMessage('⚠️ ההודעה זוהתה כמכילה ניסיון הזרקת הוראות ולא עובדה.');
      res.status(200).json({ ok: true, blocked: true });
      return;
    }

    const normalized = effectiveText.trim().toLowerCase();
    const awaitingEditFor = await readAwaitingEditFor();

    // Mid-edit-flow: this message is the replacement text, not a command (unless it happens to
    // literally be another shortcut word, in which case the admin is switching intent).
    if (awaitingEditFor && !APPROVE_WORDS.includes(normalized) && !EDIT_WORDS.includes(normalized) && !REJECT_WORDS.includes(normalized)) {
      await updateQueueItemBody(awaitingEditFor, effectiveText);
      await setAwaitingEditFor(null);
      await sendAdminMessage('✏️ הטקסט עודכן בהצלחה.');
      res.status(200).json({ ok: true, action: 'edited', id: awaitingEditFor });
      return;
    }

    if (APPROVE_WORDS.includes(normalized)) {
      const latest = await findLatestPendingQueueItem();
      if (!latest) {
        await sendAdminMessage('אין כרגע פריטים ממתינים לאישור.');
        res.status(200).json({ ok: true, action: 'approve', found: false });
        return;
      }
      await updateQueueItemStatus(latest.id, 'approved');
      await sendAdminMessage('✅ אושר. הטקסט הסופי זמין בלוח הבקרה להעתקה/פרסום ידני.');
      res.status(200).json({ ok: true, action: 'approve', id: latest.id });
      return;
    }

    if (EDIT_WORDS.includes(normalized)) {
      const latest = await findLatestPendingQueueItem();
      if (!latest) {
        await sendAdminMessage('אין כרגע פריטים ממתינים לעריכה.');
        res.status(200).json({ ok: true, action: 'edit', found: false });
        return;
      }
      await setAwaitingEditFor(latest.id);
      await sendAdminMessage('✏️ שלחו את הטקסט המעודכן בהודעה הבאה.');
      res.status(200).json({ ok: true, action: 'edit-prompt', id: latest.id });
      return;
    }

    if (REJECT_WORDS.includes(normalized)) {
      const latest = await findLatestPendingQueueItem();
      if (!latest) {
        await sendAdminMessage('אין כרגע פריטים ממתינים לדחייה.');
        res.status(200).json({ ok: true, action: 'reject', found: false });
        return;
      }
      await updateQueueItemStatus(latest.id, 'rejected');
      await sendAdminMessage('🗑️ נדחה.');
      res.status(200).json({ ok: true, action: 'reject', id: latest.id });
      return;
    }

    // Not a shortcut — treat as a freeform strategic note that steers future generation.
    await appendStrategicContext(effectiveText);
    await sendAdminMessage('📝 נרשם כהנחיה אסטרטגית להמשך יצירת תוכן.');
    res.status(200).json({ ok: true, action: 'strategic-note', from });
  } catch (err) {
    console.error('[api/agent-whatsapp-webhook] error:', err);
    res.status(500).json({ ok: false, error: 'processing failed' });
  }
}
