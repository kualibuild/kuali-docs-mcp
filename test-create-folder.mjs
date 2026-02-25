import { readFileSync } from "fs";
import { google } from "googleapis";

const keyJson = readFileSync(process.env.HOME + "/.config/kuali/service-account.json", "utf8");
const credentials = JSON.parse(keyJson);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/drive"],
});

const drive = google.drive({ version: "v3", auth });
const rootId = "0ADdItM1HkFgXUk9PVA";

// Check if folder already exists
const existing = await drive.files.list({
  q: `name = 'joel test' and '${rootId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
  fields: "files(id, name)",
  supportsAllDrives: true,
  includeItemsFromAllDrives: true,
});

if (existing.data.files?.length > 0) {
  console.log("Folder already exists:", existing.data.files[0].id);
} else {
  const folder = await drive.files.create({
    requestBody: {
      name: "joel test",
      mimeType: "application/vnd.google-apps.folder",
      parents: [rootId],
    },
    fields: "id, name",
    supportsAllDrives: true,
  });
  console.log("Created folder:", folder.data.name, "| ID:", folder.data.id);
  console.log("URL: https://drive.google.com/drive/folders/" + folder.data.id);
}
