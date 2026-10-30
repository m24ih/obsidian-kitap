/**
 * obsidian-kitap - Goodreads Import & Migration Data Contracts
 * Strict TypeScript models with ZERO runtime dependencies and ZERO `: any` / `as any`.
 */

import type { TFile } from 'obsidian';
import type { BookMetadata } from '../types';

/**
 * Raw parsed row directly from goodreads_library_export.csv.
 * Provides typed access to standard Goodreads columns (in camelCase)
 * while allowing index access for original column names or legacy headers.
 */
export interface GoodreadsRawRow {
  bookId?: string;
  title: string;
  author: string;
  authorLf?: string;
  additionalAuthors?: string;
  isbn?: string;
  isbn13?: string;
  myRating?: string;
  averageRating?: string;
  publisher?: string;
  binding?: string;
  numberOfPages?: string;
  yearPublished?: string;
  originalPublicationYear?: string;
  dateRead?: string;
  dateAdded?: string;
  bookshelves?: string;
  bookshelvesWithPositions?: string;
  exclusiveShelf?: string;
  myReview?: string;
  spoiler?: string;
  privateNotes?: string;
  readCount?: string;
  ownedCopies?: string;
  [key: string]: string | undefined;
}

/**
 * Normalized and mapped Goodreads book entity ready for note generation or duplicate matching.
 */
export interface ParsedGoodreadsBook {
  /** Original raw parsed row */
  raw: GoodreadsRawRow;
  /** Complete BookMetadata compatible with noteBuilder and templates */
  metadata: BookMetadata;
  /** Normalized 10-digit ISBN (if present or calculable) */
  isbn10?: string;
  /** Normalized 13-digit ISBN (if present or calculable) */
  isbn13?: string;
  /** Title stripped of (Series Name, #N) and format tags for duplicate matching */
  cleanTitle: string;
  /** Series title and volume number if parsed from title */
  seriesTitle?: string;
  /** User's personal rating (1-5), or undefined if unrated (Goodreads "0") */
  userRating?: number;
  /** ISO 8601 formatted read date: YYYY-MM-DD */
  dateReadIso?: string;
  /** ISO 8601 formatted added date: YYYY-MM-DD */
  dateAddedIso?: string;
  /** Mapped Turkish reading status (e.g. "Okundu", "Okunuyor", "Okunacak") */
  readingStatus: string;
  /** Sanitized review content converted from Goodreads HTML to clean Markdown */
  reviewMarkdown?: string;
}

/**
 * An existing book note detected in the Obsidian vault.
 */
export interface ExistingVaultBook {
  /** Obsidian TFile handle */
  file: TFile;
  /** Vault relative path (e.g. "Kitaplar/Dune - Frank Herbert.md") */
  path: string;
  /** Book title extracted from frontmatter or filename */
  title: string;
  /** Book author extracted from frontmatter or filename */
  author: string;
  /** Extracted or normalized ISBN-10 from frontmatter */
  isbn10?: string;
  /** Extracted or normalized ISBN-13 from frontmatter */
  isbn13?: string;
  /** Complete frontmatter key-value record */
  frontmatter: Record<string, unknown>;
}

/**
 * Classification match reasons for vault duplicate detection.
 */
export type DuplicateMatchReason =
  | 'isbn-exact'
  | 'isbn-converted'
  | 'title-author-normalized';

/**
 * Association between a CSV book and an existing vault note.
 */
export interface ExistingBookMatch {
  csvBook: ParsedGoodreadsBook;
  existingNote: ExistingVaultBook;
  matchReason: DuplicateMatchReason;
}

/**
 * Partitioned duplicate scan result separating new imports from existing notes.
 */
export interface DuplicateScanResult {
  /** Books with no matching record in the vault */
  newBooks: ParsedGoodreadsBook[];
  /** Books that already exist in the vault with their match details */
  existingBooks: ExistingBookMatch[];
}

/**
 * Progress callback reporting current progress to modal UI.
 */
export type ImportProgressCallback = (
  current: number,
  total: number,
  message: string
) => void;

/**
 * Options controlling import execution flow.
 */
export interface ImportOptions {
  /** Whether to update existing vault notes non-destructively */
  updateExisting: boolean;
  /** Whether to query active providers for missing covers and metadata */
  enrichFromProviders: boolean;
  /** Destination folder in the vault (defaults to settings.targetFolder) */
  targetFolder?: string;
  /** Optional UI progress reporting callback */
  onProgress?: ImportProgressCallback;
  /** Abort signal for cancelling import mid-way */
  abortSignal?: AbortSignal;
}

/**
 * Itemized failure report for import or update.
 */
export interface ImportErrorItem {
  title: string;
  error: string;
}

/**
 * Overall import execution statistics and outcome.
 */
export interface ImportResult {
  importedCount: number;
  updatedCount: number;
  skippedCount?: number;
  errors: ImportErrorItem[];
}

/**
 * Non-destructive frontmatter update result.
 */
export interface FrontmatterUpdateResult {
  updatedContent: string;
  changed: boolean;
}
