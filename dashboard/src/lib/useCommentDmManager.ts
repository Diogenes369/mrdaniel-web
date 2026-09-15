import { useCallback, useEffect, useMemo, useState } from 'react';
import { onValue, ref, push, set, remove, query as dbQuery, limitToLast } from 'firebase/database';
import { db } from '../firebase';

// Config/authoring layer for the Instagram Comment-to-DM flow. The automation itself (comment
// detection, auto-reply, DM dispatch) runs in ManyChat — see api/leads.ts's `manychat-lead`
// handler, which already receives {subscriberId, igUsername, keyword, guideId} from a ManyChat
// External Request and stores the lead. This hook does not talk to Meta or ManyChat; it gives
// Daniel one place to author campaigns (keyword ↔ guide ↔ post ↔ DM copy) and see how each one is
// performing, reading the same `leads` node the ManyChat webhook already writes to.

export interface CommentDmCampaign {
  id: string;
  label: string;
  keyword: string;
  guideSlug: string;
  postUrl: string;
  publicReplyTemplate: string;
  dmTemplate: string;
  active: boolean;
  createdAt: number;
  updatedAt: number;
}

export type CommentDmCampaignDraft = Omit<CommentDmCampaign, 'id' | 'createdAt' | 'updatedAt'>;

const DEFAULT_PUBLIC_REPLY = 'שלחתי לך 📩 תבדוק/י DM!';
const DEFAULT_DM_TEMPLATE = 'היי {{first_name}} 👋\nהנה המדריך שביקשת: {{guide_link}}\n\nאם יש שאלות — אני כאן.';

export const NEW_CAMPAIGN_DRAFT: CommentDmCampaignDraft = {
  label: '',
  keyword: '',
  guideSlug: '',
  postUrl: '',
  publicReplyTemplate: DEFAULT_PUBLIC_REPLY,
  dmTemplate: DEFAULT_DM_TEMPLATE,
  active: true,
};

/** Merge tags a template may reference. Purely descriptive here — ManyChat resolves them when the
 *  flow actually sends the reply/DM; this panel only authors and copies the text. */
export const DM_MERGE_TAGS = ['{{first_name}}', '{{ig_username}}', '{{guide_title}}', '{{guide_link}}'] as const;

export interface CampaignStats {
  keyword: string;
  leadCount: number;
  lastTs: number;
}

interface LeadRow {
  keyword?: string;
  source?: string;
  ts?: number;
  lastTs?: number;
}

function toCampaigns(raw: unknown): CommentDmCampaign[] {
  if (!raw || typeof raw !== 'object') return [];
  return Object.entries(raw as Record<string, Omit<CommentDmCampaign, 'id'>>)
    .map(([id, c]) => ({
      id,
      label: c.label ?? '',
      keyword: c.keyword ?? '',
      guideSlug: c.guideSlug ?? '',
      postUrl: c.postUrl ?? '',
      publicReplyTemplate: c.publicReplyTemplate ?? DEFAULT_PUBLIC_REPLY,
      dmTemplate: c.dmTemplate ?? DEFAULT_DM_TEMPLATE,
      active: c.active !== false,
      createdAt: c.createdAt ?? 0,
      updatedAt: c.updatedAt ?? 0,
    }))
    .sort((a, b) => (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt));
}

/** Per-keyword lead counts from the `leads` node, restricted to ManyChat-sourced rows — the same
 *  data the Leads tab already shows, just grouped by trigger keyword for this panel. */
function statsByKeyword(raw: unknown): Map<string, CampaignStats> {
  const out = new Map<string, CampaignStats>();
  if (!raw || typeof raw !== 'object') return out;
  for (const row of Object.values(raw as Record<string, LeadRow>)) {
    if (row?.source !== 'manychat') continue;
    const keyword = (row.keyword ?? '').trim().toLowerCase();
    if (!keyword) continue;
    const ts = row.lastTs ?? row.ts ?? 0;
    const existing = out.get(keyword);
    if (existing) {
      existing.leadCount += 1;
      existing.lastTs = Math.max(existing.lastTs, ts);
    } else {
      out.set(keyword, { keyword, leadCount: 1, lastTs: ts });
    }
  }
  return out;
}

export function useCommentDmManager() {
  const [campaigns, setCampaigns] = useState<CommentDmCampaign[]>([]);
  const [stats, setStats] = useState<Map<string, CampaignStats>>(new Map());
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!db) {
      setLoaded(true);
      return;
    }
    const offs = [
      onValue(ref(db, 'comment_dm_campaigns'), (snap) => {
        setCampaigns(toCampaigns(snap.val()));
        setLoaded(true);
      }),
      onValue(dbQuery(ref(db, 'leads'), limitToLast(1000)), (snap) => setStats(statsByKeyword(snap.val()))),
    ];
    return () => offs.forEach((o) => o());
  }, []);

  const statsFor = useCallback(
    (keyword: string): CampaignStats | null => stats.get(keyword.trim().toLowerCase()) ?? null,
    [stats]
  );

  const saveCampaign = useCallback((draft: CommentDmCampaignDraft, id?: string) => {
    if (!db) return;
    const now = Date.now();
    if (id) {
      set(ref(db, `comment_dm_campaigns/${id}`), { ...draft, createdAt: campaigns.find((c) => c.id === id)?.createdAt ?? now, updatedAt: now }).catch(
        (e) => console.error('[comment-dm] save campaign failed:', e)
      );
    } else {
      push(ref(db, 'comment_dm_campaigns'), { ...draft, createdAt: now, updatedAt: now }).catch((e) =>
        console.error('[comment-dm] create campaign failed:', e)
      );
    }
  }, [campaigns]);

  const deleteCampaign = useCallback((id: string) => {
    if (!db) return;
    remove(ref(db, `comment_dm_campaigns/${id}`)).catch((e) => console.error('[comment-dm] delete campaign failed:', e));
  }, []);

  const toggleActive = useCallback((campaign: CommentDmCampaign) => {
    if (!db) return;
    set(ref(db, `comment_dm_campaigns/${campaign.id}`), { ...campaign, active: !campaign.active, updatedAt: Date.now() }).catch((e) =>
      console.error('[comment-dm] toggle campaign failed:', e)
    );
  }, []);

  const totalLeads = useMemo(() => [...stats.values()].reduce((sum, s) => sum + s.leadCount, 0), [stats]);

  return { campaigns, loaded, statsFor, totalLeads, saveCampaign, deleteCampaign, toggleActive };
}
