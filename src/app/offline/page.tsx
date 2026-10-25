import { getTranslations } from "next-intl/server";

export default async function OfflinePage() {
  const t = await getTranslations("common.offline");
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
      <h1 className="font-heading text-3xl leading-tight text-balance">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
    </main>
  );
}
