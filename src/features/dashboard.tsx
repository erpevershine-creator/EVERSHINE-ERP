"use client";
import Link from "next/link";
import {
  ArrowUpRight,
  ClipboardCheck,
  FilePenLine,
  Bell,
  History,
  Warehouse,
  Building2,
} from "lucide-react";
import { useReview } from "@/components/review-provider";
import { Badge, formatTime, PageHeading } from "@/components/ui";
import { visibleRequest } from "@/lib/review-data";
export function Dashboard() {
  const { state, actor } = useReview();
  if (!state) return <PageHeading title="Workspace" />;
  const requests = state.requests.filter((r) => visibleRequest(actor, r));
  const pending = requests
    .filter((r) => r.status === "Pending")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const notices = state.notifications.filter(
    (n) => n.recipients.includes(actor.id) && !n.readBy.includes(actor.id),
  );
  const events = state.audit.filter(
    (e) =>
      actor.role === "Owner" ||
      e.actor === actor.name ||
      requests.some((r) => r.id === e.target),
  );
  const metrics = [
    {
      label: "Awaiting approval",
      value: pending.length,
      icon: ClipboardCheck,
      href: "/approvals",
      hint: "Oldest requests first",
    },
    {
      label: "Your drafts",
      value: requests.filter(
        (r) => r.status === "Draft" && r.requesterId === actor.id,
      ).length,
      icon: FilePenLine,
      href: "/approvals",
      hint: "Ready to continue",
    },
    {
      label: "Unread notifications",
      value: notices.length,
      icon: Bell,
      href: "/notifications",
      hint: "Within your access",
    },
    {
      label: "Recorded decisions",
      value: events.length,
      icon: History,
      href: "/audit",
      hint: "Sample audit activity",
    },
  ];
  return (
    <>
      <PageHeading
        title="Workspace"
        subtitle="Your requests, decisions and administration in one place."
        action={
          <span className="date-label">Head Office · {actor.role} preview</span>
        }
      />
      <div className="metric-grid">
        {metrics.map((m) => (
          <Link href={m.href} className="metric" key={m.label}>
            <div>
              <span>{m.label}</span>
              <m.icon size={18} />
            </div>
            <strong>{m.value.toString().padStart(2, "0")}</strong>
            <small>
              {m.hint}
              <ArrowUpRight size={14} />
            </small>
          </Link>
        ))}
      </div>
      <div className="dashboard-grid">
        <section className="panel">
          <div className="panel-heading">
            <h2>Needs attention</h2>
            <Link className="text-link" href="/approvals">
              View all <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="attention-list">
            {pending.length ? (
              pending.slice(0, 5).map((r) => (
                <Link key={r.id} href="/approvals" className="attention-row">
                  <span className="request-icon">
                    <ClipboardCheck size={18} />
                  </span>
                  <div>
                    <strong>{r.title}</strong>
                    <small>
                      {r.module} · {r.requester}
                    </small>
                  </div>
                  <div className="attention-meta">
                    <Badge>{r.status}</Badge>
                    <small>{formatTime(r.createdAt)}</small>
                  </div>
                </Link>
              ))
            ) : (
              <div className="empty-state">
                No requests waiting for your review.
              </div>
            )}
          </div>
          <div className="panel-note">
            Each request is reviewed and approved individually.
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Company structure</h2>
            <Badge>Confirmed</Badge>
          </div>
          <div className="location-row">
            <Building2 size={18} />
            <div>
              <strong>Head Office</strong>
              <small>Company administration</small>
            </div>
          </div>
          <div className="location-row">
            <Warehouse size={18} />
            <div>
              <strong>Operations Warehouse</strong>
              <small>Daily sales and operations</small>
            </div>
          </div>
          <div className="location-row">
            <Warehouse size={18} />
            <div>
              <strong>Reserve Warehouse</strong>
              <small>Reserve stock and replenishment</small>
            </div>
          </div>
          <div className="panel-note">
            Purchases may enter either warehouse.
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Recent activity</h2>
            <Link className="text-link" href="/audit">
              View history <ArrowUpRight size={14} />
            </Link>
          </div>
          <div className="activity-list">
            {events.slice(0, 4).map((e) => (
              <div className="activity-row" key={e.id}>
                <span className="activity-dot" />
                <div>
                  <strong>
                    {e.action} <span className="muted">· {e.target}</span>
                  </strong>
                  <small>{e.actor}</small>
                </div>
                <time>{formatTime(e.at)}</time>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <h2>Foundation review</h2>
            <span className="muted">Milestone 1</span>
          </div>
          <div className="review-links">
            <Link href="/accounts">
              <span>Accounts & access</span>
              <ArrowUpRight size={16} />
            </Link>
            <Link href="/settings">
              <span>Company & security settings</span>
              <ArrowUpRight size={16} />
            </Link>
            <Link href="/usage">
              <span>Services & usage status</span>
              <ArrowUpRight size={16} />
            </Link>
            <Link href="/login">
              <span>Login screen</span>
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </section>
      </div>
    </>
  );
}
