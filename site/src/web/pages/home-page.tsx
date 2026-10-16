import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Progress } from "@/components/ui/progress";
import type { GameEvent, State } from "../../shared/types";
import { PlayerHead } from "../components/player-head";
import { QuestRow } from "../components/quest-row";
import { Section } from "../components/section";
import { StoryText } from "../components/story-text";
import { usePoll } from "../lib/api";
import { navigate } from "../lib/router";
import { until, when } from "../lib/time";

export function HomePage({ state }: { state: State }) {
  const events = usePoll<GameEvent[]>("/api/events", 30_000).data ?? [];
  const chapter = state.chapters.find((c) => c.n === state.chapter);
  const quests = chapter?.quests ?? [];
  const group = quests.filter((q) => q.shared && q.id !== "end");
  const done = group.filter((q) => q.done).length;
  const online = state.players.filter((p) => p.online);
  return (
    <div className="flex flex-col gap-10">
      <section className="flex flex-col gap-4">
        <p className="font-mono text-muted-foreground text-xs">chapter {state.chapter}</p>
        <h1 className="text-3xl tracking-tight">{chapter?.name}</h1>
        <StoryText lines={chapter?.text.length ? chapter.text : state.intro.slice(0, 2)} />
        <Progress value={(100 * done) / Math.max(1, group.length)} aria-label="group quests done" className="max-w-md" />
        <p className="font-mono text-muted-foreground text-xs">
          {done} of {group.length} group quests ·{" "}
          {chapter?.done
            ? state.nextChapterAt
              ? `next chapter ${until(state.nextChapterAt)} (${when(state.nextChapterAt)})`
              : "the story is finished"
            : "finish this chapter to open the next one on friday"}
        </p>
      </section>

      <div className="grid gap-10 md:grid-cols-[3fr_2fr]">
        <Section
          title="this chapter"
          meta={
            <a href="/quests" onClick={navigate} className="underline-offset-4 hover:underline">
              all quests
            </a>
          }
        >
          <div className="flex flex-col divide-y">
            {quests.map((quest) => (
              <QuestRow key={quest.path} quest={quest} players={state.players} />
            ))}
          </div>
        </Section>
        <div className="flex flex-col gap-10">
          <Section title="online now" meta={`${online.length}/${state.server.max || 7}`}>
            {online.length ? (
              <ul className="flex flex-wrap gap-x-5 gap-y-3">
                {online.map((p) => (
                  <li key={p.uuid} className="inline-flex items-center gap-2">
                    <PlayerHead uuid={p.uuid} name={p.name} />
                    {p.name}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-muted-foreground">
                {state.server.up ? "nobody's on right now" : "the server is asleep. wake it up at the top."}
              </p>
            )}
          </Section>
          <Section
            title="coming up"
            meta={
              <a href="/events" onClick={navigate} className="underline-offset-4 hover:underline">
                events
              </a>
            }
          >
            {events.length ? (
              <ul className="flex flex-col divide-y">
                {events.slice(0, 3).map((event) => (
                  <li key={event.id} className="flex items-center justify-between gap-3 py-2">
                    <span>{event.title}</span>
                    <span className="font-mono text-muted-foreground text-xs">{when(event.startsAt)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty className="border p-6">
                <EmptyHeader>
                  <EmptyTitle>nothing planned</EmptyTitle>
                  <EmptyDescription>
                    <a href="/events" onClick={navigate}>
                      plan something
                    </a>
                  </EmptyDescription>
                </EmptyHeader>
              </Empty>
            )}
          </Section>
          <Section title="the journal" meta={`${state.pages}/9 pages`}>
            <p className="text-muted-foreground">
              {state.pages ? (
                <a href="/story" onClick={navigate} className="underline underline-offset-4">
                  read what the keepers wrote
                </a>
              ) : state.chapter >= 2 ? (
                "open the chests at abandoned camps to find the pages"
              ) : (
                "the pages turn up from chapter 2"
              )}
            </p>
          </Section>
        </div>
      </div>
    </div>
  );
}
