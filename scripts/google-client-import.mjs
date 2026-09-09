import http from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { validateClient } from "./google-drive-oauth.mjs";
import { readGoogleSecret, writeGoogleSecret } from "./google-secret-store.mjs";
export function validateImportRequest(req, origin, nonce, body) {
  if (
    req.method !== "POST" ||
    req.url !== "/" ||
    req.headers.host !== new URL(origin).host ||
    req.headers.origin !== origin ||
    !req.headers["content-type"]?.startsWith(
      "application/x-www-form-urlencoded",
    )
  )
    throw Error("INVALID_LOCAL_IMPORT");
  const data = new URLSearchParams(body),
    given = data.get("nonce") ?? "";
  if (
    data.getAll("nonce").length !== 1 ||
    data.getAll("config").length !== 1 ||
    given.length !== nonce.length ||
    !timingSafeEqual(Buffer.from(given), Buffer.from(nonce))
  )
    throw Error("INVALID_LOCAL_IMPORT");
  return validateClient(JSON.parse(data.get("config")));
}
export async function importClientInBrowser() {
  const nonce = randomBytes(32).toString("hex"),
    server = http.createServer();
  let timer,
    busy = false;
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  console.log("Local credential import: " + origin + "/");
  try {
    await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(Error("LOCAL_IMPORT_EXPIRED")),
        5 * 60000,
      );
      server.on("request", async (req, res) => {
        res.setHeader("Cache-Control", "no-store");
        res.setHeader("Referrer-Policy", "no-referrer");
        res.setHeader(
          "Content-Security-Policy",
          `default-src 'none'; form-action 'self'; connect-src 'self'; script-src 'nonce-${nonce}'; frame-ancestors 'none'`,
        );
        if (req.headers.host !== new URL(origin).host || req.url !== "/") {
          res.writeHead(400);
          res.end();
          return;
        }
        if (req.method === "GET") {
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(
            `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>EVERSHINE Google client setup</title><body><h1>Google client setup</h1><p>Save the EVERSHINE ERP Backup desktop client on this computer.</p><form method="post" action="/"><input type="hidden" name="nonce" value="${nonce}"><label>Client configuration <input type="password" name="config" required autocomplete="off"></label><button>Save protected configuration</button></form><p id="result" role="status"></p><script nonce="${nonce}">document.querySelector("form").addEventListener("submit",async function(event){event.preventDefault();const button=this.querySelector("button");button.disabled=true;try{const response=await fetch("/",{method:"POST",body:new URLSearchParams(new FormData(this))});const message=await response.text();this.reset();document.getElementById("result").textContent=message;if(response.ok)this.remove();else button.disabled=false;}catch{document.getElementById("result").textContent="Connection could not finish. Return to ERP setup.";button.disabled=false;}});</script></body></html>`,
          );
          return;
        }
        if (busy) {
          res.writeHead(409);
          res.end();
          return;
        }
        try {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 65536) throw Error("INVALID_LOCAL_IMPORT");
            chunks.push(chunk);
          }
          const client = validateImportRequest(
            req,
            origin,
            nonce,
            Buffer.concat(chunks).toString(),
          );
          if (busy) throw Error("LOCAL_IMPORT_BUSY");
          busy = true;
          clearTimeout(timer);
          let existing;
          try {
            existing = await readGoogleSecret("client");
          } catch (e) {
            if (e.code !== "ENOENT") throw e;
          }
          if (existing && existing.client_id !== client.client_id)
            throw Error("EXISTING_CLIENT_MUST_BE_REVIEWED");
          await writeGoogleSecret("client", client);
          res.setHeader("Content-Type", "text/plain; charset=utf-8");
          res.end(
            "Google client configuration saved with Windows protection. No Drive account access has been granted yet.",
            resolve,
          );
        } catch (e) {
          res.writeHead(400);
          res.end("Configuration was not saved. Return to the ERP setup.");
          if (busy) reject(e);
        }
      });
    });
  } finally {
    clearTimeout(timer);
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
  }
}
