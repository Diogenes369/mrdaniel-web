import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowRight, ExternalLink, Clock, Copy, Check, MessageCircle } from 'lucide-react';
import WebButton from '../components/WebButton';
import { useNewsArticle, formatRelativeTime } from '../services/newsService';

export default function NewsArticlePage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data: item, isLoading, isError } = useNewsArticle(slug);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const t = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(t);
  }, [copied]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
    } catch {
      // clipboard API unavailable — user can still copy manually from the address bar
    }
  };

  if (isLoading) {
    return (
      <div id="page-top" className="min-h-screen pt-24 md:pt-28">
        <div className="container mx-auto px-6 max-w-3xl animate-pulse space-y-5">
          <div className="h-5 w-28 bg-white/5 rounded-full" />
          <div className="h-9 w-full bg-white/5 rounded-xl" />
          <div className="h-9 w-2/3 bg-white/5 rounded-xl" />
          <div className="h-48 w-full bg-white/5 rounded-2xl mt-6" />
        </div>
      </div>
    );
  }

  if (isError || !item) {
    return (
      <div id="page-top" className="min-h-screen pt-24 md:pt-28 flex items-center justify-center px-6">
        <div className="text-center max-w-md">
          <h1 className="font-display text-3xl font-black text-white mb-4">הכתבה לא נמצאה</h1>
          <p className="text-zinc-400 mb-8 leading-relaxed">
            ייתכן שהכתבה כבר לא זמינה בפיד המקורי, או שהקישור פג תוקף.
          </p>
          <WebButton variant="glass" onClick={() => navigate('/news')}>
            <ArrowRight className="w-4 h-4" />
            חזרה לחדשות
          </WebButton>
        </div>
      </div>
    );
  }

  return (
    <div id="page-top" className="min-h-screen pt-24 md:pt-28 pb-24">
      <div className="container mx-auto px-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <button
            onClick={() => navigate('/news')}
            className="group inline-flex items-center gap-2 text-sm font-medium text-zinc-400 hover:text-brand-400 transition-colors mb-8"
          >
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            חזרה לחדשות
          </button>

          <div className="flex items-center gap-3 flex-wrap mb-5">
            <span className="px-3 py-1 text-xs font-mono font-bold tracking-widest border border-brand-500/30 bg-brand-500/10 rounded-full text-brand-400">
              {item.source}
            </span>
            <span className="px-3 py-1 text-xs font-mono font-bold tracking-widest border border-white/10 rounded-full text-zinc-400">
              {item.category}
            </span>
            <span className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Clock className="w-3.5 h-3.5" />
              {formatRelativeTime(item.publishedAt)}
            </span>
          </div>

          <h1 dir="auto" className="font-display font-black text-3xl md:text-5xl leading-[1.15] text-white mb-8">
            {item.title}
          </h1>

          <div className="flex items-center gap-3 pb-8 mb-8 border-b border-white/10">
            <span className="text-xs font-bold text-zinc-500">שיתוף:</span>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(`${item.title} ${window.location.href}`)}`}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="שיתוף בוואטסאפ"
              title="שיתוף בוואטסאפ"
              className="w-10 h-10 flex items-center justify-center rounded-full border border-white/15 text-zinc-400 hover:border-brand-400/50 hover:text-brand-300 transition-colors"
            >
              <MessageCircle className="w-4 h-4" />
            </a>
            <button
              onClick={handleCopyLink}
              aria-label="העתקת קישור לכתבה"
              title="העתקת קישור"
              className="w-10 h-10 flex items-center justify-center rounded-full border border-white/15 text-zinc-400 hover:border-brand-400/50 hover:text-brand-300 transition-colors"
            >
              {copied ? <Check className="w-4 h-4 text-brand-400" /> : <Copy className="w-4 h-4" />}
            </button>
          </div>

          <div className="relative overflow-hidden bg-[#0D0E12] border border-white/10 rounded-2xl p-6 md:p-10 mb-10">
            <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" aria-hidden="true" />
            <p dir="auto" className="relative text-zinc-300 text-lg leading-[1.9]">
              {item.summary}
            </p>
          </div>

          <WebButton
            variant="primary"
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full sm:w-auto justify-center"
          >
            <ExternalLink className="w-4 h-4" />
            {`לכתבה המקורית ב-${item.source}`}
          </WebButton>
        </motion.div>
      </div>
    </div>
  );
}
