import { useEffect, useState, type ReactNode } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X,
  Check,
  ArrowLeft,
  ArrowRight,
  Bot,
  Code2,
  BookOpen,
  MessageCircle,
  Network,
  MessagesSquare,
  Globe,
  BrainCog,
  MessageCircleQuestion,
  Building2,
} from 'lucide-react';
import WebButton from './WebButton';
import ModalHeaderBanner from './ModalHeaderBanner';
import { sendLeadWebhook } from '../lib/leadWebhook';
import { isValidPhone } from '../lib/phone';
import { useBodyScrollLock } from '../hooks/useBodyScrollLock';

// Firebase (~200KB gzipped) is dynamically imported, not statically — same reasoning as App.tsx's
// own `loadTracker`, kept out of this modal's bundle until a visitor actually interacts with it.
import { loadTracker } from '../lib/loadTracker';
const trackField = (field: string, action: 'focus' | 'blur' | 'submit') =>
  loadTracker().then((t) => t.trackFormInteraction('LeadForm', field, action));

// The real WhatsApp Business number surfaced as a direct-contact option on the confirmation step
// of the product-qualification flow (see PRODUCT_STEPS below) — deliberately a plain constant, not
// an env var: it's meant to be public-facing (it's literally what a wa.me link exposes), matching
// how CONTACT_EMAIL is defined the same way in Footer.tsx/SocialLinks.tsx elsewhere in this codebase.
const WHATSAPP_NUMBER = '972506473039';

const SERVICES = [
  { id: 'ai', label: 'סוכן AI מותאם אישית', icon: Bot },
  { id: 'dev', label: 'אוטומציה ואינטגרציית LLM', icon: Code2 },
  { id: 'content', label: 'רכישת תוכן / מגזינים', icon: BookOpen },
  { id: 'other', label: 'משהו אחר', icon: MessageCircle },
];

/** The product-qualification flow's "primary goal / system" question — distinct from SERVICES
 * above (which is the generic contact flow's broad topic picker) because a visitor arriving from
 * a priced product/agent CTA has already told us WHAT they're interested in; this question is
 * about HOW it plugs into their world, which is what actually qualifies the lead. */
const GOALS = [
  { id: 'crm', label: 'חיבור למערכת CRM קיימת', icon: Network },
  { id: 'whatsapp', label: 'אוטומציה ב-WhatsApp', icon: MessagesSquare },
  { id: 'web', label: 'אתר / צ׳אט אתר', icon: Globe },
  { id: 'internal', label: 'חיפוש חכם במסמכים ובידע שלי', icon: BrainCog },
  { id: 'other', label: 'משהו אחר', icon: MessageCircleQuestion },
];

const COMPANY_SIZES = [
  { id: 'solo', label: 'עצמאי / פרילנסר' },
  { id: 'small', label: 'עד 10 עובדים' },
  { id: 'medium', label: '10–50 עובדים' },
  { id: 'large', label: '50+ עובדים' },
];

function mapSubjectToService(subject?: string): string {
  if (!subject) return '';
  if (/אוטומצי|LLM|API|אינטגרצי/i.test(subject)) return 'dev';
  if (/AI|בינה|סוכן/i.test(subject)) return 'ai';
  if (/רכישת|מגזין|חוברת/i.test(subject)) return 'content';
  return '';
}

interface ProductContext {
  name: string;
  price: number;
  tierLabel?: string;
  category?: string;
}

interface LeadModalDetail {
  subject?: string;
  sourceSection?: string;
  prefillMessage?: string;
  product?: ProductContext;
}

interface FormState {
  name: string;
  email: string;
  phone: string;
  service: string;
  goal: string;
  companySize: string;
  message: string;
}

