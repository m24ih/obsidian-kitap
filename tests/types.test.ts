import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SETTINGS,
  DEFAULT_NOTE_TEMPLATE,
  BookMetadata,
  SearchResultItem,
} from '../src/types';

describe('Core Types & Defaults', () => {
  it('contains expected default settings values in Turkish', () => {
    expect(DEFAULT_SETTINGS.targetFolder).toBe('Kitaplar');
    expect(DEFAULT_SETTINGS.fileNameTemplate).toBe('{{baslik}} - {{yazar}}');
    expect(DEFAULT_SETTINGS.noteTemplate).toBe(DEFAULT_NOTE_TEMPLATE);
    expect(DEFAULT_SETTINGS.downloadCovers).toBe(false);
    expect(DEFAULT_SETTINGS.coverFolder).toBe('Kitaplar/Kapaklar');
    expect(DEFAULT_SETTINGS.readingStatusOptions).toEqual(['Okunacak', 'Okunuyor', 'Okundu']);
    expect(DEFAULT_SETTINGS.defaultReadingStatus).toBe('Okunacak');
    expect(DEFAULT_SETTINGS.defaultProvider).toBe('kitapyurdu');
  });

  it('default template includes required template placeholders', () => {
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
      '{{description}}',
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
      'kapak:',
      'url:',
      'okuma_durumu:',
    ];

    for (const key of requiredFrontmatterKeys) {
      expect(DEFAULT_NOTE_TEMPLATE).toContain(key);
    }
  });

  it('allows instantiation of fully compliant BookMetadata objects', () => {
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
    };

    expect(sampleBook.title).toBe('Kozmos');
    expect(sampleBook.rating).toBe(4.8);
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
