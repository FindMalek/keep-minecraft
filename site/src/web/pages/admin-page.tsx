import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AdminOverview } from "../../shared/types";
import { PlayerHead } from "../components/player-head";
import { Section } from "../components/section";
import { api } from "../lib/api";
import { ago, when } from "../lib/time";

const post = <T,>(path: string, body: unknown = {}): Promise<T> => api<T>(path, { method: "POST", body });

function bytes(value: number): string {
  if (value < 1024 ** 2) return `${Math.round(value / 1024)} KB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(0)} MB`;
  return `${(value / 1024 ** 3).toFixed(1)} GB`;
}

function Login({ onDone }: { onDone: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    post("/api/admin/login", { user: form.get("user"), password: form.get("password") }).then(onDone, (e: Error) => setError(e.message));
  };
  return (
    <form onSubmit={submit} className="flex max-w-xs flex-col gap-4">
      <h1 className="text-xl">admin</h1>
      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="admin-user">username</FieldLabel>
          <Input id="admin-user" name="user" autoComplete="username" required />
        </Field>
        <Field>
          <FieldLabel htmlFor="admin-password">password</FieldLabel>
          <Input id="admin-password" name="password" type="password" autoComplete="current-password" required />
          {error && <FieldError>{error}</FieldError>}
        </Field>
      </FieldGroup>
      <Button type="submit" className="self-start">
        sign in
      </Button>
    </form>
  );
}

function Console({ disabled }: { disabled: boolean }) {
  const [lines, setLines] = useState<{ command: string; reply: string }[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const run = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const command = input.current?.value.trim() ?? "";
    if (!command) return;
    post<{ reply: string }>("/api/admin/console", { command }).then(
      ({ reply }) => {
        setLines((all) => [...all.slice(-49), { command, reply: reply || "(no reply)" }]);
        if (input.current) input.current.value = "";
      },
      (e: Error) => toast.error(e.message),
    );
  };
  return (
    <div className="flex flex-col gap-3">
      {lines.length > 0 && (
        <pre className="max-h-72 overflow-auto border bg-card p-3 font-mono text-xs leading-relaxed">
          {lines.map((line, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: an append-only log
            <div key={i}>
              <span className="text-muted-foreground">&gt; {line.command}</span>
              {"\n"}
              {line.reply}
            </div>
          ))}
        </pre>
      )}
      <form onSubmit={run} className="flex gap-2">
        <Input
          ref={input}
          aria-label="server command"
          placeholder="say hello · time set day · weather clear"
          className="font-mono"
          disabled={disabled}
        />
        <Button type="submit" variant="outline" disabled={disabled}>
          run
        </Button>
      </form>
    </div>
  );
}