const EMPTY_FORM: FormState = { name: '', email: '', phone: '', service: '', goal: '', companySize: '', message: '' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function LeadForm() {
  const [isOpen, setIsOpen] = useState(false);
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [subjectContext, setSubjectContext] = useState('');
  const [sourceSection, setSourceSection] = useState('');
  const [product, setProduct] = useState<ProductContext | null>(null);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const isProductFlow = product !== null;

  useEffect(() => {
    const handleOpen = (e: Event) => {
      const detail = (e as CustomEvent<LeadModalDetail>).detail;
      if (detail?.subject) {
        setSubjectContext(detail.subject);
        setForm((f) => ({ ...f, service: mapSubjectToService(detail.subject) || f.service }));
      }
      if (detail?.prefillMessage) {
        setForm((f) => ({ ...f, message: detail.prefillMessage! }));
      }
      setSourceSection(detail?.sourceSection || '');
      setProduct(detail?.product ?? null);
      setIsOpen(true);
    };
    window.addEventListener('open-lead-modal', handleOpen);
    return () => window.removeEventListener('open-lead-modal', handleOpen);
  }, []);

  // Lock background scroll while the modal is open — on mobile, a touch that starts on the
  // backdrop (or a fast swipe past the scrollable body's bounds) can otherwise scroll the page
  // behind the fixed overlay, which reads as the whole layout jumping while typing.
  // Shared, reference-counted — see useBodyScrollLock for why a local
  // save/restore of body.style.overflow permanently locked the page when overlays
  // overlapped.
  useBodyScrollLock(isOpen);

  const reset = () => {
    setStep(0);
    setForm(EMPTY_FORM);
    setSubjectContext('');
    setSourceSection('');
    setProduct(null);
    setStatus('idle');
  };

  const close = () => {
    setIsOpen(false);
    window.setTimeout(reset, 400);
  };

  // Product flow: step 0 = goal + company size, step 1 = contact details, step 2 = confirmation.
  // Generic flow: step 0 = contact details, step 1 = topic, step 2 = message. Kept as two distinct
  // orderings (rather than one shared shape) so every existing generic-flow call site — Header,
  // Hero, ROICalculator, etc. — keeps its already-tested UX unchanged.
  const canProceed = isProductFlow
    ? step === 0
      ? form.goal !== '' && form.companySize !== ''
      : step === 1
        ? form.name.trim().length > 1 && EMAIL_RE.test(form.email) && isValidPhone(form.phone)
        : true
    : step === 0
      ? form.name.trim().length > 1 && EMAIL_RE.test(form.email) && isValidPhone(form.phone)
      : step === 1
        ? form.service !== ''
        : true;

  const submit = async () => {
    setStatus('sending');
    const project = isProductFlow ? product!.name : SERVICES.find((s) => s.id === form.service)?.label ?? form.service;
    const goalLabel = GOALS.find((g) => g.id === form.goal)?.label;
    const companySizeLabel = COMPANY_SIZES.find((c) => c.id === form.companySize)?.label;
    const notes = [
      subjectContext ? `הקשר: ${subjectContext}` : '',
      goalLabel ? `מטרה עיקרית: ${goalLabel}` : '',
      form.message,
    ]
      .filter(Boolean)
      .join('\n');

    sendLeadWebhook({
      name: form.name,
      email: form.email,
      phone: form.phone,
      message: `${project}\n${notes}`,
      sourceSection,
      inquiryTopic: subjectContext || project,
    });

    trackField('submit', 'submit');

    // `/api/leads` both emails the lead and records it for the dashboard.
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          phone: form.phone,
          project,
          notes,
          sourceSection,
          selectedProduct: product?.name,
          productCategory: product?.category,
          price: product?.price,
          userCompanySize: companySizeLabel,
        }),
      });
      if (!res.ok) throw new Error('bad status');
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  const steps = isProductFlow ? ['מטרה ומידע', 'פרטי קשר', 'אישור ושליחה'] : ['פרטי קשר', 'תחום עניין', 'פרטי הפרויקט'];

  const whatsappHref = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(
    `שלום, אשמח לשוחח לגבי ${product?.name ?? subjectContext ?? 'התאמת פתרון'}${form.name ? ` — ${form.name}` : ''}`
  )}`;

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-center items-end md:items-center px-4 md:px-0 pb-[calc(1rem+env(safe-area-inset-bottom))] md:pb-0">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={close}
            className="absolute inset-0 bg-black/90"
          />

          <motion.div
            initial={{ opacity: 0, y: 60, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 60, scale: 0.96 }}
            transition={{ type: 'spring', damping: 26, stiffness: 220 }}
            className="relative w-full max-w-lg max-h-[85dvh] md:max-h-[90dvh] flex flex-col bg-[#0b0c10] border border-white/15 shadow-[0_30px_80px_rgba(0,0,0,0.9)] rounded-3xl overflow-hidden"
          >
            {/* Header — branded logo banner (see ModalHeaderBanner) shared by every modal on the
                site, overlapped by the text block below via negative margin. */}
            <div className="relative bg-[#0D0E12] border-b border-white/10">
              <ModalHeaderBanner />

              <button
                onClick={close}
                className="absolute top-4 left-4 w-11 h-11 flex items-center justify-center bg-black/40 backdrop-blur-sm text-zinc-300 hover:text-white rounded-full hover:bg-black/60 transition-colors"
                aria-label="סגירה"
              >
                <X size={18} />
              </button>

              <div className="relative -mt-7 md:-mt-8 px-6 md:px-8 pb-4">
              <div className="flex items-center gap-2.5 mb-1 pl-14">
                <span className="w-2 h-2 rounded-full bg-brand-400 shadow-[0_0_8px_rgba(0,255,102,0.8)] shrink-0" aria-hidden="true" />
                {isProductFlow ? (
                  <h3 className="font-display font-black text-xl md:text-2xl text-white leading-snug">
                    אפיון וחיבור: <span className="text-brand-500">{product!.name}</span>
                  </h3>
                ) : (
                  <h3 className="font-display font-black text-2xl md:text-3xl text-white">
                    בואו <span className="text-brand-500">נתחיל.</span>
                  </h3>
                )}
              </div>

              {isProductFlow ? (
                status === 'idle' && (
                  <p className="text-sm text-zinc-400 mt-1">
                    {product!.tierLabel && <span className="text-brand-400 font-mono text-xs ml-1.5">{product!.tierLabel}</span>}
                    ₪{product!.price.toLocaleString('he-IL')}
                  </p>
                )
              ) : (
                subjectContext &&
                status === 'idle' && <p className="text-sm text-zinc-500 mt-2">בהמשך ל: {subjectContext}</p>
              )}

              {status === 'idle' && (
                <div className="flex items-center gap-2 mt-6">
                  {steps.map((s, idx) => (
                    <div key={s} className="flex-1">
                      <div className="h-1 rounded-full bg-white/10 overflow-hidden">
                        <motion.div
                          initial={false}
                          animate={{ scaleX: idx <= step ? 1 : 0 }}
                          transition={{ duration: 0.4, ease: 'easeOut' }}
                          className="h-full w-full origin-right bg-brand-500 shadow-[0_0_8px_rgba(0,255,102,0.6)]"
                        />
                      </div>
                      <span className={`text-xs mt-1.5 block ${idx <= step ? 'text-zinc-300' : 'text-zinc-500'}`}>
                        {s}
                      </span>
                    </div>
                  ))}
                </div>
              )}
              </div>
            </div>

            {/* Body — extra bottom padding on mobile keeps the last input/textarea clear of the
                virtual keyboard, on top of the sticky header/footer (outside this scroll area) and
                the dvh-capped card above already keeping both permanently visible. */}
            <div className="p-6 pb-10 md:p-8 overflow-y-auto flex-1 momentum-scroll">
              {status === 'sent' ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center text-center py-8"
                >
                  <motion.div
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ type: 'spring', stiffness: 260, damping: 15, delay: 0.1 }}
                    className="w-16 h-16 rounded-full bg-brand-500/15 border border-brand-500/40 flex items-center justify-center mb-5 shadow-[0_0_30px_rgba(0,255,102,0.25)]"
                  >
                    <Check className="w-8 h-8 text-brand-400" />
                  </motion.div>
                  <h4 className="font-display text-2xl font-bold text-white mb-2">קיבלתי. מדבר איתך בקרוב.</h4>
                  <p className="text-zinc-300 text-base leading-relaxed max-w-xs">
                    תודה {form.name.split(' ')[0]} — הפרטים אצלי. אחזור אליך למייל שהשארת, בדרך כלל תוך יום עסקים.
                  </p>
                  <WebButton variant="glass" onClick={close} className="mt-8">
                    סגירה
                  </WebButton>
                </motion.div>
              ) : (
                <AnimatePresence mode="wait">
                  {isProductFlow ? (
                    <>
                      {step === 0 && (
                        <motion.div
                          key="p-step0"
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-6"
                        >
                          <div>
                            <p className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3">מה המטרה העיקרית?</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              {GOALS.map((g) => (
                                <button
                                  key={g.id}
                                  type="button"
                                  onClick={() => setForm({ ...form, goal: g.id })}
                                  className={`flex items-center gap-3 p-3.5 rounded-2xl border text-right transition-all ${
                                    form.goal === g.id
                                      ? 'border-brand-400/60 bg-brand-500/10 shadow-[0_0_20px_rgba(0,255,102,0.15)]'
                                      : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                                  }`}
                                >
                                  <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${form.goal === g.id ? 'bg-brand-400/20 text-brand-300' : 'bg-white/5 text-zinc-400'}`}>
                                    <g.icon size={17} />
                                  </span>
                                  <span className="text-sm font-medium text-zinc-200">{g.label}</span>
                                </button>
                              ))}
                            </div>
                          </div>

                          <div>
                            <p className="text-sm font-bold uppercase tracking-wider text-zinc-400 mb-3 flex items-center gap-1.5">
                              <Building2 size={14} />
                              גודל הארגון
                            </p>
                            <div className="flex flex-wrap gap-2">
                              {COMPANY_SIZES.map((c) => (
                                <button
                                  key={c.id}
                                  type="button"
                                  onClick={() => setForm({ ...form, companySize: c.id })}
                                  className={`px-4 py-2 rounded-full border text-sm font-bold transition-colors ${
                                    form.companySize === c.id
                                      ? 'bg-brand-500 border-brand-500 text-black'
                                      : 'bg-white/[0.02] border-white/10 text-zinc-300 hover:border-brand-500/40'
                                  }`}
                                >
                                  {c.label}
                                </button>
                              ))}
                            </div>
                          </div>
                        </motion.div>
                      )}

                      {step === 1 && (
                        <motion.div
                          key="p-step1"
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-5"
                        >
                          <ContactFields form={form} setForm={setForm} />
                        </motion.div>
                      )}

                      {step === 2 && (
                        <motion.div
                          key="p-step2"
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-5"
                        >
                          <div className="bg-white/[0.03] border border-white/10 rounded-2xl p-4 space-y-2 text-sm">
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-500">סוכן / מוצר</span>
                              <span className="text-zinc-200 font-medium">{product!.name}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-500">מטרה עיקרית</span>
                              <span className="text-zinc-200 font-medium">{GOALS.find((g) => g.id === form.goal)?.label}</span>
                            </div>
                            <div className="flex items-center justify-between">
                              <span className="text-zinc-500">גודל ארגון</span>
                              <span className="text-zinc-200 font-medium">{COMPANY_SIZES.find((c) => c.id === form.companySize)?.label}</span>
                            </div>
                          </div>

                          <Field label="משהו נוסף שכדאי שנדע? (לא חובה)">
                            <textarea
                              value={form.message}
                              onChange={(e) => setForm({ ...form, message: e.target.value })}
                              onFocus={() => trackField('message', 'focus')}
                              placeholder="מערכות קיימות, לוחות זמנים, אילוצים מיוחדים..."
                              rows={3}
                              className="input-glow resize-none"
                            />
                          </Field>

                          <a
                            href={whatsappHref}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center justify-center gap-2 w-full py-3 rounded-xl border border-white/10 bg-white/[0.02] text-sm font-bold text-zinc-300 hover:border-brand-500/40 hover:text-white transition-colors"
                          >
                            <MessageCircle size={16} className="text-brand-400" />
                            מעדיפים לדבר ישירות? המשיכו ב-WhatsApp
                          </a>

                          {status === 'error' && (
                            <p className="text-xs text-red-400">
                              קרתה תקלה בשליחה. נסו שוב, או צרו קשר ישירות במייל daniel@mrdaniel.co.il.
                            </p>
                          )}
                        </motion.div>
                      )}
                    </>
                  ) : (
                    <>
                      {step === 0 && (
                        <motion.div
                          key="step0"
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-5"
                        >
                          <ContactFields form={form} setForm={setForm} autoFocusName />
                        </motion.div>
                      )}

                      {step === 1 && (
                        <motion.div
                          key="step1"
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          transition={{ duration: 0.25 }}
                          className="grid grid-cols-1 sm:grid-cols-2 gap-3"
                        >
                          {SERVICES.map((s) => (
                            <button
                              key={s.id}
                              onClick={() => setForm({ ...form, service: s.id })}
                              className={`flex items-center gap-3 p-4 rounded-2xl border text-right transition-all ${
                                form.service === s.id
                                  ? 'border-brand-400/60 bg-brand-500/10 shadow-[0_0_20px_rgba(0,255,102,0.15)]'
                                  : 'border-white/10 bg-white/[0.02] hover:border-white/25'
                              }`}
                            >
                              <span className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center ${form.service === s.id ? 'bg-brand-400/20 text-brand-300' : 'bg-white/5 text-zinc-400'}`}>
                                <s.icon size={17} />
                              </span>
                              <span className="text-base font-medium text-zinc-200">{s.label}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}

                      {step === 2 && (
                        <motion.div
                          key="step2"
                          initial={{ opacity: 0, x: -16 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 16 }}
                          transition={{ duration: 0.25 }}
                          className="space-y-5"
                        >
                          <Field label="ספרו לי בקצרה על הפרויקט (לא חובה)">
                            <textarea
                              value={form.message}
                              onChange={(e) => setForm({ ...form, message: e.target.value })}
                              onFocus={() => trackField('message', 'focus')}
                              placeholder="היקף, לוחות זמנים, אתגרים מיוחדים..."
                              rows={5}
                              className="input-glow resize-none"
                            />
                          </Field>
                          {status === 'error' && (
                            <p className="text-xs text-red-400">
                              קרתה תקלה בשליחה. נסו שוב, או צרו קשר ישירות במייל daniel@mrdaniel.co.il.
                            </p>
                          )}
                        </motion.div>
                      )}
                    </>
                  )}
                </AnimatePresence>
              )}
            </div>

            {/* Footer nav */}
            {status !== 'sent' && (
              <div className="p-6 md:p-8 pt-2 flex items-center justify-between gap-4 border-t border-white/10">
                {step > 0 ? (
                  <button
                    onClick={() => setStep((s) => s - 1)}
                    className="flex items-center gap-2 text-sm text-zinc-400 hover:text-white transition-colors font-medium"
                  >
                    <ArrowRight size={16} />
                    חזרה
                  </button>
                ) : (
                  <span />
                )}

                {step < 2 ? (
                  <WebButton variant="primary" disabled={!canProceed} onClick={() => setStep((s) => s + 1)}>
                    המשך
                    <ArrowLeft size={16} />
                  </WebButton>
                ) : (
                  <WebButton variant="primary" disabled={status === 'sending'} onClick={submit}>
                    {status === 'sending' ? 'שולח…' : 'שלחו — ואחזור אליכם'}
                  </WebButton>
                )}
              </div>
            )}
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

function ContactFields({
  form,
  setForm,
  autoFocusName,
}: {
  form: FormState;
  setForm: (f: FormState) => void;
  autoFocusName?: boolean;
}) {
  return (
    <>
      <Field label="שם מלא">
        <input
          autoFocus={autoFocusName}
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          onFocus={() => trackField('name', 'focus')}
          placeholder="השם שלך"
          className="input-glow"
        />
      </Field>
      <Field label="אימייל">
        <input
          type="email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
          onFocus={() => trackField('email', 'focus')}
          placeholder="you@company.com"
          dir="ltr"
          className="input-glow text-left"
        />
      </Field>
      <Field label="טלפון נייד">
        <input
          type="tel"
          value={form.phone}
          onChange={(e) => setForm({ ...form, phone: e.target.value })}
          onFocus={() => trackField('phone', 'focus')}
          placeholder="050-1234567"
          dir="ltr"
          className="input-glow text-left"
        />
      </Field>
    </>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-bold uppercase tracking-wider text-zinc-400 mb-2">{label}</span>
      {children}
    </label>
  );
}
