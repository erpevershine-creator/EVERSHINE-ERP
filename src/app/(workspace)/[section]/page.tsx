import { notFound } from "next/navigation";
import { Dashboard } from "@/features/dashboard";
import { Approvals } from "@/features/approvals";
import { Accounts, Permissions } from "@/features/administration";
import { Audit, Notifications } from "@/features/history-notifications";
import { Settings, Backups, Usage } from "@/features/settings";
const pages = {
  dashboard: Dashboard,
  approvals: Approvals,
  accounts: Accounts,
  permissions: Permissions,
  audit: Audit,
  notifications: Notifications,
  settings: Settings,
  backups: Backups,
  usage: Usage,
};
const titles: Record<string, string> = {
  dashboard: "Workspace",
  approvals: "Approval Center",
  accounts: "Account Management",
  permissions: "Positions & Permissions",
  audit: "Audit & History",
  notifications: "Notifications",
  settings: "Settings",
  backups: "Backup & Restore",
  usage: "Usage Monitor",
};
export async function generateMetadata({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  return { title: titles[section] ?? "Page not found" };
}
export default async function Section({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  const { section } = await params;
  if (!Object.hasOwn(pages, section)) notFound();
  const Component = pages[section as keyof typeof pages];
  return <Component />;
}
