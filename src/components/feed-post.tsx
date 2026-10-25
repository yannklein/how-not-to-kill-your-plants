import Link from "next/link";
import type { FeedPost as Post } from "@/lib/feed/queries";
import { PlantAvatar } from "./plant-avatar";

/** One plant-news card, or a gardener tip. `when` is the relative time, formatted on the server. */
export function FeedPost({
  post,
  when,
  moodLabel,
  gardenerLabel = "Gardener",
}: {
  post: Post;
  when: string;
  moodLabel: string;
  gardenerLabel?: string;
}) {
  const isTip = post.kind === "tip";
  const title = isTip ? (post.plant ? `${gardenerLabel} · ${post.plant.name}` : gardenerLabel) : post.plant!.name;
  const body = (
    <>
      {isTip ? (
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xl">💡</span>
      ) : (
        <PlantAvatar coverUrl={post.plant!.coverUrl} mood={post.mood} moodLabel={moodLabel} size="sm" />
      )}
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <p className="flex items-baseline justify-between gap-2">
          <span className="truncate font-medium">{title}</span>
          <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
        </p>
        <p className="text-sm">{post.text}</p>
        {post.photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img data-post-photo src={post.photoUrl} alt="" className="mt-1 max-h-64 w-full rounded-lg object-cover" />
        ) : null}
      </div>
    </>
  );
  const cardClass = "flex gap-3 rounded-xl border bg-card p-3 text-card-foreground";
  return (
    <li data-testid="feed-post">
      {post.plant ? (
        <Link href={`/plants/${post.plant.id}`} className={cardClass}>
          {body}
        </Link>
      ) : (
        <div className={cardClass}>{body}</div>
      )}
    </li>
  );
}
