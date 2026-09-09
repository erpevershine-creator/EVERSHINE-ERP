"use client";
import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PageHeading, Modal, Badge } from "@/components/ui";
import {
  createLocalBackup,
  reviewBackupRetention,
} from "@/app/backups/actions";
import type { Result } from "@/app/live/actions";
export type BackupRun = {
  origin: "manual" | "scheduled";
  scheduled_for: string | null;
  archive_state: string;
  pruned_at: string | null;
  prune_error_code: string | null;
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
  schedule,
}: {
  schedule: { enabled: boolean; last_checked_at: string | null } | null;
  runs: BackupRun[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [retention, setRetention] = useState<Awaited<
    ReturnType<typeof reviewBackupRetention>
  > | null>(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewError, setReviewError] = useState("");
  async function openRetention() {
    setReviewing(true);
    setReviewError("");
    try {
      setRetention(await reviewBackupRetention());
    } catch {
      setReviewError("Retention review could not be loaded. Please retry.");
    } finally {
      setReviewing(false);
    }
  }
  const [selected, setSelected] = useState<string | null>(null);
  const [state, action, pending] = useActionState(createLocalBackup, {
    status: "idle",
    message: "",
  } as Result);
  const running = runs.some((r) => ["queued", "running"].includes(r.status));
  useEffect(() => {
    if (!running && !schedule?.enabled) return;
    const timer = setInterval(() => router.refresh(), running ? 4000 : 60000);
    return () => clearInterval(timer);
  }, [running, router, schedule?.enabled]);
  const detail = runs.find((r) => r.id === selected);
  return (
    <>
      <PageHeading
        title="Backup & Restore"
        subtitle="Local encrypted backups with a separate restore check."
        action={
          <button onClick={openRetention} disabled={reviewing}>
            {reviewing ? "Loading…" : "Retention review"}
          </button>
        }
      />
      {reviewError && <p role="alert">{reviewError}</p>}
      <section className="panel">
        <p className="muted">
          Daily · 18:00 Myanmar time ·{" "}
          {schedule?.enabled ? "Enabled while local server runs" : "Disabled"}
          {schedule?.last_checked_at
            ? " · Last check " + time(schedule.last_checked_at)
            : " · Waiting for scheduler"}
        </p>
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
                  <Badge>
                    {r.archive_state === "pruned"
                      ? "Pruned"
                      : r.archive_state === "pruning"
                        ? "Removing"
                        : r.status}
                  </Badge>
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
      {retention && (
        <Modal title="Backup retention" wide onClose={() => setRetention(null)}>
          <p>
            Scheduled backups: 7 daily · 3 completed months · 1 completed year.
            Manual backups are kept.
          </p>
          <p>
            {retention.keep} kept · {retention.candidates} outside retention ·{" "}
            {retention.removed} removed
          </p>
          <p className="muted">
            Removal runs after a newer verified backup passes its archive
            integrity check. History remains.
          </p>
          <div className="live-scroll">
            <table>
              <thead>
                <tr>
                  <th>Started · Myanmar time</th>
                  <th>Source</th>
                  <th>Retention</th>
                </tr>
              </thead>
              <tbody>
                {retention.rows.map((r) => (
                  <tr key={r.id}>
                    <td>{time(r.created_at)}</td>
                    <td>{r.origin}</td>
                    <td>{r.reasons.join(" · ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {retention.total > retention.rows.length && (
            <p>
              Showing latest {retention.rows.length} of {retention.total}{" "}
              backups. Totals include all records.
            </p>
          )}
        </Modal>
      )}
      {detail && (
        <Modal title="Backup details" onClose={() => setSelected(null)}>
          <p>{detail.reason}</p>
          <p>
            {detail.archive_state === "pruned"
              ? "Archive removed by retention; history retained."
              : detail.archive_state === "pruning"
                ? "Archive removal in progress; unavailable for restore."
                : detail.stage}
          </p>
          <dl>
            <dt>Backup ID</dt>
            <dd>{detail.id}</dd>
            <dt>Source</dt>
            <dd>
              {detail.origin === "scheduled"
                ? "Daily schedule · " + detail.scheduled_for
                : "Manual request"}
            </dd>
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
          {detail.prune_error_code && (
            <p role="alert">Retention check: {detail.prune_error_code}</p>
          )}
          {detail.pruned_at && <p>Removed: {time(detail.pruned_at)}</p>}
          {detail.status === "verified" &&
            detail.archive_state === "present" && (
              <p>
                Database record checksums and stored file checksums matched
                after an isolated restore.
              </p>
            )}
        </Modal>
      )}
    </>
  );
}
