import {
  canApprove,
  canRevise,
  type ApprovalStatus,
  type Module,
  type PreviewActor,
} from "./policy";
import {
  initialAccounts,
  initialPositions,
  applyPageAccessChange,
  type ReviewAccount,
  type ReviewPosition,
  type PageAccessChange,
} from "./administration";

export type ReviewRequest = {
  pageAccessChange?: PageAccessChange;
  id: string;
  title: string;
  module: Module;
  requesterId: string;
  requester: string;
  target: string;
  current: string;
  proposed: string;
  reason: string;
  status: ApprovalStatus;
  createdAt: string;
  deadline: string | null;
  version: number;
  decisionReason?: string;
  approver?: string;
  sourceId?: string;
  versions: { version: number; details: string; reason: string; at: string }[];
};
export type AuditEvent = {
  id: string;
  at: string;
  actor: string;
  action: string;
  target: string;
  details: string;
  before?: string;
  after?: string;
};
export type ReviewNotification = {
  id: string;
  title: string;
  message: string;
  at: string;
  recipients: string[];
  readBy: string[];
  requestId?: string;
};
export type ReviewState = {
  accounts: ReviewAccount[];
  positions: ReviewPosition[];
  schema: 1;
  requests: ReviewRequest[];
  audit: AuditEvent[];
  notifications: ReviewNotification[];
};

export function initialState(): ReviewState {
  const now = Date.now();
  const at = (hours: number) => new Date(now + hours * 3600000).toISOString();
  return {
    accounts: initialAccounts(),
    positions: structuredClone(initialPositions),
    schema: 1,
    requests: [
      {
        id: "REQ-001",
        title: "Third device access",
        module: "Account Management",
        requesterId: "employee",
        requester: "Employee (sample)",
        target: "Sample employee · laptop",
        current: "Two active devices",
        proposed: "Approve new laptop; close oldest active session",
        reason: "Replacement laptop for daily work.",
        status: "Pending",
        createdAt: at(-5),
        deadline: at(19),
        version: 1,
        versions: [],
      },
      {
        id: "REQ-002",
        title: "Position export permission",
        module: "Positions & Permissions",
        requesterId: "admin",
        requester: "Account Admin (sample)",
        target: "Sample position · included account: Employee (sample)",
        current: "Account report export: disabled",
        proposed: "Enable account report export for the included account only",
        reason: "Monthly account review responsibilities.",
        status: "Pending",
        createdAt: at(-2),
        deadline: null,
        version: 1,
        versions: [],
      },
      {
        id: "REQ-003",
        title: "Account display name correction",
        module: "Account Management",
        requesterId: "employee",
        requester: "Employee (sample)",
        target: "Sample employee account",
        current: "Sample Employee",
        proposed: "Employee (sample)",
        reason: "Correct the display spelling; same person and account.",
        status: "Approved",
        createdAt: at(-24),
        deadline: null,
        version: 1,
        approver: "Owner (sample)",
        versions: [
          {
            version: 1,
            details: "Employee (sample)",
            reason: "Confirmed sample spelling.",
            at: at(-20),
          },
        ],
      },
    ],
    audit: [
      {
        id: "EVT-001",
        at: at(-20),
        actor: "Owner (sample)",
        action: "Approved",
        target: "REQ-003",
        details: "Confirmed sample spelling.",
        before: "Sample Employee",
        after: "Employee (sample)",
      },
    ],
    notifications: [
      {
        id: "NOT-001",
        title: "Third device access",
        message: "A sample login request is waiting for review.",
        at: at(-5),
        recipients: ["owner", "admin", "employee"],
        readBy: [],
        requestId: "REQ-001",
      },
      {
        id: "NOT-002",
        title: "Position export permission",
        message: "Review the template change and included account.",
        at: at(-2),
        recipients: ["owner", "admin"],
        readBy: [],
        requestId: "REQ-002",
      },
    ],
  };
}

