"use client";

import { useEffect, useState } from "react";
import { CATEGORIES } from "@/lib/types";

const BUILD_STEPS = CATEGORIES;
const STEP_MS = 3500;

/** The wait while the registry is built: morning light warming up as each category gets filled. */
export function Building() {
  const [step, setStep] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => setStep((s) => Math.min(s + 1, BUILD_STEPS.length - 1)), STEP_MS);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="relative flex min-h-dvh flex-col justify-center overflow-hidden">
      <div
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-1/2 -z-0 h-[140vmin] w-[140vmin] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background: "radial-gradient(circle, rgb(226 219 242 / 0.85) 0%, rgb(241 219 229 / 0.5) 35%, transparent 65%)",
          animation: `lamp ${(BUILD_STEPS.length * STEP_MS) / 1000}s ease-out forwards`,
        }}
      />
      <div className="relative grid w-full gap-10 lg:grid-cols-2 lg:items-center lg:gap-24">
        <div className="space-y-6">
          <h1 className="font-serif text-[33px] leading-tight font-semibold lg:text-[52px] lg:leading-[1.08]">
            Building your registry
          </h1>
          <p className="max-w-[40ch] text-muted lg:text-[17px]">
            Choosing real products from Amazon, Target, and Walmart, and noting why each one is on your list. This
            takes about 30 seconds.
          </p>
        </div>
        <ol className="space-y-1 font-serif text-[21px] lg:space-y-2 lg:text-[30px]" role="status">
          {BUILD_STEPS.map((name, i) => (
            <li
              key={name}
              className={`transition-colors duration-700 ${i < step ? "text-text" : i === step ? "text-accent" : "text-muted/40"}`}
            >
              {name}
              {i < step && <span className="sr-only"> done</span>}
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
