import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import {
  createDoc,
  readDoc,
  listDocs,
  getComments,
  replyToComment,
  resolveComment,
} from "./google.js";

const server = new Server(
  { name: "kuali-docs-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "create_doc",
      description:
        "Create a new Google Doc from Markdown content in the Kuali docs folder. Returns the doc URL.",
      inputSchema: {
        type: "object",
        properties: {
          title: { type: "string", description: "Document title" },
          content: {
            type: "string",
            description: "Document content in Markdown format",
          },
          subfolder: {
            type: "string",
            description:
              "Optional subfolder name to organize docs (e.g. 'PRDs', 'Specs'). Created if it doesn't exist.",
          },
        },
        required: ["title", "content"],
      },
    },
    {
      name: "read_doc",
      description:
        "Read the content of a Google Doc as Markdown. Accepts a doc URL or ID.",
      inputSchema: {
        type: "object",
        properties: {
          doc: {
            type: "string",
            description: "Google Doc URL or document ID",
          },
        },
        required: ["doc"],
      },
    },
    {
      name: "list_docs",
      description:
        "List Google Docs in the Kuali docs folder, optionally filtered to a subfolder.",
      inputSchema: {
        type: "object",
        properties: {
          subfolder: {
            type: "string",
            description: "Optional subfolder name to list docs from",
          },
        },
      },
    },
    {
      name: "get_comments",
      description:
        "Get all comments (and their replies) on a Google Doc. Accepts a doc URL or ID.",
      inputSchema: {
        type: "object",
        properties: {
          doc: {
            type: "string",
            description: "Google Doc URL or document ID",
          },
        },
        required: ["doc"],
      },
    },
    {
      name: "reply_to_comment",
      description: "Post a reply to a comment on a Google Doc.",
      inputSchema: {
        type: "object",
        properties: {
          doc: {
            type: "string",
            description: "Google Doc URL or document ID",
          },
          comment_id: {
            type: "string",
            description: "The ID of the comment to reply to",
          },
          reply: { type: "string", description: "The reply text" },
        },
        required: ["doc", "comment_id", "reply"],
      },
    },
    {
      name: "resolve_comment",
      description: "Mark a comment as resolved on a Google Doc.",
      inputSchema: {
        type: "object",
        properties: {
          doc: {
            type: "string",
            description: "Google Doc URL or document ID",
          },
          comment_id: {
            type: "string",
            description: "The ID of the comment to resolve",
          },
        },
        required: ["doc", "comment_id"],
      },
    },
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  try {
    switch (name) {
      case "create_doc": {
        const result = await createDoc(
          args!.title as string,
          args!.content as string,
          args!.subfolder as string | undefined
        );
        return {
          content: [
            {
              type: "text",
              text: `Created: **${result.title}**\nURL: ${result.url}\nID: ${result.id}`,
            },
          ],
        };
      }

      case "read_doc": {
        const markdown = await readDoc(args!.doc as string);
        return { content: [{ type: "text", text: markdown }] };
      }

      case "list_docs": {
        const docs = await listDocs(args!.subfolder as string | undefined);
        if (docs.length === 0) {
          return { content: [{ type: "text", text: "No docs found." }] };
        }
        const lines = docs.map(
          (d) => `- **${d.name}**\n  ${d.url}\n  Modified: ${d.modifiedTime}`
        );
        return {
          content: [{ type: "text", text: lines.join("\n") }],
        };
      }

      case "get_comments": {
        const comments = await getComments(args!.doc as string);
        if (comments.length === 0) {
          return { content: [{ type: "text", text: "No comments found." }] };
        }
        return {
          content: [{ type: "text", text: JSON.stringify(comments, null, 2) }],
        };
      }

      case "reply_to_comment": {
        await replyToComment(
          args!.doc as string,
          args!.comment_id as string,
          args!.reply as string
        );
        return { content: [{ type: "text", text: "Reply posted." }] };
      }

      case "resolve_comment": {
        await resolveComment(args!.doc as string, args!.comment_id as string);
        return { content: [{ type: "text", text: "Comment resolved." }] };
      }

      default:
        throw new Error(`Unknown tool: ${name}`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { content: [{ type: "text", text: `Error: ${message}` }], isError: true };
  }
});

const transport = new StdioServerTransport();
await server.connect(transport);
