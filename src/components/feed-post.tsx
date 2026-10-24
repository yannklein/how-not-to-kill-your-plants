import Link from "next/link";
import type { FeedPost as Post } from "@/lib/feed/queries";
import { PlantAvatar } from "./plant-avatar";

/** One plant-news card. `when` is the relative time, formatted on the server. */
export function FeedPost({ post, when, moodLabel }: { post: Post; when: string; moodLabel: string }) {
  return (
    <li data-testid="feed-post">
      <Link href={`/plants/${post.plant.id}`} className="flex gap-3 rounded-xl border bg-card p-3 text-card-foreground">
        <PlantAvatar coverUrl={post.plant.coverUrl} mood={post.mood} moodLabel={moodLabel} size="sm" />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex items-baseline justify-between gap-2">
            <span className="truncate font-medium">{post.plant.name}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{when}</span>
          </p>
          <p className="text-sm">{post.text}</p>
          {post.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              data-post-photo
              src={post.photoUrl}
              alt=""
              className="mt-1 max-h-64 w-full rounded-lg object-cover"
            />
          ) : null}
        </div>
      </Link>
    </li>
  );
}
