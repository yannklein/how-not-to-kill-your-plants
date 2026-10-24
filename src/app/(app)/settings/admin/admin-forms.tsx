"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  createInviteAction,
  deleteSpot,
  resetPasswordAction,
  retryCareProfileAction,
  saveHome,
  setAiCap,
  upsertGroup,
  upsertSpot,
  type ActionResult,
} from "./actions";

const LIGHT_LEVELS = ["low", "medium", "bright_indirect", "direct"] as const;
const WINDOW_DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW", "none"] as const;
type LightLevel = (typeof LIGHT_LEVELS)[number];
type WindowDirection = (typeof WINDOW_DIRECTIONS)[number];

const selectClass =
  "h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm dark:bg-input/30";

type Status = "idle" | "saved" | "error";

function useSubmit() {
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Status>("idle");
  function submit(fn: () => Promise<ActionResult>, onOk?: () => void) {
    setStatus("idle");
    start(async () => {
      const r = await fn();
      setStatus(r.ok ? "saved" : "error");
      if (r.ok) onOk?.();
    });
  }
  return { pending, status, submit };
}

function Field({ label, id, children }: { label: string; id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}

function StatusLine({ status, okText }: { status: Status; okText: string }) {
  const t = useTranslations("settings.admin");
  if (status === "saved") return <p className="text-sm text-muted-foreground">{okText}</p>;
  if (status === "error")
    return (
      <p role="alert" className="text-sm text-destructive">
        {t("error")}
      </p>
    );
  return null;
}

export function HomeForm({
  initial,
}: {
  initial: { name: string; city: string; hemisphere: "N" | "S"; timezone: string };
}) {
  const t = useTranslations("settings.admin");
  const { pending, status, submit } = useSubmit();
  const [v, setV] = useState(initial);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => saveHome(v));
      }}
    >
      <Field label={t("homeName")} id="home-name">
        <Input id="home-name" value={v.name} required onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label={t("city")} id="home-city">
        <Input id="home-city" value={v.city} required onChange={(e) => setV({ ...v, city: e.target.value })} />
      </Field>
      <Field label={t("hemisphere")} id="home-hemisphere">
        <select
          id="home-hemisphere"
          className={selectClass}
          value={v.hemisphere}
          onChange={(e) => setV({ ...v, hemisphere: e.target.value as "N" | "S" })}
        >
          <option value="N">{t("north")}</option>
          <option value="S">{t("south")}</option>
        </select>
      </Field>
      <Field label={t("timezone")} id="home-tz">
        <Input id="home-tz" value={v.timezone} required onChange={(e) => setV({ ...v, timezone: e.target.value })} />
      </Field>
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
      <StatusLine status={status} okText={t("saved")} />
    </form>
  );
}

export function GroupForm({
  users,
  group,
}: {
  users: { id: string; name: string }[];
  group?: { id: string; name: string; memberIds: string[] };
}) {
  const t = useTranslations("settings.admin");
  const { pending, status, submit } = useSubmit();
  const [name, setName] = useState(group?.name ?? "");
  const [members, setMembers] = useState<string[]>(group?.memberIds ?? []);
  const key = group?.id ?? "new";
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-3"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        submit(
          () => upsertGroup(name, members, group?.id),
          () => {
            if (!group) {
              setName("");
              setMembers([]);
            }
          },
        );
      }}
    >
      <Field label={group ? t("groupName") : t("newGroup")} id={`group-name-${key}`}>
        <Input id={`group-name-${key}`} value={name} required onChange={(e) => setName(e.target.value)} />
      </Field>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium">{t("members")}</legend>
        {users.map((u) => (
          <label key={u.id} className="flex min-h-9 items-center gap-2 text-sm">
            <Checkbox
              checked={members.includes(u.id)}
              onCheckedChange={(on) =>
                setMembers((cur) => (on ? [...cur, u.id] : cur.filter((id) => id !== u.id)))
              }
            />
            {u.name}
          </label>
        ))}
      </fieldset>
      <Button type="submit" disabled={pending}>
        {group ? t("save") : t("addGroup")}
      </Button>
      <StatusLine status={status} okText={t("saved")} />
    </form>
  );
}

