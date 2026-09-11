// Approved policy values, not a substitute for server / database enforcement.
export const policy = {
  company: "EVERSHINE",
  warehouses: ["Operations Warehouse", "Reserve Warehouse"],
  maxDevices: 2,
  wrongPasswordLimit: 5,
  passwordMonths: 6,
  passwordNoticeDays: 14,
  idleDays: 7,
  deviceApprovalHours: 24,
  retentionYears: 3,
  usageWarningPercent: 80,
  deadlineReminderHours: 3,
} as const;

export type ApprovalStatus =
  | "Draft"
  | "Pending"
  | "Approved"
  | "Rejected"
  | "Revised"
  | "Cancelled"
  | "Expired";
export type PreviewRole = "Owner" | "Admin" | "Employee";
export type Module =
  | "Account Management"
  | "Positions & Permissions"
  | "Settings"
  | "Supplier Onboarding";
export type PreviewActor = {
  id: string;
  name: string;
  role: PreviewRole;
  approvals: Module[];
};

export const actors: PreviewActor[] = [
  {
    id: "owner",
    name: "Owner (sample)",
    role: "Owner",
    approvals: ["Account Management", "Positions & Permissions", "Settings", "Supplier Onboarding"],
  },
  {
    id: "admin",
    name: "Account Admin (sample)",
    role: "Admin",
    approvals: ["Account Management"],
  },
  {
    id: "employee",
    name: "Employee (sample)",
    role: "Employee",
    approvals: [],
  },
];

export function canApprove(
  actor: PreviewActor,
  request: { module: Module; requesterId: string },
) {
  return (
    actor.role === "Owner" ||
    (actor.role === "Admin" &&
      actor.id !== request.requesterId &&
      actor.approvals.includes(request.module))
  );
}
export function canRevise(actor: PreviewActor, module: Module) {
  return (
    actor.role === "Owner" ||
    (actor.role === "Admin" && actor.approvals.includes(module))
  );
}
export function validatePassword(value: string) {
  return value.length >= 8 && /[A-Z]/.test(value) && /[0-9]/.test(value);
}
export function quotaPolicy(percent: number | null) {
  if (percent === null || !Number.isFinite(percent) || percent < 0)
    return {
      known: false,
      pauseEmail: true,
      pauseScheduledReports: true,
      manualExportAllowed: true,
    };
  return {
    known: true,
    pauseEmail: percent >= 80,
    pauseScheduledReports: percent >= 80,
    manualExportAllowed: true,
  };
}
export function isLocalReview(
  environment: string | undefined,
  enabled: string | undefined,
  host: string,
) {
  return (
    environment === "development" &&
    enabled === "1" &&
    /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host)
  );
}
export function csvCell(value: unknown) {
  let text = String(value ?? "");
  if (/^[\s]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return '"' + text.replaceAll('"', '""') + '"';
}
