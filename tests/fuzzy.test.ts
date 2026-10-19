import { describe, expect, it } from 'vitest';
import { calculateFuzzyScore, fuzzySortBooks, normalizeTurkish } from '../src/utils/fuzzy';

describe('Fuzzy Search and Turkish Normalization Suite', () => {
  it('normalizes Turkish accented characters and trims whitespace', () => {
    expect(normalizeTurkish('Üç Cisim Problemi')).toBe('uc cisim problemi');
    expect(normalizeTurkish('  İSTANBUL   HATIRASI  ')).toBe('istanbul hatirasi');
    expect(normalizeTurkish('Şeker Portakalı')).toBe('seker portakali');
    expect(normalizeTurkish('Açlık Oyunları - Çevirmen')).toBe('aclik oyunlari - cevirmen');
  });

  it('calculates higher score for exact matches and case-insensitive matches', () => {
    const scoreExact = calculateFuzzyScore('Üç Cisim Problemi', 'üç cisim problemi');
    const scorePartial = calculateFuzzyScore('Üç', 'Üç Cisim Problemi');
    const scoreUnrelated = calculateFuzzyScore('Suç ve Ceza', 'Üç Cisim Problemi');

    expect(scoreExact).toBeGreaterThan(scorePartial);
    expect(scorePartial).toBeGreaterThan(scoreUnrelated);
    expect(scoreUnrelated).toBe(0);
  });

  it('sorts books by relevance prioritizing exact title matches and author matches', () => {
    const books = [
      { id: '1', title: 'Alplerin Son Üç Problemi', author: 'Yazar A' },
      { id: '2', title: 'Üç Cisim Problemi', author: 'Cixin Liu' },
      { id: '3', title: 'Üç Cisim Problemi Grafik / Cilt 1', author: 'Cixin Liu' },
      { id: '4', title: 'Rastgele Kitap', author: 'Yazar B' },
    ];

    const sorted = fuzzySortBooks('uc cisim problemi', books);

    expect(sorted[0].title).toBe('Üç Cisim Problemi');
    expect(sorted[1].title).toBe('Üç Cisim Problemi Grafik / Cilt 1');
    expect(sorted[2].title).toBe('Alplerin Son Üç Problemi');
  });

  it('handles case-insensitive query variations (uppercase, lowercase, mixed)', () => {
    const books = [
      { id: '1', title: 'Kürk Mantolu Madonna', author: 'Sabahattin Ali' },
      { id: '2', title: 'Madonna Şarkıları', author: 'Yazar' },
    ];

    const sortedUpper = fuzzySortBooks('KÜRK MANTOLU MADONNA', books);
    expect(sortedUpper[0].title).toBe('Kürk Mantolu Madonna');

    const sortedLower = fuzzySortBooks('kurk mantolu madonna', books);
    expect(sortedLower[0].title).toBe('Kürk Mantolu Madonna');
  });
});
