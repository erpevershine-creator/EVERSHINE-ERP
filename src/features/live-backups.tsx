"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeading, Modal, Badge } from "@/components/ui";
import { createLocalBackup } from "@/app/backups/actions";
import type { Result } from "@/app/live/actions";
export type BackupRun = {
  id: string;
  reason: string;
  status: string;
  stage: string;
  created_at: string;
  finished_at: string | null;
  archive_bytes: number | null;
  table_count: number | null;
  storage_files: number | null;
  manifest_sha256: string | null;
  error_code: string | null;
};
const time = (s: string) =>
  new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Yangon",
  }).format(new Date(s));
export function LiveBackups({
  runs,
  canCreate,
}: {
  runs: BackupRun[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string | null>(null);
  const [state, action, pending] = useActionState(createLocalBackup, {
    status: "idle",
    message: "",
  } as Result);
  const running = runs.some((r) => ["queued", "running"].includes(r.status));
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [running, router]);
  const detail = runs.find((r) => r.id === selected);
  return (
    <>
      <PageHeading
        title="Backup & Restore"
        subtitle="Local encrypted backups with a separate restore check."
      />
      <section className="panel">
        {canCreate && (
          <form action={action} className="account-form">
            <label>
              Backup reason
              <input
                name="reason"
                required
                maxLength={1000}
                placeholder="Reason for this backup"
                disabled={pending || running}
              />
            </label>
            <div className="form-actions">
              <button className="primary" disabled={pending || running}>
                {pending || running
                  ? "Backup in progress…"
                  : "Create & verify backup"}
              </button>
            </div>
          </form>
        )}
        {state.message && (
          <p role={state.status === "error" ? "alert" : "status"}>
            {state.message}
          </p>
        )}
        <p className="muted">
          Restore checks use a separate database. Live restore and Google Drive
          / Telegram delivery are not enabled yet.
        </p>
      </section>
      <div className="table-panel live-scroll">
        <table>
          <thead>
            <tr>
              <th>Started · Myanmar time</th>
              <th>Status</th>
              <th>Progress</th>
              <th>Size</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {runs.map((r) => (
              <tr key={r.id}>
                <td>{time(r.created_at)}</td>
                <td>
                  <Badge>{r.status}</Badge>
                </td>
                <td>{r.stage}</td>
                <td>
                  {r.archive_bytes === null
                    ? "—"
                    : (r.archive_bytes / 1024 / 1024).toFixed(2) + " MB"}
                </td>
                <td>
                  <button onClick={() => setSelected(r.id)}>View</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!runs.length && <p>No local backups yet.</p>}
      </div>
      {detail && (
        <Modal title="Backup details" onClose={() => setSelected(null)}>
          <p>{detail.reason}</p>
          <p>{detail.stage}</p>
          <dl>
            <dt>Backup ID</dt>
            <dd>{detail.id}</dd>
            <dt>Started</dt>
            <dd>{time(detail.created_at)}</dd>
            <dt>Verified tables</dt>
            <dd>{detail.table_count ?? "—"}</dd>
            <dt>Verified photo/storage files</dt>
            <dd>{detail.storage_files ?? "—"}</dd>
            <dt>Finished</dt>
            <dd>{detail.finished_at ? time(detail.finished_at) : "—"}</dd>
          </dl>
          {detail.error_code && (
            <p role="alert">Error reference: {detail.error_code}</p>
          )}
          {detail.status === "verified" && (
            <p>
              Database record checksums and stored file checksums matched after
              an isolated restore.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}
