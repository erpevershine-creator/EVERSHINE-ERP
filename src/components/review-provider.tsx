"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { actors, type PreviewActor } from "@/lib/policy";
import {
  canViewPage,
  validGmail,
  validPhoto,
  pageCatalog,
  applyPageAccessChange,
  type ReviewAccount,
  type PageAccess,
} from "@/lib/administration";
import {
  expireRequests,
  initialState,
  transition,
  type ReviewState,
  type ReviewRequest,
} from "@/lib/review-data";

const storageKey = "evershine:m1:sample-session:v1";
const actorKey = `${storageKey}:actor`;
type AccountInput = Pick<
  ReviewAccount,
  | "name"
  | "username"
  | "positionId"
  | "department"
  | "role"
  | "contact"
  | "photo"
>;
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
  previewActors: PreviewActor[];
  currentAccount: ReviewAccount | undefined;
  canView: (page: string) => boolean;
  createAccount: (input: AccountInput) => string | null;
  requestPageAccess: (
    positionId: string,
    pages: PageAccess,
    accountIds: string[],
    reason: string,
  ) => string | null;
};
const ReviewContext = createContext<ReviewContextValue | null>(null);
export function ReviewProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ReviewState | null>(null);
  const [actorId, changeActor] = useState("owner");
  const currentAccount = state?.accounts.find(
    (a) => a.id === actorId && a.status === "Active",
  );
  const previewActors: PreviewActor[] =
    state?.accounts
      .filter((a) => a.status === "Active")
      .map((a) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        approvals: a.approvals,
      })) ?? actors;
  const actor = previewActors.find((a) => a.id === actorId) ?? actors[0];
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
            next = {
              ...parsed,
              accounts: Array.isArray(parsed.accounts)
                ? parsed.accounts
                : next.accounts,
              positions: Array.isArray(parsed.positions)
                ? parsed.positions
                : next.positions,
            };
        }
        sessionStorage.setItem(storageKey, JSON.stringify(next));
        const savedActor = sessionStorage.getItem(actorKey);
        if (
          next.accounts.some(
            (a) => a.id === savedActor && a.status === "Active",
          )
        )
          changeActor(savedActor!);
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
  function setActor(id: string) {
    if (!previewActors.some((a) => a.id === id)) return;
    changeActor(id);
    try {
      sessionStorage.setItem(actorKey, id);
    } catch {
      /* Memory preview remains available. */
    }
  }
  function createAccount(input: AccountInput) {
    if (!state || !currentAccount) return "The preview is opening. Try again.";
    if (
      actor.role !== "Owner" &&
      !(
        actor.role === "Admin" && actor.approvals.includes("Account Management")
      )
    )
      return "Account creation is outside your permissions.";
    const position = state.positions.find(
      (p) => p.id === input.positionId && p.id !== "owner-position",
    );
    if (
      !position ||
      input.role === "Owner" ||
      !["Admin", "Employee"].includes(input.role)
    )
      return "Choose a staff position and ERP role.";
    if (
      !input.name.trim() ||
      !input.department.trim() ||
      !input.contact.trim() ||
      !validPhoto(input.photo)
    )
      return "Complete the employee details and select a profile photo.";
    if (!validGmail(input.username))
      return "Enter a company-assigned @gmail.com address.";
    if (
      state.accounts.some(
        (a) => a.username.toLowerCase() === input.username.trim().toLowerCase(),
      )
    )
      return "This username is already assigned to an account.";
    if (
      actor.role === "Admin" &&
      (input.role !== "Employee" ||
        position.approvals.length > 0 ||
        pageCatalog.some(
          (p) => position.pages[p.id] && !currentAccount.pages[p.id],
        ))
    )
      return "This position or role exceeds your delegated authority.";
    if (input.role === "Employee" && position.approvals.length)
      return "This position requires the Admin ERP role.";
    // Explicit allowlist: password fields never enter sample state or audit.
    const account: ReviewAccount = {
      id: crypto.randomUUID(),
      name: input.name.trim(),
      username: input.username.trim().toLowerCase(),
      positionId: position.id,
      department: input.department.trim(),
      role: input.role,
      contact: input.contact.trim(),
      photo: input.photo,
      status: "Active",
      pages: { ...position.pages },
      approvals: input.role === "Admin" ? [...position.approvals] : [],
    };
    setState({
      ...state,
      accounts: [...state.accounts, account],
      audit: [
        {
          id: crypto.randomUUID(),
          at: new Date().toISOString(),
          actor: actor.name,
          action: "Sample account created",
          target: account.id,
          details: `${account.name} · ${position.name} · ${account.role}`,
        },
        ...state.audit,
      ],
    });
    return null;
  }
  function requestPageAccess(
    positionId: string,
    pages: PageAccess,
    accountIds: string[],
    reason: string,
  ) {
    if (!state || !currentAccount) return "The preview is opening. Try again.";
    if (
      actor.role !== "Owner" &&
      !(
        actor.role === "Admin" &&
        actor.approvals.includes("Positions & Permissions")
      )
    )
      return "Template changes are outside your permissions.";
    const position = state.positions.find((p) => p.id === positionId);
    if (!position || position.id === "owner-position")
      return "The single Owner account keeps company access.";
    if (!reason.trim()) return "Enter a reason note.";
    if (pageCatalog.every((p) => position.pages[p.id] === pages[p.id]))
      return "Change at least one page visibility setting.";
    if (
      actor.role === "Admin" &&
      pageCatalog.some((p) => pages[p.id] && !currentAccount.pages[p.id])
    )
      return "This change exceeds your delegated page access.";
    const change = {
      positionId,
      before: { ...position.pages },
      after: { ...pages },
      accountIds: [...accountIds],
      accountBefore: Object.fromEntries(
        state.accounts
          .filter((a) => accountIds.includes(a.id))
          .map((a) => [a.id, { ...a.pages }]),
      ),
    };
    try {
      applyPageAccessChange(state.positions, state.accounts, change);
    } catch (error) {
      return error instanceof Error
        ? error.message
        : "Check the affected accounts.";
    }
    const at = new Date().toISOString(),
      id = `REQ-${crypto.randomUUID().slice(0, 8)}`;
    const members = state.accounts
      .filter((a) => accountIds.includes(a.id))
      .map((a) => `${a.name} (${a.username || a.id})`)
      .join(", ");
    const describe = (access: PageAccess) =>
      pageCatalog
        .map((p) => `${p.label}: ${access[p.id] ? "Visible" : "Hidden"}`)
        .join("; ");
    const request: ReviewRequest = {
      id,
      title: `Page access · ${position.name}`,
      module: "Positions & Permissions",
      requesterId: actor.id,
      requester: actor.name,
      target: `${position.name} · Included accounts: ${members}`,
      current: describe(position.pages),
      proposed: describe(pages),
      reason: reason.trim(),
      status: "Pending",
      createdAt: at,
      deadline: null,
      version: 1,
      versions: [],
      pageAccessChange: change,
    };
    setState({
      ...state,
      requests: [...state.requests, request],
      audit: [
        {
          id: crypto.randomUUID(),
          at,
          actor: actor.name,
          action: "Submitted",
          target: id,
          details: reason.trim(),
          before: request.current,
          after: `${request.proposed} · ${request.target}`,
        },
        ...state.audit,
      ],
      notifications: [
        {
          id: crypto.randomUUID(),
          at,
          title: request.title,
          message: "Review page visibility and the included accounts.",
          recipients: [
            ...new Set([
              actor.id,
              ...previewActors
                .filter(
                  (a) =>
                    a.role === "Owner" ||
                    a.approvals.includes("Positions & Permissions"),
                )
                .map((a) => a.id),
            ]),
          ],
          readBy: [],
          requestId: id,
        },
        ...state.notifications,
      ],
    });
    return null;
  }
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
        setActor,
        previewActors,
        currentAccount,
        canView: (page) => canViewPage(currentAccount, page),
        createAccount,
        requestPageAccess,
        act,
        addDraft,
        markRead,
        reset: () => {
          if (actor.role === "Owner") {
            setState(initialState());
            setActor("owner");
          }
        },
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
