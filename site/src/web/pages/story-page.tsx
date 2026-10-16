import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { State } from "../../shared/types";
import { Section } from "../components/section";
import { StoryText } from "../components/story-text";

function Page({ title, lines }: { title: string; lines: string[] }) {
  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle className="font-mono text-muted-foreground text-xs">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <StoryText lines={lines} />
      </CardContent>
    </Card>
  );
}

export function StoryPage({ state }: { state: State }) {
  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <section className="flex flex-col gap-4">
        <p className="font-mono text-muted-foreground text-xs">the story so far</p>
        <h1 className="text-3xl tracking-tight">{state.title}</h1>
        <StoryText lines={state.intro} />
      </section>
      <Page title="a torn page" lines={state.journal.tornPage} />
      {state.chapters
        .filter((c) => c.open && c.text.length)
        .map((chapter) => (
          <Section key={chapter.n} title={`chapter ${chapter.n} · ${chapter.name}`} meta={chapter.done ? "done" : "now"}>
            <StoryText lines={chapter.text} />
          </Section>
        ))}
      {state.journal.pages.length > 0 && (
        <Section title="the keepers' journal" meta={`${state.journal.pages.length}/9`}>
          <div className="flex flex-col gap-3">
            {state.journal.pages.map((page, i) => (
              <Page key={page} title={`page ${i + 1}`} lines={page.split("\n\n")} />
            ))}
          </div>
        </Section>
      )}
      {state.journal.letter && <Page title="the last letter" lines={state.journal.letter} />}
      {state.journal.ending && <Page title="the ship" lines={state.journal.ending} />}
      <p className="text-muted-foreground text-xs">chapters you haven't reached stay hidden here.</p>
    </div>
  );
}
