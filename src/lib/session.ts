import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { isLocale, type Locale } from "@/i18n/locales";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "admin" | "user";
  locale: Locale;
  pushTime: string;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const u = session.user as typeof session.user & {
    role?: string | null;
    locale?: string | null;
    pushTime?: string | null;
  };
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role === "admin" ? "admin" : "user",
    locale: isLocale(u.locale) ? u.locale : "en",
    pushTime: u.pushTime ?? "08:30",
  };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/login");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.role !== "admin") notFound();
  return u;
}
