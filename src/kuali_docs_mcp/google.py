"""Google Drive and Docs API operations."""

import json
import os
import re

import html2text
from google.oauth2 import service_account
from googleapiclient.discovery import build

from .markdown import markdown_to_doc_requests

SCOPES = [
    "https://www.googleapis.com/auth/drive",
    "https://www.googleapis.com/auth/documents",
]


def _get_credentials():
    key_json = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY")
    key_file = os.environ.get("GOOGLE_SERVICE_ACCOUNT_KEY_FILE")
    if not key_json and key_file:
        with open(key_file) as f:
            key_json = f.read()
    if not key_json:
        raise ValueError("GOOGLE_SERVICE_ACCOUNT_KEY or GOOGLE_SERVICE_ACCOUNT_KEY_FILE is required")
    return service_account.Credentials.from_service_account_info(json.loads(key_json), scopes=SCOPES)


def _root_folder_id() -> str:
    folder_id = os.environ.get("DRIVE_FOLDER_ID")
    if not folder_id:
        raise ValueError("DRIVE_FOLDER_ID is required")
    return folder_id


def parse_doc_id(doc_id_or_url: str) -> str:
    match = re.search(r"/d/([a-zA-Z0-9_-]+)", doc_id_or_url)
    return match.group(1) if match else doc_id_or_url


def _get_or_create_subfolder(name: str) -> str:
    creds = _get_credentials()
    drive = build("drive", "v3", credentials=creds)
    root_id = _root_folder_id()

    res = drive.files().list(
        q=f"name = '{name}' and '{root_id}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false",
        fields="files(id)",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()

    files = res.get("files", [])
    if files:
        return files[0]["id"]

    folder = drive.files().create(
        body={"name": name, "mimeType": "application/vnd.google-apps.folder", "parents": [root_id]},
        fields="id",
        supportsAllDrives=True,
    ).execute()
    return folder["id"]


def create_doc(title: str, content: str, subfolder: str | None = None) -> dict:
    creds = _get_credentials()
    drive = build("drive", "v3", credentials=creds)
    docs = build("docs", "v1", credentials=creds)

    parent_id = _get_or_create_subfolder(subfolder) if subfolder else _root_folder_id()

    file = drive.files().create(
        body={"name": title, "mimeType": "application/vnd.google-apps.document", "parents": [parent_id]},
        fields="id",
        supportsAllDrives=True,
    ).execute()

    doc_id = file["id"]
    requests = markdown_to_doc_requests(content)
    if requests:
        docs.documents().batchUpdate(documentId=doc_id, body={"requests": requests}).execute()

    return {"id": doc_id, "url": f"https://docs.google.com/document/d/{doc_id}/edit", "title": title}


def update_doc(doc_id_or_url: str, content: str) -> None:
    creds = _get_credentials()
    docs = build("docs", "v1", credentials=creds)
    doc_id = parse_doc_id(doc_id_or_url)

    doc = docs.documents().get(documentId=doc_id).execute()
    body_content = doc.get("body", {}).get("content", [])
    end_index = body_content[-1]["endIndex"] if body_content else 2

    requests = []
    if end_index > 2:
        requests.append({"deleteContentRange": {"range": {"startIndex": 1, "endIndex": end_index - 1}}})
    requests.extend(markdown_to_doc_requests(content))

    docs.documents().batchUpdate(documentId=doc_id, body={"requests": requests}).execute()


def read_doc(doc_id_or_url: str) -> str:
    creds = _get_credentials()
    drive = build("drive", "v3", credentials=creds)
    doc_id = parse_doc_id(doc_id_or_url)

    html = drive.files().export(fileId=doc_id, mimeType="text/html").execute()

    h = html2text.HTML2Text()
    h.ignore_links = True
    h.body_width = 0
    return h.handle(html.decode("utf-8"))


def list_docs(subfolder: str | None = None) -> list[dict]:
    creds = _get_credentials()
    drive = build("drive", "v3", credentials=creds)

    parent_id = _get_or_create_subfolder(subfolder) if subfolder else _root_folder_id()

    res = drive.files().list(
        q=f"'{parent_id}' in parents and mimeType = 'application/vnd.google-apps.document' and trashed = false",
        fields="files(id, name, modifiedTime)",
        orderBy="modifiedTime desc",
        supportsAllDrives=True,
        includeItemsFromAllDrives=True,
    ).execute()

    return [
        {
            "id": f["id"],
            "name": f["name"],
            "url": f"https://docs.google.com/document/d/{f['id']}/edit",
            "modifiedTime": f.get("modifiedTime", ""),
        }
        for f in res.get("files", [])
    ]


def get_comments(doc_id_or_url: str) -> list[dict]:
    creds = _get_credentials()
    drive = build("drive", "v3", credentials=creds)
    doc_id = parse_doc_id(doc_id_or_url)

    res = drive.comments().list(
        fileId=doc_id,
        includeDeleted=False,
        fields="comments(id,author/displayName,content,resolved,createdTime,modifiedTime,quotedFileContent/value,replies(id,author/displayName,content,createdTime))",
    ).execute()

    return [
        {
            "id": c["id"],
            "author": c.get("author", {}).get("displayName"),
            "content": c.get("content"),
            "resolved": c.get("resolved", False),
            "createdTime": c.get("createdTime"),
            "quotedText": c.get("quotedFileContent", {}).get("value"),
            "replies": [
                {
                    "id": r["id"],
                    "author": r.get("author", {}).get("displayName"),
                    "content": r.get("content"),
                    "createdTime": r.get("createdTime"),
                }
                for r in c.get("replies", [])
            ],
        }
        for c in res.get("comments", [])
    ]


def reply_to_comment(doc_id_or_url: str, comment_id: str, content: str) -> None:
    creds = _get_credentials()
    drive = build("drive", "v3", credentials=creds)
    doc_id = parse_doc_id(doc_id_or_url)
    drive.replies().create(fileId=doc_id, commentId=comment_id, body={"content": content}, fields="id").execute()


def resolve_comment(doc_id_or_url: str, comment_id: str) -> None:
    creds = _get_credentials()
    drive = build("drive", "v3", credentials=creds)
    doc_id = parse_doc_id(doc_id_or_url)
    drive.comments().update(fileId=doc_id, commentId=comment_id, body={"resolved": True}, fields="id").execute()
