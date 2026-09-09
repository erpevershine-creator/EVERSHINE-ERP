import { importClientInBrowser } from "./google-client-import.mjs";
import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  validateClient,
  makeAuthorization,
  validateCallback,
  exchangeCode,
  checkConnection,
  backupGoogleAccount,
} from "./google-drive-oauth.mjs";
import { readGoogleSecret, writeGoogleSecret } from "./google-secret-store.mjs";
const root = fileURLToPath(new URL("../", import.meta.url));
async function main() {
  if (
    process.platform !== "win32" ||
    path.resolve(root) !== path.resolve("C:/Users/DELL/Desktop/EVERSHINE-ERP")
  )
    throw Error("LOCAL_GOOGLE_SETUP_ONLY");
  const mode = process.argv[2];
  if (mode === "import-browser") return importClientInBrowser();
  if (mode === "import") {
    const source = process.argv[3];
    if (!source) throw Error("CLIENT_JSON_PATH_REQUIRED");
    const stat = await fs.stat(source);
    if (!stat.isFile() || stat.size > 65536)
      throw Error("INVALID_GOOGLE_DESKTOP_CLIENT");
    const client = validateClient(
      JSON.parse(await fs.readFile(source, "utf8")),
    );
    let existing;
    try {
      existing = await readGoogleSecret("client");
    } catch (e) {
      if (e.code !== "ENOENT") throw e;
    }
    if (existing && existing.client_id !== client.client_id)
      throw Error("EXISTING_CLIENT_MUST_BE_REVIEWED");
    await writeGoogleSecret("client", client);
    console.log("Google desktop client saved with Windows protection.");
    return;
  }
  const client = await readGoogleSecret("client");
  if (mode === "status") {
    const identity = await checkConnection(
      client,
      await readGoogleSecret("connection"),
    );
    console.log(JSON.stringify({ connected: true, email: identity.email }));
    return;
  }
  if (mode !== "connect") throw Error("USE_IMPORT_CONNECT_OR_STATUS");
  const authorizationFile = path.join(
    root,
    ".runtime/google-drive-authorization.json",
  );
  const server = http.createServer();
  let authorization,
    busy = false,
    timer;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  authorization = makeAuthorization(client, server.address().port);
  try {
    const completion = new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(Error("GOOGLE_AUTHORIZATION_EXPIRED")),
        5 * 60000,
      );
      server.on("request", async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Content-Type", "text/plain; charset=utf-8");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader(
          "Content-Security-Policy",
          "default-src 'none'; frame-ancestors 'none'",
        );
        if (busy) {
          res.statusCode = 409;
          res.end("Connection check already in progress.");
          return;
        }
        let code;
        try {
          code = validateCallback(req, authorization);
        } catch (e) {
          res.statusCode = 400;
          res.end(
            "Google connection was not accepted. Return to the ERP setup.",
          );
          if (e.message === "GOOGLE_CONSENT_DENIED") reject(e);
          return;
        }
        busy = true;
        clearTimeout(timer); // A valid callback arrived within the authorization window.
        try {
          const connection = await exchangeCode(client, authorization, code);
          await writeGoogleSecret("connection", connection);
          res.end(
            "Google Drive account connected for EVERSHINE ERP. Backup uploads are not enabled yet. You may close this tab.",
            () => resolve(connection.email),
          );
        } catch (e) {
          res.statusCode = 400;
          res.end(
            "Connection could not be verified. No new connection was saved. Return to the ERP setup.",
          );
          reject(e);
        }
      });
    });
    await fs.mkdir(path.dirname(authorizationFile), { recursive: true });
    await fs.writeFile(
      authorizationFile,
      JSON.stringify({
        url: authorization.url,
        email: backupGoogleAccount,
        expires_at: new Date(Date.now() + 5 * 60000).toISOString(),
      }),
    );
    console.log(
      "Google authorization ready. Open .runtime/google-drive-authorization.json URL in the system browser. Expires in five minutes.",
    );
    console.log(JSON.stringify({ connected: true, email: await completion }));
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await fs.unlink(authorizationFile).catch(() => {});
  }
}
main().catch((e) => {
  console.error(
    /^[A-Z_]+$/.test(e.message) ? e.message : "GOOGLE_SETUP_FAILED",
  );
  process.exitCode = 1;
});
