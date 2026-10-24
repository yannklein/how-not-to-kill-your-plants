import { eq } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { db } from "@/db/client";
import { home, species } from "@/db/schema";
import { getPlantForUser } from "@/lib/access";
import { CareProfile } from "@/lib/ai/schemas";
import { isGrowing, seasonOf } from "@/lib/care/season";
import { speciesLabel } from "@/lib/plants/display";
import { requireUser } from "@/lib/session";
import { coverUrls, upcomingTasksForPlant } from "@/lib/tasks/queries";
import { todayIn } from "@/lib/time";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-1">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {children}
    </section>
  );
}

export default async function PlantPage({ params }: { params: Promise<{ id: string }> }) {
  const [user, { id }, t, tc, format] = await Promise.all([
    requireUser(),
    params,
    getTranslations("plants"),
    getTranslations("care"),
    getFormatter(),
  ]);
  const plant = await getPlantForUser(user.id, id);
  const [[homeRow], [sp], upcoming, covers] = await Promise.all([
    db.select().from(home).limit(1),
    plant.speciesId ? db.select().from(species).where(eq(species.id, plant.speciesId)) : [],
    upcomingTasksForPlant(plant.id),
    coverUrls([plant]),
  ]);
  const cover = covers.get(plant.id);
  const today = todayIn(homeRow?.timezone ?? "Europe/Madrid");
  const growing = isGrowing(seasonOf(today, homeRow?.hemisphere ?? "N"));
  const parsed = sp?.careProfileStatus === "ready" ? CareProfile.safeParse(sp.careProfile) : null;
  const profile = parsed?.success ? parsed.data : null;
  const text = profile?.text[user.locale];
  const range = profile?.waterIntervalDays[growing ? "growing" : "dormant"];
  const dayLabel = (day: string) =>
    format.dateTime(new Date(`${day}T00:00:00Z`), { dateStyle: "medium", timeZone: "UTC" });

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <div className="aspect-[4/3] w-full overflow-hidden rounded-xl bg-muted">
        {cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cover} alt={plant.name} className="size-full object-cover" />
        ) : null}
      </div>

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{plant.name}</h1>
          {sp ? <p className="text-sm text-muted-foreground">{speciesLabel(sp, user.locale)}</p> : null}
        </div>
        <Link
          href={`/plants/${plant.id}/edit`}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 shrink-0 px-4")}
        >
          {t("edit")}
        </Link>
      </div>

      {sp?.careProfileStatus === "pending" ? (
        <p className="w-fit rounded-full bg-muted px-3 py-1 text-xs font-medium">{t("profilePending")}</p>
      ) : null}

      {profile && text ? (
        <div className="flex flex-col gap-4">
          <p>{text.summary}</p>
          <Section title={t("light")}>
            <p>{t(`lightLevels.${profile.light}`)}</p>
          </Section>
          <Section title={t("watering")}>
            <p>
              {plant.waterIntervalOverrideDays
                ? t("wateringOverride", { days: plant.waterIntervalOverrideDays })
                : t("wateringRange", { min: range!.min, max: range!.max })}
            </p>
          </Section>
          <Section title={t("soil")}>
            <p>{text.soilMix}</p>
          </Section>
          <Section title={t("fertilizers")}>
            <ul className="list-disc pl-5">
              {text.organicFertilizers.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </Section>
          <Section title={t("toxicity")}>
            <p>{text.toxicity}</p>
          </Section>
        </div>
      ) : null}

      <Section title={t("upcoming")}>
        {upcoming.length === 0 ? (
          <p className="text-muted-foreground">{t("noUpcoming")}</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {upcoming.map((task) => (
              <li key={task.id} className="flex justify-between gap-3">
                <span>{tc(`type.${task.type}`)}</span>
                <span className={task.dueOn < today ? "text-destructive" : "text-muted-foreground"}>
                  {dayLabel(task.dueOn)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </main>
  );
}
