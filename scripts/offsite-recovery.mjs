import {discoverDestination,listDestinationFiles,downloadVerifiedFile} from "./google-drive-files.mjs";
import {validBackupId} from "./backup-crypto.mjs";

export const recoveryArtifactNames=["database","roles","storage","storageIndex","runtimeConfiguration"];
export async function discoverRecoveryBundle({main,recovery,backupId},fetcher=fetch) {
  validBackupId(backupId);
  if(main.purpose!=="backup"||recovery.purpose!=="recovery") throw Error("RECOVERY_IDENTITIES_REQUIRED");
  async function files(context,role) {
    const root=await discoverDestination(context,fetcher);
    const runs=await listDestinationFiles({...context,parentId:root.id},fetcher);
    const found=runs.filter(f=>f.name===backupId&&f.appProperties?.evershineRole===role&&f.mimeType==="application/vnd.google-apps.folder");
    if(found.length!==1) throw Error("RECOVERY_ARCHIVE_NOT_UNIQUE");
    return listDestinationFiles({...context,parentId:found[0].id},fetcher);
  }
  const mainAll=await files(main,"backup-run"), recoveryAll=await files(recovery,"recovery-key-run");
  const mainFiles=mainAll.filter(f=>f.appProperties?.evershinePurpose==="backup"&&f.appProperties?.evershineBackupId===backupId);
  const recoveryFiles=recoveryAll.filter(f=>f.appProperties?.evershinePurpose==="recovery"&&f.appProperties?.evershineBackupId===backupId);
  const expected=["manifest.json","main-key-share.json",...recoveryArtifactNames.map(n=>n+".enc")].sort();
  if(mainFiles.map(f=>f.name).sort().join()!==expected.join()||recoveryFiles.length!==1||recoveryFiles[0].name!=="recovery-key-share.json") throw Error("RECOVERY_ARCHIVE_CONTENTS_INVALID");
  async function download(context,file) {
    if(file.appProperties?.evershineBackupId!==backupId) throw Error("RECOVERY_ARCHIVE_BINDING_INVALID");
    const {content}=await downloadVerifiedFile({...context,fileId:file.id,sha256:file.appProperties.sha256},fetcher);
    return content.toString("base64");
  }
  const entries={};
  for(const file of mainFiles) entries[file.name]=await download(main,file);
  entries["recovery-key-share.json"]=await download(recovery,recoveryFiles[0]);
  return {format:1,backupId,entries,unmanagedFiles:mainAll.length+recoveryAll.length-mainFiles.length-recoveryFiles.length};
}
