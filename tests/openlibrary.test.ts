import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  OpenLibraryProvider,
  cleanOpenLibraryKey,
  pickOpenLibraryDescription,
  extractOpenLibraryCoverUrl,
} from '../src/providers/openlibrary';
import { requestUrl } from 'obsidian';

describe('OpenLibrary Provider Suite (OpenLibraryProvider)', () => {
  let provider: OpenLibraryProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenLibraryProvider();
  });

  describe('Key Normalization & Formatting Helpers', () => {
    it('normalizes full URLs to clean OpenLibrary paths', () => {
      expect(
        cleanOpenLibraryKey('https://openlibrary.org/works/OL893414W.json')
      ).toBe('/works/OL893414W');
      expect(
        cleanOpenLibraryKey('https://openlibrary.org/books/OL7353617M/')
      ).toBe('/books/OL7353617M');
      expect(
        cleanOpenLibraryKey('http://openlibrary.org/authors/OL79034A')
      ).toBe('/authors/OL79034A');
    });

    it('formats raw OLID identifiers with proper path prefix', () => {
      expect(cleanOpenLibraryKey('OL893414W')).toBe('/works/OL893414W');
      expect(cleanOpenLibraryKey('ol893414w')).toBe('/works/OL893414W');
      expect(cleanOpenLibraryKey('OL7353617M')).toBe('/books/OL7353617M');
      expect(cleanOpenLibraryKey('OL79034A')).toBe('/authors/OL79034A');
    });

    it('formats ISBN strings into /isbn/ paths', () => {
      expect(cleanOpenLibraryKey('978-0441172719')).toBe('/isbn/9780441172719');
      expect(cleanOpenLibraryKey('0441172717')).toBe('/isbn/0441172717');
    });

    it('handles empty or whitespace strings safely', () => {
      expect(cleanOpenLibraryKey('')).toBe('');
      expect(cleanOpenLibraryKey('   ')).toBe('');
    });

    it('extracts text from various OpenLibrary description structures', () => {
      expect(pickOpenLibraryDescription('A classic sci-fi novel.')).toBe(
        'A classic sci-fi novel.'
      );
      expect(
        pickOpenLibraryDescription({ type: '/type/text', value: 'Rich synopsis.' })
      ).toBe('Rich synopsis.');
      expect(pickOpenLibraryDescription(undefined)).toBeUndefined();
      expect(pickOpenLibraryDescription('')).toBeUndefined();
      expect(pickOpenLibraryDescription({ value: '   ' })).toBeUndefined();
    });

    it('constructs correct image URL from cover ID', () => {
      expect(extractOpenLibraryCoverUrl(980253)).toBe(
        'https://covers.openlibrary.org/b/id/980253-L.jpg'
      );
      expect(extractOpenLibraryCoverUrl(0)).toBeUndefined();
      expect(extractOpenLibraryCoverUrl(-1)).toBeUndefined();
      expect(extractOpenLibraryCoverUrl(undefined)).toBeUndefined();
    });
  });

  describe('OpenLibraryProvider.search', () => {
    it('returns empty array when query is empty or whitespace', async () => {
      const results = await provider.search('   ');
      expect(results).toEqual([]);
      expect(requestUrl).not.toHaveBeenCalled();
    });

    it('executes search query and parses search docs correctly', async () => {
      const mockSearchData = {
        numFound: 1,
        docs: [
          {
            key: '/works/OL893414W',
            title: 'Dune',
            author_name: ['Frank Herbert'],
            publisher: ['Chilton Books', 'Berkley'],
            first_publish_year: 1965,
            cover_i: 980253,
            isbn: ['9780441172719', '0441172717'],
            number_of_pages_median: 608,
            ratings_average: 4.303,
            ratings_count: 448,
            language: ['eng'],
          },
        ],
      };

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: mockSearchData,
      });

      const results = await provider.search('dune');

      expect(requestUrl).toHaveBeenCalledTimes(1);
      const reqParam = (requestUrl as any).mock.calls[0][0];
      expect(reqParam.url).toContain('/search.json?q=dune');

      expect(results).toHaveLength(1);
      const item = results[0];
      expect(item.id).toBe('/works/OL893414W');
      expect(item.title).toBe('Dune');
      expect(item.author).toBe('Frank Herbert');
      expect(item.publisher).toBe('Chilton Books');
      expect(item.coverUrl).toBe('https://covers.openlibrary.org/b/id/980253-L.jpg');
      expect(item.rating).toBe(4.3);
      expect(item.isbn).toBe('9780441172719');
      expect(item.provider).toBe('openlibrary');
      expect(item.providers).toEqual(['openlibrary']);
      expect(item.sources?.openlibrary).toBeDefined();
    });

    it('normalizes formatted ISBN when querying search', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: { docs: [] },
      });

      await provider.search('isbn: 978-0441-172719');

      const reqParam = (requestUrl as any).mock.calls[0][0];
      expect(reqParam.url).toContain('q=9780441172719');
    });

    it('gracefully handles network errors during search', async () => {
      (requestUrl as any).mockRejectedValueOnce(new Error('Network timeout'));
      const results = await provider.search('Foundation');
      expect(results).toEqual([]);
    });

    it('handles search response with missing or corrupt docs', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: { docs: null },
      });
      const results = await provider.search('Foundation');
      expect(results).toEqual([]);
    });
  });

  describe('OpenLibraryProvider.getBookDetails', () => {
    it('throws an error for empty or invalid input', async () => {
      await expect(provider.getBookDetails('')).rejects.toThrow(
        'Geçersiz OpenLibrary kitap bağlantısı veya ID.'
      );
      await expect(provider.getBookDetails('   ')).rejects.toThrow(
        'Geçersiz OpenLibrary kitap bağlantısı veya ID.'
      );
    });

    it('fetches and parses work details from /works/ key and enriches with search data', async () => {
      const mockWorkJson = {
        key: '/works/OL893414W',
        title: 'Dune',
        description: 'Set on the desert planet Arrakis...',
        covers: [980253],
        subjects: ['Science fiction', 'Ecology', 'Dune'],
        authors: [{ author: { key: '/authors/OL79034A' } }],
        first_publish_date: '1965',
      };

      const mockAuthorJson = {
        key: '/authors/OL79034A',
        name: 'Frank Herbert',
      };

      const mockSearchEnrichment = {
        docs: [
          {
            publisher: ['Chilton'],
            isbn: ['9780441172719'],
            number_of_pages_median: 608,
            ratings_average: 4.3,
            ratings_count: 500,
            language: ['eng'],
          },
        ],
      };

      // Mock sequence:
      // 1. /works/OL893414W.json
      // 2. /authors/OL79034A.json
      // 3. /search.json?q=key...
      (requestUrl as any)
        .mockResolvedValueOnce({
          status: 200,
          json: mockWorkJson,
        })
        .mockResolvedValueOnce({
          status: 200,
          json: mockAuthorJson,
        })
        .mockResolvedValueOnce({
          status: 200,
          json: mockSearchEnrichment,
        });

      const metadata = await provider.getBookDetails('/works/OL893414W');

      expect(metadata.id).toBe('/works/OL893414W');
      expect(metadata.title).toBe('Dune');
      expect(metadata.author).toBe('Frank Herbert');
      expect(metadata.publisher).toBe('Chilton');
      expect(metadata.isbn).toBe('9780441172719');
      expect(metadata.pages).toBe(608);
      expect(metadata.publishDate).toBe('1965');
      expect(metadata.coverUrl).toBe('https://covers.openlibrary.org/b/id/980253-L.jpg');
      expect(metadata.description).toBe('Set on the desert planet Arrakis...');
      expect(metadata.rating).toBe(4.3);
      expect(metadata.ratingCount).toBe(500);
      expect(metadata.genres).toEqual(['Science fiction', 'Ecology', 'Dune']);
      expect(metadata.language).toBe('ENG');
      expect(metadata.provider).toBe('openlibrary');
    });

    it('fetches and parses edition details from /books/ key', async () => {
      const mockEditionJson = {
        key: '/books/OL7353617M',
        title: 'Fantastic Mr. Fox',
        publishers: ['Puffin'],
        publish_date: 'October 1, 1988',
        number_of_pages: 96,
        isbn_13: ['9780140328721'],
        covers: [15152634],
        description: 'Boggis and Bunce and Bean...',
        authors: [{ key: '/authors/OL34184A' }],
        subjects: ['Childrens', 'Animals'],
        languages: [{ key: '/languages/eng' }],
      };

      const mockAuthorJson = {
        name: 'Roald Dahl',
      };

      (requestUrl as any)
        .mockResolvedValueOnce({
          status: 200,
          json: mockEditionJson,
        })
        .mockResolvedValueOnce({
          status: 200,
          json: mockAuthorJson,
        });

      const metadata = await provider.getBookDetails('/books/OL7353617M');

      expect(metadata.id).toBe('/books/OL7353617M');
      expect(metadata.title).toBe('Fantastic Mr. Fox');
      expect(metadata.author).toBe('Roald Dahl');
      expect(metadata.publisher).toBe('Puffin');
      expect(metadata.pages).toBe(96);
      expect(metadata.publishDate).toBe('October 1, 1988');
      expect(metadata.isbn).toBe('9780140328721');
      expect(metadata.coverUrl).toBe('https://covers.openlibrary.org/b/id/15152634-L.jpg');
      expect(metadata.description).toBe('Boggis and Bunce and Bean...');
      expect(metadata.genres).toEqual(['Childrens', 'Animals']);
      expect(metadata.language).toBe('ENG');
      expect(metadata.provider).toBe('openlibrary');
    });

    it('fetches details when input is an ISBN', async () => {
      const mockIsbnEditionJson = {
        key: '/books/OL7353617M',
        title: 'Fantastic Mr. Fox',
        publishers: ['Puffin Books'],
        number_of_pages: 96,
        isbn_13: ['9780140328721'],
      };

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: mockIsbnEditionJson,
      });

      const metadata = await provider.getBookDetails('978-0140328721');

      expect(metadata.id).toBe('/isbn/9780140328721');
      expect(metadata.title).toBe('Fantastic Mr. Fox');
      expect(metadata.publisher).toBe('Puffin Books');
      expect(metadata.pages).toBe(96);
      expect(metadata.isbn).toBe('9780140328721');
    });
  });
});
