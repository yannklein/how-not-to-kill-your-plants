import { asc, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { group, spot } from "@/db/schema";
import { getPlantForUser, visibleGroupIds } from "@/lib/access";
import { requireUser } from "@/lib/session";
import { EditPlantForm } from "./edit-plant-form";

export default async function EditPlantPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }, t] = await Promise.all([requireUser(), params, getTranslations("plants")]);
  const plant = await getPlantForUser(user.id, id);
  const groupIds = await visibleGroupIds(user.id);
  const [groups, spots] = await Promise.all([
    db
      .select({ id: group.id, name: group.name })
      .from(group)
      .where(inArray(group.id, groupIds))
      .orderBy(asc(group.createdAt), asc(group.name)),
    db.select({ id: spot.id, name: spot.name }).from(spot).orderBy(asc(spot.name)),
  ]);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="font-heading text-3xl leading-tight text-balance">{t("editTitle")}</h1>
      <EditPlantForm
        plantId={plant.id}
        groups={groups}
        spots={spots}
        initial={{
          name: plant.name,
          groupId: plant.groupId,
          spotId: plant.spotId ?? "",
          status: plant.status,
          waterIntervalOverrideDays: plant.waterIntervalOverrideDays?.toString() ?? "",
          potSizeCm: plant.potSizeCm?.toString() ?? "",
          personaSummary: plant.persona?.summary ?? "",
          personaTraits: plant.persona?.traits.join(", ") ?? "",
        }}
      />
    </main>
  );
}
