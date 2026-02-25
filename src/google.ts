import { google } from "googleapis";
import { readFileSync } from "fs";
import TurndownService from "turndown";
import { markdownToDocRequests } from "./markdown.js";

function getAuth() {
  let keyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;
  const keyFile = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_FILE;
  if (!keyJson && keyFile) keyJson = readFileSync(keyFile, "utf8");
  if (!keyJson) throw new Error("GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_KEY_FILE is required");
  const credentials = JSON.parse(keyJson);
  return new google.auth.GoogleAuth({
    credentials,
    scopes: [
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
    ],
  });
}

function getRootFolderId(): string {
  const id = process.env.DRIVE_FOLDER_ID;
  if (!id) throw new Error("DRIVE_FOLDER_ID is required");
  return id;
}

// Extract doc ID from a URL or return the raw ID
export function parseDocId(input: string): string {
  const match = input.match(/\/d\/([a-zA-Z0-9_-]+)/);
  return match ? match[1] : input;
}

async function getOrCreateSubfolder(name: string): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const rootId = getRootFolderId();

  const res = await drive.files.list({
    q: `name = '${name}' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: "files(id)",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (res.data.files && res.data.files.length > 0) {
    return res.data.files[0].id!;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  return folder.data.id!;
}

export async function createDoc(
  title: string,
  content: string,
  subfolder?: string
): Promise<{ id: string; url: string; title: string }> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const docs = google.docs({ version: "v1", auth });

  const parentId = subfolder
    ? await getOrCreateSubfolder(subfolder)
    : getRootFolderId();

  // Create blank doc
  const file = await drive.files.create({
    requestBody: {
      name: title,
      mimeType: "application/vnd.google-apps.document",
      parents: [parentId],
    },
    fields: "id",
    supportsAllDrives: true,
  });

  const docId = file.data.id!;

  // Insert formatted content
  const requests = markdownToDocRequests(content);
  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    });
  }

  return {
    id: docId,
    url: `https://docs.google.com/document/d/${docId}/edit`,
    title,
  };
}

export async function updateDoc(docIdOrUrl: string, content: string): Promise<void> {
  const auth = getAuth();
  const docs = google.docs({ version: "v1", auth });
  const docId = parseDocId(docIdOrUrl);

  // Get current doc to find body length
  const doc = await docs.documents.get({ documentId: docId });
  const endIndex = doc.data.body?.content?.at(-1)?.endIndex ?? 2;

  const requests: object[] = [];

  // Delete all existing content (leave index 1 intact — Docs requires at least 1 char)
  if (endIndex > 2) {
    requests.push({ deleteContentRange: { range: { startIndex: 1, endIndex: endIndex - 1 } } });
  }

  // Insert new content
  requests.push(...markdownToDocRequests(content));

  await docs.documents.batchUpdate({ documentId: docId, requestBody: { requests } });
}

export async function readDoc(docIdOrUrl: string): Promise<string> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const docId = parseDocId(docIdOrUrl);

  // Export as HTML, then convert to Markdown
  const res = await drive.files.export(
    { fileId: docId, mimeType: "text/html" },
    { responseType: "text" }
  );

  const td = new TurndownService({ headingStyle: "atx", bulletListMarker: "-" });
  return td.turndown(res.data as string);
}

export async function listDocs(
  subfolder?: string
): Promise<Array<{ id: string; name: string; url: string; modifiedTime: string }>> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });

  const parentId = subfolder
    ? await getOrCreateSubfolder(subfolder)
    : getRootFolderId();

  const res = await drive.files.list({
    q: `'${parentId}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false`,
    fields: "files(id, name, modifiedTime)",
    orderBy: "modifiedTime desc",
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  return (res.data.files || []).map((f) => ({
    id: f.id!,
    name: f.name!,
    url: `https://docs.google.com/document/d/${f.id}/edit`,
    modifiedTime: f.modifiedTime!,
  }));
}

export async function getComments(docIdOrUrl: string): Promise<object[]> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const docId = parseDocId(docIdOrUrl);

  const res = await drive.comments.list({
    fileId: docId,
    includeDeleted: false,
    fields:
      "comments(id,author/displayName,content,resolved,createdTime,modifiedTime,quotedFileContent/value,replies(id,author/displayName,content,createdTime))",
  });

  return (res.data.comments || []).map((c) => ({
    id: c.id,
    author: c.author?.displayName,
    content: c.content,
    resolved: c.resolved,
    createdTime: c.createdTime,
    quotedText: c.quotedFileContent?.value,
    replies: (c.replies || []).map((r) => ({
      id: r.id,
      author: r.author?.displayName,
      content: r.content,
      createdTime: r.createdTime,
    })),
  }));
}

export async function replyToComment(
  docIdOrUrl: string,
  commentId: string,
  content: string
): Promise<void> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const docId = parseDocId(docIdOrUrl);

  await drive.replies.create({
    fileId: docId,
    commentId,
    requestBody: { content },
    fields: "id",
  });
}

export async function resolveComment(
  docIdOrUrl: string,
  commentId: string
): Promise<void> {
  const auth = getAuth();
  const drive = google.drive({ version: "v3", auth });
  const docId = parseDocId(docIdOrUrl);

  await drive.comments.update({
    fileId: docId,
    commentId,
    requestBody: { resolved: true } as any,
    fields: "id",
  });
}
