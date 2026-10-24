// Pure-module-safe task types: type-only import, so no DB client is pulled in.
import type { taskOutcome, taskType } from "@/db/schema";

export type TaskType = (typeof taskType.enumValues)[number];
export type TaskOutcome = (typeof taskOutcome.enumValues)[number];
