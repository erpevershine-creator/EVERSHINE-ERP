import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import {Readable} from "node:stream";
import {randomBytes,randomUUID,createHash} from "node:crypto";
import {encryptStream,signManifest} from "../scripts/backup-crypto.mjs";
import {splitBackupKey,createShareEnvelope} from "../scripts/offsite-key-shares.mjs";
import {verifyRecoveryBundle} from "../scripts/recovery-bundle-check.mjs";
test("portable recovery authenticates both shares and all artifacts before releasing restored bytes",async()=>{
  const tmp=await fs.mkdtemp(path.join(os.tmpdir(),"erp-recovery-fixture-"));
  const key=randomBytes(32),id=randomUUID(),entries={},artifacts={};
  try {
    for(const name of ["database","roles","storage","storageIndex","runtimeConfiguration"]){
      const file=path.join(tmp,name);
      artifacts[name]=await encryptStream(Readable.from([Buffer.from(`synthetic ${name}`)]),file,key);
      entries[name+".enc"]=(await fs.readFile(file)).toString("base64");
    }
    const manifest={id,artifacts,tables:[],storageFiles:0};
    const raw=Buffer.from(JSON.stringify({manifest,signature:signManifest(manifest,key)}));
    entries["manifest.json"]=raw.toString("base64");
    const {main,recovery}=splitBackupKey(key);
    for(const [name,purpose,share] of [["main","backup",main],["recovery","recovery",recovery]]) entries[name+"-key-share.json"]=createShareEnvelope({backupId:id,manifestSha256:createHash("sha256").update(raw).digest("hex"),purpose,share}).toString("base64");
    key.fill(0);main.fill(0);recovery.fill(0);
    const bundle={format:1,backupId:id,entries};
    assert.equal((await verifyRecoveryBundle(bundle)).status,"verified");
    assert.equal((await verifyRecoveryBundle(bundle,"database")).toString(),"synthetic database");
    const missing=structuredClone(bundle);delete missing.entries["recovery-key-share.json"];
    await assert.rejects(verifyRecoveryBundle(missing),/BUNDLE_INVALID/);
    const corrupt=structuredClone(bundle);corrupt.entries["storage.enc"]=Buffer.from("corrupt").toString("base64");
    await assert.rejects(verifyRecoveryBundle(corrupt,"database"));
    const swapped=structuredClone(bundle);swapped.entries["recovery-key-share.json"]=swapped.entries["main-key-share.json"];
    await assert.rejects(verifyRecoveryBundle(swapped),/SHARE_INVALID/);
    await assert.rejects(verifyRecoveryBundle(bundle,"../../escape"),/BUNDLE_INVALID/);
  }finally {key.fill(0);await fs.rm(tmp,{recursive:true,force:true});}
});
