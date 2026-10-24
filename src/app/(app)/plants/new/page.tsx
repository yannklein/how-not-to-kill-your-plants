import { asc, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { group, spot } from "@/db/schema";
import { visibleGroupIds } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { AddPlantForm } from "./add-plant-form";

export default async function NewPlantPage() {
  const [user, t] = await Promise.all([requireUser(), getTranslations("addPlant")]);
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
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <AddPlantForm groups={groups} spots={spots} />
    </main>
  );
}
