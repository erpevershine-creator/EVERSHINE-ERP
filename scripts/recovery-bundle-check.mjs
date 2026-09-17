// Portable, network-free verification. Input and decrypted output use pipes only.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createHash} from "node:crypto";
import {Writable} from "node:stream";
import {validBackupId,verifyManifest,decryptStream} from "./backup-crypto.mjs";
import {parseShareEnvelope,combineBackupKey} from "./offsite-key-shares.mjs";
const names=["database","roles","storage","storageIndex","runtimeConfiguration"];
export async function verifyRecoveryBundle(bundle,outputName) {
  validBackupId(bundle.backupId);
  const expected=["manifest.json","main-key-share.json","recovery-key-share.json",...names.map(n=>n+".enc")].sort();
  if(bundle.format!==1||!bundle.entries||Object.keys(bundle.entries).sort().join()!==expected.join()||(outputName&&!names.includes(outputName))) throw Error("RECOVERY_BUNDLE_INVALID");
  const bytes=Buffer.from(bundle.entries["manifest.json"],"base64");
  const saved=JSON.parse(bytes.toString());
  const binding={backupId:bundle.backupId,manifestSha256:createHash("sha256").update(bytes).digest("hex")};
  const main=parseShareEnvelope(Buffer.from(bundle.entries["main-key-share.json"],"base64"),{...binding,purpose:"backup"});
  const recovery=parseShareEnvelope(Buffer.from(bundle.entries["recovery-key-share.json"],"base64"),{...binding,purpose:"recovery"});
  const key=combineBackupKey(main.share,recovery.share);
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"erp-recovery-"));
  try {
    verifyManifest(saved.manifest,saved.signature,key);
    if(saved.manifest.id!==bundle.backupId||Object.keys(saved.manifest.artifacts??{}).sort().join()!==[...names].sort().join()) throw Error("RECOVERY_MANIFEST_INVALID");
    // Authenticate every artifact before releasing any decrypted content.
    for(const name of names) {
      const file=path.join(tmp,name+".enc");
      await fs.writeFile(file,Buffer.from(bundle.entries[name+".enc"],"base64"),{flag:"wx",mode:0o600});
      await decryptStream(file,saved.manifest.artifacts[name],key);
    }
    if(outputName) {
      const chunks=[];
      await decryptStream(path.join(tmp,outputName+".enc"),saved.manifest.artifacts[outputName],key,new Writable({write(chunk,_,done){chunks.push(chunk);done();}}));
      return Buffer.concat(chunks);
    }
    return {status:"verified",backupId:bundle.backupId,image:saved.manifest.image,tables:saved.manifest.tables,storageFiles:saved.manifest.storageFiles,createdAt:saved.manifest.createdAt};
  } finally {key.fill(0);main.share.fill(0);recovery.share.fill(0);await fs.rm(tmp,{recursive:true,force:true});}
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const chunks=[];let size=0;
    for await(const chunk of process.stdin){size+=chunk.length;if(size>768*1024*1024)throw Error("RECOVERY_INPUT_TOO_LARGE");chunks.push(chunk);}
    const input=Buffer.concat(chunks);
    const result=await verifyRecoveryBundle(JSON.parse(input.toString()),process.argv[2]);input.fill(0);
    if(Buffer.isBuffer(result)){process.stdout.write(result,()=>result.fill(0));}
    else process.stdout.write(JSON.stringify(result));
  }catch{console.error("RECOVERY_VERIFICATION_FAILED");process.exitCode=1;}
}
