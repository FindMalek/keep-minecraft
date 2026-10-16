import { type FormEvent, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import type { Me, PublicInfo } from "../../shared/types";
import { Section } from "../components/section";
import { StoryText } from "../components/story-text";
import { api } from "../lib/api";

interface Pending {
  id: string;
  code: number;
  waking: boolean;
}

function SignIn({ onSignedIn }: { onSignedIn: (me: Me) => void }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => {
      api<{ ok: boolean; me?: Me }>("/api/login/check", { method: "POST", body: { id: pending.id } }).then(
        (result) => result.ok && result.me && onSignedIn(result.me),
        (e: Error) => {
          setError(e.message);
          setPending(null);
        },
      );
    }, 2000);
    return () => clearInterval(timer);
  }, [pending, onSignedIn]);

  const start = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name"));
    api<Pending>("/api/login/start", { method: "POST", body: { name } }).then(
      (result) => {
        setError(null);
        setPending(result);
      },
      (e: Error) => setError(e.message),
    );
  };

  if (pending) {
    return (
      <div className="flex max-w-sm flex-col items-start gap-3">
        <p>In Minecraft, open chat (T) and type:</p>
        <code className="select-all border px-3 py-2 font-mono text-base">/trigger login set {pending.code}</code>
        <p className="text-muted-foreground text-xs">
          {pending.waking && "The server was asleep and is waking up (about a minute). Join it, then type the code. "}
          Waiting for it… you need to be on the server. The code works for 5 minutes.
        </p>
        <Button variant="ghost" size="sm" onClick={() => setPending(null)}>
          start over
        </Button>
      </div>
    );
  }
  return (
    <form onSubmit={start} className="flex max-w-sm flex-col gap-3">
      <Field>
        <FieldLabel htmlFor="signin-name">your minecraft name</FieldLabel>
        <Input id="signin-name" name="name" required pattern="[A-Za-z0-9_]{3,16}" autoComplete="username" />
        <FieldDescription>No password: you prove it's you by typing a code in game.</FieldDescription>
        {error && <FieldError>{error}</FieldError>}
      </Field>
      <Button type="submit" className="self-start">
        sign in
      </Button>
    </form>
  );
}

export function JoinPage({ info, me, onSignedIn }: { info: PublicInfo | null; me: Me | null; onSignedIn: (me: Me) => void }) {
  return (
    <div className="flex max-w-2xl flex-col gap-10">
      <section className="flex flex-col gap-4">
        <p className="font-mono text-muted-foreground text-xs">a minecraft server for friends</p>
        <h1 className="text-3xl tracking-tight">{info?.title ?? "the keep"}</h1>
        <StoryText
          lines={[
            "Vanilla, with a story: the Keepers left the Keep forty years ago and their trail is still out there. A new chapter opens every week. Play when you can.",
          ]}
        />
      </section>
      {!me && (
        <Section title="sign in">
          <SignIn onSignedIn={onSignedIn} />
        </Section>
      )}
      <Section title="how to join">
        <ol className="flex list-decimal flex-col gap-2.5 pl-5">
          <li>Ask Malek to add your Minecraft name to the whitelist. You need Minecraft Java Edition on a computer.</li>
          <li>
            Install the{" "}
            <a href="https://modrinth.com/app" className="underline underline-offset-4">
              Modrinth App
            </a>{" "}
            (or Prism Launcher).
          </li>
          <li>
            {info?.packUrl ? (
              <a href={info.packUrl} className="underline underline-offset-4">
                Download the pack
              </a>
            ) : (
              "Download the pack"
            )}{" "}
            and open it with the app. It installs Minecraft {info?.version} with the right mods: better FPS, shaders, far view distance,
            voice chat, minimap.
          </li>
          <li>
            Play. The server is already in your list as <span className="font-mono">{info?.address}</span>. If it's asleep, sign in here and
            wake it up first.
          </li>
          <li>Voice chat: hold Caps Lock to talk, V opens its settings. People sound closer the closer they are.</li>
        </ol>
      </Section>
    </div>
  );
}
