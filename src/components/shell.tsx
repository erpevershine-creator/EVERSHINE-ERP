"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  LayoutDashboard,
  UsersRound,
  ShieldCheck,
  ClipboardCheck,
  History,
  Bell,
  Settings2,
  DatabaseBackup,
  Gauge,
  LogIn,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { ThemeControl } from "./theme";
import { useReview } from "./review-provider";
import { actors } from "@/lib/policy";
export const navigation = [
  {
    path: "dashboard",
    label: "Workspace",
    icon: LayoutDashboard,
    group: "WORKSPACE",
  },
  {
    path: "approvals",
    label: "Approval Center",
    icon: ClipboardCheck,
    group: "WORKSPACE",
  },
  {
    path: "notifications",
    label: "Notifications",
    icon: Bell,
    group: "WORKSPACE",
  },
  {
    path: "accounts",
    label: "Account Management",
    icon: UsersRound,
    group: "ADMINISTRATION",
  },
  {
    path: "permissions",
    label: "Positions & Permissions",
    icon: ShieldCheck,
    group: "ADMINISTRATION",
  },
  {
    path: "audit",
    label: "Audit & History",
    icon: History,
    group: "ADMINISTRATION",
  },
  { path: "settings", label: "Settings", icon: Settings2, group: "SYSTEM" },
  {
    path: "backups",
    label: "Backup & Restore",
    icon: DatabaseBackup,
    group: "SYSTEM",
  },
  { path: "usage", label: "Usage Monitor", icon: Gauge, group: "SYSTEM" },
];
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const { state, actor, setActor, storageAvailable } = useReview();
  const unread =
    state?.notifications.filter(
      (n) => n.recipients.includes(actor.id) && !n.readBy.includes(actor.id),
    ).length ?? 0;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      {menu ? (
        <button
          className="sidebar-overlay"
          onClick={() => setMenu(false)}
          aria-label="Close navigation"
        />
      ) : null}
      <aside className={`sidebar ${menu ? "sidebar-open" : ""}`}>
        <Link
          href="/dashboard"
          className="brand"
          onClick={() => setMenu(false)}
        >
          <span className="brand-mark">E</span>
          <span>
            EVERSHINE<small>ERP / 2.1</small>
          </span>
        </Link>
        <button
          className="mobile-close icon-button"
          aria-label="Close menu"
          onClick={() => setMenu(false)}
        >
          <X size={18} />
        </button>
        <nav aria-label="Main navigation">
          {navigation.map((item, index) => (
            <div key={item.path}>
              {index === 0 || item.group !== navigation[index - 1].group ? (
                <div className="nav-group">{item.group}</div>
              ) : null}
              <Link
                href={`/${item.path}`}
                aria-current={pathname === `/${item.path}` ? "page" : undefined}
                className={
                  pathname === `/${item.path}` ? "nav-link active" : "nav-link"
                }
                onClick={() => setMenu(false)}
              >
                <item.icon size={17} />
                <span>{item.label}</span>
                {item.path === "notifications" && unread ? (
                  <span className="nav-count">{unread}</span>
                ) : null}
              </Link>
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <span className="local-dot" />
          Local foundation <span className="milestone">M1</span>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            onClick={() => setMenu(true)}
          >
            <Menu size={20} />
          </button>
          <span className="breadcrumb">
            EVERSHINE <ChevronRight size={13} />
            <span>Head Office</span>
          </span>
          <div className="topbar-end">
            <span className="sample-label">Sample data</span>
            <ThemeControl />
            <Link
              className="icon-button notification-shortcut"
              href="/notifications"
              aria-label="Open notifications"
            >
              <Bell size={18} />
              {unread ? <i /> : null}
            </Link>
            <label className="preview-actor">
              <span className="avatar">{actor.role.slice(0, 1)}</span>
              <select
                aria-label="Preview as"
                value={actor.id}
                onChange={(e) => setActor(e.target.value)}
              >
                {actors.map((a) => (
                  <option value={a.id} key={a.id}>
                    {a.role} preview
                  </option>
                ))}
              </select>
            </label>
            <Link
              href="/login"
              className="icon-button"
              aria-label="View login screen"
              title="View login screen"
            >
              <LogIn size={18} />
            </Link>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {!storageAvailable ? (
            <p className="inline-notice" role="status">
              Browser storage is unavailable. Sample changes will last until you
              reload.
            </p>
          ) : null}
          {state ? (
            children
          ) : (
            <div
              className="workspace-placeholder"
              role="status"
              aria-label="Opening workspace"
            >
              <span />
              <span />
            </div>
          )}
        </main>
        <footer className="app-footer">
          <span>
            EVERSHINE ERP <span className="muted">/ Foundation review</span>
          </span>
          <span>Local only · Sample changes stay in this browser tab</span>
        </footer>
      </div>
    </div>
  );
}
