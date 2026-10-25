import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { ChatView } from "@/components/chat-view";
import { chatPaused, getThread, listMessages, listThreads } from "@/lib/gardener/chat";
import { requireUser } from "@/lib/session";
import { signedUrl } from "@/lib/storage";
import { cn } from "@/lib/utils";

/** The gardener: ?plant=<id> opens that plant's conversation, ?thread=<id> a given one, else the general one. */
export default async function GardenerPage({
  searchParams,
}: {
  searchParams: Promise<{ plant?: string; thread?: string }>;
}) {
  const [user, t, params] = await Promise.all([requireUser(), getTranslations("gardener"), searchParams]);
  const threadId = params.thread ?? (await getThread(user.id, params.plant ?? null)).id;
  const [messages, threads, paused] = await Promise.all([
    listMessages(user.id, threadId),
    listThreads(user.id),
    chatPaused(),
  ]);
  const withPhotos = await Promise.all(
    messages.map(async (m) => ({
      id: m.id,
      role: m.role,
      content: m.content,
      photoUrl: m.content.photoKey ? await signedUrl(m.content.photoKey) : null,
    })),
  );

  return (
    <main className="mx-auto flex max-w-md flex-col gap-4 p-4">
      <h1 className="font-heading text-3xl leading-tight text-balance">🩺 {t("title")}</h1>
      {threads.length > 1 ? (
        <nav aria-label={t("conversations")} className="-mx-4 flex gap-2 overflow-x-auto px-4">
          {threads.map((th) => (
            <Link
              key={th.id}
              href={`/gardener?thread=${th.id}`}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1 text-sm",
                th.id === threadId ? "bg-primary text-primary-foreground" : "bg-card",
              )}
            >
              {th.plantName ?? t("general")}
            </Link>
          ))}
        </nav>
      ) : null}
      <ChatView threadId={threadId} messages={withPhotos} paused={paused} />
    </main>
  );
}
