"use client";
import { useActionState, useRef, useState } from "react";
import { Modal } from "@/components/ui";
import {
  getIndividualPermissions,
  approveIndividualPermissions,
  type Result,
} from "@/app/live/actions";
import { permissionLabel, roleLabel } from "@/lib/erp-roles";
import type { Page, Profile } from "./live-administration";

export type IndividualAccess = {
  id: string;
  version: number;
  basePages: Record<string, boolean>;
  baseActions: Record<string, string[]>;
  extraPages: Record<string, boolean>;
  extraActions: Record<string, string[]>;
};
const actions = [
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
export function IndividualPermissions({
  profiles,
  pages,
}: {
  profiles: Profile[];
  pages: Page[];
}) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState("");
  const [loaded, setLoaded] = useState<IndividualAccess | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const loadVersion = useRef(0);
  function close() {
    loadVersion.current++;
    setOpen(false);
  }
  async function load(id: string) {
    const version = ++loadVersion.current;
    setSelected(id);
    setLoaded(null);
    setError("");
    if (!id) return;
    setLoading(true);
    try {
      const result = await getIndividualPermissions(id);
      if (version === loadVersion.current) setLoaded(result);
    } catch {
      if (version === loadVersion.current)
        setError(
          "Account permissions could not be loaded. Select the account again to retry.",
        );
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }
  return (
    <>
      <button
        className="primary"
        onClick={() => {
          loadVersion.current++;
          setLoading(false);
          setOpen(true);
          setSelected("");
          setLoaded(null);
          setError("");
        }}
      >
        Individual permissions
      </button>
      {open && (
        <Modal title="Individual permissions" wide onClose={close}>
          <label>
            Employee account
            <select
              value={selected}
              disabled={loading}
              onChange={(e) => void load(e.target.value)}
            >
              <option value="">Select employee</option>
              {profiles
                .filter(
                  (p) => p.erp_role !== "owner" && p.status !== "inactive",
                )
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.employee_name} · {p.company_position} ·{" "}
                    {roleLabel(p.erp_role)} · {p.username}
                  </option>
                ))}
            </select>
          </label>
          {loading && <p role="status">Loading permissions…</p>}
          {error && (
            <p role="alert" className="field-error">
              {error}
            </p>
          )}
          {loaded && !loading && (
            <IndividualForm
              key={loaded.id + "-" + loaded.version}
              data={loaded}
              pages={pages}
              onSaved={close}
            />
          )}
        </Modal>
      )}
    </>
  );
}
function IndividualForm({
  data,
  pages,
  onSaved,
}: {
  data: IndividualAccess;
  pages: Page[];
  onSaved: () => void;
}) {
  const [extraPages, setExtraPages] = useState(data.extraPages);
  const [extraActions, setExtraActions] = useState(data.extraActions);
  const [state, save, pending] = useActionState(
    async (_: Result, form: FormData) => {
      const result = await approveIndividualPermissions(form);
      if (result.status === "success") onSaved();
      return result;
    },
    { status: "idle", message: "" } as Result,
  );
  return (
    <form action={save} className="account-form">
      <input type="hidden" name="profile" value={data.id} />
      <input type="hidden" name="version" value={data.version} />
      <input type="hidden" name="pages" value={JSON.stringify(extraPages)} />
      <input
        type="hidden"
        name="actions"
        value={JSON.stringify(extraActions)}
      />
      <p className="muted">
        Additional access applies only to this account and stays when its role
        template changes.
      </p>
      <fieldset disabled={pending}>
        <legend>Page visibility</legend>
        <div className="table-panel live-scroll">
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Current base</th>
                <th>Additional access</th>
              </tr>
            </thead>
            <tbody>
              {pages.map((p) => (
                <tr key={p.id}>
                  <td>{permissionLabel(p.label)}</td>
                  <td>{data.basePages[p.id] ? "Allowed" : "Not allowed"}</td>
                  <td>
                    <input
                      aria-label={
                        "Additional page: " + permissionLabel(p.label)
                      }
                      type="checkbox"
                      checked={!!extraPages[p.id]}
                      onChange={(e) => {
                        const next = { ...extraPages };
                        if (e.target.checked) next[p.id] = true;
                        else delete next[p.id];
                        setExtraPages(next);
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details>
          <summary>Action permissions</summary>
          {pages.map((p) => (
            <fieldset key={p.id}>
              <legend>{permissionLabel(p.label)}</legend>
              <div className="live-check-grid">
                {actions.map((a) => {
                  const base = !!(
                    data.baseActions[p.label]?.includes(a) ||
                    data.baseActions[p.label]?.includes("*") ||
                    data.baseActions["*"]?.includes("*")
                  );
                  return (
                    <label key={a}>
                      <input
                        type="checkbox"
                        aria-label={
                          "Additional " +
                          permissionLabel(p.label) +
                          ": " +
                          a.replaceAll("_", " ")
                        }
                        checked={!!extraActions[p.label]?.includes(a)}
                        onChange={(e) => {
                          const next = { ...extraActions };
                          next[p.label] = e.target.checked
                            ? [...(next[p.label] ?? []), a]
                            : (next[p.label] ?? []).filter((x) => x !== a);
                          if (!next[p.label].length) delete next[p.label];
                          setExtraActions(next);
                        }}
                      />
                      {a.replaceAll("_", " ")}
                      {base ? " · base allowed" : ""}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ))}
        </details>
        <label>
          Reason
          <textarea name="reason" required maxLength={1000} />
        </label>
      </fieldset>
      {state.message && (
        <p role="alert" className="field-error">
          {state.message}
        </p>
      )}
      <div className="form-actions">
        <button className="primary" disabled={pending}>
          {pending ? "Saving…" : "Approve & save"}
        </button>
      </div>
    </form>
  );
}
