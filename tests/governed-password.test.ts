import test from "node:test";
import assert from "node:assert/strict";
import { completeGovernedPasswordChange } from "../src/lib/governed-password.ts";

test("lost provider response reconciles only from committed proof", async () => {
  const outcomes: boolean[] = [];
  assert.equal(await completeGovernedPasswordChange({
    update: async () => { throw Error("connection lost"); },
    receipt: async () => ({ data: true, error: null }),
    finish: async success => { outcomes.push(success); return { error: null }; },
  }), "completed");
  assert.deepEqual(outcomes, [true]);
});

test("provider success without a receipt cannot clear access", async () => {
  assert.equal(await completeGovernedPasswordChange({
    update: async () => ({ error: null }),
    receipt: async () => ({ data: false, error: null }),
    finish: async () => { assert.fail("unproven completion"); },
  }), "pending");
});

test("rejected provider call without proof records failure, not success", async () => {
  const outcomes: boolean[] = [];
  assert.equal(await completeGovernedPasswordChange({
    update: async () => ({ error: { status: 422 } }),
    receipt: async () => ({ data: false, error: null }),
    finish: async success => { outcomes.push(success); return { error: null }; },
  }), "failed");
  assert.deepEqual(outcomes, [false]);
});

test("uncertain provider or receipt response retains the fence", async () => {
  for (const receipt of [{ data: false, error: null }, { data: null, error: Error("unavailable") }]) {
    assert.equal(await completeGovernedPasswordChange({
      update: async () => ({ error: { status: 503 } }),
      receipt: async () => receipt,
      finish: async () => { assert.fail("uncertain result cannot finish"); },
    }), "pending");
  }
});

test("proof with failed finalization remains pending for reconciliation", async () => {
  assert.equal(await completeGovernedPasswordChange({
    update: async () => ({ error: null }),
    receipt: async () => ({ data: true, error: null }),
    finish: async () => ({ error: Error("interrupted") }),
  }), "pending");
});
