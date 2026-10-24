"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";

type State = "loading" | "unsupported" | "denied" | "off" | "on";

function urlBase64ToBuffer(base64: string): ArrayBuffer {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

async function post(method: "POST" | "DELETE", body: unknown) {
  const res = await fetch("/api/push/subscribe", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`push subscribe ${method} failed: ${res.status}`);
}

export function PushToggle({ vapidPublicKey }: { vapidPublicKey: string }) {
  const t = useTranslations("push");
  const [state, setState] = useState<State>("loading");
  const [failed, setFailed] = useState(false);
  const [pending, start] = useTransition();

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        return setState("unsupported");
      }
      if (Notification.permission === "denied") return setState("denied");
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setState(sub ? "on" : "off");
    })().catch(() => setState("unsupported"));
  }, []);

  function toggle() {
    setFailed(false);
    start(async () => {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (state === "on") {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            await post("DELETE", { endpoint: sub.endpoint });
            await sub.unsubscribe();
          }
          return setState("off");
        }
        const permission = await Notification.requestPermission();
        if (permission !== "granted") return setState(permission === "denied" ? "denied" : "off");
        const sub =
          (await reg.pushManager.getSubscription()) ??
          (await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToBuffer(vapidPublicKey),
          }));
        await post("POST", sub.toJSON());
        setState("on");
      } catch (error) {
        console.error(error);
        setFailed(true);
      }
    });
  }

  if (state === "loading") return null;
  if (state === "unsupported") return <p className="text-sm text-muted-foreground">{t("unsupported")}</p>;
  if (state === "denied") return <p className="text-sm text-muted-foreground">{t("denied")}</p>;
  return (
    <div className="flex flex-col gap-2">
      <Button type="button" variant={state === "on" ? "outline" : "default"} disabled={pending} onClick={toggle}>
        {state === "on" ? t("disable") : t("enable")}
      </Button>
      {failed && <p className="text-sm text-destructive">{t("failed")}</p>}
    </div>
  );
}
