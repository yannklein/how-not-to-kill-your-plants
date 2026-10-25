import { describe, expect, it } from "vitest";
import { pickHighlights } from "@/lib/feed/highlights";
import type { PostType } from "@/lib/feed/types";

const now = new Date("2026-11-10T12:00:00Z");
const ago = (hours: number) => new Date(now.getTime() - hours * 3600_000);
const post = (id: string, type: PostType, hoursAgo: number) => ({ id, type, createdAt: ago(hoursAgo) });

describe("pickHighlights", () => {
  it("keeps the last 3 days, big moments first", () => {
    const r = pickHighlights([post("t", "thanks", 1), post("m", "moment", 48), post("p", "photo", 120)], now);
    expect(r.map((p) => p.id)).toEqual(["m", "t"]);
  });
  it("caps at 5, big moments first then recency", () => {
    const posts = [
      post("t1", "thanks", 1), post("t2", "thanks", 2), post("s", "season", 3), post("mo", "mood", 4),
      post("b", "birthday", 10), post("f", "first", 20), post("p", "photo", 5),
    ];
    expect(pickHighlights(posts, now).map((p) => p.id)).toEqual(["p", "b", "f", "t1", "t2"]);
  });
  it("falls back to the latest 3 when nothing is recent", () => {
    const posts = [post("a", "thanks", 240), post("b", "moment", 480), post("c", "photo", 300), post("d", "mood", 600)];
    expect(pickHighlights(posts, now).map((p) => p.id)).toEqual(["a", "c", "b"]);
  });
  it("returns nothing for no posts", () => {
    expect(pickHighlights([], now)).toEqual([]);
  });
});

describe("pickHighlights with tips", () => {
  it("ranks big plant moments first, then tips, then routine posts", () => {
    const posts = [post("t", "thanks", 1), { id: "tip", type: "tip" as const, createdAt: ago(2) }, post("m", "moment", 3)];
    expect(pickHighlights(posts, now).map((p) => p.id)).toEqual(["m", "tip", "t"]);
  });
});
