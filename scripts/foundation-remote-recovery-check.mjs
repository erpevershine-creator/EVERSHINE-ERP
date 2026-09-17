import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {fileURLToPath} from "node:url";
import {randomUUID,createHash} from "node:crypto";
import {spawn} from "node:child_process";
import {readGoogleSecret} from "./google-secret-store.mjs";
import {discoverRecoveryBundle} from "./offsite-recovery.mjs";
import {validBackupId} from "./backup-crypto.mjs";

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const id=validBackupId(process.argv[2]??"");
const docker=path.join(process.env.LOCALAPPDATA,"Programs/DockerDesktop/resources/bin/docker.exe");
const clone=`evershine-remote-recovery-${randomUUID()}`,label="evershine.remote-recovery";
const stage=await fs.mkdtemp(path.join(os.tmpdir(),"erp-recovery-source-"));
let created=false,input;
const report={status:"running",backupId:id,startedAt:new Date().toISOString(),sourceHashes:{},checks:[],
  boundaries:"Remote retrieval uses existing account-bound OAuth on Windows. Linux verification/restore has no Windows profile, local archive, local receipt or DPAPI key. Fresh-account authorization on a replacement computer is not proven by this run."};
function run(args,stdin){return new Promise((resolve,reject)=>{
  const child=spawn(docker,args,{windowsHide:true,stdio:["pipe","pipe","pipe"]});
  const chunks=[];let size=0;const timer=setTimeout(()=>child.kill(),180000);
  child.stdout.on("data",b=>{size+=b.length;if(size>256*1024*1024)child.kill();else chunks.push(b);});
  child.stderr.resume();child.stdin.on("error",()=>{});
  child.on("error",()=>{clearTimeout(timer);reject(Error("RECOVERY_COMMAND_START_FAILED"));});
  child.on("close",code=>{clearTimeout(timer);if(code===0)resolve(Buffer.concat(chunks));else reject(Error("RECOVERY_COMMAND_FAILED"));});
  child.stdin.end(stdin);
});}
try {
  for(const name of ["recovery-bundle-check.mjs","backup-crypto.mjs","offsite-key-shares.mjs"]){
    const bytes=await fs.readFile(path.join(root,"scripts",name));report.sourceHashes[name]=createHash("sha256").update(bytes).digest("hex");await fs.writeFile(path.join(stage,name),bytes);
  }
  const client=await readGoogleSecret("client");
  const bundle=await discoverRecoveryBundle({backupId:id,main:{client,connection:await readGoogleSecret("connection"),purpose:"backup"},recovery:{client,connection:await readGoogleSecret("recovery-connection"),purpose:"recovery"}});
  report.checks.push("Discovered and downloaded exact archive from both real Drive destinations without local receipts");
  report.unmanagedRemoteFilesPreserved=bundle.unmanagedFiles;
  input=Buffer.from(JSON.stringify(bundle));
  const image=(await run(["image","inspect","public.ecr.aws/supabase/storage-api:v1.72.1","--format","{{.Id}}"])).toString().trim();
  const linuxArgs=["run","--rm","-i","--network","none","--read-only","--cap-drop","ALL","--security-opt","no-new-privileges","--tmpfs","/tmp","-v",`${stage}:/source:ro`,"--entrypoint","node",image,"/source/recovery-bundle-check.mjs"];
  const proof=JSON.parse((await run(linuxArgs,input)).toString());
  report.checks.push("Linux reconstructed key from two shares and authenticated manifest plus all five artifacts");
  if(!/^sha256:[a-f0-9]{64}$/.test(proof.image))throw Error("RECOVERY_IMAGE_INVALID");
  await run(["image","inspect",proof.image,"--format","{{.Id}}"]);
  await run(["run","-d","--name",clone,"--label",`${label}=${clone}`,"--network","none","--user","postgres","--entrypoint","sh",proof.image,"-c","initdb -D /tmp/erp-pg -U supabase_admin -A trust >/tmp/erp-init.log && exec postgres -D /tmp/erp-pg -c listen_addresses= -c unix_socket_directories=/tmp"]);created=true;
  let ready=false;for(let i=0;i<40;i++){try{await run(["exec",clone,"pg_isready","-h","/tmp","-U","supabase_admin"]);ready=true;break;}catch{await new Promise(r=>setTimeout(r,500));}}
  if(!ready)throw Error("RECOVERY_DATABASE_NOT_READY");
  const sql=text=>run(["exec","-i",clone,"psql","-X","-qAt","-h","/tmp","-U","supabase_admin","-d","postgres","-v","ON_ERROR_STOP=1"],text);
  const roles=await run([...linuxArgs,"roles"],input);
  try{await sql(roles.toString().replace(/^CREATE ROLE supabase_admin;\r?$/m,""));}finally{roles.fill(0);}
  const database=await run([...linuxArgs,"database"],input);
  try{await run(["exec","-i",clone,"pg_restore","-h","/tmp","-U","supabase_admin","-d","postgres","--exit-on-error","--clean","--if-exists"],database);}finally{database.fill(0);}
  const fingerprints="select format('select jsonb_build_object(''table'',%L,''rows'',count(*),''hash'',md5(coalesce(string_agg(md5(to_jsonb(t)::text),'''' order by md5(to_jsonb(t)::text)),''''))) from %I.%I t;',schemaname||'.'||tablename,schemaname,tablename) from pg_tables where schemaname in ('public','private','auth','storage','supabase_migrations') order by schemaname,tablename\n\\gexec\n";
  const restored=(await sql(fingerprints)).toString().split(/\r?\n/).filter(s=>s.startsWith("{")).map(JSON.parse);
  if(JSON.stringify(restored)!==JSON.stringify(proof.tables))throw Error("RECOVERY_DATABASE_MISMATCH");
  report.checks.push(`Restored ${restored.length} tables with exact row counts and fingerprints`);
  await run(["exec",clone,"mkdir","/tmp/erp-files"]);
  const storage=await run([...linuxArgs,"storage"],input);
  try{await run(["exec","-i",clone,"tar","-C","/tmp/erp-files","-xf","-"],storage);}finally{storage.fill(0);}
  const index=await run([...linuxArgs,"storageIndex"],input);
  const actual=await run(["exec","-w","/tmp/erp-files",clone,"sh","-c","find . -type f -exec sha256sum {} \\; | sort"]);
  if(actual.toString().trim()!==index.toString().trim())throw Error("RECOVERY_STORAGE_MISMATCH");
  report.checks.push(`Restored and verified ${proof.storageFiles} Storage files`);
  if((await sql("select (not has_table_privilege('anon','public.profiles','select') and not has_table_privilege('authenticated','public.profiles','update') and (select relrowsecurity from pg_class where oid='public.profiles'::regclass))::text;")).toString().trim()!=="true")throw Error("RECOVERY_ACCESS_MISMATCH");
  report.checks.push("Restored profile RLS and direct-write restrictions verified");
  report.status="pass";
}catch(error){report.status="fail";report.error=/^[A-Z_]+$/.test(error.message)?error.message:"REMOTE_RECOVERY_CHECK_FAILED";process.exitCode=1;}
finally {
  input?.fill(0);
  if(created){const owned=(await run(["inspect","--format",`{{index .Config.Labels "${label}"}}`,clone])).toString().trim();if(owned!==clone)throw Error("RECOVERY_CLEANUP_REFUSED");await run(["rm","-f","-v",clone]);}
  if(path.dirname(stage)!==path.resolve(os.tmpdir())||!path.basename(stage).startsWith("erp-recovery-source-"))throw Error("RECOVERY_CLEANUP_REFUSED");
  await fs.rm(stage,{recursive:true,force:true});
  report.finishedAt=new Date().toISOString();await fs.mkdir(path.join(root,".runtime/evidence"),{recursive:true});
  await fs.writeFile(path.join(root,".runtime/evidence/remote-recovery-check.json"),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
