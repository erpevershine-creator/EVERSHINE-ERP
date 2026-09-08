import { requireAccess } from "@/lib/access";
import { LivePage } from "@/features/live-pages";
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
  permissions: "ERP Roles & Permissions",
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
  const access = await requireAccess();
  if (!access.pages[section])
    return (
      <section className="panel restricted">
        <h1>Access restricted</h1>
        <p>This page is outside your assigned permissions.</p>
      </section>
    );
  if (
    ["accounts", "permissions", "approvals", "audit", "notifications"].includes(
      section,
    )
  )
    return <LivePage section={section} />;
  const Component = pages[section as keyof typeof pages];
  return <Component />;
}
