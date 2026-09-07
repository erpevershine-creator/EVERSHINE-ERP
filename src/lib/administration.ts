import { actors, type Module, type PreviewRole } from "./policy.ts";

export const pageCatalog = [
  { id: "dashboard", label: "Workspace" },
  { id: "approvals", label: "Approval Center" },
  { id: "notifications", label: "Notifications" },
  { id: "accounts", label: "Account Management" },
  { id: "permissions", label: "Positions & Permissions" },
  { id: "audit", label: "Audit & History" },
  { id: "settings", label: "Settings" },
  { id: "backups", label: "Backup & Restore" },
  { id: "usage", label: "Usage Monitor" },
] as const;
export type PageId = (typeof pageCatalog)[number]["id"];
export type PageAccess = Record<PageId, boolean>;
export function pageAccess(...visible: PageId[]): PageAccess {
  return Object.fromEntries(
    pageCatalog.map((p) => [p.id, visible.includes(p.id)]),
  ) as PageAccess;
}
export function isPageAccess(value: unknown): value is PageAccess {
  return (
    !!value &&
    typeof value === "object" &&
    pageCatalog.every((p) => typeof (value as PageAccess)[p.id] === "boolean")
  );
}
export type ReviewPosition = {
  id: string;
  name: string;
  scope: string;
  pages: PageAccess;
  approvals: Module[];
};
export type ReviewAccount = {
  id: string;
  name: string;
  username: string;
  positionId: string;
  department: string;
  role: PreviewRole;
  contact: string;
  photo: string | null;
  status: "Active" | "Inactive";
  pages: PageAccess;
  approvals: Module[];
};
export const initialPositions: ReviewPosition[] = [
  {
    id: "owner-position",
    name: "Owner",
    scope: "Company",
    pages: pageAccess(...pageCatalog.map((p) => p.id)),
    approvals: [...actors[0].approvals],
  },
  {
    id: "admin-position",
    name: "Account Administrator",
    scope: "Account Management",
    pages: pageAccess(
      "dashboard",
      "approvals",
      "notifications",
      "accounts",
      "audit",
    ),
    approvals: ["Account Management"],
  },
  {
    id: "operations-position",
    name: "Operations Staff",
    scope: "Assigned records",
    pages: pageAccess("dashboard", "approvals", "notifications", "audit"),
    approvals: [],
  },
];
export function initialAccounts(): ReviewAccount[] {
  return [
    ...actors.map((a, index) => ({
      id: a.id,
      name: a.name,
      username: "",
      positionId: initialPositions[index].id,
      department: index === 2 ? "Operations" : "Administration",
      role: a.role,
      contact: "",
      photo: null,
      status: "Active" as const,
      pages: { ...initialPositions[index].pages },
      approvals: [...a.approvals],
    })),
    {
      id: "former",
      name: "Former Employee (sample)",
      username: "",
      positionId: "operations-position",
      department: "Operations",
      role: "Employee" as const,
      contact: "",
      photo: null,
      status: "Inactive" as const,
      pages: pageAccess(),
      approvals: [],
    },
  ];
}
export function canViewPage(
  account: Pick<ReviewAccount, "role" | "status" | "pages"> | undefined,
  page: string,
) {
  if (
    !account ||
    account.status !== "Active" ||
    !pageCatalog.some((p) => p.id === page)
  )
    return false;
  return account.role === "Owner" || account.pages[page as PageId] === true;
}
export function validGmail(value: string) {
  return /^[a-z0-9][a-z0-9._%+-]*@gmail\.com$/i.test(value.trim());
}
export function validPhoto(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length < 350000 &&
    /^data:image\/(webp|png|jpeg);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)
  );
}
export type PageAccessChange = {
  positionId: string;
  before: PageAccess;
  after: PageAccess;
  accountIds: string[];
  accountBefore: Record<string, PageAccess>;
};

export function applyPageAccessChange(
  positions: ReviewPosition[],
  accounts: ReviewAccount[],
  change: PageAccessChange,
) {
  const position = positions.find((p) => p.id === change.positionId);
  if (
    !position ||
    position.id === "owner-position" ||
    !isPageAccess(change.before) ||
    !isPageAccess(change.after)
  )
    throw new Error("This page access change is not permitted.");
  const same = (a: PageAccess, b: PageAccess) =>
    pageCatalog.every((p) => a[p.id] === b[p.id]);
  if (!same(position.pages, change.before))
    throw new Error(
      "The template changed after this request. Submit a fresh request.",
    );
  if (
    !change.accountIds.length ||
    new Set(change.accountIds).size !== change.accountIds.length
  )
    throw new Error("Select the affected accounts.");
  for (const id of change.accountIds) {
    const account = accounts.find((a) => a.id === id);
    if (
      !account ||
      account.role === "Owner" ||
      account.positionId !== position.id ||
      account.status !== "Active" ||
      !isPageAccess(change.accountBefore[id]) ||
      !same(account.pages, change.accountBefore[id])
    )
      throw new Error("An included account changed. Submit a fresh request.");
  }
  return {
    positions: positions.map((p) =>
      p.id === position.id ? { ...p, pages: { ...change.after } } : p,
    ),
    accounts: accounts.map((a) =>
      change.accountIds.includes(a.id)
        ? {
            ...a,
            pages: Object.fromEntries(
              pageCatalog.map((p) => [
                p.id,
                a.pages[p.id] !== change.before[p.id]
                  ? a.pages[p.id]
                  : change.after[p.id],
              ]),
            ) as PageAccess,
          }
        : a,
    ),
  };
}
