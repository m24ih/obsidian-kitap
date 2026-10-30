/**
 * obsidian-kitap - Vault Book Scanner
 * Scans markdown notes in the Obsidian vault using fast-path metadataCache
 * with resilient batch fallback to vault.read + parseYaml.
 * Zero external runtime dependencies. Zero `: any` or `as any` casts.
 */

import type { App, TFile } from 'obsidian';
import { parseYaml } from 'obsidian';
import type { PropertyMappingData } from '../types';
import { PropertyMappingOption } from '../settings/propertyMapping';
import type { ExistingVaultBook } from './types';
import { cleanIsbn, isIsbn, getAlternateIsbn } from '../providers/matcher';
import { cleanWikilink } from '../card/types';

export type BookPropertyMapping = PropertyMappingData;

export interface ExtractedIsbns {
  isbn10?: string;
  isbn13?: string;
}

/**
 * Resolves user remapped property key for a canonical frontmatter key.
 */
export function getEffectiveKey(
  canonical: string,
  propertyMappings?: BookPropertyMapping[]
): string | undefined {
  if (!propertyMappings || propertyMappings.length === 0) return undefined;
  const found = propertyMappings.find((m) => m.property === canonical);
  if (found && found.mapping === PropertyMappingOption.Map && found.newProperty?.trim()) {
    return found.newProperty.trim();
  }
  return undefined;
}

/**
 * Checks whether a given file path is located inside the specified target folder.
 * Returns true if targetFolder is empty, root, or matching.
 */
export function isInTargetFolder(filePath: string, targetFolder?: string): boolean {
  if (!targetFolder) return true;
  const normFolder = targetFolder.replace(/\\/g, '/').replace(/^\/+|\/+$/g, '').trim();
  if (!normFolder || normFolder === '.' || normFolder === '/') return true;

  const normPath = filePath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  return normPath.startsWith(normFolder + '/') || normPath === normFolder;
}

/**
 * Safely parses YAML frontmatter from raw markdown content without throwing.
 */
export function extractFrontmatter(content: string): Record<string, unknown> {
  if (!content || typeof content !== 'string') return {};
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match || !match[1]) return {};
  try {
    const parsed: unknown = parseYaml(match[1]);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      const cleaned: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        if (k.trim()) {
          cleaned[k.trim()] = v;
        }
      }
      return cleaned;
    }
  } catch {
    // Malformed YAML — safely fall back to empty record
  }
  return {};
}

/**
 * Extracts title from frontmatter keys or falls back to file basename.
 */
export function extractTitleFromFrontmatter(
  frontmatter: Record<string, unknown>,
  basename: string,
  propertyMappings?: BookPropertyMapping[]
): string {
  const customKey = getEffectiveKey('baslik', propertyMappings);
  const candidateKeys = [
    ...(customKey ? [customKey] : []),
    'baslik',
    'title',
    'name',
    'kitap_adi',
    'kitap',
    'book',
  ];

  for (const key of candidateKeys) {
    const val = frontmatter[key];
    if (val !== undefined && val !== null) {
      const str = cleanWikilink(val).trim();
      if (str.length > 0) return str;
    }
  }

  return basename || '';
}

/**
 * Extracts author from frontmatter keys, handling strings, arrays, and wikilinks.
 */
export function extractAuthorFromFrontmatter(
  frontmatter: Record<string, unknown>,
  propertyMappings?: BookPropertyMapping[]
): string {
  const customKey = getEffectiveKey('yazar', propertyMappings);
  const candidateKeys = [
    ...(customKey ? [customKey] : []),
    'yazar',
    'author',
    'authors',
    'yazarlar',
    'yazar_adi',
    'writer',
  ];

  for (const key of candidateKeys) {
    const val = frontmatter[key];
    if (val !== undefined && val !== null) {
      const str = cleanWikilink(val).trim();
      if (str.length > 0) return str;
    }
  }

  return '';
}

/**
 * Extracts and normalizes ISBN-10 and ISBN-13 from frontmatter keys,
 * computing complementary representations via getAlternateIsbn.
 */
