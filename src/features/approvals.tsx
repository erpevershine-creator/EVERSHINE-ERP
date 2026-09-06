"use client";
import { useState, type FormEvent } from "react";
import { Plus, Check, X, Send, RotateCcw, Copy } from "lucide-react";
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
  canApprove,
  canRevise,
  type ApprovalStatus,
  type Module,
} from "@/lib/policy";
import { visibleRequest, type ReviewRequest } from "@/lib/review-data";

const statuses: ApprovalStatus[] = [
  "Pending",
  "Approved",
  "Rejected",
  "Revised",
  "Cancelled",
  "Expired",
  "Draft",
];
const modules: Module[] = [
  "Account Management",
  "Positions & Permissions",
  "Settings",
];
export function Approvals() {
  const { state, actor } = useReview();
  const [status, setStatus] = useState<ApprovalStatus>("Pending");
  const [module, setModule] = useState("All modules");
  const [requester, setRequester] = useState("All requesters");
  const [approver, setApprover] = useState("All approvers");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (!state) return <PageHeading title="Approval Center" />;
  const visible = state.requests.filter((r) => visibleRequest(actor, r));
  const rejectedIds = new Set(
    state.audit.filter((e) => e.action === "Rejected").map((e) => e.target),
  );
  const match = (r: ReviewRequest, s: ApprovalStatus) =>
    s === "Rejected" ? rejectedIds.has(r.id) : r.status === s;
  const rows = visible.filter(
    (r) =>
      match(r, status) &&
      (module === "All modules" || r.module === module) &&
      (requester === "All requesters" || r.requester === requester) &&
      (approver === "All approvers" || r.approver === approver) &&
      (!from ||
        r.createdAt >= new Date(`${from}T00:00:00+06:30`).toISOString()) &&
      (!to ||
        r.createdAt <= new Date(`${to}T23:59:59.999+06:30`).toISOString()),
  );
  const selected = visible.find((r) => r.id === selectedId);
  const columns: Column<ReviewRequest>[] = [
    {
      key: "id",
      label: "Request",
      value: (r) => r.id,
      render: (r) => (
        <span className="record-label">
          <strong>{r.title}</strong>
          <small>{r.id}</small>
        </span>
      ),
    },
    { key: "module", label: "Module", value: (r) => r.module },
    { key: "requester", label: "Requester", value: (r) => r.requester },
    {
      key: "created",
      label: "Requested",
      value: (r) => r.createdAt,
      render: (r) => <span className="nowrap">{formatTime(r.createdAt)}</span>,
    },
    {
      key: "deadline",
      label: "Deadline",
      value: (r) => r.deadline ?? "—",
      render: (r) => (r.deadline ? formatTime(r.deadline) : "—"),
    },
    {
      key: "status",
      label: "Status",
      value: (r) => (status === "Rejected" ? "Rejected" : r.status),
      render: (r) => (
        <Badge>{status === "Rejected" ? "Rejected" : r.status}</Badge>
      ),
    },
  ];
  return (
    <>
      <PageHeading
        title="Approval Center"
        subtitle="Review requests individually and keep every decision traceable."
        action={
          <button className="primary" onClick={() => setCreating(true)}>
            <Plus size={16} /> New request
          </button>
        }
      />
      <div className="tabs" aria-label="Approval status">
        {statuses.map((s) => (
          <button
            key={s}
            aria-pressed={s === status}
            onClick={() => setStatus(s)}
          >
            {s}
            <span>{visible.filter((r) => match(r, s)).length}</span>
          </button>
        ))}
      </div>
      <div className="secondary-filters">
        <select
          aria-label="Requester filter"
          value={requester}
          onChange={(e) => setRequester(e.target.value)}
        >
          <option>All requesters</option>
          {[...new Set(visible.map((r) => r.requester))].map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
        <select
          aria-label="Approver filter"
          value={approver}
          onChange={(e) => setApprover(e.target.value)}
        >
          <option>All approvers</option>
          {[...new Set(visible.map((r) => r.approver).filter(Boolean))].map(
            (r) => (
              <option key={r}>{r}</option>
            ),
          )}
        </select>
        <label>
          From{" "}
          <input
            type="date"
            aria-label="From date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          To{" "}
          <input
            type="date"
            aria-label="To date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
      </div>
      <DataTable
        key={status}
        rows={rows}
        columns={columns}
        name="Approvals"
        initialSort="created"
        exportAllowed={actor.role !== "Employee"}
        onOpen={(r) => setSelectedId(r.id)}
        filter={
          <select
            aria-label="Module filter"
            value={module}
            onChange={(e) => setModule(e.target.value)}
          >
            <option>All modules</option>
            {modules.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        }
      />
      {selected ? (
        <RequestDetail
          key={`${selected.id}-${selected.version}`}
          request={selected}
          onClose={() => setSelectedId(null)}
        />
      ) : null}
      {creating ? (
        <NewRequest
          onClose={() => {
            setCreating(false);
            setStatus("Draft");
          }}
        />
      ) : null}
    </>
  );
}
function NewRequest({ onClose }: { onClose: () => void }) {
  const { addDraft } = useReview();
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const selectedModule = String(data.get("module")) as Module;
    if (!modules.includes(selectedModule)) return;
    addDraft({
      title: String(data.get("title")).trim(),
      module: selectedModule,
      target: String(data.get("target")).trim(),
      proposed: String(data.get("proposed")).trim(),
      reason: String(data.get("reason")).trim(),
    });
    onClose();
  }
  return (
    <Modal title="New sample request" onClose={onClose}>
      <form onSubmit={submit} className="form-stack">
        <label>
          Request title
          <input name="title" required maxLength={120} autoFocus />
        </label>
        <label>
          Module
          <select name="module">
            {modules.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        </label>
        <label>
          Target record
          <input name="target" required maxLength={200} />
        </label>
        <label>
          Requested changes
          <textarea name="proposed" required maxLength={2000} rows={3} />
        </label>
        <label>
          Reason note
          <textarea name="reason" required maxLength={1000} rows={2} />
        </label>
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit">
            Save draft
          </button>
        </div>
      </form>
    </Modal>
  );
}
function RequestDetail({
  request,
  onClose,
}: {
  request: ReviewRequest;
  onClose: () => void;
}) {
  const { state, actor, act } = useReview();
  const [reason, setReason] = useState("");
  const [details, setDetails] = useState(request.proposed);
  const [error, setError] = useState<string | null>(null);
  const permitted = canApprove(actor, request);
  const revisable = canRevise(actor, request.module);
  const editable =
    (request.status === "Draft" && request.requesterId === actor.id) ||
    (["Approved", "Revised"].includes(request.status) && revisable);
  const history = state?.audit.filter((e) => e.target === request.id) ?? [];
  function action(type: Parameters<typeof act>[1]) {
    const failure = act(request.id, type, reason, details);
    if (failure) setError(failure);
    else onClose();
  }
  return (
    <Modal title={request.title} onClose={onClose} wide>
      <div className="detail-meta">
        <span className="mono">{request.id}</span>
        <Badge>{request.status}</Badge>
        <span>Version {request.version}</span>
      </div>
      <div className="detail-grid">
        <section>
          <KeyValues
            rows={[
              ["Module", request.module],
              ["Requester", request.requester],
              ["Target record", request.target],
              ["Requested", formatTime(request.createdAt)],
              [
                "Deadline",
                request.deadline ? formatTime(request.deadline) : "No deadline",
              ],
            ]}
          />
          <div className="comparison">
            <div>
              <h3>Current data</h3>
              <p>{request.current}</p>
            </div>
            <div>
              <h3>Requested changes</h3>
              {editable ? (
                <textarea
                  aria-label="Requested changes"
                  rows={3}
                  maxLength={2000}
                  value={details}
                  onChange={(e) => setDetails(e.target.value)}
                />
              ) : (
                <p>{request.proposed}</p>
              )}
            </div>
          </div>
          <h3>Requester reason</h3>
          <p className="wrap">{request.reason}</p>
          {request.decisionReason ? (
            <p className="decision-note">
              <strong>Last decision</strong> {request.decisionReason}
            </p>
          ) : null}
          {request.sourceId ? (
            <p className="muted">Copied from {request.sourceId}</p>
          ) : null}
        </section>
        <section className="timeline-panel">
          <h3>Audit timeline</h3>
          <ul className="timeline">
            <li>
              <span className="timeline-dot" />
              <div>
                <strong>Requested</strong>
                <p>{request.requester}</p>
                <small>{formatTime(request.createdAt)}</small>
              </div>
            </li>
            {history.map((e) => (
              <li key={e.id}>
                <span className="timeline-dot" />
                <div>
                  <strong>{e.action}</strong>
                  <p>
                    {e.actor} · {e.details}
                  </p>
                  <small>{formatTime(e.at)}</small>
                </div>
              </li>
            ))}
          </ul>
          {request.versions.length ? (
            <>
              <h3>Preserved versions</h3>
              {request.versions.map((v, i) => (
                <div className="version-row" key={`${v.version}-${i}`}>
                  <strong>v{v.version}</strong>
                  <span>
                    {v.details}
                    <small>{v.reason}</small>
                  </span>
                </div>
              ))}
            </>
          ) : null}
          <h3>Requester history</h3>
          <p className="muted">
            {state?.requests.filter(
              (r) => r.requesterId === request.requesterId,
            ).length ?? 0}{" "}
            sample requests
          </p>
        </section>
      </div>
      {(request.status === "Pending" && permitted) ||
      editable ||
      (request.status === "Expired" && revisable) ? (
        <div className="decision-area">
          <label>
            Reason note
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
              rows={2}
              placeholder="Record the reason for this action"
            />
          </label>
          {error ? (
            <p className="field-error" role="alert">
              {error}
            </p>
          ) : null}
          <div className="form-actions">
            {request.status === "Pending" && permitted ? (
              <>
                <button onClick={() => action("reject")}>
                  <X size={15} /> Reject
                </button>
                <button className="primary" onClick={() => action("approve")}>
                  <Check size={15} /> Approve
                </button>
              </>
            ) : null}
            {request.status === "Draft" && request.requesterId === actor.id ? (
              <button className="primary" onClick={() => action("submit")}>
                <Send size={15} /> Submit for approval
              </button>
            ) : null}
            {["Approved", "Revised"].includes(request.status) && revisable ? (
              <button className="primary" onClick={() => action("revise")}>
                <RotateCcw size={15} /> Revise
              </button>
            ) : null}
            {request.status === "Expired" && revisable ? (
              <button className="primary" onClick={() => action("copy")}>
                <Copy size={15} /> Copy to new draft
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </Modal>
  );
}
