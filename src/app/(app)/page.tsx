import { getTranslations } from "next-intl/server";

// Placeholder home; replaced by the real task list in Task 11.
export default async function HomePage() {
  const t = await getTranslations("home");
  return (
    <main className="p-4">
      <h1 className="text-xl font-semibold">{t("title")}</h1>
      <p className="mt-2 text-muted-foreground">{t("empty")}</p>
    </main>
  );
}
