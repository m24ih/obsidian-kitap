import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_NOTE_TEMPLATE,
  BookMetadata,
  BookQuote,
  SearchResultItem,
} from '../src/types';

describe('Milestone 1: Core Types & Defaults', () => {
  it('contains expected default settings values in Turkish', () => {
    expect(DEFAULT_SETTINGS.targetFolder).toBe('Kitaplar');
    expect(DEFAULT_SETTINGS.fileNameTemplate).toBe('{{title}} - {{author}}');
    expect(DEFAULT_SETTINGS.includeQuotes).toBe(true);
    expect(DEFAULT_SETTINGS.maxQuotes).toBe(5);
    expect(DEFAULT_SETTINGS.noteTemplate).toBe(DEFAULT_NOTE_TEMPLATE);
  });

  it('default template includes all 13 template placeholders', () => {
    const requiredPlaceholders = [
      '{{title}}',
      '{{author}}',
      '{{publisher}}',
      '{{translator}}',
      '{{isbn}}',
      '{{pages}}',
      '{{publishDate}}',
      '{{coverUrl}}',
      '{{rating}}',
      '{{binkitapRating}}',
      '{{description}}',
      '{{quotes}}',
      '{{url}}',
    ];

    for (const placeholder of requiredPlaceholders) {
      expect(DEFAULT_NOTE_TEMPLATE).toContain(placeholder);
    }
  });

  it('default template contains required frontmatter YAML fields', () => {
    const requiredFrontmatterKeys = [
      'baslik:',
      'yazar:',
      'yayinevi:',
      'cevirmen:',
      'isbn:',
      'sayfa:',
      'yayin_tarihi:',
      'puan_kitapyurdu:',
      'puan_1000kitap:',
      'kapak:',
      'url:',
      'durum:',
    ];

    for (const key of requiredFrontmatterKeys) {
      expect(DEFAULT_NOTE_TEMPLATE).toContain(key);
    }
  });

  it('allows instantiation of fully compliant BookMetadata objects', () => {
    const sampleQuote: BookQuote = {
      text: 'Bir yerlerde bir şeyler, keşfedilmeyi bekliyor.',
      author: 'Carl Sagan',
      page: '42',
      likes: 120,
    };

    const sampleBook: BookMetadata = {
      id: '12345',
      url: 'https://www.kitapyurdu.com/kitap/sample/12345.html',
      title: 'Kozmos',
      author: 'Carl Sagan',
      publisher: 'Altın Kitaplar',
      translator: 'Reşit Aşçıoğlu',
      isbn: '9789754050776',
      pages: 398,
      publishDate: '2020-01-15',
      coverUrl: 'https://img.kitapyurdu.com/covers/12345.jpg',
      description: 'Evrenin derinliklerine bir yolculuk...',
      rating: 4.8,
      ratingCount: 350,
      binkitapRating: '9.4/10',
      binkitapReadCount: '45 bin',
      binkitapUrl: 'https://1000kitap.com/kitap/kozmos--12345',
      quotes: [sampleQuote],
    };

    expect(sampleBook.title).toBe('Kozmos');
    expect(sampleBook.quotes?.length).toBe(1);
    expect(sampleBook.quotes?.[0].author).toBe('Carl Sagan');
  });

  it('supports SearchResultItem structure', () => {
    const item: SearchResultItem = {
      id: '999',
      title: 'Nutuk',
      author: 'Mustafa Kemal Atatürk',
      publisher: 'Türk Tarih Kurumu',
      url: 'https://www.kitapyurdu.com/kitap/nutuk/999.html',
      coverUrl: 'https://img.kitapyurdu.com/nutuk.jpg',
      rating: 4.9,
    };

    expect(item.id).toBe('999');
    expect(item.author).toBe('Mustafa Kemal Atatürk');
  });
});
