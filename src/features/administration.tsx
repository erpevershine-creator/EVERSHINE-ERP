"use client";
import { useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Plus } from "lucide-react";
import { useReview } from "@/components/review-provider";
import { DataTable, type Column } from "@/components/table";
import { Badge, KeyValues, Modal, PageHeading } from "@/components/ui";
import { policy, validatePassword, type PreviewRole } from "@/lib/policy";
import {
  pageCatalog,
  validGmail,
  type ReviewAccount,
  type ReviewPosition,
} from "@/lib/administration";

function ProfilePhoto({
  account,
  large = false,
}: {
  account: Pick<ReviewAccount, "photo" | "name">;
  large?: boolean;
}) {
  return (
    <span className={`avatar ${large ? "avatar-profile" : ""}`}>
      {account.photo ? (
        <Image
          src={account.photo}
          alt={`${account.name || "Employee"} profile photo`}
          width={large ? 72 : 32}
          height={large ? 72 : 32}
          unoptimized
        />
      ) : (
        account.name.slice(0, 1) || "?"
      )}
    </span>
  );
}
export function Accounts() {
  const { state, actor } = useReview();
  const [status, setStatus] = useState("All statuses");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  if (!state) return null;
  const manage =
    actor.role === "Owner" ||
    (actor.role === "Admin" && actor.approvals.includes("Account Management"));
  const accounts = state.accounts.filter((a) => manage || a.id === actor.id);
  const selected = accounts.find((a) => a.id === selectedId);
  const positionName = (a: ReviewAccount) =>
    state.positions.find((p) => p.id === a.positionId)?.name ?? "Unassigned";
  const columns: Column<ReviewAccount>[] = [
    {
      key: "name",
      label: "Employee",
      value: (a) => a.name,
      render: (a) => (
        <span className="account-cell">
          <ProfilePhoto account={a} />
          <span className="record-label">
            <strong>{a.name}</strong>
            <small>{a.username || "Not provisioned"}</small>
          </span>
        </span>
      ),
    },
    { key: "position", label: "Position", value: positionName },
    { key: "department", label: "Department", value: (a) => a.department },
    { key: "role", label: "ERP role", value: (a) => a.role },
    { key: "contact", label: "Contact", value: (a) => a.contact || "—" },
    { key: "devices", label: "Active devices", value: () => "—" },
    {
      key: "status",
      label: "Status",
      value: (a) => a.status,
      render: (a) => <Badge>{a.status}</Badge>,
    },
  ];
  return (
    <>
      <PageHeading
        title="Account Management"
        subtitle="Individual accounts, assigned positions and controlled access."
        action={
          manage ? (
            <button className="primary" onClick={() => setCreating(true)}>
              <Plus size={16} />
              Create account
            </button>
          ) : undefined
        }
      />
      <div className="compact-summary">
        <span>
          <strong>{accounts.filter((a) => a.role === "Owner").length}</strong>{" "}
          Owner
        </span>
        <span>
          <strong>
            {
              accounts.filter(
                (a) => a.status === "Active" && a.role !== "Owner",
              ).length
            }
          </strong>{" "}
          Sample active staff
        </span>
        <span>
          <strong>
            {accounts.filter((a) => a.status === "Inactive").length}
          </strong>{" "}
          Inactive account
        </span>
        <span className="muted">Authentication: not connected</span>
      </div>
      <DataTable
        rows={accounts.filter(
          (a) => status === "All statuses" || a.status === status,
        )}
        columns={columns}
        name="Accounts"
        onOpen={(a) => setSelectedId(a.id)}
        exportAllowed={manage}
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
      {creating && manage ? (
        <CreateAccount onClose={() => setCreating(false)} />
      ) : null}
      {selected ? (
        <Modal title={selected.name} onClose={() => setSelectedId(null)}>
          <div className="profile-summary">
            <ProfilePhoto account={selected} large />
            <span>{selected.username || "Not provisioned"}</span>
          </div>
          <KeyValues
            rows={[
              ["Employee Name", selected.name],
              ["Position", positionName(selected)],
              ["Department", selected.department],
              ["ERP Role", selected.role],
              ["Username", selected.username || "Not provisioned"],
              ["Contact", selected.contact || "Not provided"],
              ["Status", <Badge key="status">{selected.status}</Badge>],
              ["Authentication", "Not provisioned — sample record only"],
              ["Password", "Not stored in local preview"],
              ["Device limit", `${policy.maxDevices} active devices`],
            ]}
          />
        </Modal>
      ) : null}
    </>
  );
}
function CreateAccount({ onClose }: { onClose: () => void }) {
  const { state, actor, currentAccount, createAccount } = useReview();
  const [form, setForm] = useState({
    name: "",
    positionId: "operations-position",
    department: "",
    role: "Employee" as PreviewRole,
    username: "",
    password: "",
    confirm: "",
    contact: "",
  });
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState("");
  const photoSequence = useRef(0);
  const positions =
    state?.positions.filter(
      (p) =>
        p.id !== "owner-position" &&
        (actor.role === "Owner" ||
          (!p.approvals.length &&
            pageCatalog.every(
              (page) => !p.pages[page.id] || currentAccount?.pages[page.id],
            ))),
    ) ?? [];
  const update = (field: keyof typeof form, value: string) =>
    setForm((previous) => ({ ...previous, [field]: value }));
  async function selectPhoto(file: File | undefined) {
    const sequence = ++photoSequence.current;
    setError("");
    setPhoto(null);
    if (!file) {
      setPhotoBusy(false);
      return;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 2 * 1024 * 1024
    ) {
      setPhotoBusy(false);
      setError("Choose a JPG, PNG or WebP photo up to 2 MB.");
      return;
    }
    setPhotoBusy(true);
    try {
      const bitmap = await createImageBitmap(file);
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const context = canvas.getContext("2d");
      if (!context) {
        bitmap.close();
        throw new Error("Photo preview unavailable.");
      }
      const size = Math.min(bitmap.width, bitmap.height);
      context.drawImage(
        bitmap,
        (bitmap.width - size) / 2,
        (bitmap.height - size) / 2,
        size,
        size,
        0,
        0,
        256,
        256,
      );
      bitmap.close();
      if (sequence === photoSequence.current)
        setPhoto(canvas.toDataURL("image/webp", 0.82));
    } catch {
      if (sequence === photoSequence.current)
        setError("This image could not be opened. Choose another photo.");
    } finally {
      if (sequence === photoSequence.current) setPhotoBusy(false);
    }
  }
  function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!photo || photoBusy) {
      setError("Select a profile photo first.");
      return;
    }
    if (!validGmail(form.username)) {
      setError("Enter a company-assigned @gmail.com address.");
      return;
    }
    if (!validatePassword(form.password)) {
      setError(
        "Use at least 8 characters, one uppercase letter and one number.",
      );
      return;
    }
    if (form.password !== form.confirm) {
      setError("Passwords do not match.");
      return;
    }
    const failure = createAccount({
      name: form.name,
      positionId: form.positionId,
      department: form.department,
      role: form.role,
      username: form.username,
      contact: form.contact,
      photo,
    });
    if (failure) setError(failure);
    else {
      setForm((previous) => ({ ...previous, password: "", confirm: "" }));
      onClose();
    }
  }
  return (
    <Modal title="Create account" onClose={onClose} wide>
      <form onSubmit={save} className="account-form">
        <div className="photo-field">
          <ProfilePhoto account={{ name: form.name, photo }} large />
          <label>
            Profile Photo
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              aria-describedby="photo-help"
              onChange={(e) => void selectPhoto(e.target.files?.[0])}
            />
            <small id="photo-help">JPG, PNG or WebP · up to 2 MB</small>
          </label>
        </div>
        <div className="account-form-grid">
          <label>
            Employee Name
            <input
              required
              maxLength={100}
              autoComplete="off"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
            />
          </label>
          <label>
            Department
            <input
              required
              maxLength={80}
              autoComplete="off"
              value={form.department}
              onChange={(e) => update("department", e.target.value)}
            />
          </label>
          <label>
            Position
            <select
              value={form.positionId}
              onChange={(e) => {
                const position = positions.find((p) => p.id === e.target.value);
                setForm((previous) => ({
                  ...previous,
                  positionId: e.target.value,
                  role: position?.approvals.length ? "Admin" : previous.role,
                }));
              }}
            >
              {positions.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            ERP Role
            <select
              value={form.role}
              onChange={(e) => update("role", e.target.value)}
            >
              <option>Employee</option>
              {actor.role === "Owner" ? <option>Admin</option> : null}
            </select>
          </label>
          <label>
            Username
            <input
              required
              type="email"
              maxLength={254}
              placeholder="employee@gmail.com"
              autoComplete="off"
              value={form.username}
              onChange={(e) => update("username", e.target.value)}
            />
          </label>
          <label>
            Contact
            <input
              required
              type="tel"
              maxLength={80}
              autoComplete="off"
              value={form.contact}
              onChange={(e) => update("contact", e.target.value)}
            />
          </label>
          <label>
            Password
            <input
              required
              type="password"
              maxLength={128}
              autoComplete="new-password"
              aria-describedby="password-help"
              value={form.password}
              onChange={(e) => update("password", e.target.value)}
            />
          </label>
          <label>
            Confirm Password
            <input
              required
              type="password"
              maxLength={128}
              autoComplete="new-password"
              value={form.confirm}
              onChange={(e) => update("confirm", e.target.value)}
            />
          </label>
        </div>
        <p id="password-help" className="muted">
          Minimum 8 characters, one uppercase letter and one number. Local
          preview validates passwords without saving them.
        </p>
        {error ? (
          <p className="field-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="form-actions">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="primary" type="submit" disabled={photoBusy}>
            {photoBusy ? "Preparing photo…" : "Create sample account"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function Permissions() {
  const { state, actor } = useReview();
  const [selectedId, setSelectedId] = useState("operations-position");
  const [filter, setFilter] = useState("All scopes");
  if (!state) return null;
  const selected = state.positions.find((p) => p.id === selectedId)!;
  const manage =
    actor.role === "Owner" ||
    (actor.role === "Admin" &&
      actor.approvals.includes("Positions & Permissions"));
  const columns: Column<ReviewPosition>[] = [
    { key: "name", label: "Position", value: (p) => p.name },
    {
      key: "members",
      label: "Active accounts",
      value: (p) =>
        String(
          state.accounts.filter(
            (a) => a.positionId === p.id && a.status === "Active",
          ).length,
        ),
    },
    { key: "scope", label: "Action scope", value: (p) => p.scope },
    {
      key: "pages",
      label: "Visible pages",
      value: (p) =>
        `${pageCatalog.filter((page) => p.pages[page.id]).length} / ${pageCatalog.length}`,
    },
  ];
  return (
    <>
      <PageHeading
        title="Positions & Permissions"
        subtitle="Control visible pages separately from management and approval authority."
      />
      <DataTable
        rows={state.positions.filter(
          (p) => filter === "All scopes" || p.scope === filter,
        )}
        columns={columns}
        name="Positions"
        onOpen={(p) => setSelectedId(p.id)}
        exportAllowed={manage}
        filter={
          <select
            aria-label="Position scope"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>All scopes</option>
            {state.positions.map((p) => (
              <option key={p.id}>{p.scope}</option>
            ))}
          </select>
        }
      />
      <PageVisibilityEditor
        key={`${selected.id}:${JSON.stringify(selected.pages)}`}
        position={selected}
        manage={manage}
      />
    </>
  );
}
function PageVisibilityEditor({
  position,
  manage,
}: {
  position: ReviewPosition;
  manage: boolean;
}) {
  const { state, requestPageAccess, currentAccount, actor } = useReview();
  const [pages, setPages] = useState({ ...position.pages });
  const [included, setIncluded] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const members =
    state?.accounts.filter(
      (a) =>
        a.positionId === position.id &&
        a.role !== "Owner" &&
        a.status === "Active",
    ) ?? [];
  const editable = manage && position.id !== "owner-position";
  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitted(false);
    const failure = requestPageAccess(position.id, pages, included, reason);
    setError(failure ?? "");
    if (!failure) setSubmitted(true);
  }
  return (
    <section className="panel settings-panel">
      <div className="panel-heading">
        <h2>{position.name}</h2>
        <span className="muted">Page visibility</span>
      </div>
      <form onSubmit={submit}>
        <div className="table-scroll">
          <table className="permission-matrix">
            <thead>
              <tr>
                <th scope="col">Page</th>
                <th scope="col">Current</th>
                <th scope="col">Requested visibility</th>
              </tr>
            </thead>
            <tbody>
              {pageCatalog.map((page) => (
                <tr key={page.id}>
                  <th scope="row">{page.label}</th>
                  <td>{position.pages[page.id] ? "Visible" : "Hidden"}</td>
                  <td>
                    <label className="checkbox-label">
                      <input
                        type="checkbox"
                        aria-label={`Show ${page.label}`}
                        checked={pages[page.id]}
                        disabled={
                          !editable ||
                          (actor.role === "Admin" &&
                            !currentAccount?.pages[page.id])
                        }
                        onChange={(e) => {
                          setPages({ ...pages, [page.id]: e.target.checked });
                          setSubmitted(false);
                        }}
                      />
                      {pages[page.id] ? "Visible" : "Hidden"}
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {editable ? (
          <>
            <fieldset className="affected-accounts">
              <legend>Accounts included in this change</legend>
              {members.length ? (
                members.map((account) => (
                  <label className="checkbox-label" key={account.id}>
                    <input
                      type="checkbox"
                      checked={included.includes(account.id)}
                      onChange={(e) => {
                        setIncluded(
                          e.target.checked
                            ? [...included, account.id]
                            : included.filter((id) => id !== account.id),
                        );
                        setSubmitted(false);
                      }}
                    />
                    {account.name}
                    <small>{account.username}</small>
                  </label>
                ))
              ) : (
                <p className="muted">No active accounts in this position.</p>
              )}
            </fieldset>
            <label className="reason-field">
              Reason note
              <textarea
                rows={2}
                maxLength={1000}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value);
                  setSubmitted(false);
                }}
              />
            </label>
            {error ? (
              <p className="field-error" role="alert">
                {error}
              </p>
            ) : null}
            {submitted ? (
              <p role="status">
                Request submitted.{" "}
                <Link href="/approvals">Review in Approval Center</Link>
              </p>
            ) : null}
            <div className="form-actions">
              <button
                className="primary"
                type="submit"
                disabled={submitted || !members.length}
              >
                Submit for approval
              </button>
            </div>
          </>
        ) : (
          <p className="muted">
            {position.id === "owner-position"
              ? "The single Owner account keeps company access."
              : "Page visibility is read-only for this account."}
          </p>
        )}
        <p className="footnote">
          Approval applies to the listed accounts only. Excluded accounts and
          existing individual overrides stay unchanged. Viewing a page does not
          grant management or approval authority.
        </p>
      </form>
    </section>
  );
}
