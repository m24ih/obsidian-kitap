import { describe, it, expect } from 'vitest';
import { renderBookTemplate, sanitizeFileName } from '../src/templates/engine';
import { getTemplateContentFromVault } from '../src/templates/noteBuilder';
import { TFile } from './setup';
import {
  BookMetadata,
  DEFAULT_NOTE_TEMPLATE,
  DEFAULT_STATIC_TEMPLATE,
  DEFAULT_REACTIVE_TEMPLATE,
} from '../src/types';

describe('Template Engine & Filename Sanitizer Tests', () => {
  const sampleBook: BookMetadata = {
    id: '375312',
    url: 'https://www.kitapyurdu.com/kitap/dune/375312.html',
    title: 'Dune',
    author: 'Frank Herbert',
    publisher: 'İTHAKİ YAYINLARI',
    translator: 'Dost Körpe',
    isbn: '9786053754794',
    pages: 712,
    publishDate: '2021-09-08',
    coverUrl: 'https://img.kitapyurdu.com/v1/getImage/fn:11494736/wi:800/wh:9d3c3c37e',
    description: 'Yüzüklerin Efendisi dışında bu kitapla kıyaslanacak başka bir kitap yok.',
    rating: 5,
    ratingCount: 819,
    price: '477.95 TL',
    format: 'Karton Kapak',
    genres: ['Edebiyat', 'Bilimkurgu-Fantazya'],
    originalTitle: 'Dune',
    language: 'TÜRKÇE',
  };

  describe('Feature Coverage — Variable Interpolation', () => {
    it('accurately interpolates placeholders into note templates', () => {
      const template = `Title: {{title}}
Author: {{author}}
Publisher: {{publisher}}
Translator: {{translator}}
ISBN: {{isbn}}
Pages: {{pages}}
Date: {{publishDate}}
Rating: {{rating}}
Cover: {{coverUrl}}
Desc: {{description}}
URL: {{url}}`;

      const rendered = renderBookTemplate(template, sampleBook);

      expect(rendered).toContain('Title: Dune');
      expect(rendered).toContain('Author: Frank Herbert');
      expect(rendered).toContain('Publisher: İTHAKİ YAYINLARI');
      expect(rendered).toContain('Translator: Dost Körpe');
      expect(rendered).toContain('ISBN: 9786053754794');
      expect(rendered).toContain('Pages: 712');
      expect(rendered).toContain('Date: 2021-09-08');
      expect(rendered).toContain('Rating: 5');
      expect(rendered).toContain('Cover: https://img.kitapyurdu.com');
      expect(rendered).toContain('Desc: Yüzüklerin Efendisi dışında');
      expect(rendered).toContain('URL: https://www.kitapyurdu.com/kitap/dune/375312.html');
    });

    it('renders cleanly using DEFAULT_NOTE_TEMPLATE', () => {
      const rendered = renderBookTemplate(DEFAULT_NOTE_TEMPLATE, sampleBook);

      expect(rendered.startsWith('---')).toBe(true);
      expect(rendered).toContain('baslik: "Dune"');
      expect(rendered).toContain('yazar: "Frank Herbert"');
      expect(rendered).toContain('okuma_durumu: "Okunacak"');
      expect(rendered).toContain('# Dune');
      expect(rendered).toContain('puan: 5');
    });

    it('renders new bibliographic fields: price, format, genres, originalTitle, language', () => {
      const template = `Price: {{price}}, Format: {{format}}, Genres: {{genres}}, Orig: {{originalTitle}}, Lang: {{language}}`;
      const rendered = renderBookTemplate(template, sampleBook);

      expect(rendered).toBe('Price: 477.95 TL, Format: Karton Kapak, Genres: Edebiyat, Bilimkurgu-Fantazya, Orig: Dune, Lang: TÜRKÇE');
    });

    it('renders provider and saglayici placeholders accurately', () => {
      const bookWithProvider = { ...sampleBook, provider: 'kitapyurdu' };
      const template = `Provider: {{provider}}, Saglayici: {{saglayici}}`;
      const rendered = renderBookTemplate(template, bookWithProvider);

      expect(rendered).toBe('Provider: kitapyurdu, Saglayici: kitapyurdu');
    });

    it('renders DEFAULT_STATIC_TEMPLATE cleanly with all fields', () => {
      const rendered = renderBookTemplate(DEFAULT_STATIC_TEMPLATE, sampleBook);

      expect(rendered).toContain('fiyat: "477.95 TL"');
      expect(rendered).toContain('format: "Karton Kapak"');
      expect(rendered).toContain('orijinal_baslik: "Dune"');
      expect(rendered).toContain('dil: "TÜRKÇE"');
      expect(rendered).toContain('okuma_durumu: "Okunacak"');
      expect(rendered).toContain('- "Edebiyat"');
      expect(rendered).toContain('- "Bilimkurgu-Fantazya"');
      expect(rendered).toContain('## 📝 Notlar & Alıntılar');
      expect(rendered).toContain('## ⏳ Okuma Günlüğü');
      expect(rendered).toContain('| **Alıntı / Not** | **Sayfa** | **Tarih** |');
      expect(rendered).toContain('| **Tarih** | **Başlangıç** | **Bitiş** | **Okunan Sayfa** | **Notlar** |');
    });

    it('renders DEFAULT_REACTIVE_TEMPLATE cleanly with DataviewJS blocks', () => {
      const rendered = renderBookTemplate(DEFAULT_REACTIVE_TEMPLATE, sampleBook);

      expect(rendered).toContain('tip: kitap');
      expect(rendered).toContain('okunan_sayfa: 0');
      expect(rendered).toContain('sayfa: 712');
      expect(rendered).not.toContain('toplam_sayfa:');
      expect(rendered).toContain('```dataviewjs');
      expect(rendered).toContain('const p = dv.current();');
      expect(rendered).toContain('<progress value=');
      expect(rendered).toContain('## 📊 Okuma İlerlemesi');
      expect(rendered).toContain('## ⏳ Okuma Günlüğü');
      expect(rendered).toContain("k.path : String(k).replace(/^\\[\\[/, '').replace(/\\]\\]$/, '')");
    });

    it('tolerates simple <% variable %> tags from user templates while preserving Templater expressions', () => {
      const mixedTemplate = `title: "<% title %>"
author: "<% author %>"
total: <% total_pages %>
img: "<% image %>"
created: <% tp.file.creation_date("YYYY-MM-DD") %>
code: <%* const x = 1; %>`;

      const rendered = renderBookTemplate(mixedTemplate, sampleBook);

      expect(rendered).toContain('title: "Dune"');
      expect(rendered).toContain('author: "Frank Herbert"');
      expect(rendered).toContain('total: 712');
      expect(rendered).toContain('img: "https://img.kitapyurdu.com/v1/getImage');
      // Templater ifadelerine dokunulmamalı:
      expect(rendered).toContain('created: <% tp.file.creation_date("YYYY-MM-DD") %>');
      expect(rendered).toContain('code: <%* const x = 1; %>');
    });
  });

  describe('Dataview Inline JS Quote Escaping (apostrophes in metadata)', () => {
    const apostropheBook: BookMetadata = {
      ...sampleBook,
      title: "Ay'a Yolculuk",
      author: "Madeleine L'Engle",
      publisher: "Ay'a Yayınları",
      coverUrl: "[[Kitaplar/Kapaklar/Ay'a Yolculuk - Jules Verne.jpg]]",
      description: "Jules Verne'in klasik eseri.",
    };

    const extractInlineJsBlocks = (markdown: string): string[] => {
      const blocks: string[] = [];
      const re = /`\$=([\s\S]*?)`/g;
      let match: RegExpExecArray | null;
      while ((match = re.exec(markdown)) !== null) {
        blocks.push(match[1]);
      }
      return blocks;
    };

    const expectAllInlineJsValid = (markdown: string): string[] => {
      const blocks = extractInlineJsBlocks(markdown);
      expect(blocks.length).toBeGreaterThanOrEqual(3);
      for (const block of blocks) {
        expect(() => new Function('dv', `return (${block})`)).not.toThrow();
      }
      return blocks;
    };

    it("escapes apostrophes in coverUrl so the inline Dataview JS stays valid", () => {
      const rendered = renderBookTemplate(DEFAULT_REACTIVE_TEMPLATE, apostropheBook);

      // Kaçırılmamış ham literal kalmamalı
      expect(rendered).not.toContain("'[[Kitaplar/Kapaklar/Ay'a");
      expect(rendered).toContain("Ay\\'a Yolculuk - Jules Verne.jpg");

      const blocks = expectAllInlineJsValid(rendered);
      expect(blocks.length).toBeGreaterThan(0);

      // Kapak literali doğru yola çözülmeli
      const coverBlock = blocks.find((b) => b.includes('const k = '));
      expect(coverBlock).toBeDefined();
      const evaluated = new Function(
        'dv',
        `return (${coverBlock as string})`
      )({ current: () => ({ kapak: '' }) });
      expect(evaluated).toBe("![[Kitaplar/Kapaklar/Ay'a Yolculuk - Jules Verne.jpg|250]]");
    });

    it("escapes apostrophes in title/author placeholders rendered as inline JS", () => {
      const rendered = renderBookTemplate(DEFAULT_REACTIVE_TEMPLATE, apostropheBook);

      expect(rendered).toContain('Ay\'a Yolculuk');
      expectAllInlineJsValid(rendered);

      const titleBlock = extractInlineJsBlocks(rendered).find((b) => b.includes('?.baslik'));
      expect(titleBlock).toBeDefined();
      const title = new Function('dv', `return (${titleBlock as string})`)({ current: () => ({}) });
      expect(title).toBe("Ay'a Yolculuk");
    });

    it('escapes double quotes inside double-quoted placeholders', () => {
      const quotedBook: BookMetadata = {
        ...sampleBook,
        title: 'Kitap "Özel" Adı',
        author: 'Yazar "Takma" Adı',
        coverUrl: '[[Kitaplar/Kapaklar/Kitap "Özel" Adı.jpg]]',
      };

      const rendered = renderBookTemplate(DEFAULT_REACTIVE_TEMPLATE, quotedBook);
      expectAllInlineJsValid(rendered);

      const titleBlock = extractInlineJsBlocks(rendered).find((b) => b.includes('?.baslik'));
      const title = new Function('dv', `return (${titleBlock as string})`)({ current: () => ({}) });
      expect(title).toBe('Kitap "Özel" Adı');
    });

    it('returns an empty string instead of a broken ![[|250]] embed when the cover is missing', () => {
      const noCoverBook: BookMetadata = { ...sampleBook, coverUrl: undefined };
      const rendered = renderBookTemplate(DEFAULT_REACTIVE_TEMPLATE, noCoverBook);

      expect(rendered).not.toContain('![[|250]]');
      const coverBlock = extractInlineJsBlocks(rendered).find((b) => b.includes('const k = '));
      expect(coverBlock).toBeDefined();
      const evaluated = new Function(
        'dv',
        `return (${coverBlock as string})`
      )({ current: () => ({}) });
      expect(evaluated).toBe('');
    });
  });

  describe('Boundary & Corner Cases — Missing & Undefined Fields', () => {
    it('replaces missing optional fields with empty strings instead of "undefined" literals', () => {
      const bookWithMissingFields: BookMetadata = {
        id: '999',
        url: 'https://www.kitapyurdu.com/kitap/test/999.html',
        title: 'Örnek Kitap',
        author: 'Yerli Yazar',
        publisher: 'Kültür Yayınları',
        isbn: '9781234567890',
        translator: undefined,
        rating: undefined,
      };

      const template = `Translator: {{translator}}, Rating: {{rating}}`;
      const rendered = renderBookTemplate(template, bookWithMissingFields);

      expect(rendered).not.toContain('undefined');
      expect(rendered).not.toContain('null');
      expect(rendered).toBe('Translator: , Rating: ');
    });

    it('safely renders legacy 1000Kitap tags as empty strings without crashing', () => {
      const template = `Quotes: {{quotes}}, 1000K: {{binkitapRating}}`;
      const rendered = renderBookTemplate(template, sampleBook);
      expect(rendered).toBe('Quotes: , 1000K: ');
    });
  });

  describe('Filename Sanitization', () => {
    it('removes illegal filesystem characters from titles', () => {
      const sanitized = sanitizeFileName('Dune: Part 1 / Special Edition *?');
      expect(sanitized).toBe('Dune - Part 1 - Special Edition');
    });

    it('preserves Turkish characters in file names', () => {
      const sanitized = sanitizeFileName('Kürk Mantolu Madonna - Sabahattin Ali');
      expect(sanitized).toBe('Kürk Mantolu Madonna - Sabahattin Ali');
    });
  });

  describe('Vault Template Loading (O(1) Resolution without getFiles enumeration)', () => {
    it('returns null when path or vault is missing', async () => {
      expect(await getTemplateContentFromVault('', undefined)).toBeNull();
      expect(await getTemplateContentFromVault('Template.md', {} as any)).toBeNull();
    });

    it('reads template directly using getFileByPath', async () => {
      const mockFile = Object.assign(new TFile(), { path: 'Templates/Book.md', name: 'Book.md' });
      const mockApp = {
        vault: {
          getFileByPath: (p: string) => (p === 'Templates/Book.md' ? mockFile : null),
          read: async (f: TFile) => '# {{title}}\nContent from getFileByPath',
        },
      };

      const content = await getTemplateContentFromVault('Templates/Book.md', mockApp as any);
      expect(content).toBe('# {{title}}\nContent from getFileByPath');
    });

    it('resolves relative template path via metadataCache.getFirstLinkpathDest without full vault scan', async () => {
      const mockFile = Object.assign(new TFile(), { path: 'Deep/Nested/BookTemplate.md', name: 'BookTemplate.md' });
      const mockApp = {
        vault: {
          getFileByPath: () => null,
          getAbstractFileByPath: () => null,
          read: async () => 'Content from metadataCache dest',
        },
        metadataCache: {
          getFirstLinkpathDest: (path: string) => (path === 'BookTemplate' ? mockFile : null),
        },
      };

      const content = await getTemplateContentFromVault('BookTemplate', mockApp as any);
      expect(content).toBe('Content from metadataCache dest');
    });
  });
});
