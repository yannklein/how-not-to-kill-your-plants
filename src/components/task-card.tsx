"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useTransition } from "react";
import { toast } from "sonner";
import { completeTaskAction } from "@/app/(app)/tasks/actions";
import { Button } from "@/components/ui/button";
import type { TaskOutcome, TaskType } from "@/lib/care/types";

export type TaskCardProps = {
  task: { id: string; type: TaskType; version: number; overdueDays: number };
  plant: { id: string; name: string; coverUrl: string | null };
};

type Choice = { outcome: TaskOutcome; label: string; primary?: boolean };

export function TaskCard({ task, plant }: TaskCardProps) {
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
    <li
      data-testid="task-card"
      className="flex flex-col gap-3 rounded-xl border bg-card p-3 text-card-foreground"
    >
      <div className="flex items-center gap-3">
        <div className="size-12 shrink-0 overflow-hidden rounded-lg bg-muted">
          {plant.coverUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={plant.coverUrl} alt="" className="size-full object-cover" />
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <Link href={`/plants/${plant.id}`} className="block truncate font-medium">
            {plant.name}
          </Link>
          <p className="text-sm text-muted-foreground">{t(`care.type.${task.type}`)}</p>
        </div>
        <span
          className={
            task.overdueDays > 0
              ? "shrink-0 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
              : "shrink-0 rounded-full bg-muted px-2 py-0.5 text-xs font-medium"
          }
        >
          {task.overdueDays > 0 ? t("tasks.overdueBy", { count: task.overdueDays }) : t("home.dueToday")}
        </span>
      </div>
      {task.type === "settle_check" ? (
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">{t("tasks.rootbound.label")}</span>{" "}
          {t("tasks.rootbound.hint")}
        </p>
      ) : null}
      <div className="flex gap-2">
        {choices.map((c) => (
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
