import type { App, TFile } from 'obsidian';
import type { BookMetadata, KitapPluginSettings } from '../../../src/types';
import type KitapPlugin from '../../../src/main';

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
  exclusiveShelf?: string;
  myReview?: string;
  readCount?: string;
  [key: string]: string | undefined;
}

export interface ParsedGoodreadsBook {
  raw: GoodreadsRawRow;
  metadata: BookMetadata;
  isbn10?: string;
  isbn13?: string;
  cleanTitle: string;
  seriesTitle?: string;
  userRating?: number;
  dateReadIso?: string;
  dateAddedIso?: string;
  readingStatus: string;
  reviewMarkdown?: string;
}

export interface ExistingVaultBook {
  file: TFile;
  path: string;
  title: string;
  author: string;
  isbn10?: string;
  isbn13?: string;
  frontmatter: Record<string, unknown>;
}

export interface DuplicateScanResult {
  newBooks: ParsedGoodreadsBook[];
  existingBooks: Array<{
    csvBook: ParsedGoodreadsBook;
    existingNote: ExistingVaultBook;
    matchReason: 'isbn-exact' | 'isbn-converted' | 'title-author-normalized';
  }>;
}

export interface ImportOptions {
  updateExisting: boolean;
  enrichFromProviders: boolean;
  targetFolder?: string;
  onProgress?: (current: number, total: number, message: string) => void;
  abortSignal?: AbortSignal;
}

export interface ImportResult {
  importedCount: number;
  updatedCount: number;
  errors: Array<{ title: string; error: string }>;
}
