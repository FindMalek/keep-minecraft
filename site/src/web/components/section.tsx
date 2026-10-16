import type { ReactNode } from "react";

/** A titled block: label left, meta right, a hairline under it. */
export function Section({ title, meta, children }: { title: string; meta?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-3">
      <header className="flex items-baseline justify-between gap-3 border-b pb-2">
        <h2 className="font-medium">{title}</h2>
        {meta && <span className="font-mono text-muted-foreground text-xs">{meta}</span>}
      </header>
      {children}
    </section>
  );
}
