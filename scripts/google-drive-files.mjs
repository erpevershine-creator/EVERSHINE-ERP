import { createHash } from "node:crypto";
import { readGoogleSecret, writeGoogleSecret } from "./google-secret-store.mjs";
import {
  googleTarget,
  refreshAccessToken,
} from "./google-drive-oauth.mjs";

const driveApi = "https://www.googleapis.com/drive/v3";
const uploadApi = "https://www.googleapis.com/upload/drive/v3/files";
const chunkBytes = 256 * 1024;
const maxDownloadBytes = 512 * 1024 * 1024;

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function escapeQuery(value) {
  return String(value).replaceAll("\\", "\\\\").replaceAll("'", "\\'");
}

async function responseJson(response, limit = 256 * 1024) {
  const text = await response.text();
  if (text.length > limit) throw Error("GOOGLE_RESPONSE_TOO_LARGE");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw Error("INVALID_GOOGLE_RESPONSE");
  }
}

async function driveFetch(url, options, fetcher = fetch) {
  const response = await fetcher(url, {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(120000),
  });
  if (!response.ok && response.status !== 308) {
    if (response.status === 401 || response.status === 403)
      throw Error("GOOGLE_DRIVE_ACCESS_FAILED");
    throw Error("GOOGLE_DRIVE_REQUEST_FAILED");
  }
  return response;
}

async function context({ client, connection, purpose }, fetcher) {
  const refreshed = await refreshAccessToken(
    client,
    connection,
    fetcher,
    purpose,
  );
  return { token: refreshed.accessToken, identity: refreshed.identity };
}

export async function listFiles(token, query, fetcher = fetch) {
  const url = new URL(`${driveApi}/files`);
  url.search = new URLSearchParams({
    q: query,
    spaces: "drive",
    pageSize: "100",
    fields: "nextPageToken,incompleteSearch,files(id,name,mimeType,size,md5Checksum,appProperties,parents,trashed)",
  });
  const files=[],ids=new Set(),tokens=new Set();
  for(let page=0;page<1000;page++) {
    const response = await driveFetch(url,{headers:{Authorization:`Bearer ${token}`}},fetcher);
    const body=await responseJson(response);
    if(!Array.isArray(body.files)||body.incompleteSearch) throw Error("GOOGLE_DRIVE_LIST_INCOMPLETE");
    for(const file of body.files) {
      if(typeof file.id!=="string"||ids.has(file.id)) throw Error("GOOGLE_DRIVE_LIST_CHANGED");
      ids.add(file.id);files.push(file);
    }
    if(!body.nextPageToken) return files;
    if(typeof body.nextPageToken!=="string"||tokens.has(body.nextPageToken)) throw Error("GOOGLE_DRIVE_LIST_INCOMPLETE");
    tokens.add(body.nextPageToken);url.searchParams.set("pageToken",body.nextPageToken);
  }
  throw Error("GOOGLE_DRIVE_LIST_INCOMPLETE");
}

export async function listDestinationFiles({client,connection,purpose,parentId},fetcher=fetch) {
  const {token}=await context({client,connection,purpose},fetcher);
  const parent=await getFile(token,parentId,fetcher);
  if(parent.trashed||parent.mimeType!=="application/vnd.google-apps.folder"||parent.appProperties?.evershinePurpose!==purpose) throw Error("GOOGLE_DRIVE_DESTINATION_MISMATCH");
  const files=await listFiles(token,`'${escapeQuery(parentId)}' in parents and trashed = false`,fetcher);
  if(files.some(file=>!file.parents?.includes(parentId))) throw Error("GOOGLE_DRIVE_DESTINATION_MISMATCH");
  return files;
}

export async function discoverDestination({client,connection,purpose},fetcher=fetch) {
  const {token}=await context({client,connection,purpose},fetcher);
  const role=purpose==="backup"?"backup-root":"recovery-root";
  const found=await listFiles(token,`trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='evershineRole' and value='${role}' }`,fetcher);
  if(found.length!==1||found[0].appProperties?.evershinePurpose!==purpose) throw Error("GOOGLE_DRIVE_DESTINATION_MISMATCH");
  return found[0];
}

async function getFile(token, id, fetcher) {
  const url = new URL(`${driveApi}/files/${encodeURIComponent(id)}`);
  url.searchParams.set(
    "fields",
    "id,name,mimeType,size,md5Checksum,appProperties,parents,trashed",
  );
  const response = await driveFetch(
    url,
    { headers: { Authorization: `Bearer ${token}` } },
    fetcher,
  );
  return responseJson(response);
}

