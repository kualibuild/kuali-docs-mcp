"""Markdown → Google Docs API batchUpdate requests."""

from dataclasses import dataclass, field


@dataclass
class InlineSegment:
    text: str
    bold: bool = False
    italic: bool = False


@dataclass
class DocSegment:
    inlines: list[InlineSegment]
    style: str = "NORMAL_TEXT"  # HEADING_1, HEADING_2, HEADING_3, NORMAL_TEXT
    bullet: bool = False


def _parse_inline(text: str) -> list[InlineSegment]:
    result = []
    i = 0
    current = ""

    while i < len(text):
        if text[i] == "*" and i + 1 < len(text) and text[i + 1] == "*":
            if current:
                result.append(InlineSegment(current))
            current = ""
            i += 2
            bold = ""
            while i < len(text) and not (text[i] == "*" and i + 1 < len(text) and text[i + 1] == "*"):
                bold += text[i]
                i += 1
            i += 2
            result.append(InlineSegment(bold, bold=True))
        elif text[i] == "*" and (i + 1 >= len(text) or text[i + 1] != "*"):
            if current:
                result.append(InlineSegment(current))
            current = ""
            i += 1
            italic = ""
            while i < len(text) and text[i] != "*":
                italic += text[i]
                i += 1
            i += 1
            result.append(InlineSegment(italic, italic=True))
        elif text[i] == "`":
            if current:
                result.append(InlineSegment(current))
            current = ""
            i += 1
            code = ""
            while i < len(text) and text[i] != "`":
                code += text[i]
                i += 1
            i += 1
            result.append(InlineSegment(code, italic=True))
        else:
            current += text[i]
            i += 1

    if current:
        result.append(InlineSegment(current))
    return result


def _parse_markdown(markdown: str) -> list[DocSegment]:
    segments = []
    for line in markdown.splitlines():
        if line.startswith("# "):
            segments.append(DocSegment([InlineSegment(line[2:])], style="HEADING_1"))
        elif line.startswith("## "):
            segments.append(DocSegment([InlineSegment(line[3:])], style="HEADING_2"))
        elif line.startswith("### "):
            segments.append(DocSegment([InlineSegment(line[4:])], style="HEADING_3"))
        elif line.startswith("- ") or line.startswith("* "):
            segments.append(DocSegment(_parse_inline(line[2:]), bullet=True))
        elif line.strip() == "":
            segments.append(DocSegment([InlineSegment("")]))
        else:
            segments.append(DocSegment(_parse_inline(line)))
    return segments


def markdown_to_doc_requests(markdown: str) -> list[dict]:
    segments = _parse_markdown(markdown)
    requests = []
    style_ranges = []

    full_text = ""
    current_index = 1

    for segment in segments:
        seg_start = current_index
        seg_text = "".join(s.text for s in segment.inlines) + "\n"
        full_text += seg_text

        if segment.style != "NORMAL_TEXT":
            style_ranges.append({
                "type": "paragraph",
                "startIndex": seg_start,
                "endIndex": seg_start + len(seg_text),
                "style": segment.style,
            })

        if segment.bullet:
            style_ranges.append({
                "type": "bullet",
                "startIndex": seg_start,
                "endIndex": seg_start + len(seg_text),
            })

        inline_index = seg_start
        for inline in segment.inlines:
            if inline.bold or inline.italic:
                style_ranges.append({
                    "type": "text",
                    "startIndex": inline_index,
                    "endIndex": inline_index + len(inline.text),
                    "bold": inline.bold,
                    "italic": inline.italic,
                })
            inline_index += len(inline.text)

        current_index += len(seg_text)

    if full_text:
        requests.append({"insertText": {"location": {"index": 1}, "text": full_text}})

    for r in style_ranges:
        if r["type"] == "paragraph":
            requests.append({
                "updateParagraphStyle": {
                    "range": {"startIndex": r["startIndex"], "endIndex": r["endIndex"]},
                    "paragraphStyle": {"namedStyleType": r["style"]},
                    "fields": "namedStyleType",
                }
            })
        elif r["type"] == "bullet":
            requests.append({
                "createParagraphBullets": {
                    "range": {"startIndex": r["startIndex"], "endIndex": r["endIndex"]},
                    "bulletPreset": "BULLET_DISC_CIRCLE_SQUARE",
                }
            })
        elif r["type"] == "text":
            fields = ",".join(k for k in ("bold", "italic") if r.get(k))
            requests.append({
                "updateTextStyle": {
                    "range": {"startIndex": r["startIndex"], "endIndex": r["endIndex"]},
                    "textStyle": {k: r[k] for k in ("bold", "italic") if r.get(k)},
                    "fields": fields,
                }
            })

    return requests
