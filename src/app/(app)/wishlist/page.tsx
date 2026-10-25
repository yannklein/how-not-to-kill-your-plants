import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { DiscoverCardView } from "@/components/discover-card";
import { RemoveWishButton } from "@/components/remove-wish-button";
import { buttonVariants } from "@/components/ui/button";
import { listWishes } from "@/lib/discover/wishlist";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

export default async function WishlistPage() {
  const [user, t] = await Promise.all([requireUser(), getTranslations("discover")]);
  const wishes = await listWishes(user.id);
  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="text-xl font-semibold">⭐ {t("wishlist")}</h1>
      {wishes.length === 0 ? (
        <p className="rounded-xl bg-muted p-4 text-center text-muted-foreground">{t("wishlistEmpty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {wishes.map((w) => (
            <DiscoverCardView
              key={w.id}
              card={w.card}
              testId="wish"
              actions={
                <>
                  <Link href={`/plants/new?wish=${w.id}`} className={cn(buttonVariants(), "h-10 flex-1")}>
                    {t("bought")}
                  </Link>
                  <RemoveWishButton wishId={w.id} label={t("remove")} />
                </>
              }
            />
          ))}
        </ul>
      )}
    </main>
  );
}
