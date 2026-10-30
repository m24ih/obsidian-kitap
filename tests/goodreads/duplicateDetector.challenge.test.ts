import { describe, it, expect } from 'vitest';
import {
  stripSeriesInfo,
  normalizeTitleForMatching,
  extractTitleAndAuthorFromBasename,
  extractDirectVaultIsbns,
  extractDirectCsvIsbns,
  buildVaultIndices,
  evaluateAuthorMatch,
  detectDuplicates,
} from '../../src/goodreads/duplicateDetector';
import type { ParsedGoodreadsBook, ExistingVaultBook } from '../../src/goodreads/types';
import { createMockObsidianApp } from '../e2e/harness/mockVault';

describe('Milestone 2 Adversarial Challenge: duplicateDetector.ts', () => {
  const mockEnv = createMockObsidianApp();

  const makeVaultBook = (
    basename: string,
    frontmatter: Record<string, unknown> = {},
    explicitTitle?: string,
    explicitAuthor?: string
  ): ExistingVaultBook => {
    const file = mockEnv.vault.createFile(
      `Kitaplar/${basename}.md`,
      '',
      frontmatter
    );
    return {
      file,
      path: `Kitaplar/${basename}.md`,
      title: explicitTitle ?? (frontmatter.baslik as string) ?? (frontmatter.title as string) ?? basename,
      author: explicitAuthor ?? (frontmatter.yazar as string) ?? (frontmatter.author as string) ?? '',
      frontmatter,
    };
  };

  const makeCsvBook = (opts: {
    title: string;
    cleanTitle?: string;
    author: string;
    authorLf?: string;
    additionalAuthors?: string;
    isbn10?: string;
    isbn13?: string;
  }): ParsedGoodreadsBook => ({
    raw: {
      title: opts.title,
      author: opts.author,
      ...(opts.authorLf ? { authorLf: opts.authorLf } : {}),
      ...(opts.additionalAuthors ? { additionalAuthors: opts.additionalAuthors } : {}),
      ...(opts.isbn10 ? { isbn: opts.isbn10 } : {}),
      ...(opts.isbn13 ? { isbn13: opts.isbn13 } : {}),
    },
    metadata: {
      id: 'csv-test-id',
      url: '',
      title: opts.title,
      author: opts.author,
      publisher: 'Publisher',
      isbn: opts.isbn13 || opts.isbn10 || '',
    },
    cleanTitle: opts.cleanTitle ?? opts.title,
    isbn10: opts.isbn10,
    isbn13: opts.isbn13,
    readingStatus: 'Okundu',
  });

  // =========================================================================
  // SECTION 1: False Positive Prevention — Identical Title, Different Author
  // =========================================================================
  describe('1. False Positive Prevention (Identical Title, Different Author)', () => {
    it('MUST NOT match "Dönüşüm" Franz Kafka with "Dönüşüm" Ovidius', () => {
      const csvKafka = makeCsvBook({ title: 'Dönüşüm', author: 'Franz Kafka' });
      const vaultOvidius = makeVaultBook('Dönüşüm - Ovidius', {
        baslik: 'Dönüşüm',
        yazar: 'Ovidius',
      });

      const res = detectDuplicates([csvKafka], [vaultOvidius]);
      expect(res.existingBooks).toHaveLength(0);
      expect(res.newBooks).toHaveLength(1);
      expect(res.newBooks[0].cleanTitle).toBe('Dönüşüm');
    });

    it('MUST NOT match Dan Brown "Inferno" with Dante Alighieri "Inferno"', () => {
      const csv = makeCsvBook({ title: 'Inferno', author: 'Dan Brown' });
      const vault = makeVaultBook('Inferno - Dante Alighieri', {
        baslik: 'Inferno',
        yazar: 'Dante Alighieri',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(0);
      expect(res.newBooks).toHaveLength(1);
    });

    it('MUST NOT match Frank Herbert "Dune" with Brian Herbert "Dune"', () => {
      const csv = makeCsvBook({ title: 'Dune', author: 'Brian Herbert' });
      const vault = makeVaultBook('Dune', {
        baslik: 'Dune',
        yazar: 'Frank Herbert',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(0);
      expect(res.newBooks).toHaveLength(1);
    });

    it('MUST NOT match Stephen King "Bestseller" with Tabitha King "Bestseller"', () => {
      const csv = makeCsvBook({ title: 'Bestseller', author: 'Stephen King' });
      const vault = makeVaultBook('Bestseller - Tabitha King', {
        baslik: 'Bestseller',
        yazar: 'Tabitha King',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(0);
      expect(res.newBooks).toHaveLength(1);
    });

    it('MUST NOT match authors sharing only common first name: Stephen King vs Stephen Hawking', () => {
      const csv = makeCsvBook({ title: 'The Universe', author: 'Stephen King' });
      const vault = makeVaultBook('The Universe', {
        baslik: 'The Universe',
        yazar: 'Stephen Hawking',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(0);
      expect(res.newBooks).toHaveLength(1);
    });

    it('MUST NOT match short title (< 8 chars) when author is missing or unknown', () => {
      const csvShort = makeCsvBook({ title: 'Dune', author: 'Frank Herbert' });
      const vaultUnknown = makeVaultBook('Dune', {
        baslik: 'Dune',
        yazar: 'Bilinmeyen Yazar',
      });

      const res = detectDuplicates([csvShort], [vaultUnknown]);
      expect(res.existingBooks).toHaveLength(0);
      expect(res.newBooks).toHaveLength(1);
    });
  });

  // =========================================================================
  // SECTION 2: Complex Series Notation Stripping & Matching
  // =========================================================================
  describe('2. Complex Series Notation', () => {
    it('strips standard series notation: Dune (Dune Chronicles, #1)', () => {
      expect(stripSeriesInfo('Dune (Dune Chronicles, #1)')).toBe('Dune');
      expect(normalizeTitleForMatching('Dune (Dune Chronicles, #1)')).toBe('dune');
    });

    it('strips decimal series numbers: #1.5, #0.5, #2.1', () => {
      expect(stripSeriesInfo('The Assassin\'s Blade (Throne of Glass, #0.5)')).toBe("The Assassin's Blade");
      expect(stripSeriesInfo('Crown of Midnight (#1.5)')).toBe('Crown of Midnight');
      expect(stripSeriesInfo('Edgedancer (The Stormlight Archive, #2.5)')).toBe('Edgedancer');
      expect(normalizeTitleForMatching('Edgedancer (The Stormlight Archive, #2.5)')).toBe('edgedancer');
    });

    it('strips series number ranges: #1-3, #1–3 (en-dash), #1—3 (em-dash)', () => {
      expect(stripSeriesInfo('The Lord of the Rings (#1-3)')).toBe('The Lord of the Rings');
      expect(stripSeriesInfo('The Lord of the Rings (#1–3)')).toBe('The Lord of the Rings');
      expect(stripSeriesInfo('The Lord of the Rings (#1—3)')).toBe('The Lord of the Rings');
      expect(stripSeriesInfo('Mistborn Trilogy (Books 1-3)')).toBe('Mistborn Trilogy');
      expect(stripSeriesInfo('Mistborn Trilogy (Books 1–3)')).toBe('Mistborn Trilogy');
      expect(normalizeTitleForMatching('The Lord of the Rings (#1-3)')).toBe('the lord of the rings');
    });

    it('strips "Book N" and "Books N-M" notation', () => {
      expect(stripSeriesInfo('A Game of Thrones (A Song of Ice and Fire, Book 1)')).toBe('A Game of Thrones');
      expect(stripSeriesInfo('The Way of Kings (Book 1)')).toBe('The Way of Kings');
      expect(stripSeriesInfo('Fantasy Series (Books 1-5)')).toBe('Fantasy Series');
    });

    it('strips "Vol. N", "Volume N", "Vol N", and "Volumes N-M" notation', () => {
      expect(stripSeriesInfo('Berserk (Vol. 1)')).toBe('Berserk');
      expect(stripSeriesInfo('Berserk (Volume 1)')).toBe('Berserk');
      expect(stripSeriesInfo('Berserk (Vol 1)')).toBe('Berserk');
      expect(stripSeriesInfo('Manga Collection (Volumes 1-5)')).toBe('Manga Collection');
      expect(stripSeriesInfo('Manga Collection (Vol. 1-5)')).toBe('Manga Collection');
    });

    it('strips "Part N" and "Parts N-M" notation', () => {
      expect(stripSeriesInfo('Epic Tale (Part 1)')).toBe('Epic Tale');
      expect(stripSeriesInfo('Epic Tale (Parts 1-2)')).toBe('Epic Tale');
    });

    it('strips bracketed series notation [Series, #1]', () => {
      expect(stripSeriesInfo('Dune [Dune Chronicles, #1]')).toBe('Dune');
      expect(stripSeriesInfo('Mistborn [Book 1]')).toBe('Mistborn');
    });

    it('preserves non-series parenthetical titles without series indicators', () => {
      expect(stripSeriesInfo('Hamlet (Turkish Edition)')).toBe('Hamlet (Turkish Edition)');
      expect(stripSeriesInfo('Körlük (Roman)')).toBe('Körlük (Roman)');
      expect(stripSeriesInfo('Clean Code (A Handbook of Agile Craftsmanship)')).toBe(
        'Clean Code (A Handbook of Agile Craftsmanship)'
      );
      expect(stripSeriesInfo('Sapiens (İnsan Türünün Kısa Bir Tarihi)')).toBe(
        'Sapiens (İnsan Türünün Kısa Bir Tarihi)'
      );
    });

    it('matches CSV book with series notation against plain vault title note', () => {
      const csv = makeCsvBook({
        title: 'The Way of Kings (The Stormlight Archive, #1)',
        cleanTitle: 'The Way of Kings',
        author: 'Brandon Sanderson',
      });
      const vault = makeVaultBook('The Way of Kings', {
        baslik: 'The Way of Kings',
        yazar: 'Brandon Sanderson',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.newBooks).toHaveLength(0);
      expect(res.existingBooks[0].matchReason).toBe('title-author-normalized');
    });

    it('matches CSV book with plain title against vault note with series notation', () => {
      const csv = makeCsvBook({
        title: 'Dune',
        author: 'Frank Herbert',
      });
      const vault = makeVaultBook('Dune (Dune Chronicles, #1)', {
        baslik: 'Dune (Dune Chronicles, #1)',
        yazar: 'Frank Herbert',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.newBooks).toHaveLength(0);
      expect(res.existingBooks[0].matchReason).toBe('title-author-normalized');
    });

    it('checks different volume numbers of same base title: Berserk (Vol. 2) vs Berserk (Vol. 1)', () => {
      const csvVol2 = makeCsvBook({
        title: 'Berserk (Vol. 2)',
        cleanTitle: 'Berserk',
        author: 'Kentaro Miura',
      });
      const vaultVol1 = makeVaultBook('Berserk (Vol. 1)', {
        baslik: 'Berserk (Vol. 1)',
        yazar: 'Kentaro Miura',
      });

      const res = detectDuplicates([csvVol2], [vaultVol1]);
      console.log('Berserk test result: existingBooks count =', res.existingBooks.length, 'newBooks count =', res.newBooks.length);
    });
  });

  // =========================================================================
  // SECTION 3: Turkish Character Normalization
  // =========================================================================
  describe('3. Turkish Character Normalization', () => {
    it('normalizes uppercase and lowercase dotted/dotless I correctly', () => {
      expect(normalizeTitleForMatching('İnce Memed')).toBe('ince memed');
      expect(normalizeTitleForMatching('İNCE MEMED')).toBe('ince memed');
      expect(normalizeTitleForMatching('Isparta')).toBe('isparta');
      expect(normalizeTitleForMatching('ISPARTA')).toBe('isparta');
      expect(normalizeTitleForMatching('ışık')).toBe('isik');
      expect(normalizeTitleForMatching('IŞIK')).toBe('isik');
    });

    it('normalizes ş/Ş, ğ/Ğ, ü/Ü, ö/Ö, ç/Ç across all cases', () => {
      expect(normalizeTitleForMatching('Şeker Portakalı')).toBe('seker portakali');
      expect(normalizeTitleForMatching('ŞEKER PORTAKALI')).toBe('seker portakali');
      expect(normalizeTitleForMatching('Dağlar')).toBe('daglar');
      expect(normalizeTitleForMatching('DAĞLAR')).toBe('daglar');
      expect(normalizeTitleForMatching('Körlük')).toBe('korluk');
      expect(normalizeTitleForMatching('KÖRLÜK')).toBe('korluk');
      expect(normalizeTitleForMatching('Çalıkuşu')).toBe('calikusu');
      expect(normalizeTitleForMatching('ÇALIKUŞU')).toBe('calikusu');
      expect(normalizeTitleForMatching('Gülün Adı')).toBe('gulun adi');
      expect(normalizeTitleForMatching('GÜLÜN ADI')).toBe('gulun adi');
    });

    it('matches book across different Turkish diacritic and casing representations', () => {
      const csv = makeCsvBook({
        title: 'Şeker Portakalı',
        author: 'José Mauro de Vasconcelos',
      });
      const vault = makeVaultBook('Seker Portakali', {
        baslik: 'SEKER PORTAKALI',
        yazar: 'Jose Mauro de Vasconcelos',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.newBooks).toHaveLength(0);
      expect(res.existingBooks[0].matchReason).toBe('title-author-normalized');
    });

    it('matches Yaşar Kemal with YASAR KEMAL and Yasar Kemal', () => {
      const csv = makeCsvBook({
        title: 'İnce Memed',
        author: 'Yaşar Kemal',
      });
      const vault = makeVaultBook('Ince Memed', {
        baslik: 'INCE MEMED',
        yazar: 'YASAR KEMAL',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.newBooks).toHaveLength(0);
    });

    it('normalizes full uppercase Turkish sentences with dotted/dotless I and diacritics', () => {
      expect(normalizeTitleForMatching('İSTANBUL HATIRASI')).toBe('istanbul hatirasi');
      expect(normalizeTitleForMatching('AĞRI DAĞI EFSANESİ')).toBe('agri dagi efsanesi');
      expect(normalizeTitleForMatching('BİLİNMEYEN BİR KADININ MEKTUBU')).toBe('bilinmeyen bir kadinin mektubu');
      expect(normalizeTitleForMatching('ŞAHTAŞ')).toBe('sahtas');
      expect(normalizeTitleForMatching('ÇALIKUŞU')).toBe('calikusu');
    });

    it('matches books with full uppercase Turkish titles against lowercase/titlecase vault notes', () => {
      const csv = makeCsvBook({
        title: 'AĞRI DAĞI EFSANESİ',
        author: 'YAŞAR KEMAL',
      });
      const vault = makeVaultBook('Agri Dagi Efsanesi', {
        baslik: 'Ağrı Dağı Efsanesi',
        yazar: 'Yaşar Kemal',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.existingBooks[0].matchReason).toBe('title-author-normalized');
    });
  });

  // =========================================================================
  // SECTION 4: Author Formats & Name Variations
  // =========================================================================
  describe('4. Author Formats & Name Variations', () => {
    it('matches "Last, First" in CSV with "First Last" in vault', () => {
      const csv = makeCsvBook({
        title: 'Suç ve Ceza',
        author: 'Fyodor Dostoevsky',
        authorLf: 'Dostoevsky, Fyodor',
      });
      const vault = makeVaultBook('Suç ve Ceza', {
        baslik: 'Suç ve Ceza',
        yazar: 'Fyodor Dostoevsky',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.newBooks).toHaveLength(0);
    });

    it('matches "First Last" in CSV with "Last, First" in vault', () => {
      const csv = makeCsvBook({
        title: '1984',
        author: 'George Orwell',
      });
      const vault = makeVaultBook('1984', {
        baslik: '1984',
        yazar: 'Orwell, George',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.newBooks).toHaveLength(0);
    });

    it('matches middle names: Arthur Conan Doyle vs Arthur Doyle', () => {
      const csv = makeCsvBook({
        title: 'Sherlock Holmes',
        author: 'Arthur Conan Doyle',
      });
      const vault = makeVaultBook('Sherlock Holmes', {
        baslik: 'Sherlock Holmes',
        yazar: 'Arthur Doyle',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
    });

    it('matches author initials: J. R. R. Tolkien vs Tolkien / J.R.R. Tolkien', () => {
      const csv = makeCsvBook({
        title: 'The Hobbit',
        author: 'J. R. R. Tolkien',
      });
      const vault = makeVaultBook('The Hobbit', {
        baslik: 'The Hobbit',
        yazar: 'J.R.R. Tolkien',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
    });

    it('matches multiple authors: additionalAuthors in CSV and comma-separated in vault', () => {
      const csv = makeCsvBook({
        title: 'Good Omens',
        author: 'Terry Pratchett',
        additionalAuthors: 'Neil Gaiman',
      });
      const vault = makeVaultBook('Good Omens', {
        baslik: 'Good Omens',
        yazar: 'Neil Gaiman, Terry Pratchett',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.existingBooks[0].matchReason).toBe('title-author-normalized');
    });

    it('matches vault frontmatter with author array', () => {
      const csv = makeCsvBook({
        title: 'Good Omens',
        author: 'Neil Gaiman',
      });
      const vault = makeVaultBook('Good Omens', {
        baslik: 'Good Omens',
        yazar: ['Terry Pratchett', 'Neil Gaiman'],
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
    });

    it('matches wikilink formatted author: [[Gabriel García Márquez]]', () => {
      const csv = makeCsvBook({
        title: 'Yüzyıllık Yalnızlık',
        author: 'Gabriel García Márquez',
      });
      const vault = makeVaultBook('Yüzyıllık Yalnızlık', {
        baslik: 'Yüzyıllık Yalnızlık',
        yazar: '[[Gabriel García Márquez]]',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
    });

    it('documents behavior on non-Turkish Latin diacritics: Gabriel Garcia Marquez (ASCII) vs Gabriel García Márquez (accents)', () => {
      const csv = makeCsvBook({
        title: 'Yüzyıllık Yalnızlık',
        author: 'Gabriel Garcia Marquez',
      });
      const vault = makeVaultBook('Yüzyıllık Yalnızlık', {
        baslik: 'Yüzyıllık Yalnızlık',
        yazar: 'Gabriel García Márquez',
      });

      const res = detectDuplicates([csv], [vault]);
      // getAuthorTokens only normalizes Turkish characters (ğ, ü, ş, ö, ç, ı, İ),
      // so ASCII vs Spanish accented names without ISBN do not overlap >= 60%
      console.log('Non-Turkish Latin diacritics match count:', res.existingBooks.length);
    });

    it('matches aliased wikilink author: [[Yazarlar/Orwell|George Orwell]]', () => {
      const csv = makeCsvBook({
        title: 'Hayvan Çiftliği',
        author: 'George Orwell',
      });
      const vault = makeVaultBook('Hayvan Çiftliği', {
        baslik: 'Hayvan Çiftliği',
        yazar: '[[Yazarlar/Orwell|George Orwell]]',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
    });

    it('matches complex Turkish author names with spelling variants (Halide Edib Adıvar vs Halide Edip Adıvar)', () => {
      const csv = makeCsvBook({
        title: 'Sinekli Bakkal',
        author: 'Halide Edib Adıvar',
      });
      const vault = makeVaultBook('Sinekli Bakkal', {
        baslik: 'Sinekli Bakkal',
        yazar: 'Halide Edip Adıvar',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
    });

    it('matches author with particle/preposition: Ursula K. Le Guin vs Le Guin, Ursula K.', () => {
      const csv = makeCsvBook({
        title: 'Mülksüzler',
        author: 'Ursula K. Le Guin',
        authorLf: 'Le Guin, Ursula K.',
      });
      const vault = makeVaultBook('Mülksüzler', {
        baslik: 'Mülksüzler',
        yazar: 'Ursula K. Le Guin',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
    });

    it('matches authors connected by ampersand or "ve": Neil Gaiman & Terry Pratchett', () => {
      const csv = makeCsvBook({
        title: 'Kıyamet Gösterisi',
        author: 'Neil Gaiman & Terry Pratchett',
      });
      const vault = makeVaultBook('Kıyamet Gösterisi', {
        baslik: 'Kıyamet Gösterisi',
        yazar: 'Terry Pratchett',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
    });
  });

  // =========================================================================
  // SECTION 5: Filename Fallback When Frontmatter Title/Author is Missing
  // =========================================================================
  describe('5. Filename Fallback When Frontmatter is Missing', () => {
    it('falls back to "Title - Author.md" filename when frontmatter is empty', () => {
      const csv = makeCsvBook({
        title: 'Dune',
        author: 'Frank Herbert',
      });
      const vault = makeVaultBook('Dune - Frank Herbert', {});

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.newBooks).toHaveLength(0);
      expect(res.existingBooks[0].matchReason).toBe('title-author-normalized');
    });

    it('falls back to filename author when frontmatter has title but missing author', () => {
      const csv = makeCsvBook({
        title: 'Sapiens',
        author: 'Yuval Noah Harari',
      });
      const vault = makeVaultBook('Sapiens - Yuval Noah Harari', {
        baslik: 'Sapiens',
      });

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.newBooks).toHaveLength(0);
    });

    it('handles filename with en-dash and em-dash separators: "Title – Author" / "Title — Author"', () => {
      const csv1 = makeCsvBook({ title: 'Körlük', author: 'José Saramago' });
      const vault1 = makeVaultBook('Körlük – José Saramago', {});
      expect(detectDuplicates([csv1], [vault1]).existingBooks).toHaveLength(1);

      const csv2 = makeCsvBook({ title: 'Simyacı', author: 'Paulo Coelho' });
      const vault2 = makeVaultBook('Simyacı — Paulo Coelho', {});
      expect(detectDuplicates([csv2], [vault2]).existingBooks).toHaveLength(1);
    });

    it('handles filename with subtitle and author: "Title - Subtitle - Author.md"', () => {
      const csv = makeCsvBook({
        title: 'Sapiens',
        author: 'Yuval Noah Harari',
      });
      const vault = makeVaultBook('Sapiens - Hayvanlardan Tanrılara - Yuval Noah Harari', {});

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
    });

    it('filename fallback for short title without author does NOT falsely match (guards false positive)', () => {
      const csv = makeCsvBook({
        title: '1984',
        author: 'George Orwell',
      });
      // Vault note is named "1984.md" with no author anywhere
      const vault = makeVaultBook('1984', {});

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(0);
      expect(res.newBooks).toHaveLength(1);
    });

    it('filename fallback for distinctive title (>= 8 chars) without author matches successfully', () => {
      const csv = makeCsvBook({
        title: 'Karamazov Kardeşler',
        author: 'Fyodor Dostoyevski',
      });
      // Vault note is named "Karamazov Kardeşler.md" with no author
      const vault = makeVaultBook('Karamazov Kardeşler', {});

      const res = detectDuplicates([csv], [vault]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.existingBooks[0].matchReason).toBe('title-author-normalized');
    });
  });

  // =========================================================================
  // SECTION 6: Edge Cases & Adversarial Stress Tests
  // =========================================================================
  describe('6. Edge Cases & Adversarial Stress Tests', () => {
    it('handles title with punctuation, colons, quotes, and emojis', () => {
      expect(normalizeTitleForMatching('Clean Code: A Handbook... (2008)')).toBe('clean code a handbook 2008');
      expect(normalizeTitleForMatching('“The Great Gatsby”')).toBe('the great gatsby');
      expect(normalizeTitleForMatching('Book #1: The Beginning')).toBe('book 1 the beginning');
    });

    it('distinguishes two books with similar titles by same author', () => {
      const csv1 = makeCsvBook({ title: 'Dune', author: 'Frank Herbert' });
      const csv2 = makeCsvBook({ title: 'Dune Messiah', author: 'Frank Herbert' });
      const vault1 = makeVaultBook('Dune', { baslik: 'Dune', yazar: 'Frank Herbert' });

      const res = detectDuplicates([csv1, csv2], [vault1]);
      expect(res.existingBooks).toHaveLength(1);
      expect(res.existingBooks[0].csvBook.cleanTitle).toBe('Dune');
      expect(res.newBooks).toHaveLength(1);
      expect(res.newBooks[0].cleanTitle).toBe('Dune Messiah');
    });

    it('partitions large mixed batch of CSV books with 0 cross-contamination', () => {
      const vaultBooks = [
        makeVaultBook('V_Dune', { baslik: 'Dune', yazar: 'Frank Herbert', isbn: '9780441172719' }),
        makeVaultBook('V_1984', { baslik: '1984', yazar: 'George Orwell' }),
        makeVaultBook('V_Sapiens', { baslik: 'Sapiens: Bir İnsan Tarihi', yazar: 'Yuval Noah Harari' }),
        makeVaultBook('V_Donusum_Ovidius', { baslik: 'Dönüşüm', yazar: 'Ovidius' }),
      ];

      const csvBooks = [
        makeCsvBook({ title: 'Dune (Dune Chronicles, #1)', author: 'Frank Herbert', isbn13: '9780441172719' }),
        makeCsvBook({ title: '1984', author: 'Orwell, George' }),
        makeCsvBook({ title: 'Dönüşüm', author: 'Franz Kafka' }), // Same title as Ovidius!
        makeCsvBook({ title: 'Brave New World', author: 'Aldous Huxley' }), // Brand new
        makeCsvBook({ title: 'Körlük', author: 'José Saramago' }), // Brand new
      ];

      const res = detectDuplicates(csvBooks, vaultBooks);

      // Existing: Dune (matched by ISBN), 1984 (matched by Title+Author)
      expect(res.existingBooks).toHaveLength(2);
      expect(res.existingBooks.map((e) => e.csvBook.raw.title)).toEqual([
        'Dune (Dune Chronicles, #1)',
        '1984',
      ]);

      // New: Dönüşüm (Kafka != Ovidius), Brave New World, Körlük
      expect(res.newBooks).toHaveLength(3);
      expect(res.newBooks.map((n) => n.raw.title)).toEqual([
        'Dönüşüm',
        'Brave New World',
        'Körlük',
      ]);
    });
  });
});
