import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { db } from "@/db/client";
import { home } from "@/db/schema";
import { monthSpend } from "@/lib/ai/budget";
import { currentMoods, feedForUser } from "@/lib/feed/queries";
import { openAlertsForUser } from "@/lib/gardener/alerts";
import { requireUser } from "@/lib/session";
import { dueTasksForUser } from "@/lib/tasks/queries";
import { listPlantsForUser } from "@/lib/access";
import { coverUrls } from "@/lib/tasks/queries";
import { localTimeIn, todayIn } from "@/lib/time";
import { Leaf, Lightbulb, Plus, Search, Star, Stethoscope } from "lucide-react";
import { AlertCard } from "@/components/alert-card";
import { FeedPost } from "@/components/feed-post";
import { HomeHero } from "@/components/home-hero";
import { TaskCard } from "@/components/task-card";

export default async function HomePage() {
  const [user, t, tf, tt, format] = await Promise.all([
    requireUser(),
    getTranslations("home"),
    getTranslations("feed"),
    getTranslations("tips"),
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

  // The hero shows the plants with photos first (newest additions first), up to six.
  const plants = await listPlantsForUser(user.id);
  const covers = await coverUrls(plants);
  const heroPlants = plants
    .map((p) => ({ id: p.id, name: p.name, coverUrl: covers.get(p.id) ?? null, createdAt: p.createdAt }))
    .sort((a, b) => Number(!!b.coverUrl) - Number(!!a.coverUrl) || b.createdAt.getTime() - a.createdAt.getTime())
    .slice(0, 6);
  const hour = Number(localTimeIn(homeRow?.timezone ?? "Europe/Madrid").slice(0, 2));
  const greeting = t(hour < 12 ? "greetingMorning" : hour < 18 ? "greetingAfternoon" : "greetingEvening", {
    name: user.name.split(" ")[0],
  });
  const tiles = [
    { href: "/plants/new", label: t("addPlant"), Icon: Plus, primary: true },
    { href: "/plants", label: t("myPlants"), Icon: Leaf },
    { href: "/gardener", label: t("gardener"), Icon: Stethoscope },
    { href: "/discover", label: t("discover"), Icon: Search },
    { href: "/wishlist", label: t("wishlist"), Icon: Star },
    { href: "/tips", label: t("tips"), Icon: Lightbulb },
  ];

  return (
    <main className="mx-auto flex max-w-md flex-col gap-9 px-5 pt-6 pb-10">
      <HomeHero greeting={greeting} plants={heroPlants} />

      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-2xl">{t("needsAttention")}</h2>
        {alerts.length > 0 ? (
          <ul className="flex flex-col gap-3">
            {alerts.map((a) => (
              <AlertCard key={a.id} alert={a} />
            ))}
          </ul>
        ) : null}
        {groups.length === 0 && alerts.length === 0 ? (
          <p className="rounded-3xl border-[1.5px] border-dashed border-border p-5 text-center text-muted-foreground">
            {t("empty")}
          </p>
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
      </section>

      {news.length > 0 ? (
        <section className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <h2 className="font-heading text-2xl">{tf("title")}</h2>
            <Link href="/news" className="text-sm font-bold text-primary underline-offset-4 hover:underline">
              {tf("seeAll")}
            </Link>
          </div>
          <ul className="flex flex-col gap-3">
            {news.map((post) => (
              <FeedPost
                key={post.id}
                post={post}
                when={format.relativeTime(post.createdAt, now)}
                moodLabel={tf(`mood.${post.mood}`)}
                gardenerLabel={tt("gardener")}
              />
            ))}
          </ul>
        </section>
      ) : null}

      <nav className="grid grid-cols-2 gap-3">
        {tiles.map(({ href, label, Icon, primary }) => (
          <Link
            key={href}
            href={href}
            className={
              primary
                ? "flex min-h-20 flex-col justify-between gap-2 rounded-3xl bg-primary p-4 font-bold text-primary-foreground"
                : "flex min-h-20 flex-col justify-between gap-2 rounded-3xl border-[1.5px] border-border bg-card p-4 font-bold"
            }
          >
            <Icon className="size-6" aria-hidden />
            <span className="leading-tight">{label}</span>
          </Link>
        ))}
      </nav>

      {spend?.warn ? (
        <p role="status" className="rounded-2xl bg-sunshine p-3 text-sm text-sunshine-foreground">
          {t("aiBanner", {
            pct: Math.round((spend.spentUsd / spend.capUsd) * 100),
            cap: spend.capUsd,
          })}
        </p>
      ) : null}
    </main>
  );
}
