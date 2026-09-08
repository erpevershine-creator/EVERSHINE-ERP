/* eslint-disable @next/next/no-img-element -- Private authenticated photos must bypass the shared image optimizer. */
"use client";
import { useActionState, useState, type ReactNode } from "react";
import { DataTable } from "@/components/table";
import { Badge, Modal, PageHeading } from "@/components/ui";
import {
  createAccount,
  accountStatus,
  addPosition,
  savePermissionDraft,
  decideRequest,
  getAffectedAccounts,
  type Result,
} from "@/app/live/actions";
import type { Access } from "@/lib/access";

export type Profile = {
  id: string;
  employee_name: string;
  username: string;
  department: string;
  erp_role: string;
  position_id: number;
  status: string;
  contact: string;
  version: number;
};
export type Position = {
  id: number;
  name: string;
  code: string;
  is_owner_position: boolean;
  version: number;
};
export type Page = { id: string; label: string };
export type PagePermission = {
  position_id: number;
  page_id: string;
  can_view: boolean;
};
export type ActionPermission = {
  position_id: number;
  module: string;
  action: string;
  allowed: boolean;
};
export type Request = {
  id: number;
  requester_id: string;
  target_id: string;
  reason: string;
  status: string;
  current_data: {
    pages: Record<string, boolean>;
    actions: Record<string, string[]>;
  };
  proposed_data: {
    pages: Record<string, boolean>;
    actions: Record<string, string[]>;
  };
  decision_reason: string | null;
};
export type Affected = {
  request_id: number;
  profile_id: string;
  account_name: string;
  expected_profile_version: number;
  before_pages: Record<string, boolean>;
  after_pages: Record<string, boolean>;
  before_actions: Record<string, string[]>;
  after_actions: Record<string, string[]>;
};
const initial: Result = { status: "idle", message: "" };
function can(access: Access, module: string, action: string) {
  return (
    access.role === "owner" || Boolean(access.actions[module]?.includes(action))
  );
}
function ActionForm({
  run,
  children,
  label = "Save",
  disabled = false,
}: {
  run: (form: FormData) => Promise<Result>;
  children: ReactNode;
  label?: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState(
    async (_: Result, form: FormData) => run(form),
    initial,
  );
  return (
    <form action={action} className="account-form">
      {children}
      {state.message && (
        <p
          role={state.status === "error" ? "alert" : "status"}
          className={state.status === "error" ? "field-error" : "muted"}
        >
          {state.message}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={pending || disabled}>
          {pending ? "Saving…" : label}
        </button>
      </div>
    </form>
  );
}
export function LiveAccounts({
  profiles,
  positions,
  access,
}: {
  profiles: Profile[];
  positions: Position[];
  access: Access;
}) {
  const [create, setCreate] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = profiles.find((p) => p.id === selectedId);
  const positionName = (id: number) =>
    positions.find((p) => p.id === id)?.name ?? String(id);
  return (
    <>
      <PageHeading
        title="Account Management"
        action={
          can(access, "Account Management", "create") &&
          ["owner", "admin"].includes(access.role) ? (
            <button className="primary" onClick={() => setCreate(true)}>
              Create account
            </button>
          ) : undefined
        }
      />
      <DataTable
        rows={profiles}
        name="Accounts"
        sample={false}
        exportAllowed={can(access, "Account Management", "export")}
        onOpen={(p) => setSelectedId(p.id)}
        columns={[
          {
            key: "employee",
            label: "Employee",
            value: (p) => p.employee_name,
            render: (p) => (
              <span className="live-employee">
                <img
                  src={`/api/profile-photo/${p.id}`}
                  alt=""
                  width={32}
                  height={32}
                />
                <span>{p.employee_name}</span>
              </span>
            ),
          },
          {
            key: "position",
            label: "Position",
            value: (p) => positionName(p.position_id),
          },
          {
            key: "department",
            label: "Department",
            value: (p) => p.department,
          },
          { key: "role", label: "ERP role", value: (p) => p.erp_role },
          { key: "username", label: "Username", value: (p) => p.username },
          {
            key: "status",
            label: "Status",
            value: (p) => p.status,
            render: (p) => <Badge>{p.status}</Badge>,
          },
        ]}
      />
      {create && (
        <Modal title="Create account" onClose={() => setCreate(false)} wide>
          <CreateAccount
            positions={positions}
            owner={access.role === "owner"}
          />
        </Modal>
      )}
      {selected && (
        <Modal
          title={selected.employee_name}
          onClose={() => setSelectedId(null)}
        >
          <p>
            {selected.username} · {positionName(selected.position_id)}
          </p>
          <p>
            {selected.department} · {selected.contact}
          </p>
          <Badge>{selected.status}</Badge>
          {selected.erp_role !== "owner" &&
            selected.id !== access.id &&
            ["owner", "admin"].includes(access.role) && (
              <ActionForm run={accountStatus} label="Apply account action">
                <input name="id" type="hidden" value={selected.id} />
                <label>
                  Action
                  <select name="action" required defaultValue="">
                    <option value="" disabled>
                      Select action
                    </option>
                    {(["disable", "reenable", "unlock"] as const)
                      .filter(
                        (a) =>
                          can(access, "Account Management", a) &&
                          (a === "disable"
                            ? ["active", "locked"].includes(selected.status)
                            : a === "reenable"
                              ? selected.status === "disabled"
                              : selected.status === "locked"),
                      )
                      .map((a) => (
                        <option key={a}>{a}</option>
                      ))}
                  </select>
                </label>
                <label>
                  Reason
                  <textarea name="reason" required maxLength={1000} />
                </label>
              </ActionForm>
            )}
        </Modal>
      )}
    </>
  );
}
function CreateAccount({
  positions,
  owner,
}: {
  positions: Position[];
  owner: boolean;
}) {
  const [state, action, pending] = useActionState(createAccount, initial);
  if (state.status === "success") return <p role="status">{state.message}</p>;
  return (
    <form action={action} className="account-form">
      <div className="account-form-grid">
        <label>
          Profile photo
          <input
            type="file"
            name="photo"
            accept="image/jpeg,image/png,image/webp"
            required
          />
          <small>JPEG, PNG or WebP · up to 2 MB</small>
        </label>
        <label>
          Employee name
          <input
            name="employeeName"
            required
            maxLength={120}
            autoComplete="name"
          />
        </label>
        <label>
          Position
          <select name="position" required defaultValue="">
            <option value="" disabled>
              Select position
            </option>
            {positions
              .filter((p) => !p.is_owner_position)
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label>
          Department
          <input name="department" required maxLength={120} />
        </label>
        <label>
          ERP role
          <select name="role" defaultValue="employee">
            <option value="employee">Employee</option>
            {owner && <option value="admin">Admin</option>}
          </select>
        </label>
        <label>
          Gmail username
          <input
            name="username"
            type="email"
            autoComplete="off"
            required
            placeholder="employee@gmail.com"
          />
        </label>
        <label>
          ERP password
          <input
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={128}
          />
          <small>
            At least 8 characters, one uppercase letter and one number
          </small>
        </label>
        <label>
          Confirm password
          <input
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
          />
        </label>
        <label>
          Contact
          <input name="contact" required maxLength={120} autoComplete="tel" />
        </label>
      </div>
      {state.message && (
        <p role="alert" className="field-error">
          {state.message}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={pending}>
          {pending ? "Creating…" : "Create account"}
        </button>
      </div>
    </form>
  );
}
export function LivePermissions({
  positions,
  profiles,
  pages,
  pagePermissions,
  actionPermissions,
  access,
}: {
  positions: Position[];
  profiles: Profile[];
  pages: Page[];
  pagePermissions: PagePermission[];
  actionPermissions: ActionPermission[];
  access: Access;
}) {
  const [selected, setSelected] = useState<Position | null>(null);
  const [create, setCreate] = useState(false);
  return (
    <>
      <PageHeading
        title="Positions & Permissions"
        action={
          can(access, "Positions & Permissions", "create") ? (
            <button className="primary" onClick={() => setCreate(true)}>
              New position
            </button>
          ) : undefined
        }
      />
      <DataTable
        name="Positions"
        sample={false}
        exportAllowed={can(access, "Positions & Permissions", "export")}
        rows={positions.map((p) => ({ ...p, id: String(p.id) }))}
        onOpen={(row) =>
          setSelected(positions.find((p) => String(p.id) === row.id) ?? null)
        }
        columns={[
          { key: "name", label: "Position", value: (p) => p.name },
          { key: "code", label: "Code", value: (p) => p.code },
          { key: "version", label: "Version", value: (p) => String(p.version) },
          {
            key: "accounts",
            label: "Accounts",
            value: (p) =>
              String(
                profiles.filter((a) => a.position_id === Number(p.id)).length,
              ),
          },
        ]}
      />
      {create && (
        <Modal title="New position" onClose={() => setCreate(false)}>
          <ActionForm run={addPosition}>
            <label>
              Position name
              <input name="name" required maxLength={120} />
            </label>
            <label>
              Code
              <input
                name="code"
                required
                pattern="[a-z][a-z0-9-]*"
                placeholder="warehouse-manager"
              />
            </label>
          </ActionForm>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.name} onClose={() => setSelected(null)} wide>
          {selected.is_owner_position ? (
            <p>
              Owner has company-wide access. Only one Owner account is allowed.
            </p>
          ) : (
            <PermissionForm
              key={`${selected.id}-${selected.version}`}
              position={selected}
              profiles={profiles.filter((a) => a.position_id === selected.id)}
              pages={pages}
              pagePermissions={pagePermissions}
              actionPermissions={actionPermissions}
              editable={can(access, "Positions & Permissions", "edit")}
            />
          )}
        </Modal>
      )}
    </>
  );
}
const actionChoices = [
  "view",
  "create",
  "edit",
  "approve",
  "export",
  "change_password",
  "unlock",
  "approve_device",
  "disable",
  "reenable",
];
function PermissionForm({
  position,
  profiles,
  pages,
  pagePermissions,
  actionPermissions,
  editable,
}: {
  position: Position;
  profiles: Profile[];
  pages: Page[];
  pagePermissions: PagePermission[];
  actionPermissions: ActionPermission[];
  editable: boolean;
}) {
  const [views, setViews] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      pages.map((p) => [
        p.id,
        pagePermissions.some(
          (pp) =>
            pp.position_id === position.id &&
            pp.page_id === p.id &&
            pp.can_view,
        ),
      ]),
    ),
  );
  const [actions, setActions] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      pages.map((p) => [
        p.label,
        actionPermissions
          .filter(
            (a) =>
              a.position_id === position.id &&
              a.module === p.label &&
              a.allowed,
          )
          .map((a) => a.action),
      ]),
    ),
  );
  return (
    <ActionForm
      run={savePermissionDraft}
      label="Save approval draft"
      disabled={!editable}
    >
      <input type="hidden" name="position" value={position.id} />
      <input type="hidden" name="version" value={position.version} />
      <input type="hidden" name="pages" value={JSON.stringify(views)} />
      <input type="hidden" name="actions" value={JSON.stringify(actions)} />
      <fieldset disabled={!editable}>
        <legend>Page visibility</legend>
        <div className="live-check-grid">
          {pages.map((p) => (
            <label key={p.id}>
              <input
                type="checkbox"
                checked={views[p.id]}
                onChange={(e) =>
                  setViews({ ...views, [p.id]: e.target.checked })
                }
              />
              {p.label}
            </label>
          ))}
        </div>
        <details>
          <summary>Action permissions</summary>
          {pages.map((p) => (
            <fieldset key={p.id}>
              <legend>{p.label}</legend>
              <div className="live-check-grid">
                {actionChoices.map((a) => (
                  <label key={a}>
                    <input
                      type="checkbox"
                      checked={actions[p.label]?.includes(a) ?? false}
                      onChange={(e) =>
                        setActions({
                          ...actions,
                          [p.label]: e.target.checked
                            ? [...(actions[p.label] ?? []), a]
                            : (actions[p.label] ?? []).filter((x) => x !== a),
                        })
                      }
                    />
                    {a.replaceAll("_", " ")}
                  </label>
                ))}
              </div>
            </fieldset>
          ))}
        </details>
        <fieldset>
          <legend>Accounts included in this change</legend>
          {profiles.length ? (
            profiles.map((p) => (
              <label key={p.id}>
                <input name="accounts" type="checkbox" value={p.id} />{" "}
                {p.employee_name} · {p.username} · version {p.version}
              </label>
            ))
          ) : (
            <p className="muted">No accounts currently use this position.</p>
          )}
          <small>
            Unchecked accounts keep their current permissions. New accounts use
            the approved template.
          </small>
        </fieldset>
        <label>
          Reason
          <textarea name="reason" required maxLength={1000} />
        </label>
      </fieldset>
    </ActionForm>
  );
}
function PermissionSummary({
  data,
  pages,
}: {
  data: Request["current_data"];
  pages: Page[];
}) {
  return (
    <>
      <p>
        {pages
          .filter((p) => data.pages?.[p.id])
          .map((p) => p.label)
          .join(", ") || "No pages"}
      </p>
      {Object.entries(data.actions ?? {})
        .filter(([, v]) => v.length)
        .map(([m, a]) => (
          <p key={m}>
            <strong>{m}:</strong> {a.join(", ")}
          </p>
        ))}
    </>
  );
}
export function LiveApprovals({
  requests,
  pages,
  access,
}: {
  requests: Request[];
  pages: Page[];
  access: Access;
}) {
  const [id, setId] = useState<number | null>(null);
  const selected = requests.find((r) => r.id === id);
  const [snapshots, setSnapshots] = useState<
    Record<number, { rows?: Affected[]; failed?: boolean }>
  >({});
  const snapshot = id === null ? undefined : snapshots[id];
  const affected = snapshot?.rows ?? [];
  const complete = Boolean(snapshot?.rows);
  async function openRequest(requestId: number) {
    setId(requestId);
    try {
      const rows = await getAffectedAccounts(requestId);
      setSnapshots((previous) => ({ ...previous, [requestId]: { rows } }));
    } catch {
      setSnapshots((previous) => ({
        ...previous,
        [requestId]: { failed: true },
      }));
    }
  }
  return (
    <>
      <PageHeading title="Approval Center" />
      <DataTable
        name="Approvals"
        sample={false}
        exportAllowed={can(access, "Approval Center", "export")}
        rows={requests.map((r) => ({ ...r, id: String(r.id) }))}
        onOpen={(r) => {
          void openRequest(Number(r.id));
        }}
        columns={[
          { key: "id", label: "Request", value: (r) => `PERM-${r.id}` },
          { key: "reason", label: "Reason", value: (r) => r.reason },
          {
            key: "status",
            label: "Status",
            value: (r) => r.status,
            render: (r) => <Badge>{r.status}</Badge>,
          },
        ]}
      />
      {selected && (
        <Modal
          title={`Permission request ${selected.id}`}
          onClose={() => setId(null)}
          wide
        >
          <Badge>{selected.status}</Badge>
          <p>{selected.reason}</p>
          <div className="account-form-grid">
            <section>
              <h3>Current template</h3>
              <PermissionSummary data={selected.current_data} pages={pages} />
            </section>
            <section>
              <h3>Requested template</h3>
              <PermissionSummary data={selected.proposed_data} pages={pages} />
            </section>
          </div>
          <h3>Included accounts</h3>
          {!complete && (
            <p role="status">
              {snapshot?.failed
                ? "Account snapshot could not be loaded. Close and reopen this request to retry."
                : "Loading account snapshot…"}
            </p>
          )}
          {affected
            .filter((a) => a.request_id === selected.id)
            .map((a) => (
              <details key={a.profile_id}>
                <summary>
                  {a.account_name} · version {a.expected_profile_version}
                </summary>
                <h4>Current access</h4>
                <PermissionSummary
                  data={{ pages: a.before_pages, actions: a.before_actions }}
                  pages={pages}
                />
                <h4>Requested access</h4>
                <PermissionSummary
                  data={{ pages: a.after_pages, actions: a.after_actions }}
                  pages={pages}
                />
              </details>
            ))}
          {complete && !affected.some((a) => a.request_id === selected.id) && (
            <p>Template only; existing accounts stay unchanged.</p>
          )}
          {complete &&
            selected.status === "draft" &&
            selected.requester_id === access.id && (
              <ActionForm run={decideRequest} label="Submit for approval">
                <input type="hidden" name="id" value={selected.id} />
                <input type="hidden" name="decision" value="submit" />
              </ActionForm>
            )}
          {complete &&
            selected.status === "pending" &&
            can(access, "Positions & Permissions", "approve") &&
            (selected.requester_id !== access.id ||
              access.role === "owner") && (
              <ActionForm run={decideRequest} label="Record decision">
                <input type="hidden" name="id" value={selected.id} />
                <label>
                  Decision
                  <select name="decision">
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                  </select>
                </label>
                <label>
                  Reason
                  <textarea name="reason" required maxLength={1000} />
                </label>
              </ActionForm>
            )}
          {selected.decision_reason && (
            <p>Decision: {selected.decision_reason}</p>
          )}
        </Modal>
      )}
    </>
  );
}
