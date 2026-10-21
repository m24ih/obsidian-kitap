import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getCoverExtension,
  getCoverFileName,
  downloadBookCover,
} from '../src/utils/coverDownloader';
import { BookMetadata, KitapPluginSettings, DEFAULT_SETTINGS } from '../src/types';
import { FolderSuggest } from '../src/settings/folderSuggest';
import { renderBookTemplate } from '../src/templates/engine';
import { TFolder, requestUrl } from './setup';

describe('Cover Downloader & Image Caching Suite', () => {
  const sampleBook: BookMetadata = {
    id: '375312',
    url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
    title: 'Dune',
    author: 'Frank Herbert',
    publisher: 'İthaki Yayınları',
    isbn: '9786053754794',
    coverUrl: 'https://img.kitapyurdu.com/v1/getImage/fn:11494736/wi:800/wh:9d3c3c37e',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Extension & Filename Determination', () => {
    it('determines extension from standard URLs', () => {
      expect(getCoverExtension('https://example.com/cover.jpg')).toBe('jpg');
      expect(getCoverExtension('https://example.com/cover.jpeg')).toBe('jpg');
      expect(getCoverExtension('https://example.com/cover.png')).toBe('png');
      expect(getCoverExtension('https://example.com/cover.webp')).toBe('webp');
      expect(getCoverExtension('https://example.com/cover.gif')).toBe('gif');
      expect(getCoverExtension('https://example.com/cover.svg')).toBe('svg');
    });

    it('ignores query parameters and hashes when determining extension from URL', () => {
      expect(getCoverExtension('https://example.com/cover.png?width=500#top')).toBe('png');
    });

    it('prioritizes content-type header when available', () => {
      expect(getCoverExtension('https://img.kitapyurdu.com/fn:123', 'image/png')).toBe('png');
      expect(getCoverExtension('https://img.kitapyurdu.com/fn:123', 'image/webp')).toBe('webp');
      expect(getCoverExtension('https://img.kitapyurdu.com/fn:123', 'image/jpeg; charset=utf-8')).toBe('jpg');
    });

    it('falls back to jpg when URL has no extension and no content-type', () => {
      expect(getCoverExtension('https://img.kitapyurdu.com/v1/getImage/fn:11494736/wi:800')).toBe('jpg');
    });

    it('builds clean, sanitized cover filenames using settings template', () => {
      const fileName = getCoverFileName(sampleBook, 'jpg', '{{title}} - {{author}}');
      expect(fileName).toBe('Dune - Frank Herbert.jpg');
    });

    it('handles titles with illegal filename characters safely', () => {
      const bookWithIllegalChars: BookMetadata = {
        ...sampleBook,
        title: 'Dune: Çöl/Gezegeni *Özel Baskı*?',
        author: 'Frank Herbert',
      };
      const fileName = getCoverFileName(bookWithIllegalChars, 'jpg', '{{title}}');
      expect(fileName).not.toContain(':');
      expect(fileName).not.toContain('/');
      expect(fileName).not.toContain('*');
      expect(fileName).not.toContain('?');
      expect(fileName.endsWith('.jpg')).toBe(true);
    });
  });

  describe('downloadBookCover Execution & Caching', () => {
    it('skips download if book has no coverUrl or empty url', async () => {
      const emptyBook: BookMetadata = { ...sampleBook, coverUrl: '' };
      const mockVault = { getAbstractFileByPath: vi.fn(), createBinary: vi.fn() };
      const mockApp: any = { vault: mockVault };

      const result = await downloadBookCover(mockApp, emptyBook, DEFAULT_SETTINGS);
      expect(result.success).toBe(false);
      expect(mockVault.createBinary).not.toHaveBeenCalled();
    });

    it('skips download if coverUrl is already a local wikilink', async () => {
      const localBook: BookMetadata = { ...sampleBook, coverUrl: '[[Kitaplar/Kapaklar/Dune.jpg]]' };
      const mockVault = { getAbstractFileByPath: vi.fn(), createBinary: vi.fn() };
      const mockApp: any = { vault: mockVault };

      const result = await downloadBookCover(mockApp, localBook, DEFAULT_SETTINGS);
      expect(result.success).toBe(false);
      expect(requestUrl).not.toHaveBeenCalled();
    });

    it('uses existing file from vault cache without making any HTTP request', async () => {
      const testBook: BookMetadata = { ...sampleBook };
      const expectedPath = 'Kitaplar/Kapaklar/Dune - Frank Herbert.jpg';

      const mockVault = {
        getAbstractFileByPath: vi.fn().mockImplementation((path: string) => {
          if (path === expectedPath) {
            return { path: expectedPath };
          }
          return null;
        }),
        createFolder: vi.fn(),
        createBinary: vi.fn(),
      };
      const mockApp: any = { vault: mockVault };

      const result = await downloadBookCover(mockApp, testBook, DEFAULT_SETTINGS);

      expect(result.success).toBe(true);
      expect(result.coverPath).toBe(expectedPath);
      expect(result.wikilink).toBe(`[[${expectedPath}]]`);
      expect(testBook.coverUrl).toBe(`[[${expectedPath}]]`);

      // Önemli: Dosya zaten varsa hiçbir HTTP isteği yapılmamalı!
      expect(requestUrl).not.toHaveBeenCalled();
      expect(mockVault.createBinary).not.toHaveBeenCalled();
    });

    it('downloads cover and creates binary file in vault when not cached', async () => {
      const testBook: BookMetadata = { ...sampleBook };
      const expectedPath = 'Kitaplar/Kapaklar/Dune - Frank Herbert.jpg';
      const fakeBuffer = new ArrayBuffer(8);

      (requestUrl as any).mockResolvedValueOnce({
        status: 200,
        headers: { 'content-type': 'image/jpeg' },
        arrayBuffer: fakeBuffer,
      });

      const mockVault = {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        createFolder: vi.fn(),
        createBinary: vi.fn().mockResolvedValue(undefined),
      };
      const mockApp: any = { vault: mockVault };

      const result = await downloadBookCover(mockApp, testBook, DEFAULT_SETTINGS);

      expect(result.success).toBe(true);
      expect(result.coverPath).toBe(expectedPath);
      expect(result.wikilink).toBe(`[[${expectedPath}]]`);
      expect(testBook.coverUrl).toBe(`[[${expectedPath}]]`);

      expect(requestUrl).toHaveBeenCalledWith(
        expect.objectContaining({
          url: sampleBook.coverUrl,
          method: 'GET',
        })
      );
      expect(mockVault.createBinary).toHaveBeenCalledWith(expectedPath, fakeBuffer);
    });

    it('gracefully handles HTTP error status without throwing or breaking book data', async () => {
      const originalUrl = sampleBook.coverUrl;
      const testBook: BookMetadata = { ...sampleBook };

      (requestUrl as any).mockResolvedValueOnce({
        status: 404,
        headers: {},
        arrayBuffer: new ArrayBuffer(0),
      });

      const mockVault = {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        createFolder: vi.fn(),
        createBinary: vi.fn(),
      };
      const mockApp: any = { vault: mockVault };

      const result = await downloadBookCover(mockApp, testBook, DEFAULT_SETTINGS);

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      // Orijinal coverUrl bozulmamalı
      expect(testBook.coverUrl).toBe(originalUrl);
      expect(mockVault.createBinary).not.toHaveBeenCalled();
    });

    it('gracefully handles network exception without throwing', async () => {
      const originalUrl = sampleBook.coverUrl;
      const testBook: BookMetadata = { ...sampleBook };

      (requestUrl as any).mockRejectedValueOnce(new Error('Network offline'));

      const mockVault = {
        getAbstractFileByPath: vi.fn().mockReturnValue(null),
        createFolder: vi.fn(),
        createBinary: vi.fn(),
      };
      const mockApp: any = { vault: mockVault };

      const result = await downloadBookCover(mockApp, testBook, DEFAULT_SETTINGS);

      expect(result.success).toBe(false);
      expect(result.error).toBeInstanceOf(Error);
      expect(testBook.coverUrl).toBe(originalUrl);
    });
  });

  describe('FolderSuggest Component Tests', () => {
    it('filters vault folders correctly and handles empty query', () => {
      const folderA = Object.assign(new TFolder(), { path: 'Kitaplar' });
      const folderB = Object.assign(new TFolder(), { path: 'Kitaplar/Kapaklar' });
      const folderC = Object.assign(new TFolder(), { path: 'Notlar' });

      const mockVault = {
        getAllLoadedFiles: vi.fn().mockReturnValue([folderA, folderB, folderC]),
      };
      const mockApp: any = { vault: mockVault };

      const inputEl = document.createElement('input');
      const suggester = new FolderSuggest(mockApp, inputEl);

      const allSuggestions = (suggester as any).getSuggestions('');
      expect(allSuggestions).toHaveLength(3);

      const filtered = (suggester as any).getSuggestions('kapak');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].path).toBe('Kitaplar/Kapaklar');

      const renderedEl = document.createElement('div');
      suggester.renderSuggestion(folderB, renderedEl);
      expect(renderedEl.textContent).toBe('Kitaplar/Kapaklar');

      suggester.selectSuggestion(folderB, new MouseEvent('click'));
      expect(inputEl.value).toBe('Kitaplar/Kapaklar');
    });
  });

  describe('Template Rendering with Local Covers', () => {
    it('converts markdown image syntax ![alt|size]({{coverUrl}}) to ![[path|size]] when cover is local wikilink', () => {
      const localBook: BookMetadata = {
        ...sampleBook,
        coverUrl: '[[Kitaplar/Kapaklar/Dune - Frank Herbert.jpg]]',
      };

      const template = `# {{title}}\n\n![Kapak|200]({{coverUrl}})\n\nCoverPath: {{coverPath}}`;
      const rendered = renderBookTemplate(template, localBook);

      expect(rendered).toContain('![[Kitaplar/Kapaklar/Dune - Frank Herbert.jpg|200]]');
      expect(rendered).toContain('CoverPath: Kitaplar/Kapaklar/Dune - Frank Herbert.jpg');
      expect(rendered).not.toContain('![Kapak|200]([[');
    });

    it('converts ![[ {{coverUrl}} | 250 ]] wikilink embed syntax correctly', () => {
      const localBook: BookMetadata = {
        ...sampleBook,
        coverUrl: '[[Kitaplar/Kapaklar/Dune - Frank Herbert.jpg]]',
      };

      const template = `![[ {{coverUrl}} | 250 ]]`;
      const rendered = renderBookTemplate(template, localBook);

      expect(rendered).toBe('![[Kitaplar/Kapaklar/Dune - Frank Herbert.jpg|250]]');
    });

    it('preserves standard markdown image link when coverUrl is remote HTTP URL', () => {
      const template = `![Kapak|200]({{coverUrl}})`;
      const rendered = renderBookTemplate(template, sampleBook);

      expect(rendered).toBe(`![Kapak|200](${sampleBook.coverUrl})`);
    });
  });
});
