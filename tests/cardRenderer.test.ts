import { describe, it, expect } from 'vitest';
import {
  cleanWikilink,
  cleanStringList,
  formatIsbnDisplay,
  resolveCoverUrl,
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

    it('cleans multiple wikilinks in a single string', () => {
      expect(cleanWikilink('[[Stefan Zweig]], [[Ahmet Arpad]]')).toBe('Stefan Zweig, Ahmet Arpad');
    });

    it('cleans markdown links and extracts link text', () => {
      expect(cleanWikilink('[Stefan Zweig](https://example.com)')).toBe('Stefan Zweig');
    });

    it('extracts name/title from object values', () => {
      expect(cleanWikilink({ name: 'Stefan Zweig' })).toBe('Stefan Zweig');
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

    it('preserves already hyphenated international ISBNs', () => {
      expect(formatIsbnDisplay('978-0-14-118280-3')).toBe('978-0-14-118280-3');
    });

    it('returns placeholder dash for empty ISBN', () => {
      expect(formatIsbnDisplay('')).toBe('—');
    });
  });

  describe('resolveCoverUrl', () => {
    it('resolves remote URLs and cleans wikilinks', () => {
      expect(resolveCoverUrl('https://example.com/cover.jpg')).toBe('https://example.com/cover.jpg');
      expect(resolveCoverUrl('[[cover.jpg]]')).toBe('cover.jpg');
      expect(resolveCoverUrl('![[cover.jpg|300]]')).toBe('cover.jpg');
    });

    it('handles array and object cover inputs', () => {
      expect(resolveCoverUrl(['https://example.com/cover1.jpg', 'https://example.com/cover2.jpg'])).toBe('https://example.com/cover1.jpg');
      expect(resolveCoverUrl({ url: 'https://example.com/cover.jpg' })).toBe('https://example.com/cover.jpg');
      expect(resolveCoverUrl({ link: '[[cover.jpg]]' })).toBe('cover.jpg');
    });

    it('preserves data URIs', () => {
      expect(resolveCoverUrl('data:image/png;base64,iVBORw0KGgo=')).toBe('data:image/png;base64,iVBORw0KGgo=');
    });

    it('returns null for null, empty or invalid values', () => {
      expect(resolveCoverUrl(null)).toBeNull();
      expect(resolveCoverUrl('')).toBeNull();
      expect(resolveCoverUrl('   ')).toBeNull();
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

    it('uses first author last name for Cutter code when multiple authors exist', () => {
      const res = generateDeweyAndCatalogCode('Stefan Zweig, Ahmet Arpad', ['Roman']);
      expect(res.catalogCode).toContain('ZWE');
      expect(res.catalogCode).not.toContain('ARP');
    });

    it('infers Austrian/German literature Dewey code from author nationality even without genre cue', () => {
      const res = generateDeweyAndCatalogCode(
        'Stefan Zweig',
        ['Klasik', 'Roman'],
        '2024',
        '9789750738913',
        undefined,
        undefined,
        'Avusturya'
      );
      expect(res.deweyCode).toBe('833.912');
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

    it('ensures overrides take precedence even when using different language keys', () => {
      const fm = {
        baslik: 'Sabırsız Yürek',
        yazar: 'Stefan Zweig',
        yayinevi: 'Can Yayınları',
        okunan_sayfa: 50,
        sayfa: 310,
      };
      const overrides = {
        title: 'Overridden Book Title',
        author: 'Overridden Author',
        publisher: 'Overridden Publisher',
        current_page: 200,
        total_pages: 400,
      };
      const data = parseCardData(fm, { overrides });
      expect(data.title).toBe('Overridden Book Title');
      expect(data.author).toBe('Overridden Author');
      expect(data.publisher).toBe('Overridden Publisher');
      expect(data.pagesRead).toBe(200);
      expect(data.totalPages).toBe(400);
      expect(data.readingPercent).toBe(50);
    });

    it('ensures completed status auto-advances pagesRead to totalPages if not recorded', () => {
      const fm = {
        baslik: 'Satranç',
        yazar: 'Stefan Zweig',
        sayfa: 80,
        okuma_durumu: 'Okundu',
      };
      const data = parseCardData(fm);
      expect(data.pagesRead).toBe(80);
      expect(data.readingPercent).toBe(100);
      expect(data.readingStatus).toBe('Okundu');
    });

    it('handles zero total pages gracefully without division by zero', () => {
      const fm = {
        baslik: 'Bilinmeyen Sayfa Kitabı',
        yazar: 'Test',
        okuma_durumu: 'Okunacak',
      };
      const data = parseCardData(fm);
      expect(data.totalPages).toBe(0);
      expect(data.pagesRead).toBe(0);
      expect(data.readingPercent).toBe(0);

      const container = document.createElement('div');
      const card = renderKitapCard(container, data);
      const fields = card.querySelectorAll('.meta-field-value');
      const progressField = Array.from(fields).find(f => f.classList.contains('highlight') && f.classList.contains('mono'));
      expect(progressField?.textContent).toBe('—');
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
