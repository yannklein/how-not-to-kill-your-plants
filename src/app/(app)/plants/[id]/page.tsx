import { getPlantForUser } from "@/lib/access";
import { requireUser } from "@/lib/session";

// Minimal placeholder so the add-plant flow has somewhere to land; Task 11 replaces it.
export default async function PlantPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }] = await Promise.all([requireUser(), params]);
  const plant = await getPlantForUser(user.id, id);
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{plant.name}</h1>
    </main>
  );
}
