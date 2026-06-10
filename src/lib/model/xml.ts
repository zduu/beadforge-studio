export function decodeArchiveText(archive: Record<string, Uint8Array>, path: string): string | null {
  const file = archive[path];
  return file ? new TextDecoder().decode(file) : null;
}

export function parseJsonObject(text: string): Record<string, unknown> | null {
  try {
    const value = JSON.parse(text) as unknown;
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

export function findMetadataValue(xml: string, key: string): string | null {
  for (const metadataNode of findXmlStartTags(xml, "metadata")) {
    if (metadataNode.attributes.get("key") === key) {
      return metadataNode.attributes.get("value") ?? null;
    }
  }
  return null;
}

export function parseFloatAttribute(attributes: Map<string, string>, name: string): number {
  const value = Number.parseFloat(attributes.get(name) ?? "0");
  return Number.isFinite(value) ? value : 0;
}

export function parseIntAttribute(attributes: Map<string, string>, name: string): number {
  const value = Number.parseInt(attributes.get(name) ?? "0", 10);
  return Number.isFinite(value) ? value : 0;
}

export function getXmlElementBody(xml: string, tagName: string): string | null {
  return findXmlElements(xml, tagName)[0]?.body ?? null;
}

export function findXmlElements(
  xml: string,
  tagName: string,
): Array<{ attributes: Map<string, string>; body: string }> {
  const elements: Array<{ attributes: Map<string, string>; body: string }> = [];
  const openTagPattern = createXmlOpenTagPattern(tagName);
  let match: RegExpExecArray | null;

  while ((match = openTagPattern.exec(xml))) {
    const openTag = match[0];
    const openTagEnd = openTagPattern.lastIndex;
    const attributes = parseXmlAttributes(openTag);
    if (/\/\s*>$/.test(openTag)) {
      elements.push({ attributes, body: "" });
      continue;
    }

    const closeTagPattern = createXmlCloseTagPattern(tagName);
    closeTagPattern.lastIndex = openTagEnd;
    const closeMatch = closeTagPattern.exec(xml);
    if (!closeMatch) continue;

    elements.push({
      attributes,
      body: xml.slice(openTagEnd, closeMatch.index),
    });
    openTagPattern.lastIndex = closeTagPattern.lastIndex;
  }

  return elements;
}

export function findXmlStartTags(xml: string, tagName: string): Array<{ attributes: Map<string, string> }> {
  const tags: Array<{ attributes: Map<string, string> }> = [];
  const openTagPattern = createXmlOpenTagPattern(tagName);
  let match: RegExpExecArray | null;
  while ((match = openTagPattern.exec(xml))) {
    tags.push({ attributes: parseXmlAttributes(match[0]) });
  }
  return tags;
}

function createXmlOpenTagPattern(tagName: string): RegExp {
  return new RegExp(`<(?:[\\w.-]+:)?${escapeRegExp(tagName)}\\b[^>]*>`, "gi");
}

function createXmlCloseTagPattern(tagName: string): RegExp {
  return new RegExp(`</(?:[\\w.-]+:)?${escapeRegExp(tagName)}\\s*>`, "gi");
}

function parseXmlAttributes(tag: string): Map<string, string> {
  const attributes = new Map<string, string>();
  const attributePattern = /([^\s=<>/]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;

  while ((match = attributePattern.exec(tag))) {
    const name = match[1];
    const value = match[2] ?? match[3] ?? "";
    if (name) attributes.set(name, decodeXmlEntities(value));
  }

  return attributes;
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
