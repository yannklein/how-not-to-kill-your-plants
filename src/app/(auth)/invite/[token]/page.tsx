"use client";

import { useTranslations } from "next-intl";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { APP_TITLE } from "@/components/home-hero";
import { LeafSprig } from "@/components/leaf-sprig";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth-client";
import { acceptInviteAction } from "./actions";

export default function InvitePage() {
  const { token } = useParams<{ token: string }>();
  const t = useTranslations("auth.invite");
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(e.currentTarget);
    const input = {
      name: String(form.get("name")),
      email: String(form.get("email")),
      password: String(form.get("password")),
    };
    const result = await acceptInviteAction(token, input);
    if (!result.ok) {
      setError(t(`errors.${result.error}`));
      setPending(false);
      return;
    }
    const { error: signInError } = await authClient.signIn.email({
      email: input.email,
      password: input.password,
    });
    if (signInError) {
      router.push("/login");
      return;
    }
    router.push("/");
    router.refresh();
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-8 p-5">
      <div className="relative w-full max-w-sm pt-4">
        <LeafSprig className="absolute -top-2 right-0 size-24 text-leaf" />
        <p className="max-w-60 font-heading text-[2rem] leading-[1.1] text-balance">{APP_TITLE}</p>
      </div>
      <Card className="w-full max-w-sm rounded-3xl border-[1.5px] shadow-none">
        <CardHeader>
          <CardTitle className="font-heading text-xl font-normal">{t("title")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">{t("name")}</Label>
              <Input id="name" name="name" autoComplete="name" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                name="password"
                type="password"
                autoComplete="new-password"
                minLength={8}
                required
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <Button type="submit" disabled={pending}>
              {pending ? t("submitting") : t("submit")}
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
