import { asc, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { group, spot } from "@/db/schema";
import { visibleGroupIds } from "@/lib/access";
import { wishForUser } from "@/lib/discover/wishlist";
import { requireUser } from "@/lib/session";
import { AddPlantForm } from "./add-plant-form";

export default async function NewPlantPage({ searchParams }: { searchParams: Promise<{ wish?: string }> }) {
  const [user, t, { wish }] = await Promise.all([requireUser(), getTranslations("addPlant"), searchParams]);
  const fromWish = wish ? await wishForUser(user.id, wish) : null;
  const groupIds = await visibleGroupIds(user.id);
  const [groups, spots] = await Promise.all([
    groupIds.length
      ? db
          .select({ id: group.id, name: group.name })
          .from(group)
          .where(inArray(group.id, groupIds))
          .orderBy(asc(group.createdAt), asc(group.name))
      : [],
    db.select({ id: spot.id, name: spot.name }).from(spot).orderBy(asc(spot.name)),
  ]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="font-heading text-3xl leading-tight text-balance">{t("title")}</h1>
      <AddPlantForm
        groups={groups}
        spots={spots}
        prefill={fromWish ? { scientificName: fromWish.scientificName, wishId: fromWish.id } : null}
      />
    </main>
  );
}
