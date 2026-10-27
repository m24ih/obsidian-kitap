/**
 * obsidian-kitap - Offline EAN-13 / ISBN Barcode SVG Generator
 * Generates pure vector SVG barcode elements without external dependencies.
 */

// EAN-13 Encodings
const L_CODES: Record<string, string> = {
  '0': '0001101', '1': '0011001', '2': '0010011', '3': '0111101', '4': '0100011',
  '5': '0110001', '6': '0101111', '7': '0111011', '8': '0110111', '9': '0001011'
};

const G_CODES: Record<string, string> = {
  '0': '0100111', '1': '0110011', '2': '0011011', '3': '0100001', '4': '0011101',
  '5': '0111001', '6': '0000101', '7': '0010001', '8': '0001001', '9': '0010111'
};

const R_CODES: Record<string, string> = {
  '0': '1110010', '1': '1100110', '2': '1101100', '3': '1000010', '4': '1011100',
  '5': '1001110', '6': '1010000', '7': '1000100', '8': '1001000', '9': '1110100'
};

const FIRST_DIGIT_PATTERNS: Record<string, string> = {
  '0': 'AAAAAA', '1': 'AABABB', '2': 'AABBAB', '3': 'AABBBA', '4': 'ABAABB',
  '5': 'ABBAAB', '6': 'ABBBAA', '7': 'ABABAB', '8': 'ABABBA', '9': 'ABBABA'
};

/**
 * Calculates EAN-13 check digit for the first 12 digits.
 */
export function calculateEan13CheckDigit(digits12: string): string {
  const clean = (digits12 || '').replace(/[^0-9]/g, '');
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    const n = parseInt(clean[i], 10) || 0;
    sum += i % 2 === 0 ? n : n * 3;
  }
  const rem = sum % 10;
  return rem === 0 ? '0' : String(10 - rem);
}

/**
 * Normalizes any ISBN string into a 13-digit sequence.
 * Converts ISBN-10 to ISBN-13 if necessary.
 */
export function normalizeToIsbn13(raw: string): string {
  const clean = (raw || '').replace(/[^0-9X]/gi, '').toUpperCase();
  if (clean.length === 13 && /^\d{13}$/.test(clean)) {
    return clean;
  }
  if (clean.length === 10) {
    const base9 = '978' + clean.slice(0, 9);
    return base9 + calculateEan13CheckDigit(base9);
  }
  // Fallback for partial/missing codes
  const digitsOnly = clean.replace(/[^0-9]/g, '');
  if (digitsOnly.length >= 12) {
    const base12 = digitsOnly.slice(0, 12);
    return base12 + calculateEan13CheckDigit(base12);
  }
  // Default placeholder code (Sabırsız Yürek demo barcode or 9780000000000)
  const padded = (digitsOnly + '000000000000').slice(0, 12);
  return '978' + padded.slice(3, 12) + calculateEan13CheckDigit('978' + padded.slice(3, 12));
}

/**
 * Formats 13 digits for display under the barcode: e.g. "9 789750 738913"
 */
export function formatBarcodeNumber(isbn13: string): string {
  if (isbn13.length !== 13) return isbn13;
  return `${isbn13[0]} ${isbn13.slice(1, 7)} ${isbn13.slice(7)}`;
}

/**
 * Generates the binary bit sequence (0s and 1s) for an EAN-13 code (95 modules).
 */
export function generateEan13Bits(isbn13: string): string {
  const digits = isbn13.length === 13 ? isbn13 : normalizeToIsbn13(isbn13);
  const first = digits[0];
  const pattern = FIRST_DIGIT_PATTERNS[first] || 'AAAAAA';

  let bits = '101'; // Start guard

  // Left group (digits 1 to 6)
  for (let i = 0; i < 6; i++) {
    const d = digits[i + 1];
    const enc = pattern[i] === 'A' ? L_CODES[d] : G_CODES[d];
    bits += enc || L_CODES['0'];
  }

  bits += '01010'; // Center guard

  // Right group (digits 7 to 12)
  for (let i = 0; i < 6; i++) {
    const d = digits[i + 7];
    bits += R_CODES[d] || R_CODES['0'];
  }

  bits += '101'; // End guard

  return bits; // Exactly 95 bits
}

export interface BarcodeRect {
  x: number;
  width: number;
}

/**
 * Converts 95 bits into optimized contiguous rectangles.
 * Quiet zones of 7 modules on left and right added (total width 109 units).
 */
export function getBarcodeRectangles(isbn13: string, quietZone = 7): { rects: BarcodeRect[]; totalWidth: number } {
  const bits = generateEan13Bits(isbn13);
  const rects: BarcodeRect[] = [];
  let currentX = quietZone;
  let inBar = false;
  let barStart = 0;

  for (let i = 0; i < bits.length; i++) {
    const bit = bits[i];
    if (bit === '1') {
      if (!inBar) {
        inBar = true;
        barStart = currentX;
      }
    } else {
      if (inBar) {
        rects.push({ x: barStart, width: currentX - barStart });
        inBar = false;
      }
    }
    currentX++;
  }
  if (inBar) {
    rects.push({ x: barStart, width: currentX - barStart });
  }

  const totalWidth = currentX + quietZone;
  return { rects, totalWidth };
}

/**
 * Generates an SVG string representing the barcode.
 */
export function generateBarcodeSvg(isbn: string, height = 38): string {
  const isbn13 = normalizeToIsbn13(isbn);
  const { rects, totalWidth } = getBarcodeRectangles(isbn13, 8);

  const rectsHtml = rects
    .map(r => `<rect x="${r.x}" y="0" width="${r.width}" height="${height}" />`)
    .join('');

  return `<svg class="barcode-svg" viewBox="0 0 ${totalWidth} ${height}" fill="currentColor" xmlns="http://www.w3.org/2000/svg" aria-label="ISBN Barkodu: ${isbn13}">${rectsHtml}</svg>`;
}

/**
 * Creates an SVGSVGElement representing the barcode using Obsidian createSvg helper.
 */
export function renderBarcodeSvgElement(isbn: string, height = 38): SVGSVGElement {
  const isbn13 = normalizeToIsbn13(isbn);
  const { rects, totalWidth } = getBarcodeRectangles(isbn13, 8);

  const svg = createSvg('svg', {
    cls: 'barcode-svg',
    attr: {
      viewBox: `0 0 ${totalWidth} ${height}`,
      fill: 'currentColor',
      'aria-label': `ISBN Barkodu: ${isbn13}`,
    },
  });

  for (const r of rects) {
    svg.createSvg('rect', {
      attr: {
        x: String(r.x),
        y: '0',
        width: String(r.width),
        height: String(height),
      },
    });
  }

  return svg;
}

