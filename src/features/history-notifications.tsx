"use client";
import Link from "next/link";
import { useState } from "react";
import { useReview } from "@/components/review-provider";
import { DataTable, type Column } from "@/components/table";
import {
  Badge,
  formatTime,
  KeyValues,
  Modal,
  PageHeading,
} from "@/components/ui";
import {
  visibleRequest,
  type AuditEvent,
  type ReviewNotification,
} from "@/lib/review-data";
export function Audit() {
  const { state, actor } = useReview();
  const [action, setAction] = useState("All actions");
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  if (!state) return <PageHeading title="Audit & History" />;
  const accessible = state.requests.filter((r) => visibleRequest(actor, r));
  const events = state.audit.filter(
    (e) =>
      actor.role === "Owner" ||
      e.actor === actor.name ||
      accessible.some((r) => r.id === e.target),
  );
  const columns: Column<AuditEvent>[] = [
    {
      key: "at",
      label: "Time",
      value: (r) => r.at,
      render: (r) => formatTime(r.at),
    },
    { key: "actor", label: "Actor", value: (r) => r.actor },
    {
      key: "action",
      label: "Action",
      value: (r) => r.action,
      render: (r) => <Badge>{r.action}</Badge>,
    },
    { key: "target", label: "Record", value: (r) => r.target },
    { key: "details", label: "Reason", value: (r) => r.details },
  ];
  return (
    <>
      <PageHeading
        title="Audit & History"
        subtitle="Original actors, reasons and version changes remain traceable."
      />
      <DataTable
        rows={events.filter(
          (e) => action === "All actions" || e.action === action,
        )}
        columns={columns}
        name="Audit history"
        exportAllowed={actor.role !== "Employee"}
        onOpen={setSelected}
        filter={
          <select
            aria-label="Audit action"
            value={action}
            onChange={(e) => setAction(e.target.value)}
          >
            <option>All actions</option>
            {[...new Set(events.map((e) => e.action))].map((a) => (
              <option key={a}>{a}</option>
            ))}
          </select>
        }
      />
      <p className="footnote">
        Sample events only. The protected database audit and three-year
        export/deletion process are not connected.
      </p>
      {selected ? (
        <Modal title="Audit event" onClose={() => setSelected(null)}>
          <KeyValues
            rows={[
              ["Time", formatTime(selected.at)],
              ["Actor", selected.actor],
              ["Action", selected.action],
              ["Record", selected.target],
              ["Reason", selected.details],
              ["Before", selected.before ?? "—"],
              ["After", selected.after ?? "—"],
            ]}
          />
        </Modal>
      ) : null}
    </>
  );
}
export function Notifications() {
  const { state, actor, markRead } = useReview();
  const [filter, setFilter] = useState("All notifications");
  const [selected, setSelected] = useState<ReviewNotification | null>(null);
  if (!state) return <PageHeading title="Notifications" />;
  const notices = state.notifications.filter((n) =>
    n.recipients.includes(actor.id),
  );
  const columns: Column<ReviewNotification>[] = [
    {
      key: "title",
      label: "Notification",
      value: (n) => n.title,
      render: (n) => (
        <span className="record-label">
          <strong>{n.title}</strong>
          <small>{n.message}</small>
        </span>
      ),
    },
    {
      key: "time",
      label: "Received",
      value: (n) => n.at,
      render: (n) => formatTime(n.at),
    },
    {
      key: "status",
      label: "Status",
      value: (n) => (n.readBy.includes(actor.id) ? "Read" : "Unread"),
      render: (n) => (
        <Badge>{n.readBy.includes(actor.id) ? "Read" : "Unread"}</Badge>
      ),
    },
  ];
  return (
    <>
      <PageHeading
        title="Notifications"
        subtitle="Updates relevant to your responsibilities and permissions."
      />
      <DataTable
        rows={notices.filter(
          (n) =>
            filter === "All notifications" ||
            (filter === "Unread"
              ? !n.readBy.includes(actor.id)
              : n.readBy.includes(actor.id)),
        )}
        columns={columns}
        name="Notifications"
        exportAllowed={actor.role !== "Employee"}
        onOpen={(n) => {
          markRead(n.id);
          setSelected(n);
        }}
        filter={
          <select
            aria-label="Notification status"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All notifications</option>
            <option>Unread</option>
            <option>Read</option>
          </select>
        }
      />
      {selected ? (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <p>{selected.message}</p>
          <p className="muted">{formatTime(selected.at)}</p>
          {selected.requestId ? (
            <div className="form-actions">
              <Link
                href="/approvals"
                className="button primary"
                onClick={() => setSelected(null)}
              >
                Open Approval Center
              </Link>
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
