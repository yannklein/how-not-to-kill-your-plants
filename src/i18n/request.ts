import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { getSessionUser } from "@/lib/session";
import { LOCALE_COOKIE, resolveLocale, type Locale } from "./locales";

export { resolveLocale };

export async function getLocale(): Promise<Locale> {
  const [user, cookieStore, headerStore] = await Promise.all([
    getSessionUser(),
    cookies(),
    headers(),
  ]);
  return resolveLocale({
    userLocale: user?.locale,
    cookie: cookieStore.get(LOCALE_COOKIE)?.value,
    acceptLanguage: headerStore.get("accept-language"),
  });
}

export default getRequestConfig(async () => {
  const locale = await getLocale();
  return {
    locale,
    messages: (await import(`../../messages/${locale}.json`)).default,
  };
});
