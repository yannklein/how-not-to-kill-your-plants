import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { spot } from "@/db/schema";
import { discoverPaused, lastSearch } from "@/lib/discover/search";
import { listWishes } from "@/lib/discover/wishlist";
import { requireUser } from "@/lib/session";
import { DiscoverForm } from "./discover-form";

export default async function DiscoverPage() {
  const [user, t] = await Promise.all([requireUser(), getTranslations("discover")]);
  const [spots, last, wishes, paused] = await Promise.all([
    db.select({ id: spot.id, name: spot.name }).from(spot).orderBy(asc(spot.name)),
    lastSearch(user.id),
    listWishes(user.id),
    discoverPaused(),
  ]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="font-heading text-3xl leading-tight text-balance">🔍 {t("title")}</h1>
      <DiscoverForm
        spots={spots}
        last={last ? { input: last.input, cards: last.cards } : null}
        savedNames={wishes.map((w) => w.card.scientificName)}
        paused={paused}
      />
    </main>
  );
}
