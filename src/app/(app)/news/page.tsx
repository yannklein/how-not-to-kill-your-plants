import { getFormatter, getTranslations } from "next-intl/server";
import Link from "next/link";
import { FeedPost } from "@/components/feed-post";
import { buttonVariants } from "@/components/ui/button";
import { feedForUser } from "@/lib/feed/queries";
import { requireUser } from "@/lib/session";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 20;

/** Every post the user may read, newest first, one page at a time. */
export default async function NewsPage({ searchParams }: { searchParams: Promise<{ before?: string }> }) {
  const [user, t, tt, format, { before }] = await Promise.all([
    requireUser(),
    getTranslations("feed"),
    getTranslations("tips"),
    getFormatter(),
    searchParams,
  ]);
  const beforeDate = before && !Number.isNaN(Date.parse(before)) ? new Date(before) : undefined;
  const posts = await feedForUser(user.id, user.locale, { mode: "all", before: beforeDate, limit: PAGE_SIZE });
  const now = new Date();

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="font-heading text-3xl leading-tight text-balance">{t("title")}</h1>
      {posts.length === 0 ? (
        <p className="rounded-3xl border-[1.5px] border-dashed border-border p-5 text-center text-muted-foreground">{t("empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {posts.map((post) => (
            <FeedPost
              key={post.id}
              post={post}
              when={format.relativeTime(post.createdAt, now)}
              moodLabel={t(`mood.${post.mood}`)}
              gardenerLabel={tt("gardener")}
            />
          ))}
        </ul>
      )}
      {posts.length === PAGE_SIZE ? (
        <Link
          href={`/news?before=${encodeURIComponent(posts[posts.length - 1].createdAt.toISOString())}`}
          className={cn(buttonVariants({ variant: "outline" }), "h-11 text-base")}
        >
          {t("loadMore")}
        </Link>
      ) : null}
    </main>
  );
}