export function visibleRequest(actor: PreviewActor, request: ReviewRequest) {
  return (
    actor.role === "Owner" ||
    request.requesterId === actor.id ||
    actor.approvals.includes(request.module)
  );
}
export function transition(
  state: ReviewState,
  actor: PreviewActor,
  id: string,
  action: "submit" | "approve" | "reject" | "revise" | "copy",
  reason: string,
  details: string,
  at = new Date().toISOString(),
): ReviewState {
  const request = state.requests.find((item) => item.id === id);
  if (!request || !visibleRequest(actor, request))
    throw new Error("This request is outside your preview permissions.");
  if (!reason.trim()) throw new Error("Enter a reason note.");
  const eventStatus =
    action === "submit"
      ? "Pending"
      : action === "approve"
        ? "Approved"
        : action === "reject"
          ? "Rejected"
          : action === "revise"
            ? "Revised"
            : "Draft";
  if (
    ["approve", "reject"].includes(action) &&
    (!canApprove(actor, request) || request.status !== "Pending")
  )
    throw new Error("This action is not permitted.");
  if (
    ["approve", "reject"].includes(action) &&
    request.deadline &&
    request.deadline <= at
  )
    throw new Error("This request has expired.");
  if (
    action === "submit" &&
    (request.status !== "Draft" || request.requesterId !== actor.id)
  )
    throw new Error("Only the requester can submit this draft.");
  if (
    action === "revise" &&
    (!canRevise(actor, request.module) ||
      !["Approved", "Revised"].includes(request.status))
  )
    throw new Error("This revision is not permitted.");
  if (
    action === "copy" &&
    (request.status !== "Expired" || !canRevise(actor, request.module))
  )
    throw new Error(
      "Only an authorized Owner or Admin can copy this expired request.",
    );
  if (["submit", "revise"].includes(action) && !details.trim())
    throw new Error("Enter the requested changes.");
  if (request.pageAccessChange && action === "revise")
    throw new Error(
      "Use Positions & Permissions to request a new page access change.",
    );
  if (
    request.pageAccessChange &&
    action === "submit" &&
    details.trim() !== request.proposed
  )
    throw new Error(
      "Page access details must match the selected template and accounts.",
    );
  const accessUpdate =
    request.pageAccessChange && action === "approve"
      ? applyPageAccessChange(
          state.positions,
          state.accounts,
          request.pageAccessChange,
        )
      : null;
  if (
    request.pageAccessChange &&
    action === "approve" &&
    actor.role === "Admin"
  ) {
    const approver = state.accounts.find(
      (a) => a.id === actor.id && a.status === "Active",
    );
    if (
      !approver ||
      Object.entries(request.pageAccessChange.after).some(
        ([page, visible]) =>
          visible && !approver.pages[page as keyof typeof approver.pages],
      )
    )
      throw new Error("This change exceeds your delegated page access.");
  }
  const newId = () => crypto.randomUUID();
  const updated: ReviewRequest = {
    ...request,
    status: action === "reject" ? "Draft" : eventStatus,
    proposed: ["submit", "revise"].includes(action)
      ? details.trim()
      : request.proposed,
    reason: action === "submit" ? reason.trim() : request.reason,
    decisionReason: reason.trim(),
    approver: ["approve", "reject", "revise"].includes(action)
      ? actor.name
      : request.approver,
    version: action === "revise" ? request.version + 1 : request.version,
  };
  if (action === "submit") {
    updated.createdAt = at;
    updated.deadline = request.deadline
      ? new Date(Date.parse(at) + 86400000).toISOString()
      : null;
  }
  if (action === "approve" || action === "revise") {
    updated.current = updated.proposed;
    updated.versions = [
      ...request.versions,
      {
        version: updated.version,
        details: updated.proposed,
        reason: reason.trim(),
        at,
      },
    ];
  }
  if (action === "copy") {
    updated.id = `REQ-${newId().slice(0, 8)}`;
    updated.sourceId = request.id;
    updated.requesterId = actor.id;
    updated.requester = actor.name;
    updated.createdAt = at;
    updated.deadline = null;
    updated.reason = reason.trim();
    updated.versions = [];
    updated.version = 1;
    updated.approver = undefined;
  }
  const events: AuditEvent[] = [
    {
      id: newId(),
      at,
      actor: actor.name,
      action: eventStatus === "Pending" ? "Submitted" : eventStatus,
      target: updated.id,
      details: reason.trim(),
      before: action === "approve" ? request.current : request.proposed,
      after: updated.proposed,
    },
  ];
  // Keep the rejected attempt in History while returning the editable request to Draft.
  const requests =
    action === "copy"
      ? [...state.requests, updated]
      : state.requests.map((item) => (item.id === id ? updated : item));
  return {
    ...state,
    ...(accessUpdate ?? {}),
    requests,
    audit: [...events, ...state.audit],
    notifications: [
      {
        id: newId(),
        title: `${updated.title} · ${eventStatus}`,
        message: reason.trim(),
        at,
        recipients: [
          ...new Set([
            "owner",
            updated.requesterId,
            ...(updated.module === "Account Management" ? ["admin"] : []),
          ]),
        ],
        readBy: [],
        requestId: updated.id,
      },
      ...state.notifications,
    ],
  };
}
export function expireRequests(
  state: ReviewState,
  at = new Date().toISOString(),
): ReviewState {
  const expired = state.requests.filter(
    (r) => r.status === "Pending" && r.deadline && r.deadline <= at,
  );
  if (!expired.length) return state;
  const ids = new Set(expired.map((r) => r.id));
  return {
    ...state,
    requests: state.requests.map((r) =>
      ids.has(r.id) ? { ...r, status: "Expired" } : r,
    ),
    audit: [
      ...expired.map((r) => ({
        id: crypto.randomUUID(),
        at,
        actor: "Review timer",
        action: "Expired",
        target: r.id,
        details: "Approval deadline reached.",
      })),
      ...state.audit,
    ],
  };
}
