import { KitapCardData, formatIsbnDisplay } from './types';
import { renderBarcodeSvgElement, formatBarcodeNumber } from './barcode';

/**
 * Formats date into DD.MM.YYYY for library accession stamp.
 */
export function formatStampDate(rawDate?: string): string {
  if (rawDate) {
    const parsed = new Date(rawDate);
    if (!isNaN(parsed.getTime())) {
      const day = String(parsed.getDate()).padStart(2, '0');
      const month = String(parsed.getMonth() + 1).padStart(2, '0');
      const year = parsed.getFullYear();
      return `${day}.${month}.${year}`;
    }
  }
  const now = new Date();
  const day = String(now.getDate()).padStart(2, '0');
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const year = now.getFullYear();
  return `${day}.${month}.${year}`;
}

/**
 * Creates pure SVG emblem for the typographic book cover.
 */
function createCoverEmblemSvg(): SVGSVGElement {
  const svg = createSvg('svg', {
    attr: {
      width: '20',
      height: '20',
      viewBox: '0 0 24 24',
      fill: 'none',
      stroke: 'currentColor',
      'stroke-width': '1.8',
    },
  });

  svg.createSvg('polygon', {
    attr: {
      points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2',
    },
  });

  return svg;
}

/**
 * Renders the 3D book cover element (stage).
 */
export function renderBookCoverStage(parentEl: HTMLElement, data: KitapCardData): HTMLElement {
  const stageEl = parentEl.createDiv({ cls: 'book-cover-stage' });

  const bookEl = stageEl.createDiv({ cls: 'book-cover-3d' });

  // 1. Hanging Book Ribbon (Bookmark)
  bookEl.createDiv({ cls: 'book-ribbon', attr: { 'aria-hidden': 'true' } });

  // 2. Cover image vs Typographic cover
  let typoContainer: HTMLElement | null = null;

  const createTypographicContent = (target: HTMLElement) => {
    const brand = target.createDiv({
      cls: 'cover-header-brand',
      text: `${data.publisher || 'Klasikler'} // Koleksiyon`,
    });
    brand.setAttribute('title', data.publisher || '');

    const mainTitles = target.createDiv({ cls: 'cover-main-titles' });
    mainTitles.createDiv({ cls: 'cover-author', text: data.author });
    mainTitles.createDiv({ cls: 'cover-book-title', text: data.title });

    const emblemWrap = mainTitles.createDiv({ cls: 'cover-emblem' });
    emblemWrap.appendChild(createCoverEmblemSvg());

    const footerInfo = target.createDiv({ cls: 'cover-footer-info' });
    const transText = data.translator ? `Çeviri:\n${data.translator}` : 'ÖZGÜN METİN';
    footerInfo.createDiv({ cls: 'cover-translator', text: transText });
    footerInfo.createDiv({
      cls: 'cover-publisher',
      text: (data.genres[0] || 'ROMAN').toLocaleUpperCase('tr-TR'),
    });
  };

  if (data.coverUrl) {
    bookEl.addClass('has-image');
    const imgEl = bookEl.createEl('img', {
      cls: 'book-cover-img',
      attr: {
        src: data.coverUrl,
        alt: `${data.title} Kapak Görseli`,
        loading: 'lazy',
      },
    });

    // Fallback to typographic layout if image fails to load
    imgEl.addEventListener('error', () => {
      bookEl.removeClass('has-image');
      imgEl.remove();
      if (!typoContainer) {
        typoContainer = bookEl.createDiv({ cls: 'cover-typo-fallback' });
        createTypographicContent(typoContainer);
      }
    });
  } else {
    createTypographicContent(bookEl);
  }

  // 3. Stage Badge (Reading Status & Progress)
  const statusBadge = stageEl.createSpan({ cls: 'badge' });
  if (data.readingStatus === 'Okundu') {
    statusBadge.addClass('badge-emerald');
    statusBadge.setText('OKUNDU (%100)');
  } else if (data.readingStatus === 'Okunuyor') {
    statusBadge.addClass('badge-purple');
    statusBadge.setText(`OKUNUYOR (%${data.readingPercent})`);
  } else if (data.readingStatus === 'Okunacak') {
    statusBadge.addClass('badge-amber');
    statusBadge.setText('OKUNACAK (%0)');
  } else {
    statusBadge.addClass('badge-indigo');
    statusBadge.setText(data.readingStatus.toLocaleUpperCase('tr-TR'));
  }

  return stageEl;
}

/**
 * Renders the bibliographic library accession slip.
 */
