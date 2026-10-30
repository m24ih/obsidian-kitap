/**
 * obsidian-kitap - Zero-dependency RFC 4180 Streaming CSV Parser
 * Handles quotes, multiline fields, CRLF/LF, escaped quotes (""), BOM, and Excel formulas.
 */

import type { GoodreadsRawRow } from './types';

/**
 * Strips UTF-8 Byte Order Mark (\uFEFF) if present at index 0.
 */
export function stripBom(text: string): string {
  if (text && text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

/**
 * Converts a raw header string into camelCase for unmapped fallback headers.
 */
export function toCamelCase(str: string): string {
  return str
    .trim()
    .toLowerCase()
    .replace(/[^a-zA-Z0-9]+(.)/g, (_match: string, chr: string) => chr.toUpperCase())
    .replace(/[^a-zA-Z0-9]/g, '');
}

/**
 * Unescapes Goodreads Excel formula notation, e.g. ="0143127748" or ="9780143127741".
 * Preserves leading zeros and all alphanumeric characters without numeric conversion.
 */
export function unescapeExcelFormula(value?: string | null): string {
  if (value === undefined || value === null) return '';
  let s = String(value).trim();
  if (!s) return '';

  let changed = true;
  while (changed) {
    changed = false;
    if (s.startsWith('=')) {
      s = s.slice(1).trim();
      changed = true;
    }
    while (
      (s.startsWith('"') && s.endsWith('"') && s.length >= 2) ||
      (s.startsWith("'") && s.endsWith("'") && s.length >= 2)
    ) {
      s = s.slice(1, -1).trim();
      changed = true;
    }
    if (s.startsWith('"') || s.startsWith("'")) {
      s = s.slice(1).trim();
      changed = true;
    }
    if (s.endsWith('"') || s.endsWith("'")) {
      s = s.slice(0, -1).trim();
      changed = true;
    }
  }

  return s;
}

/**
 * Canonical dictionary mapping Goodreads column headers to GoodreadsRawRow keys.
 */
export const GOODREADS_HEADER_MAP: Record<string, keyof GoodreadsRawRow> = {
  'book id': 'bookId',
  'bookid': 'bookId',
  'title': 'title',
  'author': 'author',
  'author l-f': 'authorLf',
  'author l/f': 'authorLf',
  'authorlf': 'authorLf',
  'additional authors': 'additionalAuthors',
  'additionalauthors': 'additionalAuthors',
  'isbn': 'isbn',
  'isbn13': 'isbn13',
  'my rating': 'myRating',
  'myrating': 'myRating',
  'average rating': 'averageRating',
  'averagerating': 'averageRating',
  'publisher': 'publisher',
  'binding': 'binding',
  'number of pages': 'numberOfPages',
  'numberofpages': 'numberOfPages',
  'year published': 'yearPublished',
  'yearpublished': 'yearPublished',
  'original publication year': 'originalPublicationYear',
  'originalpublicationyear': 'originalPublicationYear',
  'date read': 'dateRead',
  'dateread': 'dateRead',
  'date added': 'dateAdded',
  'dateadded': 'dateAdded',
  'bookshelves': 'bookshelves',
  'bookshelves with positions': 'bookshelvesWithPositions',
  'bookshelveswithpositions': 'bookshelvesWithPositions',
  'exclusive shelf': 'exclusiveShelf',
  'exclusiveshelf': 'exclusiveShelf',
  'my review': 'myReview',
  'myreview': 'myReview',
  'spoiler': 'spoiler',
  'private notes': 'privateNotes',
  'privatenotes': 'privateNotes',
  'read count': 'readCount',
  'readcount': 'readCount',
  'owned copies': 'ownedCopies',
  'ownedcopies': 'ownedCopies',
};

/**
 * Low-level RFC 4180 character-by-character CSV parser.
 * Returns a 2D array of string cells without any external dependencies.
 */
export function parseCsv(csvContent: string): string[][] {
  if (!csvContent) return [];

  const text = stripBom(csvContent);
  if (!text || text.trim() === '') return [];

  const rows: string[][] = [];
  let currentRow: string[] = [];
  let currentField = '';
  let inQuotes = false;
  let afterQuote = false;
  let i = 0;
  const len = text.length;

  while (i < len) {
    const char = text[i];

    if (inQuotes) {
      if (char === '"') {
        if (i + 1 < len && text[i + 1] === '"') {
          // Escaped quote ("") -> unescape to single quote
          currentField += '"';
          i += 2;
          continue;
        } else {
          // Closing quote
          inQuotes = false;
          afterQuote = true;
          i++;
          continue;
        }
      } else {
        // Character inside quotes: consume literally (newlines, commas, spaces)
        currentField += char;
        i++;
        continue;
      }
    }

    if (afterQuote) {
      if (char === ' ' || char === '\t') {
        // Whitespace padding between closing quote and delimiter
        i++;
        continue;
      } else if (char === ',') {
        currentRow.push(currentField);
        currentField = '';
        afterQuote = false;
        i++;
        continue;
      } else if (char === '\r' || char === '\n') {
        currentRow.push(currentField);
        currentField = '';
        rows.push(currentRow);
        currentRow = [];
        afterQuote = false;

        if (char === '\r' && i + 1 < len && text[i + 1] === '\n') {
          i += 2;
        } else {
          i++;
        }
        continue;
      } else {
        // Tolerant parsing of unescaped quotes or sloppy trailing content
        currentField += char;
        afterQuote = false;
        i++;
        continue;
      }
    }

    // Not inside quotes and not immediately after quote
    if (char === '"') {
      if (currentField.length === 0) {
        // Opening quote
        inQuotes = true;
        i++;
        continue;
      } else {
        // Mid-field quote (e.g. ="0143127748" or 12" Vinyl)
        currentField += '"';
        i++;
        continue;
      }
    } else if (char === ',') {
      currentRow.push(currentField);
      currentField = '';
      i++;
      continue;
    } else if (char === '\r' || char === '\n') {
      // Check for empty line between records
      if (currentRow.length === 0 && currentField === '') {
        if (char === '\r' && i + 1 < len && text[i + 1] === '\n') {
          i += 2;
        } else {
          i++;
        }
        continue;
      }

      currentRow.push(currentField);
      currentField = '';
      rows.push(currentRow);
      currentRow = [];

      if (char === '\r' && i + 1 < len && text[i + 1] === '\n') {
        i += 2;
      } else {
        i++;
      }
      continue;
    } else {
      currentField += char;
      i++;
      continue;
    }
  }

  // End of file flush
  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    rows.push(currentRow);
  }

  // Clean trailing blank rows
  while (rows.length > 0 && rows[rows.length - 1].length === 1 && rows[rows.length - 1][0] === '') {
    rows.pop();
  }

  return rows;
}

/**
 * Parses Goodreads CSV export text into typed GoodreadsRawRow records.
 * Supports dual-access via camelCase properties and raw CSV header names.
 */
export function parseGoodreadsCsv(csvContent: string): GoodreadsRawRow[] {
  const rows = parseCsv(csvContent);
  if (rows.length < 2) return [];

  const rawHeaders = rows[0].map((h) => h.trim());
  const mappedKeys: (string | undefined)[] = rawHeaders.map((header) => {
    const lower = header.toLowerCase();
    const mapped = GOODREADS_HEADER_MAP[lower];
    if (mapped) return String(mapped);
    return toCamelCase(header);
  });

  const records: GoodreadsRawRow[] = [];

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];

    // Skip blank rows where all cells are empty
    const isAllEmpty = row.every((cell) => !cell || cell.trim() === '');
    if (isAllEmpty) continue;

    const rowObj: GoodreadsRawRow = {
      title: '',
      author: '',
    };

    for (let c = 0; c < rawHeaders.length; c++) {
      const rawHeader = rawHeaders[c];
      const mappedKey = mappedKeys[c];
      let val = row[c] !== undefined ? row[c] : '';

      // Strip Excel formula wrapping from ISBN columns if present
      if (
        mappedKey === 'isbn' ||
        mappedKey === 'isbn13' ||
        rawHeader.toUpperCase() === 'ISBN' ||
        rawHeader.toUpperCase() === 'ISBN13'
      ) {
        val = unescapeExcelFormula(val);
      }

      if (mappedKey) {
        rowObj[mappedKey] = val;
      }
      if (rawHeader) {
        rowObj[rawHeader] = val;
      }
    }

    if (rowObj.title === undefined) rowObj.title = '';
    if (rowObj.author === undefined) rowObj.author = '';

    records.push(rowObj);
  }

  return records;
}
