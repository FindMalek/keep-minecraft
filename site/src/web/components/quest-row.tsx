import { Badge } from "@/components/ui/badge";
import { Item, ItemActions, ItemContent, ItemDescription, ItemMedia, ItemTitle } from "@/components/ui/item";
import { cn } from "@/lib/utils";
import type { Player, QuestStatus } from "../../shared/types";
import { PlayerHead } from "./player-head";

export function QuestRow({ quest, players }: { quest: QuestStatus; players: Player[] }) {
  const by = players.filter((p) => quest.by.includes(p.name));
  return (
    <Item size="xs" className="px-0">
      <ItemMedia>
        <span
          role="img"
          aria-label={quest.done ? "done" : "not done"}
          className={cn(
            "block size-3 border border-muted-foreground",
            quest.done && "border-foreground bg-foreground",
            quest.frame === "challenge" && "size-3.5",
          )}
        />
      </ItemMedia>
      <ItemContent>
        <ItemTitle className={cn(quest.done && "text-muted-foreground")}>
          {quest.title}
          {quest.shared && (
            <Badge variant="outline" className="font-mono text-[10px]">
              group
            </Badge>
          )}
        </ItemTitle>
        <ItemDescription>{quest.description}</ItemDescription>
      </ItemContent>
      {by.length > 0 && (
        <ItemActions aria-label={`done by ${quest.by.join(", ")}`}>
          {by.map((p) => (
            <PlayerHead key={p.uuid} uuid={p.uuid} name={p.name} className="size-5" />
          ))}
        </ItemActions>
      )}
    </Item>
  );
}
