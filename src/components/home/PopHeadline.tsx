import type { ReactNode } from 'react';

interface PopHeadlineProps {
  lead: ReactNode;
  accent?: ReactNode;
  className?: string;
}

/**
 * Section heading for the homepage's pillar sections (rewritten 2026-10-01 for the glyph world).
 * The h2 takes the site-wide headline face; the accent phrase is the one green line. Underneath, a
 * dotted rule with a typing caret replaces the old glowing gradient underline. The entrance — lines
 * rising out of a mask, the section tilting up out of depth — is the desktop scene layer's job
 * (src/lib/sceneMotion.ts), so this component stays static and readable everywhere else.
 */
export default function PopHeadline({ lead, accent, className = 'mb-7 md:mb-9' }: PopHeadlineProps) {
  return (
    <div className={className}>
      <h2 className="story-h2">
        {lead}
        {accent != null && (
          <>
            {' '}
            <span className="text-brand-400">{accent}</span>
          </>
        )}
      </h2>
      <div className="mt-5 flex items-center gap-2" aria-hidden="true">
        <span className="story-statusbar__live" />
        <span className="h-px w-24 border-t border-dotted border-[var(--color-rule)]" />
      </div>
    </div>
  );
}
