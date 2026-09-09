import test from "node:test";
import assert from "node:assert/strict";
import {
  planBackupRetention,
  type RetentionBackup,
} from "../src/lib/backup-retention.ts";
const now = new Date("2026-09-10T00:00:00Z");
const b = (
  id: string,
  date: string,
  origin = "scheduled",
): RetentionBackup => ({
  id,
  created_at: date + "T12:00:00Z",
  origin,
  status: "verified",
  archive_state: "present",
});
test("manual archives stay protected and seven daily representatives are retained", () => {
  const rows = [
    b("manual", "2020-01-01", "manual"),
    ...Array.from({ length: 9 }, (_, i) => b("d" + i, `2026-09-0${i + 1}`)),
  ];
  const plan = planBackupRetention(rows, now);
  assert.ok(
    plan.find((x) => x.id === "manual")!.reasons.includes("Manual backup"),
  );
  assert.equal(plan.filter((x) => x.reasons.includes("Daily")).length, 7);
  assert.deepEqual(
    plan
      .filter((x) => x.decision === "candidate")
      .map((x) => x.id)
      .sort(),
    ["d0", "d1"],
  );
});
test("completed-month/year representatives overlap without duplicate copies", () => {
  const rows = [
    "2024-12-31",
    "2025-12-30",
    "2025-12-31",
    "2026-05-31",
    "2026-06-30",
    "2026-07-31",
    "2026-08-30",
    "2026-08-31",
    "2026-09-01",
    "2026-09-02",
    "2026-09-03",
    "2026-09-04",
    "2026-09-05",
    "2026-09-06",
    "2026-09-07",
    "2026-09-08",
    "2026-09-09",
  ].map((d) => b(d, d));
  const plan = planBackupRetention(rows, now);
  assert.deepEqual(
    plan.filter((x) => x.reasons.includes("Monthly")).map((x) => x.id),
    ["2026-08-31", "2026-07-31", "2026-06-30"],
  );
  assert.deepEqual(
    plan.filter((x) => x.reasons.includes("Yearly")).map((x) => x.id),
    ["2025-12-31"],
  );
  assert.equal(plan.find((x) => x.id === "2024-12-31")!.decision, "candidate");
});
test("unverified, future and recovery-dependent backups are never removal candidates", () => {
  const rows = [
    { ...b("failed", "2020-01-01"), status: "failed" },
    b("future", "2030-01-01"),
    {
      ...b("old", "2020-01-01"),
      archive_state: "pruning",
      prune_replacement_id: "dependency",
    },
    b("dependency", "2020-02-01"),
    ...Array.from({ length: 9 }, (_, i) => b("d" + i, `2026-09-0${i + 1}`)),
  ];
  const plan = planBackupRetention(rows, now);
  for (const id of ["failed", "future", "old", "dependency"])
    assert.equal(plan.find((x) => x.id === id)!.decision, "keep");
  assert.throws(
    () => planBackupRetention([rows[0], rows[0]], now),
    /Duplicate/,
  );
});
test("daily slots use Myanmar calendar dates and preserve sparse history", () => {
  const plan = planBackupRetention(
    [
      { ...b("a", "2026-09-01"), created_at: "2026-09-01T17:29:00Z" },
      { ...b("b", "2026-09-01"), created_at: "2026-09-01T17:30:00Z" },
    ],
    now,
  );
  assert.equal(plan.filter((x) => x.reasons.includes("Daily")).length, 2);
  assert.equal(plan.filter((x) => x.decision === "candidate").length, 0);
});
