import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Me, PublicInfo, State } from "../shared/types";
import { PlayerHead } from "./components/player-head";
import { api, usePoll } from "./lib/api";
import { navigate, usePath } from "./lib/router";
import { EventsPage } from "./pages/events-page";
import { HomePage } from "./pages/home-page";
import { JoinPage } from "./pages/join-page";
import { PlayersPage } from "./pages/players-page";
import { QuestsPage } from "./pages/quests-page";
import { StoryPage } from "./pages/story-page";
import { WorldPage } from "./pages/world-page";

const NAV = [
  { path: "/", label: "home" },
  { path: "/story", label: "story" },
  { path: "/quests", label: "quests" },
  { path: "/events", label: "events" },
  { path: "/players", label: "players" },
  { path: "/world", label: "map" },
  { path: "/join", label: "join" },
];

function ServerStatus({ info, waking }: { info: PublicInfo | null; waking: boolean }) {
  if (!info) return null;
  const up = info.server.up;
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-muted-foreground text-xs">
      <span aria-hidden className={cn("size-1.5 border border-muted-foreground", up && "border-foreground bg-foreground")} />
      {up ? `${info.server.online}/${info.server.max} online` : waking ? "waking up, about a minute" : "asleep"}
    </span>
  );
}

export function App() {
  const path = usePath();
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  const [waking, setWaking] = useState(false);
  const info = usePoll<PublicInfo>("/api/public", waking ? 5000 : 30_000).data;
  const { data: state, reload } = usePoll<State>(me ? "/api/state" : null, 15_000);

  useEffect(() => {
    api<Me | null>("/api/me").then(setMe, () => setMe(null));
  }, []);

  useEffect(() => {
    if (info?.server.up) setWaking(false);
  }, [info?.server.up]);

  const wake = (): void => {
    setWaking(true);
    api("/api/wake", { method: "POST" }).then(
      () => toast("waking the server up, give it a minute"),
      (e: Error) => {
        setWaking(false);
        toast.error(e.message);
      },
    );
  };

  const signOut = (): void => {
    void api("/api/logout", { method: "POST" }).then(() => setMe(null));
  };

  const page = me ? path : "/join";
  const shown = me ? NAV : NAV.filter((item) => item.path === "/join");

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-11 items-center gap-4 border-b px-4">
        <a href="/" onClick={navigate} className="inline-flex items-center gap-2 font-medium">
          <span aria-hidden className="h-3.5 w-2.5 bg-foreground" />
          {info?.title ?? "the keep"}
        </a>
        <ServerStatus info={info} waking={waking} />
        {me && info && !info.server.up && !waking && (
          <Button variant="outline" size="xs" onClick={wake}>
            wake it up
          </Button>
        )}
        {me && (
          <span className="ml-auto inline-flex items-center gap-2 text-xs">
            <PlayerHead uuid={me.uuid} name={me.name} className="size-5" />
            <span className="hidden text-muted-foreground sm:inline">{me.name}</span>
            <Button variant="ghost" size="xs" onClick={signOut}>
              sign out
            </Button>
          </span>
        )}
      </header>
      <nav aria-label="pages" className="flex gap-1 overflow-x-auto border-b px-2 [scrollbar-width:none]">
        {shown.map((item) => (
          <a
            key={item.path}
            href={item.path}
            onClick={navigate}
            aria-current={page === item.path ? "page" : undefined}
            className="-mb-px whitespace-nowrap border-transparent border-b px-2 py-2.5 text-muted-foreground hover:text-foreground aria-[current=page]:border-foreground aria-[current=page]:text-foreground"
          >
            {item.label}
          </a>
        ))}
      </nav>
      <main className={page === "/world" ? "flex flex-1" : "mx-auto w-full max-w-5xl px-4 pt-8 pb-16"}>
        {me === undefined ? null : page === "/join" ? (
          <JoinPage info={info} me={me} onSignedIn={setMe} />
        ) : !state ? (
          <p className="text-muted-foreground">loading</p>
        ) : page === "/story" ? (
          <StoryPage state={state} />
        ) : page === "/quests" ? (
          <QuestsPage state={state} />
        ) : page === "/events" ? (
          <EventsPage state={state} me={me as Me} onChange={reload} />
        ) : page === "/players" ? (
          <PlayersPage state={state} />
        ) : page === "/world" ? (
          <WorldPage />
        ) : (
          <HomePage state={state} />
        )}
      </main>
    </div>
  );
}
