import { Link } from 'react-router-dom';
import { ArrowLeft, ChevronLeft } from 'lucide-react';
import Depth from './Depth';
import GlyphButton from '../ui/GlyphButton';
import { STORY_COPY } from '../../data/siteCopy';
import { CREATOR_GUIDES } from '../../data/creatorContent';
import { rtl } from '../../lib/rtl';
import { useFieldBeat, useFieldQuiet } from '../field/fieldState';

const GUIDE_SLUG = 'ai-learning-guide-2026';
// The real file behind /g/ai-learning-guide-2026 (public/guides/ai-learning-guide-2026.pdf, 1,184,816 bytes).
const GUIDE_META = 'PDF · 1.2MB';

/**
 * Last beat: the story's one action. The free beginner guide is real (the PDF already ships), so
 * the card shows it as what it is — a file, with its real name and size — and the button goes to
 * the guide's own download page. The field behind settles to a quiet lattice here.
 */
export default function StartBeat() {
  const c = STORY_COPY.start;
  const beat = useFieldBeat('start');
  const quietText = useFieldQuiet();
  const quietCard = useFieldQuiet();
  const guide = CREATOR_GUIDES.find((g) => g.slug === GUIDE_SLUG);

  return (
    <section id="start" ref={beat} className="story-beat story-beat--last">
      <div className="container-wide">
        <div className="grid grid-cols-1 items-end gap-12 lg:grid-cols-12">
          <Depth speed={0.05} className="lg:col-span-6">
            <div ref={quietText}>
              <h2 className="story-h2">{rtl(c.title)}</h2>
              <p className="story-body mt-6">{rtl(c.body)}</p>
            </div>
          </Depth>

          <Depth speed={0.12} className="lg:col-span-5 lg:col-start-8">
            <article ref={quietCard} className="glyph-frame file-card">
              <header className="flex items-center justify-between gap-3 border-b border-dotted border-[var(--color-rule)] px-5 py-3 text-[12px] text-ink-faint">
                <bdi dir="ltr" className="truncate font-type">{GUIDE_SLUG}.pdf</bdi>
                <bdi dir="ltr" className="shrink-0 font-type">{GUIDE_META}</bdi>
              </header>
              <div className="px-5 pb-6 pt-5">
                <h3 className="poster text-[2rem] leading-tight text-ink-paper">{rtl(guide?.title ?? '')}</h3>
                <p className="story-body mt-3 !text-[15px]">{rtl(guide?.blurb ?? '')}</p>
                <div className="mt-7 flex flex-wrap items-center gap-x-6 gap-y-4">
                  <GlyphButton to={`/g/${GUIDE_SLUG}`}>
                    {rtl(c.cta)}
                    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  </GlyphButton>
                  <Link to="/magazines" className="story-link text-[14px]">
                    {rtl(c.more)}
                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              </div>
            </article>
          </Depth>
        </div>
      </div>
    </section>
  );
}
