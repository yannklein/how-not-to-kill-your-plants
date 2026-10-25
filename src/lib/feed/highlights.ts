import { BIG_POST_TYPES, type PostType } from "./types";

export const HIGHLIGHT_DAYS = 3;
export const HIGHLIGHT_MAX = 5;
export const HIGHLIGHT_FALLBACK = 3;

const byNewest = (a: { createdAt: Date }, b: { createdAt: Date }) => b.createdAt.getTime() - a.createdAt.getTime();

/**
 * Recent posts, big moments first, then newest. With nothing recent, the
 * latest few whatever their age, so the section stays alive.
 */
export function pickHighlights<T extends { type: PostType | "tip"; createdAt: Date }>(posts: T[], now: Date): T[] {
  const since = now.getTime() - HIGHLIGHT_DAYS * 24 * 3600_000;
  const recent = posts.filter((p) => p.createdAt.getTime() >= since);
  if (recent.length === 0) return [...posts].sort(byNewest).slice(0, HIGHLIGHT_FALLBACK);
  // Big plant moments first, then the gardener's tips, then routine posts.
  const tier = (p: T) => (p.type === "tip" ? 1 : BIG_POST_TYPES.has(p.type) ? 0 : 2);
  return [...recent].sort((a, b) => tier(a) - tier(b) || byNewest(a, b)).slice(0, HIGHLIGHT_MAX);
}