async function createMetadata(token, metadata, fetcher) {
  const response = await driveFetch(
    `${driveApi}/files?fields=id,name,mimeType,size,md5Checksum,appProperties,parents,trashed`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(metadata),
    },
    fetcher,
  );
  return responseJson(response);
}

export async function ensureFolder(
  { client, connection, purpose, parentId = "root", name, role },
  fetcher = fetch,
) {
  if (!name || !role) throw Error("GOOGLE_DRIVE_FOLDER_INVALID");
  const { token, identity } = await context(
    { client, connection, purpose },
    fetcher,
  );
  const query = `'${escapeQuery(parentId)}' in parents and trashed = false and mimeType = 'application/vnd.google-apps.folder' and name = '${escapeQuery(name)}' and appProperties has { key='evershineRole' and value='${escapeQuery(role)}' }`;
  const existing = await listFiles(token, query, fetcher);
  if (existing.length > 1) throw Error("GOOGLE_DRIVE_FOLDER_DUPLICATE");
  if (existing.length === 1) {
    if (existing[0].appProperties?.evershinePurpose !== purpose)
      throw Error("GOOGLE_DRIVE_FOLDER_MISMATCH");
    return { ...existing[0], email: identity.email, permissionId: identity.permissionId };
  }
  const folder = await createMetadata(
    token,
    {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentId],
      appProperties: {
        evershineFormat: "1",
        evershinePurpose: purpose,
        evershineRole: role,
      },
    },
    fetcher,
  );
  if (
    folder.mimeType !== "application/vnd.google-apps.folder" ||
    folder.appProperties?.evershinePurpose !== purpose
  )
    throw Error("GOOGLE_DRIVE_FOLDER_MISMATCH");
  return { ...folder, email: identity.email, permissionId: identity.permissionId };
}

export async function ensureDestination(
  { client, connection, purpose },
  fetcher = fetch,
) {
  const target = googleTarget(purpose);
  const secretName = purpose === "backup" ? "destination" : "recovery-destination";
  let existing;
  try {
    existing = await readGoogleSecret(secretName);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const { identity } = await context({ client, connection, purpose }, fetcher);
  if (existing) {
    if (
      existing.email !== target.email ||
      existing.permissionId !== identity.permissionId ||
      typeof existing.folderId !== "string"
    )
      throw Error("GOOGLE_DRIVE_DESTINATION_MISMATCH");
    const folder = await getFile(
      (await context({ client, connection, purpose }, fetcher)).token,
      existing.folderId,
      fetcher,
    );
    if (
      folder.trashed ||
      folder.mimeType !== "application/vnd.google-apps.folder" ||
      folder.appProperties?.evershinePurpose !== purpose
    )
      throw Error("GOOGLE_DRIVE_DESTINATION_MISMATCH");
    return { ...existing, folder };
  }
  const folder = await ensureFolder(
    {
      client,
      connection,
      purpose,
      name: purpose === "backup" ? "EVERSHINE ERP Backups" : "EVERSHINE ERP Recovery Keys",
      role: purpose === "backup" ? "backup-root" : "recovery-root",
    },
    fetcher,
  );
  const destination = {
    email: target.email,
    permissionId: identity.permissionId,
    folderId: folder.id,
    folderName: folder.name,
    purpose,
    createdAt: new Date().toISOString(),
  };
  await writeGoogleSecret(secretName, destination);
  return { ...destination, folder };
}

async function downloadFile(token, id, fetcher) {
  const response = await driveFetch(
    `${driveApi}/files/${encodeURIComponent(id)}?alt=media`,
    { headers: { Authorization: `Bearer ${token}` } },
    fetcher,
  );
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.length > maxDownloadBytes) throw Error("GOOGLE_FILE_TOO_LARGE");
  return bytes;
}

export async function downloadVerifiedFile(
  { client, connection, purpose, fileId, sha256 },
  fetcher = fetch,
) {
  if (!fileId || !/^[a-f0-9]{64}$/.test(sha256 ?? ""))
    throw Error("GOOGLE_DRIVE_FILE_INVALID");
  const { token, identity } = await context(
    { client, connection, purpose },
    fetcher,
  );
  const content = await downloadFile(token, fileId, fetcher);
  if (digest(content) !== sha256) throw Error("GOOGLE_DRIVE_VERIFY_FAILED");
  return { content, email: identity.email };
}

