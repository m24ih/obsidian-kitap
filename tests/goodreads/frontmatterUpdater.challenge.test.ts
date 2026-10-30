/**
 * obsidian-kitap - Milestone 3 Adversarial Challenge Suite
 * Empirical stress tests for src/goodreads/frontmatterUpdater.ts
 *
 * Verifies non-destructive YAML frontmatter updates:
 * - Standalone comments and inline comments preservation
 * - Unmapped custom frontmatter keys preservation
 * - Byte-for-byte markdown body, personal reviews, reading logs, and kitap-kart preservation
 * - Adding new properties when none exist vs updating existing properties
 * - Windows CRLF vs Unix LF line endings
 * - Quoted wikilinks ("[[Author]]"), arrays, and special characters
 */

import { describe, it, expect } from 'vitest';
import { updateFrontmatterNonDestructive } from '../../src/goodreads/frontmatterUpdater';

describe('Milestone 3 Empirical Challenge: frontmatterUpdater.ts', () => {
  // =========================================================================
  // 1. Standalone & Inline Comment Preservation
  // =========================================================================
  describe('1. Standalone & Inline Comment Preservation', () => {
    it('preserves top standalone comments, middle comments, and bottom comments', () => {
      const note = [
        '---',
        '# --- Top Category: Metadata ---',
        'baslik: "Dune"',
        '# --- Middle Category: Reading Status ---',
        'okuma_durumu: "Okunuyor"',
        '# --- Bottom Category: User Tags ---',
        'ozel_etiket: "favori"',
        '# Final frontmatter remark',
        '---',
        '# Markdown Header',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('# --- Top Category: Metadata ---');
      expect(result.updatedContent).toContain('# --- Middle Category: Reading Status ---');
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
      expect(result.updatedContent).toContain('# --- Bottom Category: User Tags ---');
      expect(result.updatedContent).toContain('ozel_etiket: "favori"');
      expect(result.updatedContent).toContain('# Final frontmatter remark');
    });

    it('preserves inline comment when property value is updated', () => {
      const note = '---\nkisisel_puan: 3 # Eski puanım (tekrar okuyunca güncellendi)\n---\n';
      const result = updateFrontmatterNonDestructive(note, { kisisel_puan: 5 });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe(
        '---\nkisisel_puan: 5 # Eski puanım (tekrar okuyunca güncellendi)\n---\n'
      );
    });

    it('preserves inline comments on untouched properties', () => {
      const note = [
        '---',
        'baslik: "Dune" # Orijinal isim',
        'yazar: "Frank Herbert" # Hugo ödüllü yazar',
        'okuma_durumu: "Okunuyor"',
        '---',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('baslik: "Dune" # Orijinal isim');
      expect(result.updatedContent).toContain('yazar: "Frank Herbert" # Hugo ödüllü yazar');
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
    });

    it('preserves standalone comments containing colon and YAML-like syntax without confusing parser', () => {
      const note = [
        '---',
        '# key_like: "This looks like a property but is a comment"',
        '# another: [1, 2, 3]',
        'baslik: "Dune"',
        '---',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { baslik: 'Dune Mesihi' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('# key_like: "This looks like a property but is a comment"');
      expect(result.updatedContent).toContain('# another: [1, 2, 3]');
      expect(result.updatedContent).toContain('baslik: "Dune Mesihi"');
    });

    it('distinguishes # inside quoted string from an actual inline comment', () => {
      const note = '---\nbaslik: "Dune #1: Çöl Gezegeni" # Birinci kitap\n---\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('baslik: "Dune #1: Çöl Gezegeni" # Birinci kitap');
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
    });

    it('distinguishes # in URLs without spaces from inline comments', () => {
      const note = '---\nurl: "https://example.com/books#chapter1" # Resmi web sitesi\n---\n';
      const result = updateFrontmatterNonDestructive(note, { puan: 4.5 });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('url: "https://example.com/books#chapter1" # Resmi web sitesi');
      expect(result.updatedContent).toContain('puan: 4.5');
    });
  });

  // =========================================================================
  // 2. Unmapped Custom Keys & Complex YAML Preservation
  // =========================================================================
  describe('2. Unmapped Custom Keys & Complex YAML Preservation', () => {
    it('preserves unmapped custom scalar keys byte-for-byte in exact original position', () => {
      const note = [
        '---',
        'ozel_anahtar_1: "deger1"',
        'baslik: "Dune"',
        'ozel_anahtar_2: 42',
        'okuma_durumu: "Okunuyor"',
        'ozel_anahtar_3: true',
        '---',
        '# Body',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      const lines = result.updatedContent.split('\n');
      expect(lines[1]).toBe('ozel_anahtar_1: "deger1"');
      expect(lines[2]).toBe('baslik: "Dune"');
      expect(lines[3]).toBe('ozel_anahtar_2: 42');
      expect(lines[4]).toBe('okuma_durumu: "Okundu"');
      expect(lines[5]).toBe('ozel_anahtar_3: true');
    });

    it('preserves unmapped nested YAML object mappings byte-for-byte', () => {
      const note = [
        '---',
        'baslik: "Dune"',
        'kutuphane_bilgisi:',
        '  raf: "A-12"',
        '  bina: "Merkez"',
        '  odunc_alan:',
        '    isim: "Ahmet"',
        '    tarih: "2023-01-01"',
        'okuma_durumu: "Okunuyor"',
        '---',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain(
        'kutuphane_bilgisi:\n  raf: "A-12"\n  bina: "Merkez"\n  odunc_alan:\n    isim: "Ahmet"\n    tarih: "2023-01-01"'
      );
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
    });

    it('preserves unmapped multiline block scalars (| and >) byte-for-byte', () => {
      const note = [
        '---',
        'baslik: "Dune"',
        'kisisel_ozet: |',
        '  Bu kitap çöl gezegeni Arrakis üzerindeki',
        '  güç savaşlarını ve Paul Atreides hikayesini',
        '  anlatmaktadır.',
        'okuma_durumu: "Okunuyor"',
        '---',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain(
        'kisisel_ozet: |\n  Bu kitap çöl gezegeni Arrakis üzerindeki\n  güç savaşlarını ve Paul Atreides hikayesini\n  anlatmaktadır.'
      );
    });

    it('preserves unmapped custom arrays with comments byte-for-byte', () => {
      const note = [
        '---',
        'baslik: "Dune"',
        'ozel_koleksiyonlar:',
        '  # Bilim kurgu klasikleri',
        '  - "En İyiler"',
        '  - "Hugo Ödüllü"',
        'okuma_durumu: "Okunuyor"',
        '---',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain(
        'ozel_koleksiyonlar:\n  # Bilim kurgu klasikleri\n  - "En İyiler"\n  - "Hugo Ödüllü"'
      );
    });

    it('preserves unmapped keys with Turkish characters and hyphens', () => {
      const note = [
        '---',
        'çevirmen_notu: "Çeviri harika"',
        'ödünç-durumu: "Verildi"',
        'baslik: "Dune"',
        '---',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { baslik: 'Dune Yeni' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('çevirmen_notu: "Çeviri harika"');
      expect(result.updatedContent).toContain('ödünç-durumu: "Verildi"');
    });
  });

  // =========================================================================
  // 3. Byte-for-Byte Markdown Body & Codeblock Preservation
  // =========================================================================
  describe('3. Byte-for-Byte Markdown Body & Codeblock Preservation', () => {
    it('preserves kitap-kart codeblocks with exact internal spacing and id', () => {
      const bodyWithKitapKart = [
        '# Dune',
        '',
        '```kitap-kart',
        'id: 9780441172719',
        'isbn: 9780441172719',
        'title: Dune',
        'author: Frank Herbert',
        'rating: 4.8',
        '```',
        '',
        'Kullanıcı notları buradadır.',
      ].join('\n');

      const note = `---\nbaslik: "Dune"\n---\n${bodyWithKitapKart}\n`;
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent.endsWith(`---\n${bodyWithKitapKart}\n`)).toBe(true);
    });

    it('preserves multiple horizontal rules (---) inside markdown body verbatim', () => {
      const note = [
        '---',
        'baslik: "Dune"',
        '---',
        'Giriş bölümü',
        '',
        '---',
        '',
        'Gelişme bölümü',
        '',
        '---',
        '',
        'Sonuç bölümü',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { kisisel_puan: 5 });

      expect(result.changed).toBe(true);
      const parts = result.updatedContent.split('---');
      // Should have 1 frontmatter block (2 delimiters = 3 parts) + 2 horizontal rules in body = 5 parts
      expect(parts.length).toBe(5);
      expect(result.updatedContent).toContain('Giriş bölümü\n\n---\n\nGelişme bölümü\n\n---\n\nSonuç bölümü');
    });

    it('preserves personal reviews, callouts, markdown tables, and MathJax verbatim', () => {
      const complexBody = [
        '## 📝 Kişisel İnceleme',
        '',
        '> [!quote] Unutulmaz Alıntı',
        '> "Korku katildir, korku yok oluşu getiren küçük ölümdür."',
        '',
        '| Karakter | Rol | Hane |',
        '|---|---|---|',
        '| Paul Atreides | Muad\'Dib | Atreides |',
        '| Baron Harkonnen | Düşman | Harkonnen |',
        '',
        '$$E = mc^2$$',
        '',
        '### Okuma Günlüğü',
        '- 2023-01-01: Sayfa 1-50',
        '- 2023-01-05: Sayfa 51-120 (Muazzam akıyor)',
      ].join('\n');

      const note = `---\nbaslik: "Dune"\n---\n${complexBody}\n`;
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain(complexBody);
    });

    it('preserves leading and trailing newlines in body without trim corruption', () => {
      const exactBody = '\n\n\n# Body with 3 leading newlines and 2 trailing\n\n';
      const note = `---\nbaslik: "Dune"\n---${exactBody}`;

      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent.endsWith(exactBody)).toBe(true);
    });

    it('preserves unicode emojis and Turkish diacritics in body byte-for-byte', () => {
      const unicodeBody = [
        '# 📚 Kitap Notları & İnceleme ✨',
        'Öğretici ve düşündürücü: Şiirsel anlatım, yağmur, rüzgâr, dağlar, çiçekler...',
        '🌍 Karakterler: Çağan, Şule, İrem, Ömer, Gülce, Aydın.',
      ].join('\n');

      const note = `---\nbaslik: "Test"\n---\n${unicodeBody}\n`;
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain(unicodeBody);
    });
  });

  // =========================================================================
  // 4. Adding Properties vs In-Place Updates
  // =========================================================================
  describe('4. Adding Properties vs In-Place Updates', () => {
    it('creates frontmatter when note has zero frontmatter and only body', () => {
      const note = '# Pure Markdown Note\nNo frontmatter here.\n';
      const result = updateFrontmatterNonDestructive(note, {
        baslik: 'Dune',
        yazar: 'Frank Herbert',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe(
        '---\nbaslik: "Dune"\nyazar: "Frank Herbert"\n---\n# Pure Markdown Note\nNo frontmatter here.\n'
      );
    });

    it('handles empty frontmatter delimiters (---\\n---)', () => {
      const note = '---\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, {
        baslik: 'Dune',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\n---\n# Body\n');
    });

    it('updates 2 existing properties and appends 2 new properties in a single call', () => {
      const note = [
        '---',
        'baslik: "Dune"',
        'okuma_durumu: "Okunuyor"',
        'puan: 4',
        '---',
        '# Body',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, {
        okuma_durumu: 'Okundu',
        puan: 5,
        yayinevi: 'İthaki Yayınları',
        isbn: '9780441172719',
      });

      expect(result.changed).toBe(true);
      const lines = result.updatedContent.split('\n');
      // Existing properties updated in place
      expect(lines[1]).toBe('baslik: "Dune"');
      expect(lines[2]).toBe('okuma_durumu: "Okundu"');
      expect(lines[3]).toBe('puan: 5');
      // New properties appended before closing delimiter
      expect(lines[4]).toBe('yayinevi: "İthaki Yayınları"');
      expect(lines[5]).toBe('isbn: "9780441172719"');
      expect(lines[6]).toBe('---');
    });

    it('updates property to empty string "" correctly', () => {
      const note = '---\nyayinevi: "Eski Yayınevi"\n---\n';
      const result = updateFrontmatterNonDestructive(note, { yayinevi: '' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nyayinevi: ""\n---\n');
    });

    it('updates property to null as empty string ""', () => {
      const note = '---\nyayinevi: "Eski Yayınevi"\n---\n';
      const result = updateFrontmatterNonDestructive(note, { yayinevi: null });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nyayinevi: ""\n---\n');
    });

    it('ignores undefined values without adding or mutating existing', () => {
      const note = '---\nbaslik: "Dune"\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        baslik: undefined,
        yazar: undefined,
      });

      expect(result.changed).toBe(false);
      expect(result.updatedContent).toBe(note);
    });

    it('returns changed: false and exact content when all properties match', () => {
      const note = '---\nbaslik: "Dune"\nsayfa: 704\nokundu: true\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        baslik: 'Dune',
        sayfa: 704,
        okundu: true,
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
  });

  // =========================================================================
  // 5. Windows CRLF vs Unix LF Line Endings
  // =========================================================================
  describe('5. Windows CRLF vs Unix LF Line Endings', () => {
    it('strictly preserves Unix LF (\\n) line endings on update', () => {
      const note = '---\nbaslik: "Dune"\nokuma_durumu: "Okunuyor"\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, {
        okuma_durumu: 'Okundu',
        yayinevi: 'İthaki',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).not.toContain('\r');
      expect(result.updatedContent.split('\n').length).toBe(7);
    });

    it('strictly preserves Windows CRLF (\\r\\n) across all new and updated lines', () => {
      const note = '---\r\nbaslik: "Dune"\r\nokuma_durumu: "Okunuyor"\r\n---\r\n# Body\r\n';
      const result = updateFrontmatterNonDestructive(note, {
        okuma_durumu: 'Okundu',
        yayinevi: 'İthaki',
      });

      expect(result.changed).toBe(true);
      // Every newline must be preceded by \r
      const content = result.updatedContent;
      const strippedCRLF = content.replace(/\r\n/g, '');
      expect(strippedCRLF).not.toContain('\n');
      expect(strippedCRLF).not.toContain('\r');
      expect(content).toBe(
        '---\r\nbaslik: "Dune"\r\nokuma_durumu: "Okundu"\r\nyayinevi: "İthaki"\r\n---\r\n# Body\r\n'
      );
    });

    it('formats array sequence with CRLF in CRLF note', () => {
      const note = '---\r\nbaslik: "Dune"\r\n---\r\n';
      const result = updateFrontmatterNonDestructive(note, {
        tur: ['Bilim Kurgu', 'Klasik'],
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe(
        '---\r\nbaslik: "Dune"\r\ntur:\r\n  - "Bilim Kurgu"\r\n  - "Klasik"\r\n---\r\n'
      );
    });

    it('adds new frontmatter with CRLF to note without frontmatter when body has CRLF', () => {
      const note = '# Header\r\nBody text with CRLF.\r\n';
      const result = updateFrontmatterNonDestructive(note, {
        baslik: 'Dune',
      });

      expect(result.changed).toBe(true);
      const content = result.updatedContent;
      const strippedCRLF = content.replace(/\r\n/g, '');
      expect(strippedCRLF).not.toContain('\n');
      expect(strippedCRLF).not.toContain('\r');
      expect(content).toBe('---\r\nbaslik: "Dune"\r\n---\r\n# Header\r\nBody text with CRLF.\r\n');
    });

    it('preserves UTF-8 BOM (\\uFEFF) at index 0 with CRLF', () => {
      const note = '\uFEFF---\r\nbaslik: "Dune"\r\n---\r\n';
      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent.startsWith('\uFEFF---\r\n')).toBe(true);
      expect(result.updatedContent).toContain('okuma_durumu: "Okundu"');
    });
  });

  // =========================================================================
  // 6. Quoted Wikilinks, Arrays, & Special Characters
  // =========================================================================
  describe('6. Quoted Wikilinks, Arrays, & Special Characters', () => {
    it('quotes single wikilink value in double quotes ("[[Author]]")', () => {
      const note = '---\nyazar: ""\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        yazar: '[[Frank Herbert]]',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nyazar: "[[Frank Herbert]]"\n---\n');
    });

    it('handles wikilink with alias / pipe ("[[Frank Herbert|Herbert, F.]]")', () => {
      const note = '---\nyazar: ""\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        yazar: '[[Frank Herbert|Herbert, F.]]',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nyazar: "[[Frank Herbert|Herbert, F.]]"\n---\n');
    });

    it('does not double-quote wikilink if input already has quotes', () => {
      const note = '---\nyazar: ""\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        yazar: '"[[Frank Herbert]]"',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nyazar: "[[Frank Herbert]]"\n---\n');
      expect(result.updatedContent).not.toContain('""[[');
    });

    it('formats array of wikilinks with quotes on each item', () => {
      const note = '---\nbaslik: "Dune"\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        yazarlar: ['[[Frank Herbert]]', '[[Brian Herbert]]'],
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain(
        'yazarlar:\n  - "[[Frank Herbert]]"\n  - "[[Brian Herbert]]"'
      );
    });

    it('formats empty array as []', () => {
      const note = '---\ntur: ["Eski"]\n---\n';
      const result = updateFrontmatterNonDestructive(note, { tur: [] });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\ntur: []\n---\n');
    });

    it('escapes internal double quotes properly', () => {
      const note = '---\nbaslik: ""\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        baslik: 'Dune "Özel İmzalı" Baskı',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('baslik: "Dune \\"Özel İmzalı\\" Baskı"');
    });

    it('preserves existing single quotes style and escapes single quotes inside', () => {
      const note = "---\nbaslik: 'Eski'\n---\n";
      const result = updateFrontmatterNonDestructive(note, {
        baslik: "Dune: Children's Special",
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe("---\nbaslik: 'Dune: Children''s Special'\n---\n");
    });

    it('handles YAML reserved words as safely quoted strings ("true", "false", "null", "yes", "no")', () => {
      const note = '---\nbaslik: "Test"\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        durum: 'true',
        onay: 'no',
        kod: 'null',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('durum: "true"');
      expect(result.updatedContent).toContain('onay: "no"');
      expect(result.updatedContent).toContain('kod: "null"');
    });

    it('preserves leading zeros in ISBN string without numeric conversion', () => {
      const note = '---\nisbn: ""\n---\n';
      const result = updateFrontmatterNonDestructive(note, {
        isbn: '007137803X',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nisbn: "007137803X"\n---\n');
    });
  });

  // =========================================================================
  // 7. Stress & Edge Scenarios
  // =========================================================================
  describe('7. Stress & Edge Scenarios', () => {
    it('handles large notes with 50+ frontmatter properties and 5000 lines of body', () => {
      const fmLines: string[] = ['---'];
      for (let i = 1; i <= 50; i++) {
        fmLines.push(`prop_${i}: "val_${i}" # comment_${i}`);
      }
      fmLines.push('---');

      const bodyLines: string[] = [];
      for (let i = 1; i <= 5000; i++) {
        bodyLines.push(`Body line ${i}: Content with some text.`);
      }

      const note = fmLines.join('\n') + '\n' + bodyLines.join('\n') + '\n';

      const result = updateFrontmatterNonDestructive(note, {
        prop_25: 'updated_val_25',
        prop_51: 'brand_new_prop',
      });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('prop_25: "updated_val_25" # comment_25');
      expect(result.updatedContent).toContain('prop_51: "brand_new_prop"');
      expect(result.updatedContent).toContain('prop_1: "val_1" # comment_1');
      expect(result.updatedContent).toContain('prop_50: "val_50" # comment_50');
      expect(result.updatedContent.endsWith(bodyLines.join('\n') + '\n')).toBe(true);
    });

    it('performs idempotent successive updates', () => {
      const note = '---\nbaslik: "Dune"\nokuma_durumu: "Okunuyor"\n---\n# Body\n';

      const step1 = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu', puan: 5 });
      expect(step1.changed).toBe(true);

      const step2 = updateFrontmatterNonDestructive(step1.updatedContent, { okuma_durumu: 'Okundu', puan: 5 });
      expect(step2.changed).toBe(false);
      expect(step2.updatedContent).toBe(step1.updatedContent);
    });
  });

  // =========================================================================
  // 8. Adversarial Boundary & Hostile Inputs
  // =========================================================================
  describe('8. Adversarial Boundary & Hostile Inputs', () => {
    it('handles numeric zero (0) properly without treating it as falsy or empty', () => {
      const note = '---\nokunan_sayfa: 150\n---\n';
      const result = updateFrontmatterNonDestructive(note, { okunan_sayfa: 0 });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nokunan_sayfa: 0\n---\n');

      const noop = updateFrontmatterNonDestructive(result.updatedContent, { okunan_sayfa: 0 });
      expect(noop.changed).toBe(false);
    });

    it('handles boolean transitions (true -> false and false -> true)', () => {
      const note = '---\nokundu: true\n---\n';
      const toFalse = updateFrontmatterNonDestructive(note, { okundu: false });
      expect(toFalse.changed).toBe(true);
      expect(toFalse.updatedContent).toBe('---\nokundu: false\n---\n');

      const toTrue = updateFrontmatterNonDestructive(toFalse.updatedContent, { okundu: true });
      expect(toTrue.changed).toBe(true);
      expect(toTrue.updatedContent).toBe('---\nokundu: true\n---\n');
    });

    it('handles empty string content gracefully', () => {
      const note = '';
      const result = updateFrontmatterNonDestructive(note, { baslik: 'Dune' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\n---\n');
    });

    it('handles whitespace-only content gracefully', () => {
      const note = '   \n  \n';
      const result = updateFrontmatterNonDestructive(note, { baslik: 'Dune' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toBe('---\nbaslik: "Dune"\n---\n   \n  \n');
    });

    it('handles frontmatter with only comments and blank lines', () => {
      const note = '---\n# Just a comment\n\n# Another comment\n---\n# Body\n';
      const result = updateFrontmatterNonDestructive(note, { baslik: 'Dune' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('# Just a comment');
      expect(result.updatedContent).toContain('# Another comment');
      expect(result.updatedContent).toContain('baslik: "Dune"');
      expect(result.updatedContent).toContain('---\n# Body\n');
    });

    it('handles non-string fileContent gracefully without throwing', () => {
      const result = updateFrontmatterNonDestructive(null as unknown as string, { baslik: 'Dune' });
      expect(result.changed).toBe(false);
      expect(result.updatedContent).toBe('');
    });

    it('preserves Dataview inline fields in markdown body without corruption', () => {
      const note = [
        '---',
        'baslik: "Dune"',
        '---',
        '# Notlar',
        'Yazar:: [[Frank Herbert]]',
        'Okuma-Tarihi:: 2023-01-01',
        'Puan:: (kisisel:: 5)',
      ].join('\n');

      const result = updateFrontmatterNonDestructive(note, { okuma_durumu: 'Okundu' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('Yazar:: [[Frank Herbert]]');
      expect(result.updatedContent).toContain('Okuma-Tarihi:: 2023-01-01');
      expect(result.updatedContent).toContain('Puan:: (kisisel:: 5)');
    });

    it('handles keys with colons in quotes properly', () => {
      const note = '---\n"custom:ns:key": "old"\n---\n';
      const result = updateFrontmatterNonDestructive(note, { 'custom:ns:key': 'new' });

      expect(result.changed).toBe(true);
      expect(result.updatedContent).toContain('"custom:ns:key": "new"');
    });
  });
});

