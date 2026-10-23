import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MetadataComparisonModal } from '../src/modal/comparisonModal';
import { BookMetadata } from '../src/types';
import { App } from './setup';

describe('MetadataComparisonModal UI & Interaction Suite', () => {
  let app: App;
  let kyMetadata: BookMetadata;
  let drMetadata: BookMetadata;

  beforeEach(() => {
    app = new App();

    kyMetadata = {
      id: 'ky-12345',
      url: 'https://kitapyurdu.com/kitap/ben-robot/12345.html',
      title: 'Ben, Robot',
      author: 'Isaac Asimov',
      publisher: 'İthaki Yayınları',
      translator: 'Dost Körpe',
      isbn: '9789752119999',
      pages: 240,
      publishDate: '2022-01-12',
      format: 'Karton Kapak',
      language: 'Türkçe',
      genres: ['Bilimkurgu', 'Edebiyat'],
      price: '185.00 TL',
      rating: 4.8,
      coverUrl: 'https://img.kitapyurdu.com/cover.jpg',
      description: 'Kitapyurdu detaylı açıklama...',
    };

    drMetadata = {
      id: 'dr-000123',
      url: 'https://dr.com.tr/kitap/ben-robot/000123',
      title: 'Ben Robot',
      author: 'Isaac Asimov',
      publisher: 'İthaki',
      translator: 'Dost Körpe',
      isbn: '9789752119999',
      pages: 0, // D&R missing pages
      publishDate: '2016',
      format: 'Ciltli',
      language: 'Türkçe',
      genres: ['Roman'],
      price: '190.00 TL',
      rating: undefined,
      coverUrl: 'https://i.dr.com.tr/cover.jpg',
      description: 'D&R kısa açıklama.',
    };
  });

  it('initializes and renders modal with comparison table', () => {
    const onConfirm = vi.fn();
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm,
    });

    modal.open();

    expect(modal.titleEl.textContent).toContain('Kitap Metaveri Karşılaştırma');
    const table = modal.contentEl.querySelector('.kitap-comparison-table');
    expect(table).not.toBeNull();

    // Verify provider headers
    const headers = modal.contentEl.querySelectorAll('.col-provider-header');
    expect(headers).toHaveLength(2);
    expect(headers[0].textContent).toContain('Kitapyurdu');
    expect(headers[1].textContent).toContain('D&R');
  });

  it('renders Tip static row as Kitap', () => {
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm: vi.fn(),
    });

    modal.open();

    const staticRow = modal.contentEl.querySelector('.kitap-row-static');
    expect(staticRow?.textContent).toContain('Tip');
    expect(staticRow?.textContent).toContain('Kitap');
  });

  it('calculates diff count and highlights differing rows', () => {
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm: vi.fn(),
    });

    modal.open();

    const diffBadge = modal.contentEl.querySelector('.kitap-diff-badge');
    expect(diffBadge).not.toBeNull();
    expect(diffBadge?.textContent).toContain('farklı alan tespit edildi');

    const diffRows = modal.contentEl.querySelectorAll('.kitap-row-diff');
    expect(diffRows.length).toBeGreaterThan(0);
  });

  it('applies optimal defaults (e.g. pages from Kitapyurdu when D&R has 0)', () => {
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm: vi.fn(),
    });

    modal.open();

    const pageRow = Array.from(modal.contentEl.querySelectorAll('.kitap-comparison-row')).find(
      (r) => (r as HTMLElement).dataset.field === 'pages'
    ) as HTMLElement;

    expect(pageRow).toBeDefined();

    const kyPageCell = pageRow.querySelector('[data-provider-id="kitapyurdu"]');
    const drPageCell = pageRow.querySelector('[data-provider-id="dr"]');

    // Kitapyurdu cell (240 pages) should be selected by default over D&R (0 pages)
    expect(kyPageCell?.classList.contains('is-selected')).toBe(true);
    expect(drPageCell?.classList.contains('is-selected')).toBe(false);
  });

  it('allows clicking a cell to toggle selection to that provider', () => {
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm: vi.fn(),
    });

    modal.open();

    const titleRow = Array.from(modal.contentEl.querySelectorAll('.kitap-comparison-row')).find(
      (r) => (r as HTMLElement).dataset.field === 'title'
    ) as HTMLElement;

    const drTitleCell = titleRow.querySelector('[data-provider-id="dr"]') as HTMLElement;
    expect(drTitleCell).toBeDefined();

    // Click D&R title cell
    drTitleCell.click();

    expect(drTitleCell.classList.contains('is-selected')).toBe(true);

    const built = modal.buildSelectedMetadata();
    expect(built.title).toBe('Ben Robot'); // D&R title selected
  });

  it('updates all selections via "Tümünü D&R Seç" quick action button', () => {
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm: vi.fn(),
    });

    modal.open();

    const allDrBtn = Array.from(modal.contentEl.querySelectorAll('.kitap-btn-pill')).find(
      (b) => b.textContent?.includes('D&R')
    ) as HTMLButtonElement;

    expect(allDrBtn).toBeDefined();
    allDrBtn.click();

    const built = modal.buildSelectedMetadata();
    expect(built.title).toBe('Ben Robot');
    expect(built.publishDate).toBe('2016');
    expect(built.format).toBe('Ciltli');
  });

  it('submits finalized metadata when confirmation button is clicked', async () => {
    const onConfirm = vi.fn();
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm,
    });

    modal.open();

    const submitBtn = modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement;
    expect(submitBtn).toBeDefined();
    expect(submitBtn.textContent).toBe('Not Oluştur');

    await submitBtn.click();

    expect(onConfirm).toHaveBeenCalledTimes(1);
    const resultMeta: BookMetadata = onConfirm.mock.calls[0][0];
    expect(resultMeta.title).toBe('Ben, Robot');
    expect(resultMeta.pages).toBe(240);
  });

  it('shows "Aktif Nota Ekle" button text when insertIntoActive is true', () => {
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      insertIntoActive: true,
      onConfirm: vi.fn(),
    });

    modal.open();

    const submitBtn = modal.contentEl.querySelector('.mod-cta') as HTMLButtonElement;
    expect(submitBtn.textContent).toBe('Aktif Nota Ekle');
  });

  it('calls onCancel when Vazgeç button is clicked', () => {
    const onCancel = vi.fn();
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm: vi.fn(),
      onCancel,
    });

    modal.open();

    const cancelBtn = Array.from(modal.contentEl.querySelectorAll('button')).find(
      (b) => b.textContent === 'Vazgeç'
    ) as HTMLButtonElement;

    expect(cancelBtn).toBeDefined();
    cancelBtn.click();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when modal is closed directly (Escape / X close button)', () => {
    const onCancel = vi.fn();
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm: vi.fn(),
      onCancel,
    });

    modal.open();
    // Simulate user pressing Escape or clicking X close button
    modal.close();

    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('selects all fields for a provider when clicking that provider column header', () => {
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm: vi.fn(),
    });

    modal.open();

    const headers = modal.contentEl.querySelectorAll('.col-provider-header.kitap-th-selectable');
    expect(headers).toHaveLength(2);

    const drHeader = headers[1] as HTMLElement;
    expect(drHeader.textContent).toContain('D&R');

    drHeader.click();

    const built = modal.buildSelectedMetadata();
    expect(built.title).toBe('Ben Robot');
    expect(built.format).toBe('Ciltli');
    expect(built.publishDate).toBe('2016');
  });

  it('handles inverted provider order gracefully (D&R first, Kitapyurdu second)', () => {
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'dr', name: 'D&R', data: drMetadata },
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: kyMetadata },
      ],
      onConfirm: vi.fn(),
    });

    modal.open();

    // Pages should still default to Kitapyurdu (240) rather than D&R (0)
    const pageRow = Array.from(modal.contentEl.querySelectorAll('.kitap-comparison-row')).find(
      (r) => (r as HTMLElement).dataset.field === 'pages'
    ) as HTMLElement;

    const kyCell = pageRow.querySelector('[data-provider-id="kitapyurdu"]');
    expect(kyCell?.classList.contains('is-selected')).toBe(true);

    const built = modal.buildSelectedMetadata();
    expect(built.pages).toBe(240);
  });

  it('renders "Daha fazla göster" toggle for long descriptions and expands on click', () => {
    const longDesc = 'A'.repeat(250);
    const modal = new MetadataComparisonModal(app as any, {
      providers: [
        { id: 'kitapyurdu', name: 'Kitapyurdu', data: { ...kyMetadata, description: longDesc } },
        { id: 'dr', name: 'D&R', data: drMetadata },
      ],
      onConfirm: vi.fn(),
    });

    modal.open();

    const descRow = Array.from(modal.contentEl.querySelectorAll('.kitap-comparison-row')).find(
      (r) => (r as HTMLElement).dataset.field === 'description'
    ) as HTMLElement;

    expect(descRow).toBeDefined();

    const kyCell = descRow.querySelector('[data-provider-id="kitapyurdu"]') as HTMLElement;
    const textEl = kyCell.querySelector('.kitap-desc-text') as HTMLElement;
    const toggleBtn = kyCell.querySelector('.kitap-desc-toggle') as HTMLElement;

    expect(textEl).toBeDefined();
    expect(textEl.classList.contains('is-clamped')).toBe(true);
    expect(toggleBtn).toBeDefined();
    expect(toggleBtn.textContent).toBe('Daha fazla göster');

    // Click toggle to expand
    toggleBtn.click();
    expect(textEl.classList.contains('is-expanded')).toBe(true);
    expect(textEl.classList.contains('is-clamped')).toBe(false);
    expect(toggleBtn.textContent).toBe('Daha az göster');

    // Click toggle again to collapse
    toggleBtn.click();
    expect(textEl.classList.contains('is-clamped')).toBe(true);
    expect(textEl.classList.contains('is-expanded')).toBe(false);
    expect(toggleBtn.textContent).toBe('Daha fazla göster');
  });
});
