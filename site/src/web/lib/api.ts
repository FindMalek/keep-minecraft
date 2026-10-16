import { useCallback, useEffect, useRef, useState } from "react";

export async function api<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(path, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined || init?.method ? { "content-type": "application/json", "x-keep": "1" } : {},
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) {
    const data = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(data?.error ?? `${response.status}`);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

/** Fetches `path` now and every `everyMs`; `reload` refetches right away (after a change). */
export function usePoll<T>(path: string | null, everyMs: number): { data: T | null; error: string | null; reload: () => void } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useRef<() => void>(() => {});
  const reload = useCallback(() => load.current(), []);
  useEffect(() => {
    if (!path) return;
    let alive = true;
    load.current = () => {
      api<T>(path).then(
        (value) => {
          if (!alive) return;
          setData(value);
          setError(null);
        },
        (e: Error) => alive && setError(e.message),
      );
    };
    load.current();
    const timer = setInterval(load.current, everyMs);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [path, everyMs]);
  return { data, error, reload };
}
