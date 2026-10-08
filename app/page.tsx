import Link from "next/link";
import { KeepOrSkipDemo, type DemoItem } from "@/components/KeepOrSkipDemo";
import { catalogExample } from "@/lib/retail/catalog";

/** Real catalog products for the keep-or-skip demo, in the order a registry would show them. */
const DEMO = [
  { kind: "zip swaddle newborn", name: "Zip swaddle", category: "Sleep", priority: "Needed in the first weeks" },
  { kind: "bassinet", name: "Bassinet", category: "Sleep", priority: "Needed in the first weeks" },
  { kind: "ergonomic baby carrier", name: "Baby carrier", category: "On-the-go", priority: "Needed in the first weeks" },
  { kind: "baby nasal aspirator", name: "Nasal aspirator", category: "Health", priority: "Needed in the first weeks" },
  { kind: "baby bouncer", name: "Bouncer", category: "Play", priority: "Nice to have" },
];

export default function Home() {
  const demo: DemoItem[] = DEMO.flatMap(({ kind, ...item }) => {
    const offer = catalogExample(kind);
    return offer ? [{ ...item, offer }] : [];
  });

  return (
    <main className="pt-6 lg:pt-10">
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] gap-16 lg:mt-10 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-start lg:gap-20">
        <section className="space-y-6 lg:pt-16">
          <h1 className="max-w-[16ch] font-serif text-[41px] leading-[1.1] font-semibold sm:text-[52px] lg:text-[56px] lg:leading-[1.05] xl:text-[64px] 2xl:text-[76px]">
            A baby registry you can finish tonight
          </h1>
          <p className="max-w-[46ch] text-[17px] text-muted lg:text-[19px]">
            Answer a few quick questions. Get a full list of real products from Amazon, Target, and Walmart,
            then keep or skip each one.
          </p>
          <div className="space-y-3">
            <Link href="/start" className="btn-primary w-full text-[17px] sm:w-auto sm:px-8">
              Start my registry
            </Link>
            <p className="text-[14px] text-muted">Free. Family and friends never need an account.</p>
          </div>
        </section>

        {demo.length > 0 && (
          <div className="lg:mx-auto lg:w-full lg:max-w-[460px]">
            <KeepOrSkipDemo items={demo} />
          </div>
        )}
      </div>

      <section aria-labelledby="how" className="mt-20 space-y-5 lg:mt-28">
        <h2 id="how" className="font-serif text-[21px] font-semibold">
          How it works
        </h2>
        <ol className="grid gap-4 lg:grid-cols-3 lg:gap-10">
          {[
            "Answer a few quick questions about your space, budget, and plans.",
            "Review your draft one category at a time. Keep or skip each item.",
            "Share one link. Family buys from whichever store they like and marks it as gifted.",
          ].map((step, i) => (
            <li key={step} className="flex gap-4 lg:border-t lg:border-line lg:pt-5">
              <span className="w-4 shrink-0 font-serif text-[17px] text-accent">{i + 1}</span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </section>

    </main>
  );
}
