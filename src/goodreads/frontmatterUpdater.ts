/**
 * obsidian-kitap - Non-Destructive Frontmatter Updater
 * In-place line-level YAML updater preserving comments, custom keys, quote styles, and markdown body byte-for-byte.
 * Zero external runtime dependencies. Zero `: any` or `as any` casts.
 */

import type { FrontmatterUpdateResult } from './types';

interface FrontmatterEntry {
  type: 'property' | 'raw';
  key?: string;
  rawKey?: string;
  rawValue?: string;
  inlineComment?: string;
  quoteStyle?: 'double' | 'single' | 'none';
  originalLines: string[];
}

function unquote(str: string): string {
  const trimmed = str.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    if (trimmed.length >= 2) {
      const inner = trimmed.slice(1, -1);
      if (trimmed.startsWith('"')) {
        return inner.replace(/\\"/g, '"').replace(/\\\\/g, '\\');
      } else {
        return inner.replace(/''/g, "'");
      }
    }
  }
  return trimmed;
}

function findKeyColon(line: string): number {
  let inDouble = false;
  let inSingle = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"' && !inSingle) inDouble = !inDouble;
    else if (ch === "'" && !inDouble) inSingle = !inSingle;
    else if (ch === ':' && !inDouble && !inSingle) {
      if (i === line.length - 1 || /\s/.test(line[i + 1])) {
        return i;
      }
    }
  }
  return -1;
}

function parseValueAndComment(rest: string): {
  rawVal: string;
  comment: string;
  quoteStyle: 'double' | 'single' | 'none';
} {
  let inDouble = false;
  let inSingle = false;
  let escape = false;
  let commentStart = -1;

  for (let i = 0; i < rest.length; i++) {
    const ch = rest[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (ch === '\\' && inDouble) {
      escape = true;
      continue;
    }
    if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      continue;
    }
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      continue;
    }
    if (!inDouble && !inSingle && ch === '#') {
      if (i === 0 || /\s/.test(rest[i - 1])) {
        commentStart = i;
        break;
      }
    }
  }

  const valPart = commentStart !== -1 ? rest.slice(0, commentStart) : rest;
  const comment = commentStart !== -1 ? rest.slice(commentStart) : '';
  const trimmedVal = valPart.trim();

  let quoteStyle: 'double' | 'single' | 'none' = 'none';
  if (trimmedVal.startsWith('"') && trimmedVal.endsWith('"') && trimmedVal.length >= 2) {
    quoteStyle = 'double';
  } else if (trimmedVal.startsWith("'") && trimmedVal.endsWith("'") && trimmedVal.length >= 2) {
    quoteStyle = 'single';
  }

  return { rawVal: trimmedVal, comment, quoteStyle };
}

