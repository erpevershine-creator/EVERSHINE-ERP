import assert from "node:assert/strict";
import test from "node:test";
import {
  initialAccounts,
  initialPositions,
  applyPageAccessChange,
  canViewPage,
  validGmail,
  type PageAccessChange,
} from "../src/lib/administration.ts";
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

test("page access approval preserves excluded accounts and individual overrides; stale requests fail", () => {
  const positions = structuredClone(initialPositions);
  const accounts = initialAccounts();
  const employee = accounts.find((a) => a.id === "employee")!;
  employee.pages.usage = true; // An existing individual override.
  accounts.push({ ...employee, id: "excluded", pages: { ...employee.pages } });
  const position = positions.find((p) => p.id === employee.positionId)!;
  const change: PageAccessChange = {
    positionId: position.id,
    before: { ...position.pages },
    after: { ...position.pages, audit: false, accounts: true },
    accountIds: ["employee"],
    accountBefore: { employee: { ...employee.pages } },
  };
  const updated = applyPageAccessChange(positions, accounts, change);
  const actual = updated.accounts.find((a) => a.id === "employee")!;
  assert.equal(actual.pages.audit, false);
  assert.equal(actual.pages.accounts, true);
  assert.equal(actual.pages.usage, true);
  assert.deepEqual(
    updated.accounts.find((a) => a.id === "excluded"),
    accounts.find((a) => a.id === "excluded"),
  );
  assert.equal(canViewPage(actual, "audit"), false);
  assert.equal(canViewPage({ ...actual, status: "Inactive" }, "usage"), false);
  assert.throws(
    () => applyPageAccessChange(updated.positions, updated.accounts, change),
    /template changed/,
  );
  assert.throws(
    () =>
      applyPageAccessChange(positions, accounts, { ...change, accountIds: [] }),
    /Select the affected/,
  );
  assert.throws(
    () =>
      applyPageAccessChange(positions, accounts, {
        ...change,
        positionId: "owner-position",
      }),
    /not permitted/,
  );
  const stale = structuredClone(accounts);
  stale.find((a) => a.id === "employee")!.pages.dashboard = false;
  assert.throws(
    () => applyPageAccessChange(positions, stale, change),
    /included account changed/,
  );
  assert.equal(validGmail("person@gmail.com"), true);
  assert.equal(validGmail("person@example.com"), false);
});
