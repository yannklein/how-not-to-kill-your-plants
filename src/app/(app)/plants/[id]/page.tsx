import { eq } from "drizzle-orm";
import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { db } from "@/db/client";
import { home, species } from "@/db/schema";
import { getPlantForUser } from "@/lib/access";
import { CareProfile } from "@/lib/ai/schemas";
import { isGrowing, seasonOf } from "@/lib/care/season";
import { currentMoods, recentMoments } from "@/lib/feed/queries";
import { speciesLabel } from "@/lib/plants/display";
import { plantTimeline } from "@/lib/plants/photos";
import { requireUser } from "@/lib/session";
import { coverUrls, upcomingTasksForPlant } from "@/lib/tasks/queries";
import { todayIn } from "@/lib/time";
import { PhotoCapture } from "@/components/photo-capture";
import { PhotoTimeline } from "@/components/photo-timeline";
import { PlantAvatar } from "@/components/plant-avatar";
import { PlantMoments } from "@/components/plant-moments";
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
  const [user, { id }, t, tc, tf, tg, format] = await Promise.all([
    requireUser(),
    params,
    getTranslations("plants"),
    getTranslations("care"),
    getTranslations("feed"),
    getTranslations("gardener"),
    getFormatter(),
  ]);
  const plant = await getPlantForUser(user.id, id);
  const [[homeRow], [sp], upcoming, covers, moods, moments, timeline] = await Promise.all([
    db.select().from(home).limit(1),
    plant.speciesId ? db.select().from(species).where(eq(species.id, plant.speciesId)) : [],
    upcomingTasksForPlant(plant.id),
    coverUrls([plant]),
    currentMoods([plant.id]),
    recentMoments(plant.id),
    plantTimeline(plant.id),
  ]);
  const mood = moods.get(plant.id) ?? "happy";
  const now = new Date();
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
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-4">
          <PlantAvatar coverUrl={cover ?? null} mood={mood} moodLabel={tf(`mood.${mood}`)} size="lg" />
          <div className="min-w-0">
            <h1 className="text-xl font-semibold">{plant.name}</h1>
            {sp ? <p className="text-sm text-muted-foreground">{speciesLabel(sp, user.locale)}</p> : null}
            <p className="text-sm">{tf(`mood.${mood}`)}</p>
          </div>
        </div>
        <Link
          href={`/plants/${plant.id}/edit`}
          className={cn(buttonVariants({ variant: "outline" }), "h-10 shrink-0 px-4")}
        >
          {t("edit")}
        </Link>
      </div>

      {plant.persona?.summary ? <p className="text-sm italic text-muted-foreground">{plant.persona.summary}</p> : null}

      <div className="flex flex-col gap-2">
        <PhotoCapture plantId={plant.id} label={t("addPhoto")} variant="outline" />
        <Link
          href={`/gardener?plant=${plant.id}`}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 text-base")}
        >
          {tg("askAbout")}
        </Link>
      </div>
      <PlantMoments
        plantId={plant.id}
        moments={moments.map((m) => ({
          id: m.id,
          type: m.type,
          userName: m.userName,
          mine: m.userId === user.id,
          when: format.relativeTime(m.createdAt, now),
        }))}
      />
      <PhotoTimeline
        photos={timeline.map((p) => ({ id: p.id, url: p.url, label: format.dateTime(p.takenAt, { dateStyle: "medium", timeZone: homeRow?.timezone ?? "Europe/Madrid" }) }))}
      />

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
