import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { State } from "../../shared/types";
import { PlayerHead } from "../components/player-head";
import { ago, hours } from "../lib/time";

const COLUMNS = ["played", "quests", "travelled", "mined", "mobs", "fish", "deaths", "seen"];

export function PlayersPage({ state }: { state: State }) {
  const players = [...state.players].sort(
    (a, b) => Number(b.online) - Number(a.online) || (b.stats?.playMinutes ?? 0) - (a.stats?.playMinutes ?? 0),
  );
  return (
    <div className="flex flex-col gap-4">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>player</TableHead>
            {COLUMNS.map((column) => (
              <TableHead key={column} className="text-right">
                {column}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody className="font-mono">
          {players.map((p) => (
            <TableRow key={p.uuid}>
              <TableCell className="font-sans">
                <span className="inline-flex items-center gap-2">
                  <PlayerHead uuid={p.uuid} name={p.name} className={p.online ? undefined : "opacity-50"} />
                  {p.name}
                  {p.online && <span role="img" aria-label="online" className="size-1.5 bg-foreground" />}
                </span>
              </TableCell>
              <TableCell className="text-right">{p.stats ? hours(p.stats.playMinutes) : "–"}</TableCell>
              <TableCell className="text-right">{p.quests.length}</TableCell>
              <TableCell className="text-right">{p.stats ? `${p.stats.km} km` : "–"}</TableCell>
              <TableCell className="text-right">{p.stats?.blocksMined.toLocaleString("en-GB") ?? "–"}</TableCell>
              <TableCell className="text-right">{p.stats?.mobKills ?? "–"}</TableCell>
              <TableCell className="text-right">{p.stats?.fish ?? "–"}</TableCell>
              <TableCell className="text-right">{p.stats?.deaths ?? "–"}</TableCell>
              <TableCell className="text-right text-muted-foreground">
                {p.online ? "now" : p.stats ? ago(p.stats.savedAt) : "never"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <p className="text-muted-foreground text-xs">stats are saved by the game every few minutes and when you log out.</p>
    </div>
  );
}
