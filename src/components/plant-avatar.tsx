import { MOOD_EMOJI, type Mood } from "@/lib/feed/types";
import { cn } from "@/lib/utils";

const SIZES = { sm: "size-10", md: "size-12", lg: "size-24" } as const;
const BADGE = { sm: "size-5 text-xs", md: "size-6 text-sm", lg: "size-9 text-xl" } as const;

/** The plant's latest photo in a circle, with its mood as a small face. */
export function PlantAvatar({
  coverUrl,
  mood,
  moodLabel,
  size = "md",
}: {
  coverUrl: string | null;
  mood: Mood;
  moodLabel?: string;
  size?: keyof typeof SIZES;
}) {
  return (
    <div className={cn("relative shrink-0", SIZES[size])}>
      <div className="size-full overflow-hidden rounded-full bg-muted">
        {coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={coverUrl} alt="" className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center text-lg">🌿</span>
        )}
      </div>
      <span
        role="img"
        aria-label={moodLabel}
        title={moodLabel}
        className={cn(
          "absolute -right-1 -bottom-1 flex items-center justify-center rounded-full bg-background shadow-sm",
          BADGE[size],
        )}
      >
        {MOOD_EMOJI[mood]}
      </span>
    </div>
  );
}
