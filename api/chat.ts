import { genAI, generateContentWithRetry } from '../src/agent/geminiClient.js';
import { AI_ASSISTANT_SYSTEM_INSTRUCTION } from '../src/server/aiSystemPrompt.js';

// Vercel Serverless Function equivalent of server.ts's `/api/chat` route (Express only runs
// locally — this is what the AI assistant widget actually talks to in production). `.ts` entry
// with an explicit `.js` extension on the relative import for the same reason as api/news.ts:
// Vercel only bundles a `.ts` entry's dependency graph, and native Node ESM (this repo has
// `"type": "module"`) requires the literal extension in relative specifiers.


interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

const UNAVAILABLE_REPLY =
  'שירות הצ׳אט אינו זמין כרגע. ניתן למלא את טופס יצירת הקשר או לפנות ישירות במייל danihell3039@gmail.com.';
const ERROR_REPLY =
  'מצטער, חלה שגיאת תקשורת רגעית. אפשר גם למלא את טופס יצירת הקשר באתר או לפנות ישירות במייל danihell3039@gmail.com.';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' });
    return;
  }

  const messages: ChatMessage[] = Array.isArray(req.body?.messages) ? req.body.messages : [];

  // Not an error state — GEMINI_API_KEY simply isn't configured. The reply itself already tells
  // the visitor clearly what happened and points them at a working fallback (the lead form / a
  // real mailto: link), so a 200 here is the honest response, not a masked failure.
  if (!genAI) {
    res.status(200).json({ reply: UNAVAILABLE_REPLY });
    return;
  }

  try {
    const contents = messages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const response = await generateContentWithRetry({
      model: 'gemini-3.6-flash',
      contents,
      config: {
        systemInstruction: AI_ASSISTANT_SYSTEM_INSTRUCTION,
        temperature: 0.7,
        topP: 0.95,
      },
    });

    const reply = response.text?.trim() || 'תודה על פנייתך. אשמח לסייע בהמשך.';
    res.status(200).json({ reply });
  } catch (err) {
    console.error('[api/chat] Gemini chat error:', err);
    res.status(200).json({ reply: ERROR_REPLY });
  }
}
