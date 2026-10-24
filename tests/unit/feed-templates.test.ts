import { describe, expect, it } from "vitest";
import { renderPostText } from "@/lib/feed/text";
import type { PostPayload } from "@/lib/feed/types";

const thanks: PostPayload = { type: "thanks", mood: "happy", userId: "u-m", userName: "Marcela", taskType: "water" };

describe("renderPostText", () => {
  it("falls back to the template in the reader's language", () => {
    const fr = renderPostText({ type: "thanks", payload: thanks, plantName: "Pachira" }, "fr", null);
    expect(fr).toContain("Marcela");
    expect(fr).not.toBe(renderPostText({ type: "thanks", payload: thanks, plantName: "Pachira" }, "en", null));
  });

  it("returns the stored plant-voice text unchanged", () => {
    expect(renderPostText({ type: "thanks", payload: thanks, plantName: "Pachira" }, "en", "No notes 💧")).toBe(
      "No notes 💧",
    );
  });

  it("has a template for every post type", () => {
    const payloads: PostPayload[] = [
      thanks,
      { type: "moment", mood: "proud", momentId: "m", momentType: "flower", photoId: null, userName: "Yann", firstFlower: true },
      { type: "photo", mood: "happy", photoId: "p", userName: "Adriana", previousPhotoAt: null },
      { type: "birthday", mood: "happy", kind: "month", years: 0 },
      { type: "birthday", mood: "happy", kind: "year", years: 2 },
      { type: "mood", mood: "sulking", from: "needy", to: "sulking" },
      { type: "season", mood: "sleepy", season: "autumn", growing: false },
      { type: "first", mood: "happy", userName: "Yann" },
    ];
    for (const locale of ["en", "fr", "pt-BR"] as const)
      for (const payload of payloads) {
        const text = renderPostText({ type: payload.type, payload, plantName: "Pilea" }, locale, null);
        expect(text.trim(), `${locale}:${payload.type}`).not.toBe("");
        expect(text, `${locale}:${payload.type}`).not.toMatch(/feed\./);
      }
  });
});
