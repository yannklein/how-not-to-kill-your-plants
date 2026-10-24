import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LOCALES, resolveLocale } from "@/i18n/locales";

type Tree = { [key: string]: string | Tree };

function load(locale: string): Tree {
  return JSON.parse(readFileSync(path.resolve(import.meta.dirname, `../../messages/${locale}.json`), "utf8"));
}

function flatten(tree: Tree, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tree)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out[key] = v;
    else Object.assign(out, flatten(v, key));
  }
  return out;
}

describe("messages", () => {
  const flat = Object.fromEntries(LOCALES.map((l) => [l, flatten(load(l))]));

  it("has identical key sets in every locale", () => {
    const base = Object.keys(flat.en).sort();
    for (const l of LOCALES) expect(Object.keys(flat[l]).sort()).toEqual(base);
  });

  it("has no empty values", () => {
    for (const l of LOCALES)
      for (const [k, v] of Object.entries(flat[l])) expect(v.trim(), `${l}:${k}`).not.toBe("");
  });

  it("has all namespaces", () => {
    const ns = Object.keys(load("en")).sort();
    expect(ns).toEqual(
      ["addPlant", "auth", "calendar", "care", "common", "home", "plants", "push", "settings", "tasks"].sort(),
    );
  });

  it("keeps ICU placeholders consistent across locales", () => {
    const vars = (s: string) => [...s.matchAll(/\{(\w+)/g)].map((m) => m[1]).sort();
    for (const [k, v] of Object.entries(flat.en))
      for (const l of ["fr", "pt-BR"]) expect(vars(flat[l][k]), `${l}:${k}`).toEqual(vars(v));
  });
});

describe("resolveLocale", () => {
  it("maps pt to pt-BR from Accept-Language", () => {
    expect(resolveLocale({ userLocale: null, cookie: null, acceptLanguage: "pt-PT,pt;q=0.9" })).toBe("pt-BR");
  });
  it("prefers the user locale", () => {
    expect(resolveLocale({ userLocale: "fr", cookie: "en", acceptLanguage: "en" })).toBe("fr");
  });
  it("falls back to cookie, then header, then en", () => {
    expect(resolveLocale({ userLocale: null, cookie: "fr", acceptLanguage: "pt" })).toBe("fr");
    expect(resolveLocale({ userLocale: "xx", cookie: "yy", acceptLanguage: "fr-CH,fr;q=0.9" })).toBe("fr");
    expect(resolveLocale({ userLocale: null, cookie: null, acceptLanguage: "de,ja;q=0.5" })).toBe("en");
    expect(resolveLocale({})).toBe("en");
  });
  it("honours q-values", () => {
    expect(resolveLocale({ acceptLanguage: "en;q=0.5,fr;q=0.9" })).toBe("fr");
  });
});
