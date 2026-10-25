"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { completeTaskAction } from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import type { TaskOutcome, TaskType } from "@/lib/care/types";
import type { Mood } from "@/lib/feed/types";
import { PhotoCapture } from "./photo-capture";
import { PlantAvatar } from "./plant-avatar";

export type TaskRowData = { id: string; type: TaskType; version: number; overdueDays: number };

export type TaskCardProps = {
  tasks: TaskRowData[];
  plant: { id: string; name: string; coverUrl: string | null; mood: Mood };
};

type Choice = { outcome: TaskOutcome; label: string; primary?: boolean };

function TaskRow({ task, plantId }: { task: TaskRowData; plantId: string }) {
  const t = useTranslations();
  const [pending, startTransition] = useTransition();

  const choices: Choice[] =
    task.type === "water"
      ? [
          { outcome: "done", label: t("tasks.outcome.watered"), primary: true },
          { outcome: "still_moist", label: t("tasks.outcome.stillMoist") },
          { outcome: "skipped", label: t("tasks.outcome.skip") },
        ]
      : task.type === "settle_check"
        ? [
            { outcome: "rootbound_yes", label: t("tasks.rootbound.yes") },
            { outcome: "rootbound_no", label: t("tasks.rootbound.no"), primary: true },
          ]
        : [
            { outcome: "done", label: t("tasks.done"), primary: true },
            { outcome: "skipped", label: t("tasks.outcome.skip") },
          ];

  function choose(outcome: TaskOutcome) {
    startTransition(async () => {
      try {
        const result = await completeTaskAction(task.id, task.version, outcome);
        if (result.status !== "ok") toast(result.message);
      } catch {
        toast.error(t("common.error"));
      }
    });
  }

  return (
    <li data-testid="task-row" className="flex flex-col gap-2">
      <p className="text-sm font-medium text-muted-foreground">{t(`care.type.${task.type}`)}</p>
      {task.type === "settle_check" ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("tasks.rootbound.label")}</span>{" "}
          {t("tasks.rootbound.hint")}
        </p>
      ) : null}
      <div className="flex gap-2">
        {task.type === "photo" ? <PhotoCapture plantId={plantId} label={t("tasks.takePhoto")} /> : null}
        {(task.type === "photo" ? choices.filter((c) => c.outcome === "skipped") : choices).map((c) => (
          <Button
            key={c.outcome}
            type="button"
            variant={c.primary ? "default" : "outline"}
            className="h-11 flex-1 text-base"
            disabled={pending}
            onClick={() => choose(c.outcome)}
          >
            {c.label}
          </Button>
        ))}
      </div>
    </li>
  );
}

/** One card per plant: thumbnail and name once, then each due task as a row with its one-tap buttons. */
export function TaskCard({ tasks, plant }: TaskCardProps) {
  const t = useTranslations();
  const overdueDays = Math.max(0, ...tasks.map((x) => x.overdueDays));

  return (
    <li
      data-testid="task-card"
      className="flex flex-col gap-3 rounded-3xl border-[1.5px] bg-card p-4 text-card-foreground"
    >
      <div className="flex items-center gap-3">
        <PlantAvatar coverUrl={plant.coverUrl} mood={plant.mood} moodLabel={t(`feed.mood.${plant.mood}`)} />
        <Link href={`/plants/${plant.id}`} className="block min-w-0 flex-1 truncate font-medium">
          {plant.name}
        </Link>
        <span
          className={
            overdueDays > 0
              ? "shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
              : "shrink-0 rounded-full bg-sunshine px-2.5 py-0.5 text-xs font-bold text-sunshine-foreground"
          }
        >
          {overdueDays > 0 ? t("tasks.overdueBy", { count: overdueDays }) : t("home.dueToday")}
        </span>
      </div>
      <ul className="flex flex-col gap-3">
        {tasks.map((task) => (
          <TaskRow key={task.id} task={task} plantId={plant.id} />
        ))}
      </ul>
    </li>
  );
}
