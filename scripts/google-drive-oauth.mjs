import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
export const backupGoogleAccount = "erp.evershine@gmail.com";
export const recoveryGoogleAccount = "kyawthetaungftty@gmail.com";
export function googleTarget(purpose = "backup") {
  if (purpose === "backup") return { email: backupGoogleAccount, secret: "connection", authorizationFile: "google-drive-authorization.json" };
  if (purpose === "recovery") return { email: recoveryGoogleAccount, secret: "recovery-connection", authorizationFile: "google-recovery-authorization.json" };
  throw Error("INVALID_GOOGLE_PURPOSE");
}
export const backupGoogleProject = "peerless-sensor-508107-e0";
export const driveScope = "https://www.googleapis.com/auth/drive.file";
const tokenEndpoint = "https://oauth2.googleapis.com/token";
export function validateClient(value) {
  const c = value?.installed;
  if (
    !c ||
    c.project_id !== backupGoogleProject ||
    !/^822638054713-[a-z0-9]+\.apps\.googleusercontent\.com$/.test(
      c.client_id ?? "",
    ) ||
    typeof c.client_secret !== "string" ||
    !c.client_secret ||
    c.auth_uri !== "https://accounts.google.com/o/oauth2/auth" ||
    c.token_uri !== tokenEndpoint
  )
    throw Error("INVALID_GOOGLE_DESKTOP_CLIENT");
  return { client_id: c.client_id, client_secret: c.client_secret };
}
export function makeAuthorization(client, port, purpose = "backup") {
  const target = googleTarget(purpose);
  if (!Number.isInteger(port) || port < 1024 || port > 65535)
    throw Error("INVALID_LOOPBACK_PORT");
  const state = randomBytes(32).toString("base64url"),
    verifier = randomBytes(32).toString("base64url");
  const redirect_uri = `http://127.0.0.1:${port}/`;
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri,
    response_type: "code",
    scope: driveScope,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
    access_type: "offline",
    prompt: "consent",
    login_hint: target.email,
  }).toString();
  return { state, verifier, redirect_uri, url: url.toString(), purpose };
}
export function validateCallback(request, authorization) {
  const expected = new URL(authorization.redirect_uri);
  if (request.method !== "GET" || request.headers.host !== expected.host)
    throw Error("INVALID_CALLBACK");
  const url = new URL(request.url, expected);
  const state = url.searchParams.get("state") ?? "";
  if (
    url.origin !== expected.origin ||
    url.pathname !== "/" ||
    url.searchParams.getAll("state").length !== 1 ||
    Buffer.byteLength(state) !== Buffer.byteLength(authorization.state) ||
    !timingSafeEqual(Buffer.from(state), Buffer.from(authorization.state))
  )
    throw Error("INVALID_CALLBACK");
  if (url.searchParams.has("error")) throw Error("GOOGLE_CONSENT_DENIED");
  const code = url.searchParams.get("code");
  if (
    !code ||
    code.length > 4096 ||
    url.searchParams.getAll("code").length !== 1
  )
    throw Error("INVALID_CALLBACK");
  return code;
}
async function jsonRequest(url, options, fetcher) {
  const response = await fetcher(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok)
    throw Error(
      response.status === 400 || response.status === 401
        ? "GOOGLE_RECONNECT_REQUIRED"
        : "GOOGLE_REQUEST_FAILED",
    );
  const text = await response.text();
  if (text.length > 65536) throw Error("INVALID_GOOGLE_RESPONSE");
  try {
    return JSON.parse(text);
  } catch {
    throw Error("INVALID_GOOGLE_RESPONSE");
  }
}
export async function refreshAccessToken(
  client,
  connection,
  fetcher = fetch,
  purpose = "backup",
) {
  const target = googleTarget(purpose);
  if (
    connection.email !== target.email ||
    connection.client_id !== client.client_id ||
    connection.scope !== driveScope ||
    typeof connection.refresh_token !== "string" ||
    !connection.refresh_token
  )
    throw Error("GOOGLE_CONNECTION_MISMATCH");
  const token = await jsonRequest(
    tokenEndpoint,
    {
      method: "POST",
      body: new URLSearchParams({
        ...client,
        refresh_token: connection.refresh_token,
        grant_type: "refresh_token",
      }),
    },
    fetcher,
  );
  if (
    typeof token.access_token !== "string" ||
    !token.access_token
  )
    throw Error("GOOGLE_ACCESS_INCOMPLETE");
  const identity = await verifyIdentity(token.access_token, fetcher, purpose);
  if (identity.permissionId !== connection.permissionId)
    throw Error("GOOGLE_ACCOUNT_MISMATCH");
  return { accessToken: token.access_token, identity };
}
export async function verifyIdentity(accessToken, fetcher = fetch, purpose = "backup") {
  const target = googleTarget(purpose);
  if (typeof accessToken !== "string" || !accessToken)
    throw Error("INVALID_GOOGLE_TOKEN");
  const about = await jsonRequest(
    "https://www.googleapis.com/drive/v3/about?fields=user(emailAddress,permissionId)",
    { headers: { Authorization: `Bearer ${accessToken}` } },
    fetcher,
  );
  if (
    about.user?.emailAddress?.toLowerCase() !== target.email ||
    typeof about.user?.permissionId !== "string" ||
    !about.user.permissionId
  )
    throw Error("GOOGLE_ACCOUNT_MISMATCH");
  return { email: target.email, permissionId: about.user.permissionId };
}
export async function exchangeCode(
  client,
  authorization,
  code,
  fetcher = fetch,
) {
  const token = await jsonRequest(
    tokenEndpoint,
    {
      method: "POST",
      body: new URLSearchParams({
        ...client,
        code,
        code_verifier: authorization.verifier,
        redirect_uri: authorization.redirect_uri,
        grant_type: "authorization_code",
      }),
    },
    fetcher,
  );
  const scopes = new Set((token.scope ?? "").split(" "));
  if (
    !scopes.has(driveScope) ||
    scopes.size !== 1 ||
    typeof token.refresh_token !== "string" ||
    !token.refresh_token ||
    token.token_type?.toLowerCase() !== "bearer"
  )
    throw Error("GOOGLE_ACCESS_INCOMPLETE");
  const identity = await verifyIdentity(token.access_token, fetcher, authorization.purpose);
  return {
    ...identity,
    client_id: client.client_id,
    refresh_token: token.refresh_token,
    scope: driveScope,
    connected_at: new Date().toISOString(),
  };
}
export async function checkConnection(client, connection, fetcher = fetch, purpose = "backup") {
  return (await refreshAccessToken(client, connection, fetcher, purpose)).identity;
}
