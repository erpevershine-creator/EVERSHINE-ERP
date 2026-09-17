import assert from "node:assert/strict";
import { createHmac, randomBytes, randomUUID } from "node:crypto";

// Run inside the schema-only clone's network namespace (network none). The Auth
// API has no host port, outbound route, real credentials, or Owner data.
export async function checkIsolatedAuth({ run, clone, sql, label, register }) {
  const name = `${clone}-auth`;
  const image = (await run(["inspect", "--format", "{{.Image}}", "supabase_auth_evershine-erp-m2-local"])).trim();
  if (!/^sha256:[a-f0-9]{64}$/.test(image)) throw Error("Invalid Auth image identity");
  const secret = randomBytes(48).toString("hex");
  const encoded = value => Buffer.from(JSON.stringify(value)).toString("base64url");
  const unsigned = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ role: "service_role", exp: Math.floor(Date.now() / 1000) + 600 })}`;
  const admin = `${unsigned}.${createHmac("sha256", secret).update(unsigned).digest("base64url")}`;
  await run(["run", "-d", "--name", name, "--label", `${label}=${name}`, "--network", `container:${clone}`,
    "-e", "GOTRUE_API_HOST=127.0.0.1", "-e", "GOTRUE_API_PORT=9999",
    "-e", "API_EXTERNAL_URL=http://127.0.0.1:9999", "-e", "GOTRUE_SITE_URL=http://127.0.0.1:9999",
    "-e", "GOTRUE_DB_DRIVER=postgres", "-e", "GOTRUE_DB_DATABASE_URL=postgres://supabase_auth_admin@127.0.0.1:5432/postgres?sslmode=disable",
    "-e", `GOTRUE_JWT_SECRET=${secret}`, "-e", "GOTRUE_JWT_ADMIN_ROLES=service_role",
    "-e", "GOTRUE_JWT_AUD=authenticated", "-e", "GOTRUE_JWT_DEFAULT_GROUP_NAME=authenticated",
    "-e", "GOTRUE_EXTERNAL_EMAIL_ENABLED=true", "-e", "GOTRUE_MAILER_AUTOCONFIRM=true", image]);
  register(name);
  async function http(path, method = "GET", body, bearer = admin) {
    const config = [`url = ${JSON.stringify(`http://127.0.0.1:9999${path}`)}`, `request = ${JSON.stringify(method)}`,
      'silent', 'show-error', 'max-time = 12', 'write-out = "\\n%{http_code}"',
      `header = ${JSON.stringify(`Authorization: Bearer ${bearer}`)}`, 'header = "Content-Type: application/json"'];
    if (body !== undefined) config.push(`data = ${JSON.stringify(JSON.stringify(body))}`);
    const output = await run(["exec", "-i", clone, "curl", "--config", "-"], config.join("\n"));
    const boundary = output.lastIndexOf("\n");
    return { status: Number(output.slice(boundary + 1)), body: JSON.parse(output.slice(0, boundary) || "{}") };
  }
  let ready = false;
  for (let i = 0; i < 40; i++) {
    try { if ((await http("/health")).status === 200) { ready = true; break; } } catch { /* bounded startup */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  if (!ready) throw Error("Isolated Auth did not become healthy");
  const checks = [];
  const password = `TestA1-${randomBytes(16).toString("hex")}`;
  const newPassword = `TestB2-${randomBytes(16).toString("hex")}`;
  const email = "isolated.provider.owner@gmail.com";
  const created = await http("/admin/users", "POST", { email, password, email_confirm: true });
  assert.equal(created.status, 200, "synthetic Auth account creation");
  const id = created.body.id;
  assert.match(id, /^[0-9a-f-]{36}$/);
  const session = randomUUID();
  await sql(`insert into public.profiles(id,employee_name,company_position,position_id,department,erp_role,username,contact,avatar_path)
    values('${id}','Isolated Provider Owner','Owner',(select id from public.positions where erp_role_code='owner'),'Test','owner','${email}','test','${id}/photo.png');
    insert into auth.sessions(id,user_id,created_at,updated_at) values('${session}','${id}',clock_timestamp(),clock_timestamp());
    insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) values('${session}','${id}',extensions.digest('${session}','sha256'),'Synthetic Owner',clock_timestamp(),clock_timestamp());`);
  const op = (await sql(`select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated","session_id":"${session}"}',false);
    select public.prepare_password_change('${id}','Isolated provider test')->>'operation';`)).trim().split(/\r?\n/).at(-1);
  assert.match(op, /^[0-9a-f-]{36}$/);
  const duplicateUpdates = await Promise.all([0, 1].map(() => http(`/admin/users/${id}`, "PUT", { password: newPassword, app_metadata: { erp_password_operation: op } })));
  assert.equal(duplicateUpdates.filter(result => result.status === 200).length, 1, "exactly one concurrent provider update commits");
  assert.equal(duplicateUpdates.filter(result => result.status >= 400).length, 1, "duplicate transaction is rejected");
  checks.push("Concurrent duplicate provider updates commit exactly once");
  assert.equal((await sql(`select exists(select 1 from private.password_provider_receipts where operation_id='${op}');`)).trim(), "t");
  checks.push("Auth password and metadata transaction produces receipt");
  const repeat = await http(`/admin/users/${id}`, "PUT", { password, app_metadata: { erp_password_operation: op } });
  assert.ok(repeat.status >= 400, "replayed provider operation must roll back");
  checks.push("Replayed provider operation cannot overwrite password");
  await sql(`select set_config('request.jwt.claims','{"role":"service_role"}',false); select public.finish_password_change('${op}',true);`);
  const login = await http("/token?grant_type=password", "POST", { email, password: newPassword });
  assert.equal(login.status, 200, "new password authenticates after completion");
  checks.push("New password authenticates through real provider");
  const selfChange = await http("/user", "PUT", { password }, login.body.access_token);
  assert.ok(selfChange.status >= 400, "direct self password API must be rejected");
  const preserved = await http("/token?grant_type=password", "POST", { email, password: newPassword });
  assert.equal(preserved.status, 200, "rejected self update leaves password intact");
  checks.push("Direct user password update is rejected and rolls back");
  // Owner lost-session recovery also clears a failed password-administration fence.
  await sql(`insert into private.owner_recovery_codes(owner_id,code_hash,version) values('${id}',decode(repeat('a',64),'hex'),1);
    update public.profiles set password_change_pending=true where id='${id}';`);
  const recover = async () => JSON.parse((await sql(`select set_config('request.jwt.claims','{"role":"service_role"}',false);
    select public.begin_owner_recovery('${email}',repeat('a',64));`)).trim().split(/\r?\n/).at(-1));
  const abandoned = await recover();
  const retry = await recover();
  assert.notEqual(retry.operation, abandoned.operation);
  const late = await http(`/admin/users/${id}`, "PUT", { password, app_metadata: { erp_password_operation: abandoned.operation } });
  assert.ok(late.status >= 400, "superseded recovery must reject late provider update");
  checks.push("Verified recovery retry fences late earlier provider response");
  const recovered = await http(`/admin/users/${id}`, "PUT", { password, app_metadata: { erp_password_operation: retry.operation } });
  assert.equal(recovered.status, 200, "current recovery applies");
  await sql(`select set_config('request.jwt.claims','{"role":"service_role"}',false); select public.finish_owner_recovery('${retry.operation}',true);`);
  assert.equal((await sql(`select not recovery_pending and not password_change_pending from public.profiles where id='${id}';`)).trim(), "t");
  assert.equal((await http("/token?grant_type=password", "POST", { email, password })).status, 200);
  checks.push("Owner recovery clears both fences and intended password works");
  const reuse = await recover();
  assert.equal((await http(`/admin/users/${id}`, "PUT", { password, app_metadata: { erp_password_operation: reuse.operation } })).status, 200, "governed password reuse remains allowed");
  await sql(`select set_config('request.jwt.claims','{"role":"service_role"}',false); select public.finish_owner_recovery('${reuse.operation}',true);`);
  assert.equal((await http("/token?grant_type=password", "POST", { email, password })).status, 200);
  checks.push("Confirmed password reuse policy works with new receipt");
  const profileSession = randomUUID();
  await sql(`insert into auth.sessions(id,user_id,created_at,updated_at) values('${profileSession}','${id}',clock_timestamp(),clock_timestamp());
    insert into public.device_sessions(id,profile_id,device_fingerprint_hash,device_label,started_at,last_seen_at) values('${profileSession}','${id}',extensions.digest('${profileSession}','sha256'),'Profile fixture',clock_timestamp(),clock_timestamp());`);
  const profileEmail = "isolated.provider.changed@gmail.com";
  const request = (await sql(`select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated","session_id":"${profileSession}"}',false);
    select public.request_profile_change('${id}',(select version from public.profiles where id='${id}'),'{"username":"${profileEmail}","department":"Reviewed department"}','Profile provider proof');`)).trim().split(/\r?\n/).at(-1);
  assert.match(request, /^\d+$/);
  const operation = JSON.parse((await sql(`select set_config('request.jwt.claims','{"sub":"${id}","role":"authenticated","session_id":"${profileSession}"}',false);
    select public.decide_profile_change(${request},true,'Owner approves complete snapshot');`)).trim().split(/\r?\n/).at(-1));
  const illegalEmail = await http(`/admin/users/${id}`, "PUT", { email: "unapproved.provider@gmail.com", email_confirm: true });
  assert.ok(illegalEmail.status >= 400, "direct provider email update rejected");
  const profileUpdate = await http(`/admin/users/${id}`, "PUT", { email: profileEmail, email_confirm: true, app_metadata: { erp_profile_operation: operation.operation } });
  assert.equal(profileUpdate.status, 200, "approved email provider update commits");
  assert.equal((await sql(`select username::text||'|'||department from public.profiles where id='${id}';`)).trim(), `${profileEmail}|Reviewed department`);
  assert.equal((await sql(`select applied_at is not null from private.profile_change_execution where request_id=${request};`)).trim(), "t");
  checks.push("Real Auth email and complete approved profile commit atomically");
  assert.equal((await http("/token?grant_type=password", "POST", { email: profileEmail, password })).status, 200);
  assert.ok((await http("/token?grant_type=password", "POST", { email, password })).status >= 400);
  assert.equal((await sql(`select status from public.device_sessions where id='${profileSession}';`)).trim(), "logged_out");
  checks.push("New Gmail signs in; previous Gmail and old ERP session are rejected");
  assert.ok((await http(`/admin/users/${id}`, "PUT", { email, email_confirm: true, app_metadata: { erp_profile_operation: operation.operation } })).status >= 400);
  checks.push("Consumed profile provider operation cannot replay");
  return { image, checks, status: "pass", noHostPorts: true, syntheticAccountsOnly: true };
}
