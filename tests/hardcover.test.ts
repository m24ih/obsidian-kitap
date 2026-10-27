import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  HardcoverProvider,
  extractHardcoverSlugOrId,
  formatHardcoverAuthors,
} from '../src/providers/hardcover';
import { requestUrl } from 'obsidian';

describe('Hardcover Provider Suite (HardcoverProvider)', () => {
  let provider: HardcoverProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new HardcoverProvider('test_api_key_123');
  });

  describe('Hardcover Slug & Author Helpers', () => {
    it('extracts ID, slug, or ISBN from various inputs', () => {
      expect(extractHardcoverSlugOrId('12345')).toEqual({ id: 12345 });
      expect(extractHardcoverSlugOrId('hardcover:67890')).toEqual({ id: 67890 });
      expect(
        extractHardcoverSlugOrId('https://hardcover.app/books/project-hail-mary')
      ).toEqual({ slug: 'project-hail-mary' });
      expect(
        extractHardcoverSlugOrId('https://hardcover.app/books/99999')
      ).toEqual({ id: 99999 });
      expect(extractHardcoverSlugOrId('978-0593135203')).toEqual({
        isbn: '9780593135203',
      });
      expect(extractHardcoverSlugOrId('dune')).toEqual({ slug: 'dune' });
      expect(extractHardcoverSlugOrId('')).toEqual({});
      expect(extractHardcoverSlugOrId('   ')).toEqual({});
    });

    it('formats authors from contributions and cached structures', () => {
      const contributions = [
        { author: { name: 'Andy Weir' } },
        { author: { name: 'Ray Porter' } },
      ];
      expect(formatHardcoverAuthors(contributions)).toBe('Andy Weir, Ray Porter');

      const cachedObjects = [{ name: 'Frank Herbert' }];
      expect(formatHardcoverAuthors(undefined, cachedObjects)).toBe('Frank Herbert');

      const cachedStrings = ['Isaac Asimov'];
      expect(formatHardcoverAuthors(undefined, cachedStrings)).toBe('Isaac Asimov');

      expect(formatHardcoverAuthors(undefined, undefined)).toBe('');
    });
  });

  describe('API Key Lifecycle', () => {
    it('initializes with static API key', () => {
      const p = new HardcoverProvider('key_abc');
      expect(p.getApiKey()).toBe('key_abc');
    });

    it('initializes with dynamic API key getter', () => {
      let dynamicKey = 'key_1';
      const p = new HardcoverProvider(() => dynamicKey);
      expect(p.getApiKey()).toBe('key_1');
      dynamicKey = 'key_2';
      expect(p.getApiKey()).toBe('key_2');
    });

    it('updates API key via setApiKey', () => {
      provider.setApiKey('updated_key_999');
      expect(provider.getApiKey()).toBe('updated_key_999');
    });
  });

  describe('HardcoverProvider.search', () => {
    it('returns empty array when query is empty or whitespace', async () => {
      const results = await provider.search('   ');
      expect(results).toEqual([]);
      expect(requestUrl).not.toHaveBeenCalled();
    });

    it('warns and returns empty array when API key is missing', async () => {
      const noKeyProvider = new HardcoverProvider('');
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const results = await noKeyProvider.search('Project Hail Mary');

      expect(results).toEqual([]);
      expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('API anahtarı'));
      expect(requestUrl).not.toHaveBeenCalled();
      warnSpy.mockRestore();
    });

    it('executes GraphQL title query with Bearer authorization and parses results', async () => {
      const mockGraphQLResponse = {
        data: {
          books: [
            {
              id: 4242,
              title: 'Project Hail Mary',
              slug: 'project-hail-mary',
              description: 'Ryland Grace is the sole survivor...',
              pages: 496,
              release_date: '2021-05-04',
              rating: 4.52,
              ratings_count: 8500,
              image: { url: 'https://images.hardcover.app/covers/phm.jpg' },
              contributions: [{ author: { name: 'Andy Weir' } }],
              editions: [
                {
                  isbn_10: '0593135202',
                  isbn_13: '9780593135203',
                  publisher: { name: 'Ballantine Books' },
                },
              ],
            },
          ],
        },
      };

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: mockGraphQLResponse,
      });

      const results = await provider.search('Project Hail Mary');

      expect(requestUrl).toHaveBeenCalledTimes(1);
      const reqParam = (requestUrl as any).mock.calls[0][0];
      expect(reqParam.url).toBe('https://api.hardcover.app/v1/graphql');
      expect(reqParam.method).toBe('POST');
      expect(reqParam.headers['Authorization']).toBe('Bearer test_api_key_123');

      const parsedBody = JSON.parse(reqParam.body);
      expect(parsedBody.variables.searchTerm).toBe('%Project Hail Mary%');

      expect(results).toHaveLength(1);
      const item = results[0];
      expect(item.id).toBe('4242');
      expect(item.title).toBe('Project Hail Mary');
      expect(item.author).toBe('Andy Weir');
      expect(item.publisher).toBe('Ballantine Books');
      expect(item.url).toBe('https://hardcover.app/books/project-hail-mary');
      expect(item.coverUrl).toBe('https://images.hardcover.app/covers/phm.jpg');
      expect(item.rating).toBe(4.5);
      expect(item.isbn).toBe('9780593135203');
      expect(item.provider).toBe('hardcover');
      expect(item.providers).toEqual(['hardcover']);
      expect(item.sources?.hardcover).toBeDefined();
    });

    it('executes GraphQL edition query when query is an ISBN', async () => {
      const mockIsbnResponse = {
        data: {
          editions: [
            {
              isbn_13: '9780593135203',
              publisher: { name: 'Ballantine Books' },
              book: {
                id: 4242,
                title: 'Project Hail Mary',
                slug: 'project-hail-mary',
                image: { url: 'https://images.hardcover.app/covers/phm.jpg' },
                contributions: [{ author: { name: 'Andy Weir' } }],
              },
            },
          ],
        },
      };

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: mockIsbnResponse,
      });

      const results = await provider.search('978-0593135203');

      expect(requestUrl).toHaveBeenCalledTimes(1);
      const reqParam = (requestUrl as any).mock.calls[0][0];
      const parsedBody = JSON.parse(reqParam.body);
      expect(parsedBody.query).toContain('SearchByISBN');
      expect(parsedBody.variables.isbn).toBe('9780593135203');

      expect(results).toHaveLength(1);
      expect(results[0].title).toBe('Project Hail Mary');
      expect(results[0].isbn).toBe('9780593135203');
    });

    it('gracefully handles network errors during search', async () => {
      (requestUrl as any).mockRejectedValueOnce(new Error('Network offline'));
      const results = await provider.search('Project Hail Mary');
      expect(results).toEqual([]);
    });

    it('handles GraphQL error response gracefully', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: { errors: [{ message: 'Field not found' }] },
      });
      const results = await provider.search('Dune');
      expect(results).toEqual([]);
    });
  });

  describe('HardcoverProvider.getBookDetails', () => {
    it('throws error for empty input', async () => {
      await expect(provider.getBookDetails('')).rejects.toThrow(
        'Geçersiz Hardcover kitap bağlantısı veya ID.'
      );
    });

    it('throws error when API key is missing', async () => {
      const noKeyProvider = new HardcoverProvider('');
      await expect(noKeyProvider.getBookDetails('4242')).rejects.toThrow(
        'Hardcover API anahtarı ayarlanmamış'
      );
    });

    it('fetches book details by numeric ID', async () => {
      const mockBookDetailResponse = {
        data: {
          books_by_pk: {
            id: 4242,
            title: 'Project Hail Mary',
            slug: 'project-hail-mary',
            description: 'A lone astronaut must save the earth...',
            pages: 496,
            release_date: '2021-05-04',
            rating: 4.52,
            ratings_count: 8500,
            image: { url: 'https://images.hardcover.app/covers/phm.jpg' },
            contributions: [{ author: { name: 'Andy Weir' } }],
            taggings: [{ tag: { tag: 'Science Fiction' } }, { tag: { tag: 'Space' } }],
            editions: [
              {
                id: 101,
                isbn_13: '9780593135203',
                pages: 496,
                publisher: { name: 'Ballantine Books' },
              },
            ],
          },
        },
      };

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: mockBookDetailResponse,
      });

      const book = await provider.getBookDetails('4242');

      expect(book.id).toBe('4242');
      expect(book.title).toBe('Project Hail Mary');
      expect(book.author).toBe('Andy Weir');
      expect(book.publisher).toBe('Ballantine Books');
      expect(book.isbn).toBe('9780593135203');
      expect(book.pages).toBe(496);
      expect(book.publishDate).toBe('2021-05-04');
      expect(book.coverUrl).toBe('https://images.hardcover.app/covers/phm.jpg');
      expect(book.description).toBe('A lone astronaut must save the earth...');
      expect(book.rating).toBe(4.5);
      expect(book.ratingCount).toBe(8500);
      expect(book.genres).toEqual(['Science Fiction', 'Space']);
      expect(book.provider).toBe('hardcover');
    });

    it('fetches book details by slug from URL', async () => {
      const mockSlugResponse = {
        data: {
          books: [
            {
              id: 4242,
              title: 'Project Hail Mary',
              slug: 'project-hail-mary',
              contributions: [{ author: { name: 'Andy Weir' } }],
              editions: [
                {
                  isbn_13: '9780593135203',
                  publisher: { name: 'Ballantine Books' },
                },
              ],
            },
          ],
        },
      };

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: mockSlugResponse,
      });

      const book = await provider.getBookDetails(
        'https://hardcover.app/books/project-hail-mary'
      );

      expect(book.id).toBe('4242');
      expect(book.title).toBe('Project Hail Mary');
      expect(book.author).toBe('Andy Weir');
    });

    it('throws error when book is not found', async () => {
      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        json: { data: { books_by_pk: null } },
      });

      await expect(provider.getBookDetails('999999')).rejects.toThrow(
        'Hardcover üzerinde kitap bulunamadı'
      );
    });
  });
});
