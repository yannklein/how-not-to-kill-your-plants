import { asc, eq } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { db } from "@/db/client";
import { group, groupMember, home, spot, species, user } from "@/db/schema";
import { requireAdmin } from "@/lib/session";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  AiCapForm,
  GroupForm,
  HomeForm,
  InviteSection,
  ResetPasswordForm,
  RetryCareProfile,
  SpotForm,
} from "./admin-forms";

export default async function AdminPage() {
  await requireAdmin();
  const t = await getTranslations("settings.admin");

  const [homeRow] = await db.select().from(home).limit(1);
  const users = await db
    .select({ id: user.id, name: user.name })
    .from(user)
    .orderBy(asc(user.name));
  const groups = await db.select().from(group).orderBy(asc(group.createdAt));
  const members = await db.select().from(groupMember);
  const failedSpecies = await db
    .select({ id: species.id, name: species.scientificName })
    .from(species)
    .where(eq(species.careProfileStatus, "failed"))
    .orderBy(asc(species.scientificName));
  const spots = await db.select().from(spot).orderBy(asc(spot.name));

  return (
    <main className="flex flex-col gap-4 p-4">
      <h1 className="text-2xl font-semibold">{t("title")}</h1>

      <Section title={t("home")}>
        <HomeForm
          initial={{
            name: homeRow?.name ?? "Home",
            city: homeRow?.city ?? "Barcelona",
            hemisphere: homeRow?.hemisphere ?? "N",
            timezone: homeRow?.timezone ?? "Europe/Madrid",
          }}
        />
      </Section>

      <Section title={t("groups")}>
        {groups.map((g) => (
          <GroupForm
            key={g.id}
            users={users}
            group={{
              id: g.id,
              name: g.name,
              memberIds: members.filter((m) => m.groupId === g.id).map((m) => m.userId),
            }}
          />
        ))}
        <GroupForm users={users} />
      </Section>

      <Section title={t("spots")}>
        {spots.map((s) => (
          <SpotForm
            key={s.id}
            spot={{
              id: s.id,
              name: s.name,
              lightLevel: s.lightLevel,
              windowDirection: s.windowDirection,
              notes: s.notes ?? "",
            }}
          />
        ))}
        <SpotForm />
      </Section>

      <Section title={t("invites")}>
        <InviteSection />
      </Section>

      <Section title={t("resetPassword")}>
        <ResetPasswordForm users={users} />
      </Section>

      <Section title={t("aiCap")}>
        <AiCapForm initial={Number(homeRow?.aiMonthlyCapUsd ?? 20)} />
      </Section>

      <Section title={t("careProfiles")}>
        {failedSpecies.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("careProfilesNone")}</p>
        ) : (
          failedSpecies.map((sp) => <RetryCareProfile key={sp.id} speciesId={sp.id} name={sp.name} />)
        )}
      </Section>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{children}</CardContent>
    </Card>
  );
}
