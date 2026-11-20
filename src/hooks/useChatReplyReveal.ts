import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatMessage } from "../types";
import { chatMessageParts } from "../services/chatMessagePresentation";
import { createReplyRevealClock } from "../services/chatReplyReveal";

export function useChatReplyReveal(scope: string, active: boolean) {
  const [pending, setPending] = useState<{ id: string; shown: number; total: number } | null>(null);
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());
  const enabled = useRef(active);
  const mounted = useRef(true);
  enabled.current = active;
  const reduced = useRef(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const timer = useRef(createReplyRevealClock({ set: (fn: () => void, ms: number) => window.setTimeout(fn, ms), clear: (id: number) => window.clearTimeout(id) })).current;
  const finish = useCallback(() => { timer.cancel(); setPending(null); }, [timer]);
  const reset = useCallback(() => { timer.cancel(); setPending(null); setFresh(new Set()); }, [timer]);

  useEffect(() => {
    mounted.current = true;
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => { reduced.current = preference.matches; if (preference.matches) { finish(); setFresh(new Set()); } };
    preference.addEventListener("change", change);
    return () => { mounted.current = false; preference.removeEventListener("change", change); timer.cancel(); };
  }, [finish, timer]);
  useEffect(() => { reset(); }, [scope, active, reset]);

  const present = useCallback((message: ChatMessage) => {
    if (!mounted.current) return;
    // A new message completes the earlier visual sequence immediately. Sending
    // never waits for these timers, and no timer writes or deletes stored data.
    finish();
    if (!enabled.current || reduced.current) return;
    setFresh(previous => new Set([...previous, message.id].slice(-80)));
    if (message.role !== "assistant") return;
    const parts = chatMessageParts(message);
    timer.start(parts, false, shown => setPending(shown >= parts.length ? null : { id: message.id, shown, total: parts.length }));
  }, [finish, timer]);

  return { pending, fresh, present, finish, reset };
}
