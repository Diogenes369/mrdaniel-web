/**
 * What the chat agent learns about a visitor, shared by the server (src/server/intakeAgent.ts) and
 * the chat UI (the "what the agent knows" panel), so the two can't name a field differently.
 */
export interface IntakeFields {
  /** What they want done, in their words. */
  need?: string;
  /** Who it is for: freelance, a small business, a company, personal use, and the field they work in. */
  who?: string;
  /** The tools they work with today. */
  tools?: string;
  timeline?: string;
  budget?: string;
  name?: string;
  email?: string;
  /** Only when the visitor offers one; the agent never asks. */
  phone?: string;
}
export type IntakeField = keyof IntakeFields;

/** Conversation order, which is also the order the owner reads them in. */
export const FIELD_ORDER: IntakeField[] = ['need', 'who', 'tools', 'timeline', 'budget', 'name', 'email', 'phone'];

export const FIELD_LABEL: Record<IntakeField, string> = {
  need: 'מה צריך',
  who: 'למי זה',
  tools: 'כלים היום',
  timeline: 'מתי',
  budget: 'תקציב',
  name: 'שם',
  email: 'מייל',
  phone: 'טלפון',
};

/** What makes a lead the owner can answer: what they need, who they are, where to write back. */
export const REQUIRED_FIELDS: IntakeField[] = ['need', 'name', 'email'];
