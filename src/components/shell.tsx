"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
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
  LogOut,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { ThemeControl } from "./theme";
import { logout } from "@/app/login/actions";
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
export function Shell({
  children,
  authenticatedUser,
  allowedPages,
}: {
  children: React.ReactNode;
  authenticatedUser: { employeeName: string; username: string; role: string };
  allowedPages: Record<string, boolean>;
}) {
  const pathname = usePathname();
  const [menu, setMenu] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const canView = (page: string) => Boolean(allowedPages[page]);
  const live = [
    "accounts",
    "permissions",
    "approvals",
    "audit",
    "notifications",
  ].includes(pathname.split("/")[1]);
  const visibleNavigation = navigation.filter((item) => canView(item.path));
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenu(false);
        document.querySelector<HTMLButtonElement>(".mobile-menu")?.focus();
      }
    };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  const unread = 0;
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
      <aside
        id="workspace-sidebar"
        className={`sidebar ${menu ? "sidebar-open" : ""} ${collapsed ? "sidebar-collapsed" : ""}`}
      >
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
          {visibleNavigation.map((item, index) => (
            <div key={item.path}>
              {index === 0 ||
              item.group !== visibleNavigation[index - 1].group ? (
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
          Local ERP <span className="milestone">M2.2</span>
        </div>
      </aside>
      <div className={`workspace ${collapsed ? "workspace-expanded" : ""}`}>
        <header className="topbar">
          <button
            className="desktop-sidebar-toggle icon-button"
            aria-label={collapsed ? "Show sidebar" : "Hide sidebar"}
            aria-expanded={!collapsed}
            aria-controls="workspace-sidebar"
            onClick={() => setCollapsed(!collapsed)}
          >
            <Menu size={20} />
          </button>
          <button
            className="mobile-menu icon-button"
            aria-label="Open navigation"
            aria-expanded={menu}
            aria-controls="workspace-sidebar"
            onClick={() => setMenu(true)}
          >
            <Menu size={20} />
          </button>
          <span className="breadcrumb">
            EVERSHINE <ChevronRight size={13} />
            <span>Head Office</span>
          </span>
          <div className="topbar-end">
            <span className="sample-label">
              {live ? "Local database" : "Sample review"}
            </span>
            <ThemeControl />
            {canView("notifications") ? (
              <Link
                className="icon-button notification-shortcut"
                href="/notifications"
                aria-label="Open notifications"
              >
                <Bell size={18} />
                {unread ? <i /> : null}
              </Link>
            ) : null}
            <span
              className="authenticated-user"
              title={authenticatedUser.username}
            >
              <span className="avatar">
                {authenticatedUser.employeeName.slice(0, 1).toUpperCase()}
              </span>
              <span>
                <strong>{authenticatedUser.employeeName}</strong>
                <small>{authenticatedUser.role}</small>
              </span>
            </span>
            <form action={logout}>
              <button
                type="submit"
                className="icon-button"
                aria-label="Sign out"
                title="Sign out"
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <main id="main-content" tabIndex={-1}>
          {children}
        </main>
        <footer className="app-footer">
          <span>
            EVERSHINE ERP <span className="muted">/ Foundation review</span>
          </span>
          <span>
            {live
              ? "Local database · Myanmar time"
              : "Local only · Sample review"}
          </span>
        </footer>
      </div>
    </div>
  );
}