async function multipartUpload(token, metadata, mimeType, content, fetcher) {
  const boundary = "evershine-" + createHash("sha256").update(content).digest("hex").slice(0, 24);
  const crlf = "\r\n";
  const prefix = Buffer.from(
    "--" +
      boundary +
      crlf +
      "Content-Type: application/json; charset=UTF-8" +
      crlf +
      crlf +
      JSON.stringify(metadata) +
      crlf +
      "--" +
      boundary +
      crlf +
      "Content-Type: " +
      mimeType +
      crlf +
      crlf,
  );
  const suffix = Buffer.from(crlf + "--" + boundary + "--" + crlf);
  const body = Buffer.concat([prefix, content, suffix]);
  const response = await driveFetch(
    uploadApi + "?uploadType=multipart&fields=id,name,mimeType,size,md5Checksum,appProperties,parents,trashed",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
        "Content-Length": String(body.length),
      },
      body,
    },
    fetcher,
  );
  return responseJson(response);
}

export async function uploadVerifiedFile(
  {
    client,
    connection,
    purpose,
    parentId,
    name,
    mimeType = "application/octet-stream",
    content,
    backupId,
    role,
  },
  fetcher = fetch,
) {
  if (!Buffer.isBuffer(content) || !name || !backupId || !role)
    throw Error("GOOGLE_DRIVE_FILE_INVALID");
  const { token, identity } = await context(
    { client, connection, purpose },
    fetcher,
  );
  const sha256 = digest(content);
  const query = `'${escapeQuery(parentId)}' in parents and trashed = false and appProperties has { key='evershineBackupId' and value='${escapeQuery(backupId)}' } and appProperties has { key='evershineRole' and value='${escapeQuery(role)}' }`;
  const existing = await listFiles(token, query, fetcher);
  if (existing.length > 1) throw Error("GOOGLE_DRIVE_FILE_DUPLICATE");
  if (existing.length === 1) {
    if (existing[0].name !== name || Number(existing[0].size ?? -1) !== content.length)
      throw Error("GOOGLE_DRIVE_FILE_MISMATCH");
    const oldContent = await downloadFile(token, existing[0].id, fetcher);
    if (digest(oldContent) !== sha256) throw Error("GOOGLE_DRIVE_FILE_MISMATCH");
    return { ...existing[0], sha256, email: identity.email };
  }
  const metadata = {
    name,
    parents: [parentId],
    mimeType,
    appProperties: {
      evershineFormat: "1",
      evershineBackupId: backupId,
      evershineRole: role,
      evershinePurpose: purpose,
      sha256,
    },
  };
  if (content.length <= 8 * 1024 * 1024) {
    const uploaded = await multipartUpload(
      token,
      metadata,
      mimeType,
      content,
      fetcher,
    );
    if (!uploaded?.id) throw Error("GOOGLE_DRIVE_UPLOAD_FAILED");
    const verified = await downloadFile(token, uploaded.id, fetcher);
    if (digest(verified) !== sha256) throw Error("GOOGLE_DRIVE_VERIFY_FAILED");
    return { ...uploaded, sha256, email: identity.email };
  }
  const start = await driveFetch(
    uploadApi + "?uploadType=resumable",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json; charset=utf-8",
        "X-Upload-Content-Type": mimeType,
        "X-Upload-Content-Length": String(content.length),
      },
      body: JSON.stringify(metadata),
    },
    fetcher,
  );
  const location = start.headers.get("location");
  if (!location || !location.startsWith("https://www.googleapis.com/"))
    throw Error("GOOGLE_DRIVE_UPLOAD_FAILED");
  let uploaded;
  for (let offset = 0; offset < content.length; ) {
    const end = Math.min(content.length, offset + chunkBytes);
    const response = await driveFetch(
      location,
      {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Length": String(end - offset),
          "Content-Range": `bytes ${offset}-${end - 1}/${content.length}`,
        },
        body: content.subarray(offset, end),
      },
      fetcher,
    );
    if (response.status === 308) {
      const range = response.headers.get("range");
      const received = range?.match(/bytes=0-(\d+)$/)?.[1];
      offset = received ? Number(received) + 1 : end;
    } else {
      uploaded = await responseJson(response);
      offset = content.length;
    }
  }
  if (!uploaded?.id) throw Error("GOOGLE_DRIVE_UPLOAD_FAILED");
  const verified = await downloadFile(token, uploaded.id, fetcher);
  if (digest(verified) !== sha256) throw Error("GOOGLE_DRIVE_VERIFY_FAILED");
  return { ...uploaded, sha256, email: identity.email };
}
