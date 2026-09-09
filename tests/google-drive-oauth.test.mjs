import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  validateClient,
  makeAuthorization,
  validateCallback,
  exchangeCode,
  checkConnection,
  driveScope,
  backupGoogleAccount,
} from "../scripts/google-drive-oauth.mjs";
import { secretCodec } from "../scripts/google-secret-store.mjs";
const client = {
  client_id: "822638054713-fixture.apps.googleusercontent.com",
  client_secret: "test-only-value",
};
const raw = {
  installed: {
    ...client,
    project_id: "peerless-sensor-508107-e0",
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
  },
};
const response = (data) => ({
  ok: true,
  status: 200,
  text: async () => JSON.stringify(data),
});
test("client import rejects other projects, web clients and substituted endpoints", () => {
  assert.deepEqual(validateClient(raw), client);
  assert.throws(() => validateClient({ web: raw.installed }));
  for (const replacement of [
    { project_id: "old-project" },
    { client_id: "123-fixture.apps.googleusercontent.com" },
    { token_uri: "https://example.com/token" },
  ])
    assert.throws(() =>
      validateClient({ installed: { ...raw.installed, ...replacement } }),
    );
});
test("authorization uses fresh S256 PKCE and only app-file access with exact loopback redirect", () => {
  const a = makeAuthorization(client, 54399),
    b = makeAuthorization(client, 54399),
    u = new URL(a.url);
  assert.notEqual(a.state, b.state);
  assert.notEqual(a.verifier, b.verifier);
  assert.equal(
    u.searchParams.get("code_challenge"),
    createHash("sha256").update(a.verifier).digest("base64url"),
  );
  assert.equal(u.searchParams.get("scope"), driveScope);
  assert.equal(u.searchParams.get("redirect_uri"), "http://127.0.0.1:54399/");
  assert.equal(u.searchParams.get("login_hint"), backupGoogleAccount);
  assert.ok(!a.url.includes(client.client_secret));
});
test("callback rejects forged host, wrong state, duplicate values and denial", () => {
  const a = makeAuthorization(client, 54399),
    request = {
      method: "GET",
      headers: { host: "127.0.0.1:54399" },
      url: `/?state=${a.state}&code=test-only-code`,
    };
  assert.equal(validateCallback(request, a), "test-only-code");
  for (const patch of [
    { method: "POST" },
    { headers: { host: "evil.test:54399" } },
    { url: "/?state=bad&code=x" },
    { url: request.url + "&state=duplicate" },
    { url: request.url + "&code=duplicate" },
    { url: `http://evil.test/?state=${a.state}&code=x` },
  ])
    assert.throws(() => validateCallback({ ...request, ...patch }, a));
  assert.throws(
    () =>
      validateCallback(
        { ...request, url: `/?state=${a.state}&error=access_denied` },
        a,
      ),
    /GOOGLE_CONSENT_DENIED/,
  );
});
test("code exchange binds PKCE and verified Google identity before returning refresh token", async () => {
  const a = makeAuthorization(client, 54399);
  let calls = 0;
  const fetcher = async (url, options) => {
    assert.equal(options.redirect, "error");
    calls++;
    if (calls === 1) {
      assert.equal(url, "https://oauth2.googleapis.com/token");
      assert.equal(options.body.get("code_verifier"), a.verifier);
      return response({
        access_token: "fixture-access",
        refresh_token: "fixture-refresh",
        scope: driveScope,
        token_type: "Bearer",
      });
    }
    assert.equal(options.headers.Authorization, "Bearer fixture-access");
    return response({
      user: { emailAddress: backupGoogleAccount, permissionId: "fixture-user" },
    });
  };
  const connection = await exchangeCode(client, a, "fixture-code", fetcher);
  assert.equal(connection.email, backupGoogleAccount);
  assert.equal(connection.refresh_token, "fixture-refresh");
  assert.equal(calls, 2);
  assert.equal(connection.access_token, undefined);
});
test("exchange rejects wrong accounts and excessive or incomplete scope", async () => {
  const a = makeAuthorization(client, 54399);
  for (const scope of [
    "",
    driveScope + " https://www.googleapis.com/auth/drive",
  ])
    await assert.rejects(
      exchangeCode(client, a, "code", async () =>
        response({
          access_token: "x",
          refresh_token: "y",
          scope,
          token_type: "Bearer",
        }),
      ),
      /GOOGLE_ACCESS_INCOMPLETE/,
    );
  await assert.rejects(
    exchangeCode(client, a, "code", async (url) =>
      url.includes("/token")
        ? response({
            access_token: "x",
            refresh_token: "y",
            scope: driveScope,
            token_type: "Bearer",
          })
        : response({
            user: {
              emailAddress: "old.account@gmail.com",
              permissionId: "other",
            },
          }),
    ),
    /GOOGLE_ACCOUNT_MISMATCH/,
  );
});
test("refresh verification rejects changed identity and revoked grants without returning provider error details", async () => {
  const c = {
    ...client,
    email: backupGoogleAccount,
    scope: driveScope,
    permissionId: "original",
    refresh_token: "fixture-refresh",
  };
  await assert.rejects(
    checkConnection(client, c, async (url) =>
      url.includes("/token")
        ? response({ access_token: "fixture" })
        : response({
            user: {
              emailAddress: backupGoogleAccount,
              permissionId: "different",
            },
          }),
    ),
    /GOOGLE_ACCOUNT_MISMATCH/,
  );
  await assert.rejects(
    checkConnection(client, c, async () => ({
      ok: false,
      status: 400,
      text: async () => "secret provider detail",
    })),
    /^Error: GOOGLE_RECONNECT_REQUIRED$/,
  );
});
test(
  "Windows protection roundtrips disposable tokens and rejects damaged ciphertext",
  { skip: process.platform !== "win32" },
  async () => {
    const input = Buffer.from("disposable OAuth token fixture"),
      sealed = await secretCodec("Protect", input);
    assert.ok(!sealed.includes(input));
    assert.deepEqual(await secretCodec("Unprotect", sealed), input);
    sealed[sealed.length - 1] ^= 1;
    await assert.rejects(
      secretCodec("Unprotect", sealed),
      /GOOGLE_SECRET_STORE_FAILED/,
    );
  },
);

test("local client import rejects cross-origin and forged form submissions", async () => {
  const { validateImportRequest } = await import(
    "../scripts/google-client-import.mjs"
  );
  const origin = "http://127.0.0.1:54399",
    nonce = "a".repeat(64),
    req = {
      method: "POST",
      url: "/",
      headers: {
        host: "127.0.0.1:54399",
        origin,
        "content-type": "application/x-www-form-urlencoded",
      },
    };
  const body = new URLSearchParams({
    nonce,
    config: JSON.stringify(raw),
  }).toString();
  assert.deepEqual(validateImportRequest(req, origin, nonce, body), client);
  assert.throws(() =>
    validateImportRequest(
      { ...req, headers: { ...req.headers, origin: "https://evil.test" } },
      origin,
      nonce,
      body,
    ),
  );
  assert.throws(() =>
    validateImportRequest(req, origin, nonce, body + "&nonce=other"),
  );
  assert.throws(() => validateImportRequest(req, origin, "b".repeat(64), body));
});
