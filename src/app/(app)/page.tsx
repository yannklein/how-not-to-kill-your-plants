import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { db } from "@/db/client";
import { home } from "@/db/schema";
import { monthSpend } from "@/lib/ai/budget";
import { requireUser } from "@/lib/session";
import { dueTasksForUser } from "@/lib/tasks/queries";
import { todayIn } from "@/lib/time";
import { TaskCard } from "@/components/task-card";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export default async function HomePage() {
  const [user, t] = await Promise.all([requireUser(), getTranslations("home")]);
  const [homeRow] = await db.select().from(home).limit(1);
  const today = todayIn(homeRow?.timezone ?? "Europe/Madrid");
  const [groups, spend] = await Promise.all([
    dueTasksForUser(user.id, today),
    user.role === "admin" ? monthSpend() : Promise.resolve(null),
  ]);

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">{t("needsAttention")}</h1>

      {groups.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {groups.flatMap((g) =>
            g.tasks.map((task) => (
              <TaskCard
                key={task.id}
                task={{ id: task.id, type: task.type, version: task.version, overdueDays: task.overdueDays }}
                plant={{ id: g.plant.id, name: g.plant.name, coverUrl: g.plant.coverUrl }}
              />
            )),
          )}
        </ul>
      )}

      <div className="flex gap-2">
        <Link href="/plants/new" className={cn(buttonVariants(), "h-11 flex-1 text-base")}>
          {t("addPlant")}
        </Link>
        <Link href="/plants" className={cn(buttonVariants({ variant: "outline" }), "h-11 flex-1 text-base")}>
          {t("myPlants")}
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
