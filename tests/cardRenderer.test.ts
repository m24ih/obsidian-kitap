import { describe, it, expect } from 'vitest';
import {
  cleanWikilink,
  cleanStringList,
  formatIsbnDisplay,
  generateDeweyAndCatalogCode,
  normalizeReadingStatus,
  parseCardData,
} from '../src/card/types';
import {
  formatStampDate,
  renderKitapCard,
  renderBookCoverStage,
  renderBibliographicSlip,
} from '../src/card/cardRenderer';

describe('Card Types & Parser Suite', () => {
  describe('cleanWikilink', () => {
    it('cleans standard wikilinks', () => {
      expect(cleanWikilink('[[Stefan Zweig]]')).toBe('Stefan Zweig');
      expect(cleanWikilink('![[Kapaklar/sabirsiz-yurek.jpg]]')).toBe('Kapaklar/sabirsiz-yurek.jpg');
    });

    it('extracts alias from piped wikilink', () => {
      expect(cleanWikilink('[[Stefan Zweig|Zweig]]')).toBe('Zweig');
    });

    it('cleans arrays of wikilinks', () => {
      expect(cleanWikilink(['[[Yazar Bir]]', '[[Yazar İki]]'])).toBe('Yazar Bir, Yazar İki');
    });

    it('handles quotes and nulls gracefully', () => {
      expect(cleanWikilink('"[[Stefan Zweig]]"')).toBe('Stefan Zweig');
      expect(cleanWikilink(null)).toBe('');
      expect(cleanWikilink(undefined)).toBe('');
    });
  });

  describe('cleanStringList', () => {
    it('normalizes string arrays with wikilinks', () => {
      const list = cleanStringList(['[[Modern Klasikler]]', '[[Avusturya Edebiyatı]]']);
      expect(list).toEqual(['Modern Klasikler', 'Avusturya Edebiyatı']);
    });

    it('parses comma-separated and newline-separated strings', () => {
      expect(cleanStringList('Klasik, Roman, Çeviri')).toEqual(['Klasik', 'Roman', 'Çeviri']);
      expect(cleanStringList('Klasik\nRoman\nÇeviri')).toEqual(['Klasik', 'Roman', 'Çeviri']);
    });

    it('handles empty input gracefully', () => {
      expect(cleanStringList(null)).toEqual([]);
      expect(cleanStringList('')).toEqual([]);
    });
  });

  describe('formatIsbnDisplay', () => {
    it('formats 13-digit ISBN into standard 5-part hyphenated display', () => {
      expect(formatIsbnDisplay('9789750738913')).toBe('978-975-07-3891-3');
    });

    it('formats 10-digit ISBN into standard 4-part hyphenated display', () => {
      expect(formatIsbnDisplay('0306406152')).toBe('030-64-0615-2');
    });

    it('returns placeholder dash for empty ISBN', () => {
      expect(formatIsbnDisplay('')).toBe('—');
    });
  });

  describe('generateDeweyAndCatalogCode', () => {
    it('generates Austrian/German literature Dewey and Cutter for Stefan Zweig', () => {
      const res = generateDeweyAndCatalogCode(
        'Stefan Zweig',
        ['Modern Klasikler', 'Avusturya Edebiyatı'],
        '2024',
        '9789750738913'
      );
      expect(res.deweyCode).toBe('833.912');
      expect(res.catalogCode).toContain('Dewey: 833.912 ZWE 2024');
      expect(res.catalogCode).toContain('ACC-2024-TR-8913');
    });

    it('uses custom user dewey and user catalog code when provided', () => {
      const res = generateDeweyAndCatalogCode(
        'Orhan Pamuk',
        ['Roman'],
        '2020',
        '9789750500000',
        '894.35',
        'ÖZEL-KATALOG-001'
      );
      expect(res.deweyCode).toBe('894.35');
      expect(res.catalogCode).toBe('ÖZEL-KATALOG-001');
    });

    it('falls back to 800 and KIT if author and genres are empty', () => {
      const res = generateDeweyAndCatalogCode('', []);
      expect(res.deweyCode).toBe('800');
      expect(res.catalogCode).toContain('KIT');
    });
  });

  describe('normalizeReadingStatus', () => {
    it('normalizes common English and Turkish statuses', () => {
      expect(normalizeReadingStatus('reading', 50, 200)).toBe('Okunuyor');
      expect(normalizeReadingStatus('completed', 200, 200)).toBe('Okundu');
      expect(normalizeReadingStatus('unread', 0, 200)).toBe('Okunacak');
      expect(normalizeReadingStatus('dropped', 20, 200)).toBe('Bırakıldı');
    });

    it('infers status from pages when status is not provided', () => {
      expect(normalizeReadingStatus(undefined, 200, 200)).toBe('Okundu');
      expect(normalizeReadingStatus(undefined, 50, 200)).toBe('Okunuyor');
      expect(normalizeReadingStatus(undefined, 0, 200)).toBe('Okunacak');
    });
  });

  describe('parseCardData', () => {
    it('parses Turkish frontmatter correctly', () => {
      const fm = {
        baslik: 'Sabırsız Yürek',
        orijinal_baslik: 'Ungeduld des Herzens',
        yazar: '[[Stefan Zweig]]',
        uyruk: 'Avusturya, 1881–1942',
        cevirmen: '[[Ahmet Arpad]]',
        yayinevi: '[[Can Yayınları]]',
        dizi: 'Modern Klasikler #54',
        isbn: '9789750738913',
        sayfa: 310,
        okunan_sayfa: 210,
        okuma_durumu: 'Okunuyor',
        puan: '4,6',
        oy_sayisi: 1842,
        format: 'Karton Kapak',
        baski: '24. Basım',
        tur: ['Modern Klasikler', 'Avusturya Edebiyatı'],
        yayin_tarihi: '2024-10',
        date_added: '2026-10-19',
      };

      const data = parseCardData(fm);
      expect(data.title).toBe('Sabırsız Yürek');
      expect(data.originalTitle).toBe('Ungeduld des Herzens');
      expect(data.author).toBe('Stefan Zweig');
      expect(data.translator).toBe('Ahmet Arpad');
      expect(data.publisher).toBe('Can Yayınları');
      expect(data.totalPages).toBe(310);
      expect(data.pagesRead).toBe(210);
      expect(data.readingPercent).toBe(68);
      expect(data.rating).toBe(4.6);
      expect(data.ratingCount).toBe(1842);
      expect(data.edition).toBe('24. Basım');
      expect(data.format).toBe('Karton Kapak');
      expect(data.catalogCode).toContain('Dewey: 833.912 ZWE 2024');
    });

    it('parses English / MediaDB frontmatter fields seamlessly', () => {
      const fm = {
        title: 'Brave New World',
        author: 'Aldous Huxley',
        publisher: 'Harper Perennial',
        total_pages: '288',
        current_page: '144',
        status: 'reading',
        rating: 4.2,
      };

      const data = parseCardData(fm);
      expect(data.title).toBe('Brave New World');
      expect(data.author).toBe('Aldous Huxley');
      expect(data.publisher).toBe('Harper Perennial');
      expect(data.totalPages).toBe(288);
      expect(data.pagesRead).toBe(144);
      expect(data.readingPercent).toBe(50);
      expect(data.readingStatus).toBe('Okunuyor');
      expect(data.rating).toBe(4.2);
    });

    it('handles empty frontmatter and extracts title from sourcePath', () => {
      const data = parseCardData(null, { sourcePath: 'Kitaplar/Kuyucaklı Yusuf.md' });
      expect(data.title).toBe('Kuyucaklı Yusuf');
      expect(data.author).toBe('Bilinmeyen Yazar');
      expect(data.publisher).toBe('Bilinmeyen Yayınevi');
      expect(data.readingPercent).toBe(0);
      expect(data.readingStatus).toBe('Okunacak');
    });

    it('allows codeblock parameter overrides to take precedence', () => {
      const fm = { title: 'Eski Başlık', okunan_sayfa: 10, sayfa: 100 };
      const overrides = { okunan_sayfa: 80 };
      const data = parseCardData(fm, { overrides });
      expect(data.pagesRead).toBe(80);
      expect(data.readingPercent).toBe(80);
    });
  });
});

