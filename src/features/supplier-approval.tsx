"use client";
import { useState } from "react";
import { Modal, Badge } from "@/components/ui";
import { decideSupplier } from "@/app/suppliers/actions";
import { SupplierPackageSummary } from "./supplier-package-summary";
import type { SupplierPackageInput } from "@/lib/suppliers";
import type { Access } from "@/lib/access";
import type { Request } from "./live-administration";

export function SupplierApproval({
  request,
  access,
  onClose,
}: {
  request: Request;
  access: Access;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [decision, setDecision] = useState("approve");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const proposed = request.proposed_data as unknown as {
    payload: SupplierPackageInput;
    revision: number;
    code: string;
    packageId: string;
  };
  const current = request.current_data as unknown as {
    payload?: SupplierPackageInput;
    revision?: number;
  };
  const approve =
    access.role === "owner" ||
    (access.role === "admin" &&
      access.actions["Suppliers & Commercials"]?.some(
        (a) => a === "approve" || a === "*",
      ));
  const canDecide =
    approve && (request.requester_id !== access.id || access.role === "owner");
  async function run(action: string) {
    setBusy(true);
    setMessage("");
    try {
      const f = new FormData();
      f.set("id", String(request.id));
      f.set("decision", action);
      f.set("reason", reason);
      const result = await decideSupplier(f);
      setMessage(result.message);
      if (result.status === "success") onClose();
    } catch {
      setMessage(
        "Could not confirm the decision. Reload the request before retrying.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      title={`Supplier request ${request.id} · ${proposed.code}`}
      onClose={() => {
        if (!busy) onClose();
      }}
      wide
    >
      <div className="form-stack">
        <Badge>{request.status}</Badge>
        <p>Reason: {request.reason}</p>
        {current.payload && (
          <details>
            <summary>
              Current Active package · revision {current.revision}
            </summary>
            <SupplierPackageSummary payload={current.payload} />
          </details>
        )}
        <h3>Requested package · revision {proposed.revision}</h3>
        <SupplierPackageSummary payload={proposed.payload} />
        {request.status === "pending" && (
          <>
            <label>
              Decision reason
              <textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={1000}
                disabled={busy}
              />
            </label>
            {canDecide && (
              <>
                <label>
                  Decision
                  <select
                    value={decision}
                    onChange={(e) => setDecision(e.target.value)}
                  >
                    <option value="approve">Approve</option>
                    <option value="reject">Reject</option>
                  </select>
                </label>
                <button
                  className="primary"
                  disabled={busy || !reason.trim()}
                  onClick={() => void run(decision)}
                >
                  Record decision
                </button>
              </>
            )}
            {request.requester_id === access.id && (
              <button
                disabled={busy || !reason.trim()}
                onClick={() => void run("withdraw")}
              >
                Withdraw request
              </button>
            )}
          </>
        )}
        {request.decision_reason && (
          <p>Decision reason: {request.decision_reason}</p>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </Modal>
  );
}
