import fs from "node:fs/promises";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {readGoogleSecret} from "./google-secret-store.mjs";
import {discoverDestination,listDestinationFiles} from "./google-drive-files.mjs";
import {discoverRecoveryBundle} from "./offsite-recovery.mjs";
import {verifyRecoveryBundle} from "./recovery-bundle-check.mjs";
import {planBackupRetention} from "../src/lib/backup-retention.ts";
import {uuidPattern} from "./backup-crypto.mjs";

const root=path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const report={status:"running",startedAt:new Date().toISOString(),deletedFiles:0,archives:[],unmanagedFolders:0};
try {
  const client=await readGoogleSecret("client");
  const main={client,connection:await readGoogleSecret("connection"),purpose:"backup"};
  const recovery={client,connection:await readGoogleSecret("recovery-connection"),purpose:"recovery"};
  const destination=await discoverDestination(main);
  const folders=await listDestinationFiles({...main,parentId:destination.id});
  for(const folder of folders){
    if(folder.mimeType!=="application/vnd.google-apps.folder"||folder.appProperties?.evershineRole!=="backup-run"||!uuidPattern.test(folder.name)){report.unmanagedFolders++;continue;}
    try {
      const bundle=await discoverRecoveryBundle({main,recovery,backupId:folder.name});
      const proof=await verifyRecoveryBundle(bundle);
      const saved=JSON.parse(Buffer.from(bundle.entries["manifest.json"],"base64").toString());
      // Only authenticated provenance can make an archive automatically eligible.
      const origin=["scheduled","manual"].includes(saved.manifest.origin)?saved.manifest.origin:"unknown";
      report.archives.push({id:folder.name,origin,status:"verified",created_at:proof.createdAt,archive_state:"present",unmanagedFiles:bundle.unmanagedFiles});
    }catch{report.archives.push({id:folder.name,origin:"unknown",status:"unverified",created_at:"",archive_state:"present"});}
  }
  report.plan=planBackupRetention(report.archives);
  report.status="reviewed";
  report.boundary="Read-only real-destination retention review. Unknown signed provenance, unverified archives and unmanaged files are preserved. No remote removal executed.";
}catch(error){report.status="fail";report.error=/^[A-Z_]+$/.test(error.message)?error.message:"REMOTE_RETENTION_REVIEW_FAILED";process.exitCode=1;}
report.finishedAt=new Date().toISOString();
await fs.mkdir(path.join(root,".runtime/evidence"),{recursive:true});
await fs.writeFile(path.join(root,".runtime/evidence/remote-retention-review.json"),JSON.stringify(report,null,2));
console.log(JSON.stringify(report));
