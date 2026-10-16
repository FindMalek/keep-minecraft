import { type FormEvent, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Item, ItemActions, ItemContent, ItemDescription, ItemTitle } from "@/components/ui/item";
import { Textarea } from "@/components/ui/textarea";
import type { GameEvent, Me, State } from "../../shared/types";
import { Section } from "../components/section";
import { api, usePoll } from "../lib/api";
import { until, when } from "../lib/time";

function NewEvent({ onCreated }: { onCreated: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    api("/api/events", {
      method: "POST",
      body: { title: form.get("title"), description: form.get("description"), startsAt: new Date(String(form.get("startsAt"))).getTime() },
    }).then(
      () => {
        target.reset();
        setError(null);
        toast("event added");
        onCreated();
      },
      (e: Error) => setError(e.message),
    );
  };
  return (
    <form onSubmit={submit}>
      <FieldGroup className="grid gap-4 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="event-title">what</FieldLabel>
          <Input id="event-title" name="title" required maxLength={80} placeholder="boat race on the river" />
        </Field>
        <Field>
          <FieldLabel htmlFor="event-when">when (your time)</FieldLabel>
          <Input id="event-when" name="startsAt" type="datetime-local" required />
        </Field>
        <Field className="sm:col-span-2">
          <FieldLabel htmlFor="event-details">details</FieldLabel>
          <Textarea id="event-details" name="description" maxLength={500} rows={2} placeholder="meet at the keep gate, bring a boat" />
        </Field>
        <Field orientation="horizontal" className="sm:col-span-2">
          <Button type="submit">add event</Button>
          {error && <FieldError>{error}</FieldError>}
        </Field>
      </FieldGroup>
    </form>
  );
}

export function EventsPage({ state, me, onChange }: { state: State; me: Me; onChange: () => void }) {
  const { data, reload } = usePoll<GameEvent[]>("/api/events", 30_000);
  const events = data ?? [];
  const refresh = (): void => {
    reload();
    onChange();
  };
  const toggle = (event: GameEvent): void => {
    api(`/api/events/${event.id}/going`, { method: "POST", body: { going: !event.going.includes(me.name) } }).then(refresh, (e: Error) =>
      toast.error(e.message),
    );
  };
  const remove = (event: GameEvent): void => {
    api(`/api/events/${event.id}`, { method: "DELETE" }).then(refresh, (e: Error) => toast.error(e.message));
  };
  return (
    <div className="flex max-w-2xl flex-col gap-10">
      {state.nextChapterAt && (
        <Item variant="outline">
          <ItemContent>
            <ItemTitle>chapter {state.chapter + 1} opens</ItemTitle>
            <ItemDescription className="font-mono">
              {when(state.nextChapterAt)} · {until(state.nextChapterAt)}
            </ItemDescription>
          </ItemContent>
        </Item>
      )}
      <Section title="coming up" meta={events.length ? `${events.length}` : undefined}>
        {events.length ? (
          <div className="flex flex-col divide-y">
            {events.map((event) => {
              const going = event.going.includes(me.name);
              return (
                <Item key={event.id} className="items-start px-0">
                  <div className="flex w-36 shrink-0 flex-col font-mono text-xs">
                    <span>{when(event.startsAt)}</span>
                    <span className="text-muted-foreground">{event.startsAt > Date.now() ? until(event.startsAt) : "now"}</span>
                  </div>
                  <ItemContent>
                    <ItemTitle>{event.title}</ItemTitle>
                    {event.description && <ItemDescription>{event.description}</ItemDescription>}
                    <ItemDescription>
                      {event.going.length ? `going: ${event.going.join(", ")}` : "nobody yet"} · by {event.createdBy}
                    </ItemDescription>
                  </ItemContent>
                  <ItemActions>
                    <Button size="sm" variant={going ? "default" : "outline"} aria-pressed={going} onClick={() => toggle(event)}>
                      {going ? "going" : "i'm in"}
                    </Button>
                    {event.createdBy === me.name && (
                      <Button size="sm" variant="ghost" onClick={() => remove(event)}>
                        delete
                      </Button>
                    )}
                  </ItemActions>
                </Item>
              );
            })}
          </div>
        ) : (
          <Empty className="border p-8">
            <EmptyHeader>
              <EmptyTitle>nothing planned</EmptyTitle>
              <EmptyDescription>boat races, build-offs, a trip to the nether. start something.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </Section>
      <Section title="plan something">
        <NewEvent onCreated={refresh} />
      </Section>
    </div>
  );
}
