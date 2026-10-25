import { inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { db } from "@/db/client";
import { species } from "@/db/schema";
import { listPlantsForUser } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { speciesLabel } from "@/lib/plants/display";
import { coverUrls } from "@/lib/tasks/queries";
import { currentMoods } from "@/lib/feed/queries";
import { PlantAvatar } from "@/components/plant-avatar";

export default async function PlantsPage() {
  const [user, t, tf] = await Promise.all([requireUser(), getTranslations("plants"), getTranslations("feed")]);
  const plants = (await listPlantsForUser(user.id)).sort((a, b) => a.name.localeCompare(b.name));
  const speciesIds = [...new Set(plants.flatMap((p) => (p.speciesId ? [p.speciesId] : [])))];
  const [speciesRows, covers, moods] = await Promise.all([
    speciesIds.length ? db.select().from(species).where(inArray(species.id, speciesIds)) : [],
    coverUrls(plants),
    currentMoods(plants.map((p) => p.id)),
  ]);
  const speciesById = new Map(speciesRows.map((s) => [s.id, s]));

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="font-heading text-3xl leading-tight text-balance">{t("title")}</h1>
      {plants.length === 0 ? (
        <p className="rounded-3xl border-[1.5px] border-dashed border-border p-5 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {plants.map((p) => {
            const sp = p.speciesId ? speciesById.get(p.speciesId) : undefined;
            const cover = covers.get(p.id);
            return (
              <li key={p.id}>
                <Link
                  href={`/plants/${p.id}`}
                  className="flex items-center gap-3 rounded-3xl border-[1.5px] bg-card p-4"
                >
                  <PlantAvatar
                    coverUrl={cover ?? null}
                    mood={moods.get(p.id) ?? "happy"}
                    moodLabel={tf(`mood.${moods.get(p.id) ?? "happy"}`)}
                  />
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.name}</p>
                    {sp ? (
                      <p className="truncate text-sm text-muted-foreground">{speciesLabel(sp, user.locale)}</p>
                    ) : null}
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </main>
  );
}
