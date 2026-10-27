import { describe, it, expect } from 'vitest';
import {
  calculateEan13CheckDigit,
  normalizeToIsbn13,
  formatBarcodeNumber,
  generateEan13Bits,
  getBarcodeRectangles,
  generateBarcodeSvg,
  renderBarcodeSvgElement,
} from '../src/card/barcode';

describe('Barcode Module (Offline Pure SVG EAN-13 Generator)', () => {
  describe('calculateEan13CheckDigit', () => {
    it('calculates correct check digit for Sabırsız Yürek (978975073891 -> 3)', () => {
      expect(calculateEan13CheckDigit('978975073891')).toBe('3');
    });

    it('calculates correct check digit when remainder is zero', () => {
      // 978030640615 -> check digit 7 (978-0-306-40615-7)
      expect(calculateEan13CheckDigit('978030640615')).toBe('7');
    });

    it('handles non-numeric characters gracefully', () => {
      expect(calculateEan13CheckDigit('978-975-07-3891')).toBe('3');
    });
  });

  describe('normalizeToIsbn13', () => {
    it('returns 13-digit string intact if already clean', () => {
      expect(normalizeToIsbn13('9789750738913')).toBe('9789750738913');
    });

    it('cleans hyphens and spaces from ISBN-13', () => {
      expect(normalizeToIsbn13('978-975-07-3891-3')).toBe('9789750738913');
    });

    it('converts 10-digit ISBN to 13-digit ISBN with calculated check digit', () => {
      // ISBN-10: 9750738913 or 0306406152
      const res = normalizeToIsbn13('0306406152');
      expect(res).toBe('9780306406157');
    });

    it('converts 10-digit ISBN ending in X', () => {
      // e.g. 155860832X -> 9781558608320
      const res = normalizeToIsbn13('155860832X');
      expect(res.startsWith('978155860832')).toBe(true);
      expect(res.length).toBe(13);
    });

    it('provides fallback for empty or invalid strings', () => {
      const res1 = normalizeToIsbn13('');
      expect(res1.length).toBe(13);
      expect(res1.startsWith('978')).toBe(true);

      const res2 = normalizeToIsbn13('abc');
      expect(res2.length).toBe(13);
      expect(res2.startsWith('978')).toBe(true);
    });
  });

  describe('formatBarcodeNumber', () => {
    it('formats 13 digits with spaces matching standard book barcode format', () => {
      expect(formatBarcodeNumber('9789750738913')).toBe('9 789750 738913');
    });

    it('returns as-is if string is not 13 digits', () => {
      expect(formatBarcodeNumber('12345')).toBe('12345');
    });
  });

  describe('generateEan13Bits', () => {
    it('produces exactly 95 bits for an EAN-13 code', () => {
      const bits = generateEan13Bits('9789750738913');
      expect(bits.length).toBe(95);
    });

    it('starts with 101, has center 01010, and ends with 101', () => {
      const bits = generateEan13Bits('9789750738913');
      expect(bits.startsWith('101')).toBe(true);
      expect(bits.slice(45, 50)).toBe('01010');
      expect(bits.endsWith('101')).toBe(true);
    });

    it('contains only 0s and 1s', () => {
      const bits = generateEan13Bits('9789750738913');
      expect(/^[01]+$/.test(bits)).toBe(true);
    });
  });

  describe('getBarcodeRectangles', () => {
    it('generates non-overlapping positive-width rectangles with quiet zones', () => {
      const { rects, totalWidth } = getBarcodeRectangles('9789750738913', 8);
      expect(totalWidth).toBeGreaterThan(95);
      expect(rects.length).toBeGreaterThan(20);

      for (let i = 0; i < rects.length; i++) {
        expect(rects[i].width).toBeGreaterThanOrEqual(1);
        if (i > 0) {
          expect(rects[i].x).toBeGreaterThan(rects[i - 1].x);
        }
      }
    });
  });

  describe('generateBarcodeSvg & renderBarcodeSvgElement', () => {
    it('generates valid SVG string containing rect elements', () => {
      const svg = generateBarcodeSvg('978-975-07-3891-3');
      expect(svg).toContain('<svg class="barcode-svg"');
      expect(svg).toContain('<rect');
      expect(svg).toContain('aria-label="ISBN Barkodu: 9789750738913"');
    });

    it('creates native SVGSVGElement without errors and appends rects', () => {
      const svgEl = renderBarcodeSvgElement('978-975-07-3891-3', 38);
      expect(svgEl).toBeInstanceOf(SVGElement);
      expect(svgEl.getAttribute('class')).toBe('barcode-svg');
      expect(svgEl.getAttribute('aria-label')).toBe('ISBN Barkodu: 9789750738913');
      expect(svgEl.querySelectorAll('rect').length).toBeGreaterThan(20);
    });
  });
});
