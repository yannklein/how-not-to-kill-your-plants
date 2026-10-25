import Link from "next/link";
import { LeafSprig } from "./leaf-sprig";

export const APP_TITLE = "How Not To Kill Your Plants";

export type HeroPlant = { id: string; name: string; coverUrl: string | null };

/** The morning welcome: greeting, the app's title by a drawn sprig, and the plants as round portraits. */
export function HomeHero({ greeting, plants }: { greeting: string; plants: HeroPlant[] }) {
  return (
    <section data-testid="home-hero" className="relative flex flex-col gap-5 pt-4">
      <LeafSprig className="pointer-events-none absolute -top-3 -right-5 size-40" />
      <div className="relative flex flex-col gap-2">
        <p className="font-semibold text-muted-foreground">{greeting}</p>
        <h1 className="max-w-60 font-heading text-[2rem] leading-[1.1] text-balance">{APP_TITLE}</h1>
      </div>
      <ul className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1" aria-label={APP_TITLE}>
        {plants.map((p) => (
          <li key={p.id} data-testid="hero-portrait" className="shrink-0">
            <Link href={`/plants/${p.id}`} className="flex w-20 flex-col items-center gap-1.5 text-center">
              <span className="size-[4.75rem] overflow-hidden rounded-full border-[3px] border-card bg-secondary outline-2 outline-primary">
                {p.coverUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.coverUrl} alt="" className="size-full object-cover" />
                ) : (
                  <span className="flex size-full items-center justify-center">
                    <LeafSprig className="size-14" />
                  </span>
                )}
              </span>
              <span className="w-full truncate text-xs font-bold text-muted-foreground">{p.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