function escapeDoubleQuotes(str: string): string {
  return str.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function escapeSingleQuotes(str: string): string {
  return str.replace(/'/g, "''");
}

function formatScalar(val: unknown, quoteStyle: 'double' | 'single' | 'none'): string {
  if (val === null || val === undefined) {
    return '""';
  }
  if (typeof val === 'number') {
    return String(val);
  }
  if (typeof val === 'boolean') {
    return val ? 'true' : 'false';
  }
  let str: string;
  if (typeof val === 'string') {
    str = val;
  } else if (typeof val === 'bigint') {
    str = val.toString();
  } else {
    str = '';
  }
  if (str === '') {
    return '""';
  }
  const cleanStr =
    (str.startsWith('"') && str.endsWith('"') && str.length >= 2) ||
    (str.startsWith("'") && str.endsWith("'") && str.length >= 2)
      ? unquote(str)
      : str;

  if (quoteStyle === 'single') {
    return `'${escapeSingleQuotes(cleanStr)}'`;
  }
  return `"${escapeDoubleQuotes(cleanStr)}"`;
}

function formatUpdatedPropertyLines(
  rawKey: string,
  val: unknown,
  quoteStyle: 'double' | 'single' | 'none',
  inlineComment: string
): string[] {
  const commentSuffix = inlineComment
    ? inlineComment.startsWith(' ')
      ? inlineComment
      : ' ' + inlineComment
    : '';

  if (Array.isArray(val)) {
    if (val.length === 0) {
      return [`${rawKey}: []${commentSuffix}`];
    }
    const lines: string[] = [`${rawKey}:${commentSuffix}`];
    for (const item of val) {
      const formattedItem = formatScalar(item, 'double');
      lines.push(`  - ${formattedItem}`);
    }
    return lines;
  }

  const formattedVal = formatScalar(val, quoteStyle);
  return [`${rawKey}: ${formattedVal}${commentSuffix}`];
}

function extractArrayItems(lines: string[]): string[] | null {
  if (lines.length === 0) return null;
  const firstLine = lines[0];
  const colonIdx = firstLine.indexOf(':');
  if (colonIdx !== -1) {
    const rest = firstLine.slice(colonIdx + 1).trim();
    if (rest.startsWith('[') && rest.endsWith(']')) {
      const inner = rest.slice(1, -1).trim();
      if (!inner) return [];
      return inner.split(',').map((s) => unquote(s.trim()));
    }
  }
  if (lines.length > 1) {
    const items: string[] = [];
    for (let i = 1; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (trimmed.startsWith('-')) {
        const itemRest = trimmed.slice(1).trim();
        items.push(unquote(itemRest));
      }
    }
    return items;
  }
  return null;
}

function isPropertyUnchanged(entry: FrontmatterEntry, newVal: unknown): boolean {
  if (newVal === undefined) {
    return true;
  }

  if (Array.isArray(newVal)) {
    const existingItems = extractArrayItems(entry.originalLines);
    if (!existingItems) return false;
    if (existingItems.length !== newVal.length) return false;
    for (let i = 0; i < existingItems.length; i++) {
      if (existingItems[i] !== unquote(String(newVal[i]))) {
        return false;
      }
    }
    return true;
  }

  const raw = entry.rawValue ?? '';

  if (newVal === null || newVal === '') {
    return (
      raw === '' ||
      raw === '~' ||
      raw === 'null' ||
      raw === '""' ||
      raw === "''"
    );
  }

  if (typeof newVal === 'boolean') {
    if (raw.toLowerCase() === 'true' && newVal === true) return true;
    if (raw.toLowerCase() === 'false' && newVal === false) return true;
    return false;
  }

  if (typeof newVal === 'number') {
    if (raw !== '' && raw === String(newVal)) {
      return true;
    }
    if (raw !== '' && !isNaN(Number(raw)) && Number(raw) === newVal && !raw.startsWith('0')) {
      return true;
    }
    return false;
  }

  if (typeof newVal === 'string') {
    const unquotedRaw = unquote(raw);
    const unquotedNew = unquote(newVal);
    return unquotedRaw === unquotedNew;
  }

  return false;
}

/**
 * Non-destructively updates YAML frontmatter in a markdown note.
 * Preserves YAML comments, custom keys, quote styles, ordering, and the markdown body byte-for-byte.
 *
 * @param fileContent The entire raw content of the markdown file.
 * @param updatedProperties Key-value pairs to update or add in the frontmatter.
 * @returns { updatedContent: string; changed: boolean }
 */
export function updateFrontmatterNonDestructive(
  fileContent: string,
  updatedProperties: Record<string, unknown>
): FrontmatterUpdateResult {
  if (typeof fileContent !== 'string') {
    return { updatedContent: '', changed: false };
  }

  const hasBom = fileContent.startsWith('\uFEFF');
  const cleanContent = hasBom ? fileContent.slice(1) : fileContent;
  const eol = fileContent.includes('\r\n') ? '\r\n' : '\n';

  const validEntries = Object.entries(updatedProperties).filter(
    ([_, v]) => v !== undefined
  );

  let openDelim = '';
  let rawFm = '';
  let closeDelim = '';
  let body = '';
  let hasFm = false;

  const openMatch = cleanContent.match(/^---\r?\n/);
  if (openMatch) {
    openDelim = openMatch[0];
    const rest = cleanContent.slice(openDelim.length);
    const closeMatch = rest.match(/^(---(?:\r?\n|$))/) || rest.match(/\r?\n(---(?:\r?\n|$))/);
    if (closeMatch && closeMatch.index !== undefined) {
      hasFm = true;
      if (closeMatch[0].startsWith('\r\n') || closeMatch[0].startsWith('\n')) {
        const newlineLength = closeMatch[0].startsWith('\r\n') ? 2 : 1;
        rawFm = rest.slice(0, closeMatch.index);
        closeDelim = closeMatch[1];
        body = rest.slice(closeMatch.index + newlineLength + closeDelim.length);
      } else {
        rawFm = '';
        closeDelim = closeMatch[1];
        body = rest.slice(closeMatch.index + closeDelim.length);
      }
    }
  }

  // Case A: No existing frontmatter
  if (!hasFm) {
    if (validEntries.length === 0) {
      return { updatedContent: fileContent, changed: false };
    }
    const newFmLines: string[] = ['---'];
    for (const [k, v] of validEntries) {
      newFmLines.push(...formatUpdatedPropertyLines(k, v, 'double', ''));
    }
    newFmLines.push('---');
    const newFmBlock = newFmLines.join(eol);
    const updatedContent = (hasBom ? '\uFEFF' : '') + newFmBlock + eol + cleanContent;
    return { updatedContent, changed: true };
  }

  // Case B: Existing frontmatter present
  // Açılış --- satırından hemen sonra gelen boş satırları temizle
  let hadLeadingBlankLines = false;
  if (rawFm.length > 0) {
    const strippedFm = rawFm.replace(/^(?:[ \t]*\r?\n)+/, '');
    if (strippedFm !== rawFm) {
      rawFm = strippedFm;
      hadLeadingBlankLines = true;
    }
  }

  const fmLines = rawFm.length > 0 ? rawFm.split(/\r?\n/) : [];
  const entries: FrontmatterEntry[] = [];
  let currentProp: FrontmatterEntry | null = null;

  for (let i = 0; i < fmLines.length; i++) {
    const line = fmLines[i];
    const trimmed = line.trim();

    // Check if indented continuation line
    if (/^\s+/.test(line)) {
      if (currentProp) {
        currentProp.originalLines.push(line);
      } else {
        entries.push({ type: 'raw', originalLines: [line] });
      }
      continue;
    }

    // Blank lines, comments, templater tags
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('<%')) {
      currentProp = null;
      entries.push({ type: 'raw', originalLines: [line] });
      continue;
    }

    // Top-level property line
    const colonIdx = findKeyColon(line);
    if (colonIdx !== -1) {
      const rawKeyPart = line.slice(0, colonIdx).trim();
      const key = unquote(rawKeyPart);
      const rest = line.slice(colonIdx + 1);
      const { rawVal, comment, quoteStyle } = parseValueAndComment(rest);

      currentProp = {
        type: 'property',
        key,
        rawKey: rawKeyPart,
        rawValue: rawVal,
        inlineComment: comment,
        quoteStyle,
        originalLines: [line],
      };
      entries.push(currentProp);
    } else {
      currentProp = null;
      entries.push({ type: 'raw', originalLines: [line] });
    }
  }

  const handledKeys = new Set<string>();

  // Eski/yinelenen alan adlarını yerinde hedef alana taşı:
  //   durum -> okuma_durumu, puan_kitapyurdu / puan_dr -> puan
  // Hedef alan zaten mevcutsa eski alan yinelenen olarak kaldırılır.
  const existingPropertyKeys = new Set<string>();
  for (const entry of entries) {
    if (entry.type === 'property' && entry.key) {
      existingPropertyKeys.add(entry.key);
    }
  }

  const migrateAliasInPlace = (targetKey: string, aliasKeys: string[]): boolean => {
    if (!(targetKey in updatedProperties) || updatedProperties[targetKey] === undefined) {
      return false;
    }
    // Kullanıcı eski alanı açıkça güncellemek istiyorsa taşıma yapma
    if (aliasKeys.some((alias) => alias in updatedProperties)) {
      return false;
    }

    const targetExists = existingPropertyKeys.has(targetKey);
    let migrated = false;
    let structuralChange = false;

    for (const entry of entries) {
      if (entry.type !== 'property' || !entry.key || !aliasKeys.includes(entry.key)) {
        continue;
      }

      if (targetExists || migrated) {
        // Hedef alan zaten var: yinelenen eski alanı kaldır
        entry.originalLines = [];
      } else {
        // Eski alanı yerinde hedef alana dönüştür (konum ve satır içi yorum korunur)
        entry.key = targetKey;
        entry.rawKey = targetKey;
        // Değer aynı kalsa bile anahtar adı değiştiği için satırı yeniden yaz
        entry.originalLines = formatUpdatedPropertyLines(
          targetKey,
          updatedProperties[targetKey],
          entry.quoteStyle || 'double',
          entry.inlineComment || ''
        );
        migrated = true;
      }
      structuralChange = true;
    }

    return structuralChange;
  };

  const migratedReadingStatus = migrateAliasInPlace('okuma_durumu', ['durum']);
  const migratedRating = migrateAliasInPlace('puan', ['puan_kitapyurdu', 'puan_dr']);

  let changed = hadLeadingBlankLines || migratedReadingStatus || migratedRating;

  // Process existing properties
  for (const entry of entries) {
    if (entry.type !== 'property' || !entry.key) continue;
    if (!(entry.key in updatedProperties)) continue;

    const newVal = updatedProperties[entry.key];
    if (newVal === undefined) continue;

    handledKeys.add(entry.key);

    if (isPropertyUnchanged(entry, newVal)) {
      continue;
    }

    changed = true;
    entry.originalLines = formatUpdatedPropertyLines(
      entry.rawKey || entry.key,
      newVal,
      entry.quoteStyle || 'double',
      entry.inlineComment || ''
    );
  }

  // Append new properties before closing delimiter
  for (const [newKey, newVal] of validEntries) {
    if (!handledKeys.has(newKey)) {
      changed = true;
      const formatted = formatUpdatedPropertyLines(newKey, newVal, 'double', '');
      entries.push({
        type: 'property',
        key: newKey,
        rawKey: newKey,
        originalLines: formatted,
      });
    }
  }

  if (!changed) {
    return { updatedContent: fileContent, changed: false };
  }

  const updatedFmContent = entries.flatMap((e) => e.originalLines).join(eol);
  const updatedContent =
    (hasBom ? '\uFEFF' : '') +
    openDelim +
    updatedFmContent +
    (entries.length > 0 ? eol : '') +
    closeDelim +
    body;

  return { updatedContent, changed: true };
}