describe('Card DOM Renderer Suite', () => {
  it('renders complete visual card matching showcase specification', () => {
    const container = document.createElement('div');
    const data = parseCardData({
      baslik: 'Sabırsız Yürek',
      orijinal_baslik: 'Ungeduld des Herzens',
      yazar: 'Stefan Zweig',
      uyruk: 'Avusturya, 1881–1942',
      cevirmen: 'Ahmet Arpad',
      yayinevi: 'Can Yayınları',
      dizi: 'Modern Klasikler #54',
      isbn: '9789750738913',
      sayfa: 310,
      okunan_sayfa: 210,
      okuma_durumu: 'Okunuyor',
      puan: 4.6,
      oy_sayisi: 1842,
      baski: '24. Basım',
      format: 'Karton Kapak',
      tur: ['Modern Klasikler', 'Avusturya Edebiyatı'],
      date_added: '2026-10-19',
    });

    const card = renderKitapCard(container, data);
    expect(card.classList.contains('kitap-kart-wrapper')).toBe(true);

    // 1. Layout
    const layout = card.querySelector('.library-card-layout');
    expect(layout).not.toBeNull();

    // 2. Book Cover Stage
    const stage = layout?.querySelector('.book-cover-stage');
    expect(stage).not.toBeNull();

    const book3d = stage?.querySelector('.book-cover-3d');
    expect(book3d).not.toBeNull();
    expect(book3d?.querySelector('.book-ribbon')).not.toBeNull();
    expect(book3d?.querySelector('.cover-book-title')?.textContent).toBe('Sabırsız Yürek');
    expect(book3d?.querySelector('.cover-author')?.textContent).toBe('Stefan Zweig');
    expect(book3d?.querySelector('.cover-emblem svg')).not.toBeNull();

    const stageBadge = stage?.querySelector('.badge');
    expect(stageBadge?.textContent).toBe('OKUNUYOR (%68)');
    expect(stageBadge?.classList.contains('badge-purple')).toBe(true);

    // 3. Bibliographic Slip
    const slip = layout?.querySelector('.bibliographic-slip');
    expect(slip).not.toBeNull();

    // Slip Header
    expect(slip?.querySelector('.slip-inst-title')?.textContent).toContain('Can Yayınları Arşivi');
    expect(slip?.querySelector('.slip-catalog-code')?.textContent).toContain('Dewey: 833.912 ZWE');
    expect(slip?.querySelector('.slip-header .badge')?.textContent).toBe('STANDART KATALOG');

    // Meta Grid (8 fields)
    const fields = slip?.querySelectorAll('.meta-field');
    expect(fields?.length).toBe(8);

    const titleField = slip?.querySelector('.meta-field-value.highlight');
    expect(titleField?.textContent).toContain('Sabırsız Yürek (Ungeduld des Herzens)');

    const isbnField = slip?.querySelector('.meta-field-value.mono');
    expect(isbnField?.textContent).toBe('978-975-07-3891-3');

    // Visual Reading Progress Bar
    const progressTrack = slip?.querySelector('.slip-progress-bar-wrap');
    expect(progressTrack?.getAttribute('aria-valuenow')).toBe('68');
    const progressFill = slip?.querySelector('.slip-progress-bar-fill') as HTMLElement;
    expect(progressFill?.style.width).toBe('68%');

    // Barcode & Stamp
    const barcodeSvg = slip?.querySelector('.barcode-svg');
    expect(barcodeSvg).not.toBeNull();
    expect(barcodeSvg?.querySelectorAll('rect').length).toBeGreaterThan(20);
    expect(slip?.querySelector('.barcode-number')?.textContent).toBe('9 789750 738913');

    const stamp = slip?.querySelector('.accession-stamp');
    expect(stamp?.textContent).toContain('KÜTÜPHANE KAYDI ONAYLANDI');
    expect(stamp?.textContent).toContain('19.10.2026 · OBSIDIAN-KITAP');
  });

  it('renders cover image when coverUrl is present, and gracefully recovers on error', () => {
    const container = document.createElement('div');
    const data = parseCardData({
      baslik: 'Görsel Kapaklı Kitap',
      yazar: 'Test Yazar',
      kapak: 'https://img.kitapyurdu.com/test.jpg',
    });

    renderBookCoverStage(container, data);
    const book3d = container.querySelector('.book-cover-3d');
    expect(book3d?.classList.contains('has-image')).toBe(true);

    const img = book3d?.querySelector('img.book-cover-img') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toBe('https://img.kitapyurdu.com/test.jpg');

    // Simulate image error event
    img.dispatchEvent(new Event('error'));
    expect(book3d?.classList.contains('has-image')).toBe(false);
    expect(book3d?.querySelector('.cover-typo-fallback')).not.toBeNull();
  });

  it('formatStampDate produces valid DD.MM.YYYY string', () => {
    expect(formatStampDate('2026-10-19')).toBe('19.10.2026');
    const todayStr = formatStampDate();
    expect(/^\d{2}\.\d{2}\.\d{4}$/.test(todayStr)).toBe(true);
  });
});
