"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { actors, type PreviewActor } from "@/lib/policy";
import {
  expireRequests,
  initialState,
  transition,
  type ReviewState,
  type ReviewRequest,
} from "@/lib/review-data";

const storageKey = "evershine:m1:sample-session:v1";
type ReviewContextValue = {
  state: ReviewState | null;
  actor: PreviewActor;
  setActor: (id: string) => void;
  act: (
    id: string,
    action: Parameters<typeof transition>[3],
    reason: string,
    details: string,
  ) => string | null;
  addDraft: (
    input: Pick<
      ReviewRequest,
      "title" | "module" | "target" | "proposed" | "reason"
    >,
  ) => void;
  markRead: (id: string) => void;
  reset: () => void;
  storageAvailable: boolean;
};
const ReviewContext = createContext<ReviewContextValue | null>(null);
export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ReviewState | null>(null);
  const [actor, changeActor] = useState(actors[0]);
  const [storageAvailable, setStorageAvailable] = useState(true);
  useEffect(() => {
    let active = true;
    Promise.resolve().then(() => {
      if (!active) return;
      let next = initialState();
      try {
        const stored = sessionStorage.getItem(storageKey);
        if (stored) {
          const parsed = JSON.parse(stored) as ReviewState;
          if (
            parsed.schema === 1 &&
            Array.isArray(parsed.requests) &&
            Array.isArray(parsed.audit) &&
            Array.isArray(parsed.notifications) &&
            parsed.requests.every(
              (r) => Array.isArray(r.versions) && typeof r.id === "string",
            ) &&
            parsed.notifications.every(
              (n) => Array.isArray(n.recipients) && Array.isArray(n.readBy),
            )
          )
            next = parsed;
        }
        sessionStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        setStorageAvailable(false);
      }
      setState(expireRequests(next));
    });
    const timer = setInterval(
      () =>
        setState((previous) =>
          previous ? expireRequests(previous) : previous,
        ),
      15000,
    );
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, []);
  useEffect(() => {
    if (state) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(state));
      } catch {
        /* Continue in memory when browser storage is unavailable. */
      }
    }
  }, [state]);
  function act(
    id: string,
    action: Parameters<typeof transition>[3],
    reason: string,
    details: string,
  ) {
    if (!state) return "The preview is opening. Try again.";
    try {
      setState(transition(state, actor, id, action, reason, details));
      return null;
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Could not update the sample request.";
    }
  }
  function addDraft(
    input: Pick<
      ReviewRequest,
      "title" | "module" | "target" | "proposed" | "reason"
    >,
  ) {
    const at = new Date().toISOString();
    const id = `REQ-${crypto.randomUUID().slice(0, 8)}`;
    setState((previous) =>
      previous
        ? {
            ...previous,
            requests: [
              ...previous.requests,
              {
                ...input,
                id,
                requesterId: actor.id,
                requester: actor.name,
                current: "No change applied",
                status: "Draft",
                createdAt: at,
                deadline: null,
                version: 1,
                versions: [],
              },
            ],
            audit: [
              {
                id: crypto.randomUUID(),
                at,
                actor: actor.name,
                action: "Draft created",
                target: id,
                details: input.reason,
              },
              ...previous.audit,
            ],
          }
        : previous,
    );
  }
  function markRead(id: string) {
    setState((previous) =>
      previous
        ? {
            ...previous,
            notifications: previous.notifications.map((n) =>
              n.id === id &&
              n.recipients.includes(actor.id) &&
              !n.readBy.includes(actor.id)
                ? { ...n, readBy: [...n.readBy, actor.id] }
                : n,
            ),
          }
        : previous,
    );
  }
  return (
    <ReviewContext
      value={{
        state,
        actor,
        setActor: (id) =>
          changeActor(actors.find((a) => a.id === id) ?? actors[0]),
        act,
        addDraft,
        markRead,
        reset: () => setState(initialState()),
        storageAvailable,
      }}
    >
      {children}
    </ReviewContext>
  );
}
export function useReview() {
  const context = useContext(ReviewContext);
  if (!context) throw new Error("ReviewProvider is required");
  return context;
}
