"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PlantInputError, updatePlant } from "@/lib/plants/update";
import { requireUser } from "@/lib/session";

export type EditState = { error: boolean };

function intOrNull(v: FormDataEntryValue | null): number | null {
  const s = typeof v === "string" ? v.trim() : "";
  return s === "" ? null : Number(s);
}

export async function updatePlantAction(
  plantId: string,
  _prev: EditState,
  form: FormData,
): Promise<EditState> {
  const user = await requireUser();
  const spotId = String(form.get("spotId") ?? "");
  try {
    await updatePlant(user.id, plantId, {
      name: String(form.get("name") ?? ""),
      groupId: String(form.get("groupId") ?? ""),
      spotId: spotId === "" ? null : spotId,
      status: String(form.get("status") ?? ""),
      waterIntervalOverrideDays: intOrNull(form.get("waterIntervalOverrideDays")),
      potSizeCm: intOrNull(form.get("potSizeCm")),
    });
  } catch (error) {
    if (error instanceof PlantInputError) return { error: true };
    throw error;
  }
  revalidatePath("/");
  revalidatePath("/plants");
  revalidatePath(`/plants/${plantId}`);
  redirect(`/plants/${plantId}`);
}