export function renderBibliographicSlip(parentEl: HTMLElement, data: KitapCardData): HTMLElement {
  const slipEl = parentEl.createDiv({ cls: 'bibliographic-slip' });

  // 1. Slip Header
  const headerEl = slipEl.createDiv({ cls: 'slip-header' });
  const titlesWrap = headerEl.createDiv();
  const instTitle = data.publisher ? `${data.publisher} Arşivi` : 'Özel Kitaplık Arşivi';
  titlesWrap.createDiv({ cls: 'slip-inst-title', text: `Kütüphane Bilgi Fişi · ${instTitle}` });
  titlesWrap.createDiv({ cls: 'slip-catalog-code', text: data.catalogCode });

  headerEl.createSpan({ cls: 'badge badge-emerald', text: 'STANDART KATALOG' });

  // 2. Slip Meta Grid (8 structured fields)
  const metaGrid = slipEl.createDiv({ cls: 'slip-meta-grid' });

  const addField = (label: string, value: string, isHighlight = false, isMono = false) => {
    const field = metaGrid.createDiv({ cls: 'meta-field' });
    field.createSpan({ cls: 'meta-field-label', text: label });
    const valEl = field.createSpan({ cls: 'meta-field-value', text: value });
    if (isHighlight) valEl.addClass('highlight');
    if (isMono) valEl.addClass('mono');
  };

  // Field 1: Kitap Adı
  const titleDisplay = data.originalTitle ? `${data.title} (${data.originalTitle})` : data.title;
  addField('Kitap / Eser Adı', titleDisplay, true);

  // Field 2: Yazar & Uyruk
  const authorDisplay = data.authorNationality ? `${data.author} (${data.authorNationality})` : data.author;
  addField('Yazar & Uyruk', authorDisplay);

  // Field 3: Çevirmen
  addField('Çevirmen', data.translator || '—');

  // Field 4: Yayınevi & Dizi
  const pubDisplay = data.series ? `${data.publisher} · ${data.series}` : data.publisher;
  addField('Yayınevi & Dizi', pubDisplay);

  // Field 5: ISBN-13
  addField('ISBN-13 Kodu', formatIsbnDisplay(data.isbn13 || data.isbn), false, true);

  // Field 6: Baskı & Cilt Türü
  addField('Baskı & Cilt Türü', `${data.edition} · ${data.format}`);

  // Field 7: Okuma İlerlemesi
  let progressText: string;
  if (data.totalPages > 0) {
    progressText = `${data.pagesRead} / ${data.totalPages} (%${data.readingPercent})`;
  } else if (data.readingStatus === 'Okundu') {
    progressText = 'Tamamlandı (%100)';
  } else if (data.pagesRead > 0) {
    progressText = `${data.pagesRead} sayfa okundu`;
  } else {
    progressText = '—';
  }
  addField('Okuma İlerlemesi', progressText, true, true);

  // Field 8: Okur Puanı
  const ratingText = data.rating
    ? `★ ${data.rating.toFixed(1)} / 5.0${data.ratingCount ? ` (${data.ratingCount.toLocaleString('tr-TR')} Okur İncelemesi)` : ''}`
    : '★ — / 5.0';
  addField('Okur Puanı & Değerlendirme', ratingText);

  // 3. Visual Reading Progress Bar
  const ariaValueText = data.totalPages > 0
    ? `%${data.readingPercent} Okundu, ${data.pagesRead}/${data.totalPages} sayfa`
    : (data.readingStatus === 'Okundu' ? 'Tamamlandı (%100)' : `%${data.readingPercent} Okundu`);

  const progressSec = slipEl.createDiv({ cls: 'slip-progress-section' });
  const barWrap = progressSec.createDiv({
    cls: 'slip-progress-bar-wrap',
    attr: {
      role: 'progressbar',
      'aria-valuenow': String(data.readingPercent),
      'aria-valuemin': '0',
      'aria-valuemax': '100',
      'aria-label': 'Okuma İlerlemesi',
      'aria-valuetext': ariaValueText,
    },
  });

  const barFill = barWrap.createDiv({ cls: 'slip-progress-bar-fill' });
  barFill.style.width = `${data.readingPercent}%`;

  // 4. Barcode & Library Accession Stamp Footer
  const footerEl = slipEl.createDiv({ cls: 'slip-footer' });

  // Barcode
  const barcodeWrap = footerEl.createDiv({ cls: 'barcode-wrap' });
  barcodeWrap.appendChild(renderBarcodeSvgElement(data.isbn13 || data.isbn, 34));
  barcodeWrap.createSpan({ cls: 'barcode-number', text: formatBarcodeNumber(data.isbn13) });

  // Accession Stamp
  const stampEl = footerEl.createDiv({ cls: 'accession-stamp' });
  stampEl.createSpan({ text: 'KÜTÜPHANE KAYDI ONAYLANDI' });
  stampEl.createEl('br');
  const stampDate = formatStampDate(data.dateAdded);
  stampEl.createEl('strong', { text: `${stampDate} · OBSIDIAN-KITAP` });

  return slipEl;
}

/**
 * Main renderer: creates the complete visual library card inside the specified container.
 */
export function renderKitapCard(container: HTMLElement, data: KitapCardData): HTMLElement {
  const wrapper = container.createDiv({ cls: 'kitap-kart-wrapper' });
  const layout = wrapper.createDiv({ cls: 'library-card-layout' });

  renderBookCoverStage(layout, data);
  renderBibliographicSlip(layout, data);

  return wrapper;
}
