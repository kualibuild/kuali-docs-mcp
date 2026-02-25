// Markdown → Google Docs API requests, and Google Doc HTML → Markdown

interface InlineSegment {
  text: string;
  bold?: boolean;
  italic?: boolean;
}

interface DocSegment {
  inlines: InlineSegment[];
  style: "HEADING_1" | "HEADING_2" | "HEADING_3" | "NORMAL_TEXT";
  bullet?: boolean;
}

function parseInline(text: string): InlineSegment[] {
  const result: InlineSegment[] = [];
  let i = 0;
  let current = "";

  while (i < text.length) {
    if (text[i] === "*" && text[i + 1] === "*") {
      if (current) result.push({ text: current });
      current = "";
      i += 2;
      let bold = "";
      while (i < text.length && !(text[i] === "*" && text[i + 1] === "*")) {
        bold += text[i++];
      }
      i += 2;
      result.push({ text: bold, bold: true });
    } else if (text[i] === "*" && text[i + 1] !== "*") {
      if (current) result.push({ text: current });
      current = "";
      i++;
      let italic = "";
      while (i < text.length && text[i] !== "*") {
        italic += text[i++];
      }
      i++;
      result.push({ text: italic, italic: true });
    } else if (text[i] === "`") {
      if (current) result.push({ text: current });
      current = "";
      i++;
      let code = "";
      while (i < text.length && text[i] !== "`") {
        code += text[i++];
      }
      i++;
      result.push({ text: code, italic: true });
    } else {
      current += text[i++];
    }
  }

  if (current) result.push({ text: current });
  return result;
}

export function markdownToDocRequests(markdown: string): object[] {
  const lines = markdown.split("\n");
  const segments: DocSegment[] = [];

  for (const line of lines) {
    const h1 = line.match(/^# (.+)/);
    const h2 = line.match(/^## (.+)/);
    const h3 = line.match(/^### (.+)/);
    const bullet = line.match(/^[-*] (.+)/);

    if (h1) {
      segments.push({ inlines: [{ text: h1[1] }], style: "HEADING_1" });
    } else if (h2) {
      segments.push({ inlines: [{ text: h2[1] }], style: "HEADING_2" });
    } else if (h3) {
      segments.push({ inlines: [{ text: h3[1] }], style: "HEADING_3" });
    } else if (bullet) {
      segments.push({
        inlines: parseInline(bullet[1]),
        style: "NORMAL_TEXT",
        bullet: true,
      });
    } else if (line.trim() === "") {
      segments.push({ inlines: [{ text: "" }], style: "NORMAL_TEXT" });
    } else {
      segments.push({ inlines: parseInline(line), style: "NORMAL_TEXT" });
    }
  }

  // Build full text and track index ranges
  const requests: object[] = [];
  const styleRanges: Array<{
    startIndex: number;
    endIndex: number;
    paragraphStyle?: string;
    textStyle?: { bold?: boolean; italic?: boolean };
    bullet?: boolean;
  }> = [];

  let fullText = "";
  let currentIndex = 1;

  for (const segment of segments) {
    const segStart = currentIndex;
    const segText =
      segment.inlines.map((i) => i.text).join("") + "\n";

    fullText += segText;

    // Track paragraph style range
    if (segment.style !== "NORMAL_TEXT" || segment.bullet) {
      styleRanges.push({
        startIndex: segStart,
        endIndex: segStart + segText.length,
        paragraphStyle: segment.bullet ? undefined : segment.style,
        bullet: segment.bullet,
      });
    }

    // Track inline style ranges
    let inlineIndex = segStart;
    for (const inline of segment.inlines) {
      if (inline.bold || inline.italic) {
        styleRanges.push({
          startIndex: inlineIndex,
          endIndex: inlineIndex + inline.text.length,
          textStyle: { bold: inline.bold, italic: inline.italic },
        });
      }
      inlineIndex += inline.text.length;
    }

    currentIndex += segText.length;
  }

  // Single text insertion
  if (fullText) {
    requests.push({
      insertText: {
        location: { index: 1 },
        text: fullText,
      },
    });
  }

  // Apply styles
  for (const range of styleRanges) {
    if (range.paragraphStyle) {
      requests.push({
        updateParagraphStyle: {
          range: { startIndex: range.startIndex, endIndex: range.endIndex },
          paragraphStyle: { namedStyleType: range.paragraphStyle },
          fields: "namedStyleType",
        },
      });
    }
    if (range.bullet) {
      requests.push({
        createParagraphBullets: {
          range: { startIndex: range.startIndex, endIndex: range.endIndex },
          bulletPreset: "BULLET_DISC_CIRCLE_SQUARE",
        },
      });
    }
    if (range.textStyle) {
      requests.push({
        updateTextStyle: {
          range: { startIndex: range.startIndex, endIndex: range.endIndex },
          textStyle: range.textStyle,
          fields: Object.keys(range.textStyle).join(","),
        },
      });
    }
  }

  return requests;
}
