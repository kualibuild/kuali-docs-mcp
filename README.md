# Kuali Docs MCP

Google Docs integration for Claude — create docs from Markdown, read comments, and collaborate with PMs and designers.

## What it does

- **Create docs** — Turn a Markdown PRD or spec into a formatted Google Doc
- **Read docs** — Pull a Google Doc back as Markdown
- **List docs** — See what's in the shared folder
- **Get comments** — Read all comments and replies on a doc
- **Reply to comments** — Post a reply as the Kuali bot
- **Resolve comments** — Mark a comment as done

## Install

### Claude Desktop (double-click install)

1. Download the latest `kuali-docs-mcp-v*.dxt` from [Releases](../../releases)
2. Double-click the `.dxt` file
3. Claude Desktop will prompt you for two values:
   - **Service Account Key** — paste the JSON key (ask your team lead)
   - **Drive Folder ID** — defaults to the shared Kuali folder, leave as-is unless told otherwise
4. Click Install

### Claude CLI

```bash
claude mcp add --scope user --transport stdio kuali-docs \
  --env GOOGLE_SERVICE_ACCOUNT_KEY='<paste json here>' \
  --env DRIVE_FOLDER_ID='0ADdItM1HkFgXUk9PVA' \
  -- node /path/to/kuali-docs-mcp/dist/index.js
```

Or install the .dxt directly:

```bash
claude mcp install kuali-docs-mcp-v1.0.0.dxt
```

> **Requires Node.js 18+** — [download here](https://nodejs.org) if needed.

## Usage

Once installed, just talk to Claude:

> *"Create a PRD for the new dashboard feature"* → Claude writes the PRD and creates a Google Doc
>
> *"What comments are on [doc URL]?"* → Claude reads all open comments
>
> *"Reply to the first comment saying we'll address this in v2"* → Claude posts the reply

## Workflow

1. Have a conversation with Claude about a PRD or spec
2. Claude creates a formatted Google Doc in the shared folder (or a subfolder)
3. PMs and designers open the doc, log in with their normal Google accounts, and leave comments
4. Come back to Claude: *"Read the comments on [doc URL] and let's go through them"*
5. Claude can reply to comments, resolve them, and export the final doc back to Markdown for GitHub

## Development

```bash
npm install
node build.mjs       # builds dist/ and packages kuali-docs-mcp-v*.dxt
```

To release: push a tag like `git tag v1.0.0 && git push --tags` — GitHub Actions builds and attaches the `.dxt` to the release automatically.

## Security

- Uses a Google service account scoped to one shared Drive folder only
- The service account key is stored as a secret in Claude Desktop's keychain
- The service account bypasses Google 2FA (it uses JWT auth, not human login)
- No data is sent anywhere except Google's APIs
