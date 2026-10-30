/**
 * obsidian-kitap - Goodreads Duplicate Detection & Pre-Import Partitioning Engine
 * Multi-strategy deduplication:
 *   1. Direct and converted ISBN matching (O(1) in-memory index)
 *   2. Series-stripped, Turkish diacritic-normalized Title + Author token matching
 *   3. Strict author conflict protection to eliminate false positives
 * Zero external runtime dependencies. Zero `: any` or `as any` casts.
 */

import type {
  ParsedGoodreadsBook,
  ExistingVaultBook,
  DuplicateScanResult,
  DuplicateMatchReason,
  ExistingBookMatch,
} from './types';
import {
  cleanIsbn,
  isIsbn,
  getAlternateIsbn,
  normalizeTitle,
  areAuthorsMatching,
} from '../providers/matcher';
import { cleanBookTitle, cleanGoodreadsIsbn } from './mapper';
import { cleanWikilink } from '../card/types';

/**
 * Strips Goodreads series information in parentheses/brackets from book titles.
 * Preserves non-series parenthetical subtitles (e.g. "(General Edition)").
 */
export function stripSeriesInfo(title?: string | null): string {
  if (!title || typeof title !== 'string') return '';
  const trimmed = title.trim();
  if (!trimmed) return '';

  // 1. Check cleanBookTitle from mapper (M1 compatibility)
  const fromMapper = cleanBookTitle(trimmed);
  if (fromMapper.seriesTitle && fromMapper.cleanTitle) {
    return fromMapper.cleanTitle;
  }

  // 2. Extended series pattern:
  // Matches parenthesized or bracketed suffixes that explicitly contain series indicators:
  // e.g. #\d+, Book(s) \d+, Vol(ume(s)|\.)? \d+, Part(s) \d+
  // Also supports ranges like #1-3 or #1–3
  const seriesPattern =
    /\s*[([][^()[\]]*?(?:#\d+|Books?\s+\d+|Vol(?:umes?|\.)?\s+\d+|Parts?\s+\d+)(?:[-–—]\d+)?[^()[\]]*?[)\]]\s*$/i;
  const match = trimmed.match(seriesPattern);
  if (match && match.index !== undefined && match.index > 0) {
    return trimmed.slice(0, match.index).trim();
  }

  return trimmed;
}

/**
 * Normalizes book title for duplicate matching:
 * Strips series info, physical format tags, punctuation, and Turkish diacritics.
 */
export function normalizeTitleForMatching(title?: string | null): string {
  if (!title || typeof title !== 'string') return '';
  const stripped = stripSeriesInfo(title);
  const normalized = normalizeTitle(stripped);
  return normalized.replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parses Title and Author from filename basename when frontmatter is absent.
 */
export function extractTitleAndAuthorFromBasename(basename: string): {
  title: string;
  author?: string;
} {
  if (!basename || typeof basename !== 'string') {
    return { title: '' };
  }
  const clean = basename.trim();
  const parts = clean.split(/\s+[-–—]\s+/);
  if (parts.length >= 2) {
    return {
      title: parts[0].trim(),
      author: parts.slice(1).join(' - ').trim(),
    };
  }
  return { title: clean };
}

/**
 * Internal index structure holding pre-indexed vault book records for O(1) lookups.
 */
export interface VaultIndices {
  isbnIndex: Map<string, ExistingVaultBook>;
  titleIndex: Map<string, ExistingVaultBook[]>;
  directVaultIsbns: Set<string>; // key: `${book.path}::${cleanIsbn}`
}

/**
 * Extracts all clean, valid direct ISBNs present in a vault book note.
 */
export function extractDirectVaultIsbns(book: ExistingVaultBook): string[] {
  const result = new Set<string>();

  const addIfValid = (rawVal: unknown) => {
    if (typeof rawVal !== 'string' && typeof rawVal !== 'number') return;
    const clean = cleanIsbn(String(rawVal));
    if (isIsbn(clean)) {
      result.add(clean);
    }
  };

  // 1. Check frontmatter properties
  if (book.frontmatter && typeof book.frontmatter === 'object') {
    const fm = book.frontmatter;
    for (const key of ['isbn', 'isbn13', 'isbn10', 'ISBN', 'ISBN13', 'ISBN10', 'barkod', 'barcode']) {
      addIfValid(fm[key]);
    }
  }

  // 2. Fall back to explicit fields on ExistingVaultBook if frontmatter had no valid ISBN
  if (result.size === 0) {
    addIfValid(book.isbn13);
    addIfValid(book.isbn10);
  }

  return Array.from(result);
}

/**
 * Extracts all clean, valid direct ISBNs present in the original CSV row.
 */
export function extractDirectCsvIsbns(csvBook: ParsedGoodreadsBook): string[] {
  const result = new Set<string>();

  const addIfValid = (rawVal?: string | null) => {
    if (!rawVal) return;
    const clean = cleanGoodreadsIsbn(rawVal);
    if (isIsbn(clean)) {
      result.add(clean);
    }
  };

  addIfValid(csvBook.raw?.isbn13);
  addIfValid(csvBook.raw?.isbn);
  addIfValid(csvBook.metadata?.isbn);

  // Fallback to mapped fields if raw/metadata had no valid ISBN
  if (result.size === 0) {
    if (csvBook.isbn13 && isIsbn(cleanIsbn(csvBook.isbn13))) {
      result.add(cleanIsbn(csvBook.isbn13));
    }
    if (csvBook.isbn10 && isIsbn(cleanIsbn(csvBook.isbn10))) {
      result.add(cleanIsbn(csvBook.isbn10));
    }
  }

  return Array.from(result);
}

/**
 * Builds dual in-memory lookup indices for vault notes in O(V) time.
 */
export function buildVaultIndices(vaultBooks: ExistingVaultBook[]): VaultIndices {
  const isbnIndex = new Map<string, ExistingVaultBook>();
  const titleIndex = new Map<string, ExistingVaultBook[]>();
  const directVaultIsbns = new Set<string>();

  const alternateCandidates: Array<{ altIsbn: string; book: ExistingVaultBook }> = [];

  // Pass 1: Index direct ISBNs and titles
  for (const book of vaultBooks) {
    const directIsbns = extractDirectVaultIsbns(book);

    for (const isbn of directIsbns) {
      directVaultIsbns.add(`${book.path}::${isbn}`);
      if (!isbnIndex.has(isbn)) {
        isbnIndex.set(isbn, book);
      }

      const alt = getAlternateIsbn(isbn);
      if (alt && isIsbn(alt) && alt !== isbn) {
        alternateCandidates.push({ altIsbn: alt, book });
      }
    }

    // Index title and file basename
    const candidateVaultTitles = new Set<string>();
    if (book.title && book.title.trim()) {
      candidateVaultTitles.add(book.title.trim());
    }
    if (book.file?.basename && book.file.basename.trim()) {
      candidateVaultTitles.add(book.file.basename.trim());
    }

    for (const rawTitle of candidateVaultTitles) {
      const clean = cleanWikilink(rawTitle).trim();
      if (!clean) continue;

      const norm = normalizeTitleForMatching(clean);
      if (norm) {
        let list = titleIndex.get(norm);
        if (!list) {
          list = [];
          titleIndex.set(norm, list);
        }
        if (!list.some((b) => b.path === book.path)) {
          list.push(book);
        }
      }

      // If title is in "Title - Author" format, also index the sub-title
      const { title: subTitle } = extractTitleAndAuthorFromBasename(clean);
      if (subTitle && subTitle !== clean) {
        const normSub = normalizeTitleForMatching(subTitle);
        if (normSub && normSub !== norm) {
          let subList = titleIndex.get(normSub);
          if (!subList) {
            subList = [];
            titleIndex.set(normSub, subList);
          }
          if (!subList.some((b) => b.path === book.path)) {
            subList.push(book);
          }
        }
      }
    }
  }

  // Pass 2: Index alternate converted ISBNs without overriding direct entries
  for (const { altIsbn, book } of alternateCandidates) {
    if (!isbnIndex.has(altIsbn)) {
      isbnIndex.set(altIsbn, book);
    }
  }

  return { isbnIndex, titleIndex, directVaultIsbns };
}

/**
 * Evaluates whether authors match, conflict, or lack sufficient data.
 */
export function evaluateAuthorMatch(
  csvBook: ParsedGoodreadsBook,
  vaultBook: ExistingVaultBook,
  normTitle: string
): 'match' | 'conflict' | 'no-author-match' {
  const csvAuthors = [
    csvBook.metadata?.author,
    csvBook.raw?.author,
    csvBook.raw?.authorLf,
    csvBook.raw?.additionalAuthors,
  ].filter((a): a is string => Boolean(a && a.trim() && a.trim() !== 'Bilinmeyen Yazar'));

  let vaultAuthor = cleanWikilink(vaultBook.author).trim();
  if (!vaultAuthor || vaultAuthor === 'Bilinmeyen Yazar') {
    const basename = vaultBook.file?.basename || '';
    const { author: extractedAuthor } = extractTitleAndAuthorFromBasename(basename);
    if (extractedAuthor) {
      vaultAuthor = extractedAuthor;
    }
  }

  const hasCsvAuthor = csvAuthors.length > 0;
  const hasVaultAuthor = Boolean(vaultAuthor && vaultAuthor !== 'Bilinmeyen Yazar');

  if (hasCsvAuthor && hasVaultAuthor) {
    const anyMatches = csvAuthors.some((ca) => areAuthorsMatching(ca, vaultAuthor));
    if (anyMatches) {
      return 'match';
    }
    // Explicit conflict: both sides provide authors, but they do NOT match!
    return 'conflict';
  }

  // Missing author on one or both sides: match only if title is distinctive (>= 8 chars)
  if (normTitle.length >= 8) {
    return 'match';
  }

  return 'no-author-match';
}

/**
 * Scans CSV books against existing vault books and cleanly partitions them into
 * new books and existing books with verified match reasons.
 *
 * @param csvBooks Parsed Goodreads books from CSV
 * @param vaultBooks Scanned existing books in the vault
 * @returns DuplicateScanResult separating newBooks from existingBooks
 */
export function detectDuplicates(
  csvBooks: ParsedGoodreadsBook[],
  vaultBooks: ExistingVaultBook[]
): DuplicateScanResult {
  const newBooks: ParsedGoodreadsBook[] = [];
  const existingBooks: ExistingBookMatch[] = [];

  if (!csvBooks || csvBooks.length === 0) {
    return { newBooks, existingBooks };
  }

  if (!vaultBooks || vaultBooks.length === 0) {
    return { newBooks: [...csvBooks], existingBooks };
  }

  const indices = buildVaultIndices(vaultBooks);

  for (const csvBook of csvBooks) {
    // 1. Try ISBN Match
    const directCsvIsbns = extractDirectCsvIsbns(csvBook);
    const candidateIsbns: string[] = [];

    for (const d of directCsvIsbns) {
      if (!candidateIsbns.includes(d)) candidateIsbns.push(d);
      const alt = getAlternateIsbn(d);
      if (alt && isIsbn(alt) && !candidateIsbns.includes(alt)) {
        candidateIsbns.push(alt);
      }
    }

    if (csvBook.isbn13) {
      const clean13 = cleanIsbn(csvBook.isbn13);
      if (isIsbn(clean13) && !candidateIsbns.includes(clean13)) {
        candidateIsbns.push(clean13);
      }
      const alt10 = getAlternateIsbn(clean13);
      if (alt10 && isIsbn(alt10) && !candidateIsbns.includes(alt10)) {
        candidateIsbns.push(alt10);
      }
    }
    if (csvBook.isbn10) {
      const clean10 = cleanIsbn(csvBook.isbn10);
      if (isIsbn(clean10) && !candidateIsbns.includes(clean10)) {
        candidateIsbns.push(clean10);
      }
      const alt13 = getAlternateIsbn(clean10);
      if (alt13 && isIsbn(alt13) && !candidateIsbns.includes(alt13)) {
        candidateIsbns.push(alt13);
      }
    }

    let isbnMatched = false;
    for (const cand of candidateIsbns) {
      const vaultBook = indices.isbnIndex.get(cand);
      if (vaultBook) {
        const isExact = directCsvIsbns.some((dIsbn) =>
          indices.directVaultIsbns.has(`${vaultBook.path}::${dIsbn}`)
        );
        const matchReason: DuplicateMatchReason = isExact
          ? 'isbn-exact'
          : 'isbn-converted';

        existingBooks.push({
          csvBook,
          existingNote: vaultBook,
          matchReason,
        });
        isbnMatched = true;
        break;
      }
    }

    if (isbnMatched) continue;

    // 2. Try Title + Author Fallback Match
    const candidateTitles = [
      csvBook.cleanTitle,
      csvBook.raw?.title,
      csvBook.metadata?.title,
    ].filter((t): t is string => Boolean(t && t.trim()));

    let titleMatched = false;
    for (const rawTitle of candidateTitles) {
      const normTitle = normalizeTitleForMatching(rawTitle);
      if (!normTitle) continue;

      const vaultCandidates = indices.titleIndex.get(normTitle);
      if (!vaultCandidates || vaultCandidates.length === 0) continue;

      let chosenCandidate: ExistingVaultBook | null = null;
      for (const cand of vaultCandidates) {
        const evalResult = evaluateAuthorMatch(csvBook, cand, normTitle);
        if (evalResult === 'match') {
          chosenCandidate = cand;
          break;
        }
      }

      if (chosenCandidate) {
        existingBooks.push({
          csvBook,
          existingNote: chosenCandidate,
          matchReason: 'title-author-normalized',
        });
        titleMatched = true;
        break;
      }
    }

    if (titleMatched) continue;

    // 3. Unmatched -> New Book
    newBooks.push(csvBook);
  }

  return { newBooks, existingBooks };
}
