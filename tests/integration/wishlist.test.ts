import { beforeEach, describe, expect, it } from "vitest";
import { user, wishlistItem } from "@/db/schema";
import type { DiscoverCard } from "@/lib/discover/types";
import { consumeWish, listWishes, removeWish, saveWish, wishForUser } from "@/lib/discover/wishlist";
import { db, resetDb } from "./setup";

const NOT_FOUND = { digest: "NEXT_HTTP_ERROR_FALLBACK;404" };
const calathea: DiscoverCard = {
  scientificName: "Calathea orbifolia", commonName: "Calathea", whyItFits: "Loves bright shade.", ease: "Medium",
  goesWith: "Pairs with your Ficus.", benefits: "Humidity.", safety: "Pet-safe.", harvest: null,
};

describe("wishlist", () => {
  const [Y, M] = ["u-y", "u-m"];

  beforeEach(async () => {
    await resetDb();
    await db.insert(user).values([
      { id: Y, name: "Yann", email: "y@example.com" },
      { id: M, name: "Marcela", email: "m@example.com" },
    ]);
  });

  it("saves a suggestion once, with its full card", async () => {
    const a = await saveWish(Y, calathea);
    const b = await saveWish(Y, calathea);
    expect(b).toBe(a);
    const wishes = await listWishes(Y);
    expect(wishes).toHaveLength(1);
    expect(wishes[0].card).toEqual(calathea);
    expect(await wishForUser(Y, a)).toMatchObject({ scientificName: "Calathea orbifolia", commonName: "Calathea" });
  });

  it("is personal: others can't see, remove or use it", async () => {
    const id = await saveWish(Y, calathea);
    expect(await listWishes(M)).toHaveLength(0);
    expect(await wishForUser(M, id)).toBeNull();
    await expect(removeWish(M, id)).rejects.toMatchObject(NOT_FOUND);
    await consumeWish(M, id);
    expect(await db.select().from(wishlistItem)).toHaveLength(1);
  });

  it("is removed when its owner buys it or removes it", async () => {
    const id = await saveWish(Y, calathea);
    await consumeWish(Y, id);
    expect(await listWishes(Y)).toHaveLength(0);
    const again = await saveWish(Y, calathea);
    await removeWish(Y, again);
    expect(await listWishes(Y)).toHaveLength(0);
  });
});