function Dashboard({ onSignOut }: { onSignOut: () => void }) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const load = useCallback(() => {
    post<AdminOverview>("/api/admin/overview").then(setData, (e: Error) => toast.error(e.message));
  }, []);
  useEffect(() => {
    load();
    const timer = setInterval(load, 10_000);
    return () => clearInterval(timer);
  }, [load]);

  const act = (path: string, body: unknown, done: string): void => {
    post<{ reply?: string }>(path, body).then(
      (result) => {
        toast(result.reply || done);
        setTimeout(load, 1500);
      },
      (e: Error) => toast.error(e.message),
    );
  };
  const addPlayer = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const target = event.currentTarget;
    const name = String(new FormData(target).get("name"));
    act("/api/admin/players", { action: "whitelist-add", name }, "added");
    target.reset();
  };

  if (!data) return <p className="text-muted-foreground">loading</p>;
  const up = data.server.up;
  return (
    <div className="flex flex-col gap-10">
      <div className="flex items-center justify-between gap-4">
        <h1 className="text-xl">admin</h1>
        <Button variant="ghost" size="sm" onClick={onSignOut}>
          sign out
        </Button>
      </div>

      <div className="grid gap-10 md:grid-cols-2">
        <Section title="server" meta={up ? `${data.server.online.length}/${data.server.max} online` : "asleep"}>
          <p className="text-muted-foreground">
            {up
              ? data.server.online.length
                ? `on now: ${data.server.online.join(", ")}`
                : "running, nobody on. it goes to sleep after 30 minutes."
              : "stopped. starting takes about a minute."}
          </p>
          <div className="flex flex-wrap gap-2">
            {!up && <Button onClick={() => act("/api/admin/server", { action: "start" }, "starting")}>start</Button>}
            {up && (
              <>
                <Button variant="outline" onClick={() => act("/api/admin/server", { action: "restart" }, "restarting")}>
                  restart
                </Button>
                <Button variant="destructive" onClick={() => act("/api/admin/server", { action: "stop" }, "stopping")}>
                  stop
                </Button>
              </>
            )}
          </div>
        </Section>

        <Section title="story" meta={data.chapter ? `chapter ${data.chapter}/7` : undefined}>
          <p className="text-muted-foreground">
            {data.pages ?? 0}/9 journal pages found. Chapters open on fridays once the current one is finished; you can open the next one
            now.
          </p>
          <div>
            <Button variant="outline" disabled={!up} onClick={() => act("/api/admin/chapter", {}, "next chapter open")}>
              open the next chapter now
            </Button>
          </div>
        </Section>
      </div>

      <Section title="players" meta={`${data.whitelist.length} on the whitelist`}>
        <form onSubmit={addPlayer} className="flex max-w-md gap-2">
          <Input
            name="name"
            required
            pattern="[A-Za-z0-9_]{3,16}"
            placeholder="minecraft name"
            aria-label="minecraft name to whitelist"
            disabled={!up}
          />
          <Button type="submit" variant="outline" disabled={!up}>
            add
          </Button>
        </form>
        {!up && <p className="text-muted-foreground text-xs">the server has to be running to change players.</p>}
        {data.whitelist.length > 0 && (
          <Table>
            <TableBody>
              {data.whitelist.map((p) => {
                const online = data.server.online.includes(p.name);
                return (
                  <TableRow key={p.uuid}>
                    <TableCell>
                      <span className="inline-flex items-center gap-2">
                        <PlayerHead uuid={p.uuid} name={p.name} className={online ? undefined : "opacity-50"} />
                        {p.name}
                        {p.op && (
                          <Badge variant="outline" className="font-mono text-[10px]">
                            op
                          </Badge>
                        )}
                        {online && <span className="text-muted-foreground text-xs">online</span>}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      <span className="inline-flex gap-1">
                        {online && (
                          <Button
                            size="xs"
                            variant="ghost"
                            onClick={() => act("/api/admin/players", { action: "kick", name: p.name }, "kicked")}
                          >
                            kick
                          </Button>
                        )}
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={!up}
                          onClick={() => act("/api/admin/players", { action: p.op ? "deop" : "op", name: p.name }, "done")}
                        >
                          {p.op ? "remove op" : "make op"}
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          disabled={!up}
                          onClick={() => act("/api/admin/players", { action: "whitelist-remove", name: p.name }, "removed")}
                        >
                          remove
                        </Button>
                      </span>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Section>

      <Section title="console" meta="any server command">
        <Console disabled={!up} />
      </Section>

      <Section
        title="log"
        meta={
          <button
            type="button"
            className="underline-offset-4 hover:underline"
            onClick={() => post<string[]>("/api/admin/logs").then(setLogs)}
          >
            {logs.length ? "refresh" : "show"}
          </button>
        }
      >
        {logs.length > 0 && (
          <pre className="max-h-96 overflow-auto border bg-card p-3 font-mono text-[11px] leading-relaxed">{logs.join("\n")}</pre>
        )}
      </Section>

      <div className="grid gap-10 md:grid-cols-2">
        <Section title="backups" meta="nightly, kept 7 days">
          {data.backups.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>file</TableHead>
                  <TableHead className="text-right">size</TableHead>
                  <TableHead className="text-right">made</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody className="font-mono">
                {data.backups.map((b) => (
                  <TableRow key={b.name}>
                    <TableCell className="max-w-48 truncate">{b.name}</TableCell>
                    <TableCell className="text-right">{bytes(b.bytes)}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{ago(b.at)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="text-muted-foreground">none yet. the first one runs an hour after the server starts.</p>
          )}
        </Section>

        <Section title="events" meta={`${data.events.length}`}>
          {data.events.length ? (
            <ul className="flex flex-col divide-y">
              {data.events.map((event) => (
                <li key={event.id} className="flex items-center justify-between gap-3 py-2">
                  <span>
                    {event.title} <span className="font-mono text-muted-foreground text-xs">{when(event.startsAt)}</span>
                  </span>
                  <Button
                    size="xs"
                    variant="ghost"
                    onClick={() =>
                      api(`/api/admin/events/${event.id}`, { method: "DELETE" }).then(load, (e: Error) => toast.error(e.message))
                    }
                  >
                    delete
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-muted-foreground">no events planned.</p>
          )}
        </Section>
      </div>
    </div>
  );
}

export function AdminPage() {
  const [state, setState] = useState<{ admin: boolean; enabled: boolean } | null>(null);
  const check = useCallback(() => {
    api<{ admin: boolean; enabled: boolean }>("/api/admin/me").then(setState, () => setState({ admin: false, enabled: false }));
  }, []);
  useEffect(check, [check]);
  if (!state) return null;
  if (!state.enabled) return <p className="text-muted-foreground">the admin account isn't set up on this server.</p>;
  if (!state.admin) return <Login onDone={check} />;
  return <Dashboard onSignOut={() => void post("/api/admin/logout").then(check)} />;
}