export function SpotForm({
  spot,
}: {
  spot?: { id: string; name: string; lightLevel: LightLevel; windowDirection: WindowDirection; notes: string };
}) {
  const t = useTranslations("settings.admin");
  const { pending, status, submit } = useSubmit();
  const blank = { name: "", lightLevel: "medium" as LightLevel, windowDirection: "none" as WindowDirection, notes: "" };
  const [v, setV] = useState(spot ?? blank);
  const key = spot?.id ?? "new";
  return (
    <form
      className="flex flex-col gap-3 rounded-lg border p-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit(
          () => upsertSpot({ ...v, id: spot?.id }),
          () => {
            if (!spot) setV(blank);
          },
        );
      }}
    >
      <Field label={spot ? t("spotName") : t("newSpot")} id={`spot-name-${key}`}>
        <Input id={`spot-name-${key}`} value={v.name} required onChange={(e) => setV({ ...v, name: e.target.value })} />
      </Field>
      <Field label={t("light")} id={`spot-light-${key}`}>
        <select
          id={`spot-light-${key}`}
          className={selectClass}
          value={v.lightLevel}
          onChange={(e) => setV({ ...v, lightLevel: e.target.value as LightLevel })}
        >
          {LIGHT_LEVELS.map((l) => (
            <option key={l} value={l}>
              {t(`lightLevels.${l}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("window")} id={`spot-window-${key}`}>
        <select
          id={`spot-window-${key}`}
          className={selectClass}
          value={v.windowDirection}
          onChange={(e) => setV({ ...v, windowDirection: e.target.value as WindowDirection })}
        >
          {WINDOW_DIRECTIONS.map((d) => (
            <option key={d} value={d}>
              {d === "none" ? t("windowNone") : d}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("notes")} id={`spot-notes-${key}`}>
        <Input id={`spot-notes-${key}`} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={pending} className="flex-1">
          {spot ? t("save") : t("newSpot")}
        </Button>
        {spot && (
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={() => {
              if (window.confirm(t("deleteSpotConfirm"))) submit(() => deleteSpot(spot.id));
            }}
          >
            {t("delete")}
          </Button>
        )}
      </div>
      <StatusLine status={status} okText={t("saved")} />
    </form>
  );
}

export function InviteSection() {
  const t = useTranslations("settings.admin");
  const [pending, start] = useTransition();
  const [url, setUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <div className="flex flex-col gap-3">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            setCopied(false);
            const r = await createInviteAction();
            setFailed(!r.ok);
            setUrl(r.ok ? r.url : null);
          })
        }
      >
        {t("createInvite")}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t("error")}
        </p>
      )}
      {url && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-muted-foreground">{t("inviteReady")}</p>
          <Input readOnly value={url} aria-label={t("inviteReady")} onFocus={(e) => e.currentTarget.select()} />
          <Button
            variant="outline"
            onClick={async () => {
              await navigator.clipboard.writeText(url);
              setCopied(true);
            }}
          >
            {copied ? t("copied") : t("copy")}
          </Button>
        </div>
      )}
    </div>
  );
}

export function ResetPasswordForm({ users }: { users: { id: string; name: string }[] }) {
  const t = useTranslations("settings.admin");
  const { pending, status, submit } = useSubmit();
  const [userId, setUserId] = useState(users[0]?.id ?? "");
  const [password, setPassword] = useState("");
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(
          () => resetPasswordAction(userId, password),
          () => setPassword(""),
        );
      }}
    >
      <Field label={t("user")} id="reset-user">
        <select id="reset-user" className={selectClass} value={userId} onChange={(e) => setUserId(e.target.value)}>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name}
            </option>
          ))}
        </select>
      </Field>
      <Field label={t("newPassword")} id="reset-password">
        <Input
          id="reset-password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={pending || !userId}>
        {t("reset")}
      </Button>
      <StatusLine status={status} okText={t("resetDone")} />
    </form>
  );
}

export function AiCapForm({ initial }: { initial: number }) {
  const t = useTranslations("settings.admin");
  const { pending, status, submit } = useSubmit();
  const [cap, setCap] = useState(String(initial));
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        submit(() => setAiCap(Number(cap)));
      }}
    >
      <Field label={t("aiCapUsd")} id="ai-cap">
        <Input
          id="ai-cap"
          type="number"
          inputMode="decimal"
          min={0}
          step="0.01"
          required
          value={cap}
          onChange={(e) => setCap(e.target.value)}
        />
      </Field>
      <Button type="submit" disabled={pending}>
        {t("save")}
      </Button>
      <StatusLine status={status} okText={t("saved")} />
    </form>
  );
}

export function RetryCareProfile({ speciesId, name }: { speciesId: string; name: string }) {
  const t = useTranslations("settings.admin");
  const { pending, status, submit } = useSubmit();
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm italic">{name}</span>
        <Button type="button" disabled={pending} onClick={() => submit(() => retryCareProfileAction(speciesId))}>
          {t("retry")}
        </Button>
      </div>
      <StatusLine status={status} okText={t("saved")} />
    </div>
  );
}
