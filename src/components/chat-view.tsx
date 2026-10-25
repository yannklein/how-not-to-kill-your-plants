"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ChangeEvent, type FormEvent } from "react";
import { toast } from "sonner";
import { acceptSuggestionAction, sendMessageAction } from "@/app/(app)/gardener/actions";
import { uploadDraftPhoto } from "@/app/(app)/plants/upload-action";
import { Button } from "@/components/ui/button";
import type { ChatContent } from "@/lib/gardener/types";
import { downscaleImage } from "@/lib/image/downscale";
import { cn } from "@/lib/utils";
import { suggestionLabel } from "./suggestion-label";

export type ChatViewMessage = { id: string; role: "user" | "assistant"; content: ChatContent; photoUrl: string | null };

/** One conversation with the gardener. */
export function ChatView({ threadId, messages, paused }: { threadId: string; messages: ChatViewMessage[]; paused: boolean }) {
  const t = useTranslations("gardener");
  const tc = useTranslations("common");
  const router = useRouter();
  const [text, setText] = useState("");
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sending, startSending] = useTransition();
  const [applying, startApplying] = useTransition();

  function send(e: FormEvent) {
    e.preventDefault();
    if (!text.trim() && !photoKey) return;
    const question = text;
    const key = photoKey ?? undefined;
    startSending(async () => {
      try {
        const result = await sendMessageAction(threadId, question, key);
        if (result.status === "paused") toast(t("paused"));
        setText("");
        setPhotoKey(null);
        router.refresh();
      } catch (err) {
        console.error(err);
        toast.error(tc("error"));
      }
    });
  }

  async function attach(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { blob, width, height } = await downscaleImage(file);
      const form = new FormData();
      form.set("file", new File([blob], "photo.jpg", { type: "image/jpeg" }));
      form.set("width", String(width));
      form.set("height", String(height));
      const uploaded = await uploadDraftPhoto(form);
      if (uploaded.ok) setPhotoKey(uploaded.key);
      else toast.error(tc("error"));
    } catch (err) {
      console.error(err);
      toast.error(tc("error"));
    } finally {
      setUploading(false);
    }
  }

  function accept(messageId: string) {
    startApplying(async () => {
      const r = await acceptSuggestionAction(messageId);
      if (!r.ok && r.message) toast(r.message);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.length === 0 ? <p className="text-sm text-muted-foreground">{t("empty")}</p> : null}
      <ul className="flex flex-col gap-2">
        {messages.map((m) => (
          <li
            key={m.id}
            data-testid="chat-message"
            className={cn(
              "flex max-w-[85%] flex-col gap-2 rounded-2xl px-3 py-2 text-sm",
              m.role === "user" ? "self-end bg-primary text-primary-foreground" : "self-start bg-muted",
            )}
          >
            {m.photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={m.photoUrl} alt="" className="max-h-48 rounded-lg object-cover" />
            ) : null}
            {m.content.text ? <p className="whitespace-pre-wrap">{m.content.text}</p> : null}
            {m.content.suggestion ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-9 bg-background text-foreground"
                disabled={applying || !!m.content.applied}
                onClick={() => accept(m.id)}
              >
                {m.content.applied
                  ? "at" in m.content.applied
                    ? t("applied")
                    : t(m.content.applied.failed)
                  : suggestionLabel(t, m.content.suggestion)}
              </Button>
            ) : null}
          </li>
        ))}
        {sending ? <li className="self-start text-sm text-muted-foreground">{t("thinking")}</li> : null}
      </ul>

      {paused ? (
        <p role="status" className="rounded-2xl bg-sunshine p-3 text-center text-sm text-sunshine-foreground">
          {t("paused")}
        </p>
      ) : (
        <form onSubmit={send} className="flex flex-col gap-2">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("placeholder")}
            rows={2}
            maxLength={2000}
            className="rounded-md border bg-transparent px-3 py-2 text-base"
          />
          <div className="flex gap-2">
            <label className={cn("flex h-11 flex-1 cursor-pointer items-center justify-center rounded-md border text-sm", uploading && "opacity-60")}>
              {photoKey ? t("photoAttached") : t("attachPhoto")}
              <input type="file" accept="image/*" className="sr-only" disabled={uploading || sending} onChange={attach} />
            </label>
            <Button type="submit" className="h-11 flex-1 text-base" disabled={sending || uploading}>
              {t("send")}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
