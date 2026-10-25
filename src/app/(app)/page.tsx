import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { db } from "@/db/client";
import { home } from "@/db/schema";
import { monthSpend } from "@/lib/ai/budget";
import { currentMoods, feedForUser } from "@/lib/feed/queries";
import { openAlertsForUser } from "@/lib/gardener/alerts";
import { requireUser } from "@/lib/session";
import { dueTasksForUser } from "@/lib/tasks/queries";
import { todayIn } from "@/lib/time";
import { AlertCard } from "@/components/alert-card";
import { FeedPost } from "@/components/feed-post";
import { TaskCard } from "@/components/task-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const [user, t, tf, format] = await Promise.all([
    requireUser(),
    getTranslations("home"),
    getTranslations("feed"),
    getFormatter(),
  ]);
  const [homeRow] = await db.select().from(home).limit(1);
  const today = todayIn(homeRow?.timezone ?? "Europe/Madrid");
  const [groups, news, alerts, spend] = await Promise.all([
    dueTasksForUser(user.id, today),
    feedForUser(user.id, user.locale, { mode: "highlights" }),
    openAlertsForUser(user.id, user.locale),
    user.role === "admin" ? monthSpend() : Promise.resolve(null),
  ]);
  const moods = await currentMoods(
    groups.map((g) => g.plant.id),
    today,
  );
  const now = new Date();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t("needsAttention")}</h1>

      {alerts.length > 0 ? (
        <ul className="flex flex-col gap-3">
          {alerts.map((a) => (
            <AlertCard key={a.id} alert={a} />
          ))}
        </ul>
      ) : null}

      {groups.length === 0 && alerts.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.map((g) => (
            <TaskCard
              key={g.plant.id}
              tasks={g.tasks.map((task) => ({
                id: task.id,
                type: task.type,
                version: task.version,
                overdueDays: task.overdueDays,
              }))}
              plant={{
                id: g.plant.id,
                name: g.plant.name,
                coverUrl: g.plant.coverUrl,
                mood: moods.get(g.plant.id) ?? "happy",
              }}
            />
          ))}
        </ul>
      )}

      {news.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-semibold">{tf("title")}</h2>
            <Link href="/news" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
              {tf("seeAll")}
            </Link>
          </div>
          <ul className="flex flex-col gap-2">
            {news.map((post) => (
              <FeedPost
                key={post.id}
                post={post}
                when={format.relativeTime(post.createdAt, now)}
                moodLabel={tf(`mood.${post.mood}`)}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <div className="grid grid-cols-2 gap-2">
        <Link href="/plants/new" className={cn(buttonVariants(), "h-11 text-base")}>
          {t("addPlant")}
        </Link>
        <Link href="/plants" className={cn(buttonVariants({ variant: "outline" }), "h-11 text-base")}>
          {t("myPlants")}
        </Link>
        <Link href="/gardener" className={cn(buttonVariants({ variant: "outline" }), "col-span-2 h-11 text-base")}>
          {t("gardener")}
        </Link>
      </div>

      {spend?.warn ? (
        <p role="status" className="rounded-xl bg-amber-100 p-3 text-sm text-amber-900">
          {t("aiBanner", {
            pct: Math.round((spend.spentUsd / spend.capUsd) * 100),
            cap: spend.capUsd,
          })}
        </p>
      ) : null}
    </main>
  );
}
