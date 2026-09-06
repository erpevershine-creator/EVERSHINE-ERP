import assert from "node:assert/strict";
import test from "node:test";
import {
  actors,
  canApprove,
  canRevise,
  csvCell,
  isLocalReview,
  quotaPolicy,
  validatePassword,
} from "../src/lib/policy.ts";

test("only Owner may self-approve; Admin must have the exact module authority", () => {
  assert.equal(
    canApprove(actors[0], { module: "Settings", requesterId: "owner" }),
    true,
  );
  assert.equal(
    canApprove(actors[1], {
      module: "Account Management",
      requesterId: "admin",
    }),
    false,
  );
  assert.equal(
    canApprove(actors[1], {
      module: "Positions & Permissions",
      requesterId: "employee",
    }),
    false,
  );
  assert.equal(
    canApprove(actors[1], {
      module: "Account Management",
      requesterId: "employee",
    }),
    true,
  );
  assert.equal(
    canApprove(actors[2], {
      module: "Account Management",
      requesterId: "owner",
    }),
    false,
  );
  assert.equal(canRevise(actors[2], "Account Management"), false);
});
test("local review gate rejects hosted, production, disabled and deceptive hostnames", () => {
  for (const host of ["localhost:3000", "127.0.0.1:3000", "[::1]:3000"])
    assert.equal(isLocalReview("development", "1", host), true);
  for (const host of [
    "localhost.attacker.com",
    "evershine.vercel.app",
    "192.168.1.2:3000",
    "localhost:3000@attacker.com",
  ])
    assert.equal(isLocalReview("development", "1", host), false);
  assert.equal(isLocalReview("production", "1", "localhost:3000"), false);
  assert.equal(
    isLocalReview("development", undefined, "localhost:3000"),
    false,
  );
});
test("80 percent boundary pauses non-critical jobs and never blocks manual export", () => {
  assert.equal(quotaPolicy(79.9).pauseEmail, false);
  assert.equal(quotaPolicy(80).pauseEmail, true);
  assert.equal(quotaPolicy(80).pauseScheduledReports, true);
  assert.equal(quotaPolicy(100).manualExportAllowed, true);
  assert.equal(quotaPolicy(null).known, false);
  assert.equal(quotaPolicy(null).pauseEmail, true);
});
test("confirmed password minimum and spreadsheet formula neutralization", () => {
  assert.equal(validatePassword("SampleA1"), true);
  for (const value of ["shortA1", "lowercase1", "NoNumbers"])
    assert.equal(validatePassword(value), false);
  assert.equal(csvCell("=1+1"), '"\'=1+1"');
  assert.equal(csvCell("  @SUM(A1)"), '"\'  @SUM(A1)"');
  assert.equal(csvCell('ordinary "note"'), '"ordinary ""note"""');
});
