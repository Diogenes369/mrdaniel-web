import { intakeTurn } from '../src/server/intakeAgent.js';

// Vercel Serverless Function: the site's chat agent (/chat and the floating chat), one turn per
// request. server.ts delegates its own `/api/chat` route here, so local dev and production run the
// same code. `.ts` entry with an explicit `.js` extension on the relative import for the same
// reason as api/news.ts: Vercel only bundles a `.ts` entry's dependency graph, and native Node ESM
// (this repo has `"type": "module"`) requires the literal extension in relative specifiers.
//
// Since 2026-10-07 it is the intake agent (src/server/intakeAgent.ts): it answers, asks one question
// at a time and reports what the visitor has told it so far. The response is a superset of the old
// `{ reply }`, so a page cached from before still gets an answer. intakeTurn never throws: without
// a model it runs a scripted interview, so there is no error reply to show a visitor.

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }
  const body = (typeof req.body === 'object' && req.body) || {};
  const turn = await intakeTurn(body.messages, body.fields, body.ask);
  res.status(200).json(turn);
}
