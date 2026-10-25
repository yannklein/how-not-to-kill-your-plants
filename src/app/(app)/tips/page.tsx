import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { requireUser } from "@/lib/session";
import { tipsForUser, type TipItem } from "@/lib/tips/queries";

/** Every tip the gardener has given this user, grouped by plant (home-wide ones under "Your home"). */
export default async function TipsPage() {
  const [user, t, format] = await Promise.all([requireUser(), getTranslations("tips"), getFormatter()]);
  const tips = await tipsForUser(user.id, user.locale);
  const groups = new Map<string, { title: string; plantId: string | null; tips: TipItem[] }>();
  for (const tip of tips) {
    const key = tip.plant?.id ?? "home";
    const group = groups.get(key) ?? { title: tip.plant?.name ?? t("home"), plantId: tip.plant?.id ?? null, tips: [] };
    group.tips.push(tip);
    groups.set(key, group);
  }

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="font-heading text-3xl leading-tight text-balance">💡 {t("title")}</h1>
      {tips.length === 0 ? <p className="rounded-3xl border-[1.5px] border-dashed border-border p-5 text-center text-muted-foreground">{t("empty")}</p> : null}
      {[...groups.values()].map((g) => (
        <section key={g.plantId ?? "home"} className="flex flex-col gap-2">
          <h2 className="font-heading text-xl">
            {g.plantId ? <Link href={`/plants/${g.plantId}`}>{g.title}</Link> : g.title}
          </h2>
          <ul className="flex flex-col gap-2">
            {g.tips.map((tip) => (
              <li key={tip.id} className="rounded-3xl border-[1.5px] bg-card p-4 text-sm">
                <p>{tip.text}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {format.dateTime(tip.shownAt, { dateStyle: "medium" })}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </main>
  );
}
