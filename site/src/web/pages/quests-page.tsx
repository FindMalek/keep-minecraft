import { Badge } from "@/components/ui/badge";
import type { State } from "../../shared/types";
import { QuestRow } from "../components/quest-row";
import { Section } from "../components/section";

export function QuestsPage({ state }: { state: State }) {
  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <p className="text-muted-foreground">
        <Badge variant="outline" className="mr-1 font-mono text-[10px]">
          group
        </Badge>
        quests count for everyone the moment one of you does them. The rest are your own; faces show who's done them. In game they're under
        advancements (L).
      </p>
      {state.chapters
        .filter((c) => c.open)
        .reverse()
        .map((chapter) => (
          <Section
            key={chapter.n}
            title={`chapter ${chapter.n} · ${chapter.name}`}
            meta={`${chapter.quests.filter((q) => q.done).length}/${chapter.quests.length}`}
          >
            <div className="flex flex-col divide-y">
              {chapter.quests.map((quest) => (
                <QuestRow key={quest.path} quest={quest} players={state.players} />
              ))}
            </div>
          </Section>
        ))}
      <p className="text-muted-foreground text-xs">{7 - state.chapter} more chapters to go.</p>
    </div>
  );
}
