import { describe, it, expect } from 'vitest';
import { updateFrontmatterNonDestructive } from '../../src/goodreads/frontmatterUpdater';
import { SAMPLE_EXISTING_VAULT_NOTE_DUNE } from '../e2e/harness/fixtures';

describe('updateFrontmatterNonDestructive Unit Tests', () => {
  describe('Scalar Property Updates', () => {
    it('updates string property in-place preserving surrounding lines', () => {
      const note = '---\nbaslik: "Dune"\nokuma_durumu: "Okunuyor"\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
      expect(result.updatedContent).toContain('baslik: "Dune"');
      expect(result.updatedContent).toContain('---\n# Body\n');
    });

    it('updates empty integer property to a number', () => {
      const note = '---\nbaslik: "Dune"\nkisisel_puan: \n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { kisisel_puan: 5 });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('kisisel_puan: 5');
    });

    it('updates floating point numbers accurately', () => {
      const note = '---\nortalama_puan: 3.5\n---\n';
      const result = updateFrontmatterNonDestructive(note, { ortalama_puan: 4.27 });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('ortalama_puan: 4.27');
    });

    it('updates boolean properties', () => {
      const note = '---\nokundu: false\n---\n';
      const result = updateFrontmatterNonDestructive(note, { okundu: true });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('okundu: true');
    });

    it('updates date strings with quotes', () => {
      const note = '---\nokunma_tarihi: \n---\n';
      const result = updateFrontmatterNonDestructive(note, { okunma_tarihi: '2023-04-10' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('okunma_tarihi: "2023-04-10"');
    });
  });

  describe('Preservation of Structure & Comments', () => {
    it('preserves inline comment on modified line', () => {
      const note = '---\nokuma_durumu: "Okunuyor" # Şu anki okuma durumum\n---\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu" # Şu anki okuma durumum');
    });

    it('preserves inline comment on unmodified line', () => {
      const note = '---\nozel_etiket: "favori" # Kullanıcı özel etiketi\nokuma_durumu: "Okunuyor"\n---\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('ozel_etiket: "favori" # Kullanıcı özel etiketi');
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
    });

    it('preserves standalone comment lines before and between properties', () => {
      const note = '---\n# Bölüm 1: Bibliyografi\nbaslik: "Dune"\n# Bölüm 2: Durum\nokuma_durumu: "Okunuyor"\n---\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('# Bölüm 1: Bibliyografi\nbaslik: "Dune"\n# Bölüm 2: Durum\nokuma_durumu: "Okundu"');
    });

    it('preserves exact line order of existing properties', () => {
      const note = '---\nz_last: 1\na_first: 2\nm_middle: 3\n---\n';
      const result = updateFrontmatterNonDestructive(note, { a_first: 20 });

      expect(result.changed).toBe(true);
      const lines = result.updatedContent.split('\n');
      const zIdx = lines.findIndex((l) => l.startsWith('z_last'));
      const aIdx = lines.findIndex((l) => l.startsWith('a_first'));
      const mIdx = lines.findIndex((l) => l.startsWith('m_middle'));

      expect(zIdx).toBeLessThan(aIdx);
      expect(aIdx).toBeLessThan(mIdx);
    });

    it('preserves custom unrelated keys byte-for-byte', () => {
      const result = updateFrontmatterNonDestructive(SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
        okuma_durumu: 'Okundu',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('ozel_etiket: "favori-bilimkurgu" # Kullanıcı özel etiketi');
      expect(result.updatedContent).toContain('yayinevi: "İthaki Yayınları"');
    });
  });

  describe('Markdown Body Byte-for-Byte Preservation', () => {
    it('preserves kitap-kart codeblocks verbatim', () => {
      const result = updateFrontmatterNonDestructive(SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
        kisisel_puan: 5,
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('```kitap-kart\nid: 9780441172719\n```');
    });

    it('preserves headings, personal notes, and reviews', () => {
      const result = updateFrontmatterNonDestructive(SAMPLE_EXISTING_VAULT_NOTE_DUNE, {
        kisisel_puan: 5,
      });

      expect(result.updatedContent).toContain('# Dune\n\nBu not kullanıcı tarafından daha önce açılmıştır.');
      expect(result.updatedContent).toContain('## Kişisel Düşünceler\nKitabı çok beğendim, harika bir dünya.');
    });

    it('preserves horizontal rules inside body without mistaking them for frontmatter delimiter', () => {
      const note = '---\nbaslik: "Test"\n---\n\nBölüm 1\n\n---\n\nBölüm 2\n';
      const result = updateFrontmatterNonDestructive(note, { baslik: 'Yeni Başlık' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('\nBölüm 1\n\n---\n\nBölüm 2\n');
    });

    it('preserves emojis and Turkish characters in body', () => {
      const note = '---\nbaslik: "Test"\n---\n# 📚 Türkçe Kitap: Şiirler & Öyküler\nİçerik: Çiçekler, ağaçlar, gökyüzü... 🌟';
      const result = updateFrontmatterNonDestructive(note, { okundu: true });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('# 📚 Türkçe Kitap: Şiirler & Öyküler\nİçerik: Çiçekler, ağaçlar, gökyüzü... 🌟');
    });
  });

  describe('Adding New Properties', () => {
    it('appends new property before closing delimiter', () => {
      const note = '---\nbaslik: "Dune"\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { yayinevi: 'İthaki Yayınları' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\nyayinevi: "İthaki Yayınları"\n---\n# Body\n');
    });

    it('adds multiple new properties while updating an existing one', () => {
      const note = '---\nbaslik: "Dune"\nokuma_durumu: "Okunuyor"\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, {
        okuma_durumu: 'Okundu',
        yayinevi: 'İthaki Yayınları',
        isbn: '9780441172719',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
      expect(result.updatedContent).toContain('yayinevi: "İthaki Yayınları"');
      expect(result.updatedContent).toContain('isbn: "9780441172719"');
    });

    it('handles note with empty frontmatter (---\\n---)', () => {
      const note = '---\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { baslik: 'Dune' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\n---\n# Body\n');
    });

    it('creates frontmatter when note has no initial frontmatter', () => {
      const note = '# Header\nThis note has no frontmatter.\n';
      const result = updateFrontmatterNonDestructive(note, { baslik: 'Dune', yazar: 'Frank Herbert' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\nyazar: "Frank Herbert"\n---\n# Header\nThis note has no frontmatter.\n');
    });
  });

  describe('No-op / Changed Flag Accuracy', () => {
    it('returns changed: false when all updated properties match existing', () => {
      const note = '---\nbaslik: "Dune"\nokuma_durumu: "Okundu"\nkisisel_puan: 5\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, {
        okuma_durumu: 'Okundu',
        kisisel_puan: 5,
      });

      expect(result.changed).toBe(false);
      expect(result.updatedContent).toBe(note);
    });

    it('returns changed: false when update object is empty', () => {
      const note = '---\nbaslik: "Dune"\n---\n';
      const result = updateFrontmatterNonDestructive(note, {});

      expect(result.changed).toBe(false);
      expect(result.updatedContent).toBe(note);
    });

    it('returns changed: false when update values are undefined', () => {
      const note = '---\nbaslik: "Dune"\n---\n';
      const result = updateFrontmatterNonDestructive(note, { baslik: undefined, yazar: undefined });

      expect(result.changed).toBe(false);
      expect(result.updatedContent).toBe(note);
    });

    it('returns changed: false when comparing quoted vs unquoted equivalent strings', () => {
      const note = '---\nbaslik: "Dune"\nokuma_durumu: Okundu\n---\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(false);
    });
  });

  describe('Legacy Alias Migration & Leading Blank Line Cleanup', () => {
    it('migrates legacy durum key to okuma_durumu in place', () => {
      const note = '---\nbaslik: "Dune"\ndurum: Okunacak\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\nokuma_durumu: "Okundu"\n---\n# Body\n');
      expect(result.updatedContent).not.toMatch(/^durum:/m);
    });

    it('removes legacy durum line when okuma_durumu already exists', () => {
      const note =
        '---\nbaslik: "Dune"\nokuma_durumu: "Okunuyor"\ndurum: Okunacak\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\nokuma_durumu: "Okundu"\n---\n# Body\n');
      expect(result.updatedContent).not.toMatch(/^durum:/m);
    });

    it('migrates puan_kitapyurdu to puan in place, preserving the rating value', () => {
      const note = '---\nbaslik: "Dune"\npuan_kitapyurdu: 4.5\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { puan: 4.5 });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\npuan: 4.5\n---\n# Body\n');
      expect(result.updatedContent).not.toMatch(/^puan_kitapyurdu:/m);
    });

    it('drops duplicate puan_kitapyurdu line when puan already exists', () => {
      const note = '---\nbaslik: "Dune"\npuan: 4\npuan_kitapyurdu: 5\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { puan: 4 });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\npuan: 4\n---\n# Body\n');
      expect(result.updatedContent).not.toMatch(/^puan_kitapyurdu:/m);
    });

    it('strips a leading blank line immediately after the opening delimiter', () => {
      const note = '---\n\nbaslik: "Dune"\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe(
        '---\nbaslik: "Dune"\nokuma_durumu: "Okundu"\n---\n# Body\n'
      );
    });

    it('strips leading blank lines even when no property value changes', () => {
      const note = '---\n\n\nbaslik: "Dune"\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, {});

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\n---\n# Body\n');
    });
  });

  describe('Array & Wikilink Formatting', () => {
    it('formats string array as YAML block sequence', () => {
      const note = '---\nbaslik: "Dune"\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        etiketler: ['Bilim Kurgu', 'Klasik'],
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('etiketler:\n  - "Bilim Kurgu"\n  - "Klasik"');
    });

    it('quotes wikilinks in frontmatter ("[[Author]]")', () => {
      const note = '---\nyazar: "Eski Yazar"\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        yazar: '[[Frank Herbert]]',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('yazar: "[[Frank Herbert]]"');
    });

    it('formats wikilink arrays with double quotes', () => {
      const note = '---\nbaslik: "Dune"\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        yazarlar: ['[[Frank Herbert]]', '[[Brian Herbert]]'],
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('yazarlar:\n  - "[[Frank Herbert]]"\n  - "[[Brian Herbert]]"');
    });

    it('formats empty array as []', () => {
      const note = '---\nbaslik: "Dune"\n---\n';
      const result = updateFrontmatterNonDestructive(note, { etiketler: [] });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('etiketler: []');
    });
  });

  describe('Formatting & Quote Styles', () => {
    it('preserves existing single-quote style when modifying', () => {
      const note = "---\nokuma_durumu: 'Okunuyor'\n---\n";
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain("okuma_durumu: 'Okundu'");
    });

    it('quotes ISBNs with leading zeros without losing zeros', () => {
      const note = '---\nisbn: \n---\n';
      const result = updateFrontmatterNonDestructive(note, { isbn: '0441172717' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('isbn: "0441172717"');
    });

    it('escapes internal double quotes properly', () => {
      const note = '---\nbaslik: ""\n---\n';
      const result = updateFrontmatterNonDestructive(note, { baslik: 'Dune "Özel Baskı"' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('baslik: "Dune \\"Özel Baskı\\""');
    });
  });

  describe('Line Endings & Encodings', () => {
    it('preserves LF (\\n) line endings', () => {
      const note = '---\nbaslik: "Dune"\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.updatedContent).not.toContain('\r\n');
      expect(result.updatedContent).toContain('\n');
    });

    it('preserves CRLF (\\r\\n) line endings', () => {
      const note = '---\r\nbaslik: "Dune"\r\n---\r\n# Body\r\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.updatedContent).toContain('\r\n');
      expect(result.updatedContent).toBe('---\r\nbaslik: "Dune"\r\nokuma_durumu: "Okundu"\r\n---\r\n# Body\r\n');
    });

    it('preserves UTF-8 BOM (\\uFEFF) at offset 0', () => {
      const note = '\uFEFF---\nbaslik: "Dune"\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.updatedContent.startsWith('\uFEFF')).toBe(true);
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
    });

    it('preserves Templater tags inside frontmatter (<%* ... %>)', () => {
      const note = '---\n<%* const b = book; %>\nbaslik: "Dune"\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('<%* const b = book; %>');
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
    });
  });
});
