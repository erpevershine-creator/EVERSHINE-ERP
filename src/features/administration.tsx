"use client";
import { useState } from "react";
import { ShieldCheck, Check, Minus } from "lucide-react";
import { useReview } from "@/components/review-provider";
import { DataTable, type Column } from "@/components/table";
import { Badge, KeyValues, Modal, PageHeading } from "@/components/ui";
import { policy } from "@/lib/policy";

const accounts = [
  {
    id: "owner",
    name: "Owner (sample)",
    login: "Not provisioned",
    position: "Owner",
    access: "Company",
    status: "Active",
    devices: "—",
  },
  {
    id: "admin",
    name: "Account Admin (sample)",
    login: "Not provisioned",
    position: "Account Administrator",
    access: "Account Management",
    status: "Active",
    devices: "—",
  },
  {
    id: "employee",
    name: "Employee (sample)",
    login: "Not provisioned",
    position: "Operations Staff",
    access: "Assigned records",
    status: "Active",
    devices: "—",
  },
  {
    id: "former",
    name: "Former Employee (sample)",
    login: "Not provisioned",
    position: "Operations Staff",
    access: "Inactive",
    status: "Inactive",
    devices: "—",
  },
];
const positions = [
  {
    id: "owner-position",
    name: "Owner",
    members: "1",
    scope: "All approved controls",
    status: "Active",
    authority: "One Owner Main Account",
    permissions: [true, true, true, true, true],
  },
  {
    id: "admin-position",
    name: "Account Administrator",
    members: "1",
    scope: "Account Management",
    status: "Sample template",
    authority: "Owner-delegated authority only",
    permissions: [true, true, true, true, false],
  },
  {
    id: "operations-position",
    name: "Operations Staff",
    members: "1",
    scope: "Own requests and assigned records",
    status: "Sample template",
    authority: "No approval authority",
    permissions: [true, false, false, false, false],
  },
];
export function AccessRestricted() {
  return (
    <section className="panel restricted">
      <ShieldCheck size={24} />
      <h1>Access restricted</h1>
      <p>This page is outside the selected sample account’s permissions.</p>
    </section>
  );
}
export function Accounts() {
  const { actor } = useReview();
  const [status, setStatus] = useState("All statuses");
  const [selected, setSelected] = useState<(typeof accounts)[number] | null>(
    null,
  );
  if (actor.role === "Employee") return <AccessRestricted />;
  const columns: Column<(typeof accounts)[number]>[] = [
    {
      key: "name",
      label: "Account",
      value: (r) => r.name,
      render: (r) => (
        <span className="account-cell">
          <span className="avatar">{r.name[0]}</span>
          <span className="record-label">
            <strong>{r.name}</strong>
            <small>{r.login}</small>
          </span>
        </span>
      ),
    },
    { key: "position", label: "Position", value: (r) => r.position },
    { key: "scope", label: "Access scope", value: (r) => r.access },
    { key: "devices", label: "Active devices", value: (r) => r.devices },
    {
      key: "status",
      label: "Status",
      value: (r) => r.status,
      render: (r) => <Badge>{r.status}</Badge>,
    },
  ];
  return (
    <>
      <PageHeading
        title="Account Management"
        subtitle="Individual accounts, assigned positions and controlled access."
      />
      <div className="compact-summary">
        <span>
          <strong>1</strong> Owner
        </span>
        <span>
          <strong>2</strong> Sample active staff
        </span>
        <span>
          <strong>1</strong> Inactive account
        </span>
        <span className="muted">Authentication: not connected</span>
      </div>
      <DataTable
        rows={accounts.filter(
          (r) => status === "All statuses" || r.status === status,
        )}
        columns={columns}
        name="Accounts"
        onOpen={setSelected}
        filter={
          <select
            aria-label="Account status"
            value={status}
            onChange={(e) => setStatus(e.target.value)}
          >
            <option>All statuses</option>
            <option>Active</option>
            <option>Inactive</option>
          </select>
        }
      />
      <section className="panel settings-panel">
        <h2>Confirmed account controls</h2>
        <KeyValues
          rows={[
            ["Account creation", "Owner or specifically authorized Admin"],
            ["Sharing", "One account per person; no account sharing"],
            [
              "Handover",
              "Transfer the position and selected responsibilities to a separate account",
            ],
            [
              "Deactivation",
              "Close active sessions and preserve the original actor history",
            ],
            ["Owner control", "Exactly one Owner; only Owner can self-approve"],
          ]}
        />
      </section>
      {selected ? (
        <Modal title={selected.name} onClose={() => setSelected(null)}>
          <KeyValues
            rows={[
              ["Position", selected.position],
              ["Scope", selected.access],
              ["Status", <Badge key="status">{selected.status}</Badge>],
              ["Login identifier", "Company-assigned Gmail address"],
              ["Authentication", "Not provisioned — sample record only"],
              ["Device limit", `${policy.maxDevices} active devices`],
              [
                "Password management",
                selected.id === "owner"
                  ? "Owner only"
                  : "Owner or Account Management Admin",
              ],
            ]}
          />
          <p className="muted">
            Account provisioning, live sessions and handover forms follow
            foundation screen acceptance.
          </p>
        </Modal>
      ) : null}
    </>
  );
}
export function Permissions() {
  const { actor } = useReview();
  const [selected, setSelected] = useState(positions[0]);
  const [filter, setFilter] = useState("All scopes");
  if (actor.role !== "Owner") return <AccessRestricted />;
  const columns: Column<(typeof positions)[number]>[] = [
    { key: "name", label: "Position", value: (r) => r.name },
    { key: "members", label: "Accounts", value: (r) => r.members },
    { key: "scope", label: "Scope", value: (r) => r.scope },
    {
      key: "status",
      label: "Status",
      value: (r) => r.status,
      render: (r) => <Badge>{r.status}</Badge>,
    },
  ];
  return (
    <>
      <PageHeading
        title="Positions & Permissions"
        subtitle="Position templates with separately controlled individual adjustments."
      />
      <DataTable
        rows={positions.filter(
          (r) => filter === "All scopes" || r.scope === filter,
        )}
        columns={columns}
        name="Positions"
        onOpen={setSelected}
        filter={
          <select
            aria-label="Position scope"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All scopes</option>
            {positions.map((p) => (
              <option key={p.id}>{p.scope}</option>
            ))}
          </select>
        }
      />
      <section className="panel settings-panel">
        <div className="panel-heading">
          <h2>{selected.name}</h2>
          <span className="muted">Illustrative template</span>
        </div>
        <p className="muted">{selected.authority}</p>
        <div className="table-scroll">
          <table className="permission-matrix">
            <thead>
              <tr>
                <th scope="col">Module</th>
                {["View", "Manage", "Approve", "Export", "Self-approve"].map(
                  (h) => (
                    <th scope="col" key={h}>
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>{selected.scope}</td>
                {selected.permissions.map((allowed, i) => (
                  <td key={i}>
                    {allowed ? (
                      <Check
                        size={16}
                        className="permission-yes"
                        aria-label="Allowed"
                      />
                    ) : (
                      <Minus
                        size={16}
                        className="muted"
                        aria-label="Not allowed"
                      />
                    )}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <KeyValues
          rows={[
            [
              "Template update",
              "Approval includes before/after changes and the exact affected accounts",
            ],
            ["Excluded accounts", "Keep their existing permissions"],
            [
              "Individual adjustments",
              "Preserved unless explicitly included in the approved change",
            ],
            [
              "Delegation",
              "An Admin cannot grant authority beyond their own scope",
            ],
            [
              "Temporary adjustment",
              "Not supported for individual permissions",
            ],
          ]}
        />
      </section>
    </>
  );
}
