"""Kuali Docs MCP server."""

import json
from mcp.server.fastmcp import FastMCP
from .google import (
    create_doc,
    update_doc,
    read_doc,
    list_docs,
    get_comments,
    reply_to_comment,
    resolve_comment,
)

mcp = FastMCP("kuali-docs-mcp")


@mcp.tool()
def create_doc_tool(title: str, content: str, subfolder: str | None = None) -> str:
    """Create a new Google Doc from Markdown content in the Kuali docs folder. Returns the doc URL.

    Args:
        title: Document title
        content: Document content in Markdown format
        subfolder: Optional subfolder name (e.g. 'PRDs', 'Specs'). Created if it doesn't exist.
    """
    result = create_doc(title, content, subfolder)
    return f"Created: **{result['title']}**\nURL: {result['url']}\nID: {result['id']}"


@mcp.tool()
def update_doc_tool(doc: str, content: str) -> str:
    """Replace the full content of a Google Doc with new Markdown content.

    Args:
        doc: Google Doc URL or document ID
        content: New document content in Markdown format
    """
    update_doc(doc, content)
    return "Doc updated."


@mcp.tool()
def read_doc_tool(doc: str) -> str:
    """Read the content of a Google Doc as Markdown.

    Args:
        doc: Google Doc URL or document ID
    """
    return read_doc(doc)


@mcp.tool()
def list_docs_tool(subfolder: str | None = None) -> str:
    """List Google Docs in the Kuali docs folder, optionally filtered to a subfolder.

    Args:
        subfolder: Optional subfolder name to list docs from
    """
    docs = list_docs(subfolder)
    if not docs:
        return "No docs found."
    lines = [f"- **{d['name']}**\n  {d['url']}\n  Modified: {d['modifiedTime']}" for d in docs]
    return "\n".join(lines)


@mcp.tool()
def get_comments_tool(doc: str) -> str:
    """Get all comments (and their replies) on a Google Doc.

    Args:
        doc: Google Doc URL or document ID
    """
    comments = get_comments(doc)
    if not comments:
        return "No comments found."
    return json.dumps(comments, indent=2)


@mcp.tool()
def reply_to_comment_tool(doc: str, comment_id: str, reply: str) -> str:
    """Post a reply to a comment on a Google Doc.

    Args:
        doc: Google Doc URL or document ID
        comment_id: The ID of the comment to reply to
        reply: The reply text
    """
    reply_to_comment(doc, comment_id, reply)
    return "Reply posted."


@mcp.tool()
def resolve_comment_tool(doc: str, comment_id: str) -> str:
    """Mark a comment as resolved on a Google Doc.

    Args:
        doc: Google Doc URL or document ID
        comment_id: The ID of the comment to resolve
    """
    resolve_comment(doc, comment_id)
    return "Comment resolved."


def main():
    mcp.run()
