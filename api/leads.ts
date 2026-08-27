import nodemailer from 'nodemailer';

// Vercel Serverless Function equivalent of server.ts's `/api/leads` route — this is what LeadForm
// and AIAssistantWidget's booking drawer actually talk to in production (Express only runs
// locally). Defaults LEAD_EMAIL_TO to the owner's inbox so a missing env var never means leads
// go nowhere.
const LEAD_EMAIL_TO = process.env.LEAD_EMAIL_TO || 'danihell3039@gmail.com';

function getMailTransporter() {
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) return null;

  return nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false, error: 'method not allowed' });
    return;
  }

  const {
    name,
    email,
    phone,
    project,
    notes,
    sourceSection,
    selectedProduct,
    productCategory,
    price,
    userCompanySize,
  } = req.body ?? {};

  if (!name || !email) {
    res.status(400).json({ ok: false, error: 'missing name/email' });
    return;
  }

  const transporter = getMailTransporter();
  if (!transporter) {
    // Deliberately NOT `{ ok: true }` here (unlike server.ts's local-dev fallback, which logs and
    // reports success so you can click through the UI flow without needing real SMTP creds
    // locally) — in production, telling a real visitor their message was received when no email
    // was actually sent anywhere is exactly the silent-failure bug this endpoint exists to fix.
    // A non-2xx here makes LeadForm/AIAssistantWidget show their existing, already-honest error
    // state, which itself points the visitor at a working mailto: fallback.
    console.error('[api/leads] SMTP not configured — lead not delivered:', { name, email, phone, project, notes, sourceSection });
    res.status(503).json({ ok: false, error: 'email delivery not configured' });
    return;
  }

  const productLines = selectedProduct
    ? `\nמוצר/סוכן נבחר: ${selectedProduct}${productCategory ? ` (${productCategory})` : ''}\nמחיר: ${price ? `₪${price}` : '-'}\nגודל ארגון: ${userCompanySize || '-'}\n`
    : '';
  const subjectPrefix = selectedProduct ? `ליד חדש · ${selectedProduct}` : 'ליד חדש מהאתר';

  try {
    await transporter.sendMail({
      from: `"אתר דניאל בן ברוך" <${process.env.SMTP_USER}>`,
      to: LEAD_EMAIL_TO,
      replyTo: email,
      subject: `${subjectPrefix}: ${name}`,
      text: `שם: ${name}\nאימייל: ${email}\nטלפון: ${phone || '-'}\nמקור הפנייה: ${sourceSection || '-'}\nפרויקט: ${project || '-'}${productLines}\nהערות:\n${notes || '-'}`,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[api/leads] failed to send lead email:', err);
    res.status(500).json({ ok: false, error: 'send failed' });
  }
}