export function extractIsbnsFromFrontmatter(
  frontmatter: Record<string, unknown>,
  propertyMappings?: BookPropertyMapping[]
): ExtractedIsbns {
  const customKey = getEffectiveKey('isbn', propertyMappings);

  const raw13: unknown =
    frontmatter['isbn13'] ??
    frontmatter['isbn_13'] ??
    frontmatter['isbn-13'] ??
    frontmatter['ISBN13'];

  const raw10: unknown =
    frontmatter['isbn10'] ??
    frontmatter['isbn_10'] ??
    frontmatter['isbn-10'] ??
    frontmatter['ISBN10'];

  const genericKeys = [
    ...(customKey ? [customKey] : []),
    'isbn',
    'ISBN',
    'barkod',
    'barcode',
  ];

  let rawGeneric: unknown;
  for (const k of genericKeys) {
    if (frontmatter[k] !== undefined && frontmatter[k] !== null && frontmatter[k] !== '') {
      rawGeneric = frontmatter[k];
      break;
    }
  }

  let clean13 = cleanIsbn(
    typeof raw13 === 'number' || typeof raw13 === 'string' ? String(raw13) : ''
  );
  let clean10 = cleanIsbn(
    typeof raw10 === 'number' || typeof raw10 === 'string' ? String(raw10) : ''
  );

  if (clean13.length !== 13 || !isIsbn(clean13)) clean13 = '';
  if (clean10.length !== 10 || !isIsbn(clean10)) clean10 = '';

  if (typeof rawGeneric === 'string' || typeof rawGeneric === 'number') {
    const genericClean = cleanIsbn(String(rawGeneric));
    if (genericClean.length === 13 && isIsbn(genericClean) && !clean13) {
      clean13 = genericClean;
    } else if (genericClean.length === 10 && isIsbn(genericClean) && !clean10) {
      clean10 = genericClean;
    }
  }

  // Cross-compute complementary ISBN representations
  if (clean13 && !clean10) {
    const alt10 = getAlternateIsbn(clean13);
    if (alt10 && isIsbn(alt10)) clean10 = alt10;
  } else if (clean10 && !clean13) {
    const alt13 = getAlternateIsbn(clean10);
    if (alt13 && isIsbn(alt13)) clean13 = alt13;
  }

  return {
    ...(clean10 ? { isbn10: clean10 } : {}),
    ...(clean13 ? { isbn13: clean13 } : {}),
  };
}

/**
 * Assembles an ExistingVaultBook record from file handle and frontmatter.
 */
export function buildVaultBookRecord(
  file: TFile,
  frontmatter: Record<string, unknown>,
  propertyMappings?: BookPropertyMapping[]
): ExistingVaultBook {
  const basename = file.basename || file.name?.replace(/\.[^/.]+$/, '') || '';
  const title = extractTitleFromFrontmatter(frontmatter, basename, propertyMappings);
  const author = extractAuthorFromFrontmatter(frontmatter, propertyMappings);
  const { isbn10, isbn13 } = extractIsbnsFromFrontmatter(frontmatter, propertyMappings);

  return {
    file,
    path: file.path,
    title,
    author,
    ...(isbn10 ? { isbn10 } : {}),
    ...(isbn13 ? { isbn13 } : {}),
    frontmatter,
  };
}

/**
 * Scans markdown notes in the Obsidian vault to identify existing book records.
 * Uses fast-path in-memory metadataCache, falling back gracefully to vault.read with
 * bounded concurrency (batch = 25) for unindexed files.
 *
 * @param app Obsidian App instance
 * @param targetFolder Optional folder to scope the scan (e.g. "Kitaplar"). If omitted, scans whole vault.
 * @param propertyMappings Optional user-configured property mappings from plugin settings.
 * @returns Promise resolving to an array of ExistingVaultBook objects.
 */
export async function scanVaultBooks(
  app: App,
  targetFolder?: string,
  propertyMappings?: BookPropertyMapping[]
): Promise<ExistingVaultBook[]> {
  if (!app || !app.vault) {
    return [];
  }

  const allMarkdownFiles = app.vault.getMarkdownFiles ? app.vault.getMarkdownFiles() : [];
  const targetFiles = allMarkdownFiles.filter((file) => {
    if (!file || !file.path) return false;
    return isInTargetFolder(file.path, targetFolder);
  });

  if (targetFiles.length === 0) {
    return [];
  }

  const results: (ExistingVaultBook | null)[] = new Array<ExistingVaultBook | null>(
    targetFiles.length
  ).fill(null);
  const uncachedIndices: number[] = [];

  // Pass 1: In-memory fast-path via metadataCache
  for (let idx = 0; idx < targetFiles.length; idx++) {
    const file = targetFiles[idx];
    const cache = app.metadataCache?.getFileCache ? app.metadataCache.getFileCache(file) : null;
    if (cache?.frontmatter && typeof cache.frontmatter === 'object') {
      results[idx] = buildVaultBookRecord(file, cache.frontmatter, propertyMappings);
    } else {
      uncachedIndices.push(idx);
    }
  }

  // Pass 2: Bounded concurrency batch disk reads for uncached files
  if (uncachedIndices.length > 0) {
    const BATCH_SIZE = 25;
    for (let i = 0; i < uncachedIndices.length; i += BATCH_SIZE) {
      const batchIndices = uncachedIndices.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batchIndices.map(async (idx) => {
          const file = targetFiles[idx];
          try {
            const content = await app.vault.read(file);
            const frontmatter = extractFrontmatter(content);
            results[idx] = buildVaultBookRecord(file, frontmatter, propertyMappings);
          } catch {
            results[idx] = buildVaultBookRecord(file, {}, propertyMappings);
          }
        })
      );
    }
  }

  return results.filter((b): b is ExistingVaultBook => b !== null);
}
