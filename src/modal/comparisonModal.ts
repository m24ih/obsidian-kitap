import { App, Modal, Setting } from 'obsidian';
import { BookMetadata } from '../types';
import { resolveBestProviderForField } from '../providers/matcher';

export interface ProviderMetadataItem {
  id: string;
  name: string;
  data: BookMetadata;
}

export interface ComparisonModalOptions {
  providers: ProviderMetadataItem[];
  onConfirm: (selectedMetadata: BookMetadata) => void | Promise<void>;
  onCancel?: () => void;
  insertIntoActive?: boolean;
}

interface FieldDef {
  key: keyof BookMetadata;
  label: string;
}

function toSafeString(val: unknown): string {
  if (val === undefined || val === null) return '';
  if (typeof val === 'string') return val.trim();
  if (typeof val === 'number' || typeof val === 'boolean') return String(val).trim();
  if (Array.isArray(val)) {
    return val
      .map((item) => (typeof item === 'string' ? item.trim() : typeof item === 'number' ? String(item) : ''))
      .filter(Boolean)
      .join(', ');
  }
  return '';
}

const COMPARISON_FIELDS: FieldDef[] = [
  { key: 'title', label: 'Başlık' },
  { key: 'author', label: 'Yazar' },
  { key: 'publisher', label: 'Yayınevi' },
  { key: 'translator', label: 'Çevirmen' },
  { key: 'isbn', label: 'ISBN' },
  { key: 'pages', label: 'Sayfa' },
  { key: 'publishDate', label: 'Yayın Tarihi' },
  { key: 'format', label: 'Format' },
  { key: 'language', label: 'Dil' },
  { key: 'genres', label: 'Kategori / Tür' },
  { key: 'price', label: 'Fiyat' },
  { key: 'rating', label: 'Puan' },
  { key: 'coverUrl', label: 'Kapak Görseli' },
  { key: 'description', label: 'Açıklama' },
];

/**
 * Hibrit arama modunda birden fazla sağlayıcıdan gelen verileri
 * yan yana karşılaştıran ve kullanıcının istediği alanları seçmesine
 * olanak tanıyan birleşik popup arayüzü.
 */
export class MetadataComparisonModal extends Modal {
  private readonly options: ComparisonModalOptions;
  private readonly selections: Record<string, string> = {};
  private tableBodyEl: HTMLTableSectionElement | null = null;
  private isResolved: boolean = false;

  constructor(app: App, options: ComparisonModalOptions) {
    super(app);
    this.options = options;

    // Varsayılan seçimleri belirle
    this.initializeDefaults();
  }

  /**
   * En iyi varsayılan değerleri otomatik belirler.
   */
  private initializeDefaults(): void {
    if (!this.options.providers || this.options.providers.length === 0) return;

    for (const field of COMPARISON_FIELDS) {
      this.selections[field.key] = resolveBestProviderForField(
        this.options.providers,
        field.key
      );
    }
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    (this as unknown as { modalEl?: HTMLElement }).modalEl?.addClass('kitap-comparison-modal');
    contentEl.empty();
    contentEl.addClass('kitap-comparison-modal');
    contentEl.addClass('kitap-comparison-content');

    const primaryData = this.options.providers[0]?.data;
    const bookTitle = primaryData?.title || 'Kitap Bilgileri';

    titleEl.setText('Kitap Metaveri Karşılaştırma & Seçim');

    const descEl = contentEl.createDiv({ cls: 'kitap-comparison-desc' });
    descEl.createEl('p', {
      text: `"${bookTitle}" için bulunan sağlayıcı metaverilerini karşılaştırın. Notunuzda yer almasını istediğiniz değerlerin üzerine tıklayarak seçiminizi özelleştirebilirsiniz.`,
    });

    // Hızlı Seçim Butonları ve Farklı Alanlar Sayacı
    this.renderToolbar(contentEl);

    // Karşılaştırma Tablosu
    this.renderTable(contentEl);

    // Alt İşlem Butonları (Vazgeç / Onayla)
    this.renderFooter(contentEl);
  }

  /**
   * Hızlı seçim araç çubuğunu çizer.
   */
  private renderToolbar(container: HTMLElement): void {
    const toolbar = container.createDiv({ cls: 'kitap-comparison-toolbar' });

    const btnGroup = toolbar.createDiv({ cls: 'kitap-quick-actions' });

    for (const p of this.options.providers) {
      const btn = btnGroup.createEl('button', {
        cls: 'kitap-btn-pill',
        text: `Tümünü ${p.name} Seç`,
      });
      btn.addEventListener('click', () => {
        for (const f of COMPARISON_FIELDS) {
          this.selections[f.key] = p.id;
        }
        this.updateTableSelectionClasses();
      });
    }

    // Farklı alan sayısını hesapla
    let diffCount = 0;
    if (this.options.providers.length >= 2) {
      for (const f of COMPARISON_FIELDS) {
        const firstVal = this.formatFieldValue(this.options.providers[0].data[f.key], f.key);
        const hasDiff = this.options.providers.some(
          (p) => this.formatFieldValue(p.data[f.key], f.key) !== firstVal
        );
        if (hasDiff) {
          diffCount++;
        }
      }
    }

    if (diffCount > 0) {
      toolbar.createSpan({
        cls: 'kitap-diff-badge',
        text: `${diffCount} farklı alan tespit edildi`,
      });
    }
  }

  /**
   * Karşılaştırma tablosunu çizer.
   */
  private renderTable(container: HTMLElement): void {
    const tableWrapper = container.createDiv({ cls: 'kitap-comparison-table-wrapper' });
    const table = tableWrapper.createEl('table', { cls: 'kitap-comparison-table' });

    // Table Header
    const thead = table.createEl('thead');
    const headerRow = thead.createEl('tr');
    headerRow.createEl('th', { text: 'Özellik', cls: 'col-field-name' });

    for (const p of this.options.providers) {
      const th = headerRow.createEl('th', { cls: 'col-provider-header kitap-th-selectable' });
      th.title = `Tüm alanları ${p.name} olarak seç`;
      th.createSpan({ cls: `kitap-badge kitap-badge-${p.id}`, text: p.name });
      th.createSpan({ cls: 'kitap-th-hint', text: ' (Tümünü Seç)' });
      th.addEventListener('click', () => {
        for (const f of COMPARISON_FIELDS) {
          this.selections[f.key] = p.id;
        }
        this.updateTableSelectionClasses();
      });
    }

    // Table Body
    this.tableBodyEl = table.createEl('tbody');

    // Sabit 'Tip' satırı
    const tipRow = this.tableBodyEl.createEl('tr', { cls: 'kitap-row-static' });
    tipRow.createEl('td', { text: 'Tip', cls: 'kitap-td-label' });
    for (let i = 0; i < this.options.providers.length; i++) {
      tipRow.createEl('td', { text: 'Kitap', cls: 'kitap-td-val' });
    }

    for (const field of COMPARISON_FIELDS) {
      const row = this.tableBodyEl.createEl('tr', { cls: 'kitap-comparison-row' });
      row.dataset.field = field.key;

      const firstVal = this.formatFieldValue(this.options.providers[0]?.data[field.key], field.key);
      const isDiff =
        this.options.providers.length >= 2 &&
        this.options.providers.some(
          (p) => this.formatFieldValue(p.data[field.key], field.key) !== firstVal
        );

      if (isDiff) {
        row.addClass('kitap-row-diff');
      }

      // 1. Sütun: Alan Adı
      const labelCell = row.createEl('td', { cls: 'kitap-td-label' });
      labelCell.createSpan({ text: field.label });
      if (isDiff) {
        labelCell.createSpan({ cls: 'kitap-diff-dot', attr: { title: 'Farklı Değerler' } });
      }

      // Sağlayıcı Sütunları
      for (const p of this.options.providers) {
        const td = row.createEl('td', {
          cls: 'kitap-td-val kitap-cell-selectable',
        });
        td.tabIndex = 0;
        td.dataset.providerId = p.id;
        td.dataset.field = field.key;

        this.renderCellContent(td, p.data[field.key], field.key, p.id);

        const selectThis = () => {
          this.selections[field.key] = p.id;
          this.updateRowSelectionClasses(row, field.key);
        };

        td.addEventListener('click', selectThis);
        td.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            selectThis();
          }
        });
      }
    }

    this.updateTableSelectionClasses();
  }

  /**
   * Hücre içeriğini alan tipine göre zengin biçimlendirmeyle çizer.
   */
  private renderCellContent(
    td: HTMLElement,
    value: unknown,
    key: keyof BookMetadata,
    _providerId: string
  ): void {
    td.empty();

    const checkWrapper = td.createSpan({ cls: 'kitap-cell-check' });
    checkWrapper.setText('✓');

    const contentDiv = td.createDiv({ cls: 'kitap-cell-content' });

    if (key === 'coverUrl') {
      const url = toSafeString(value);
      if (url) {
        const coverBox = contentDiv.createDiv({ cls: 'kitap-cover-cell-box' });
        coverBox.createEl('img', {
          cls: 'kitap-cover-cell-img',
          attr: { src: url, alt: 'Kapak Önizleme' },
        });
        coverBox.createSpan({ cls: 'kitap-cover-cell-text', text: 'Kapak Görseli' });
      } else {
        contentDiv.createSpan({ cls: 'kitap-val-empty', text: '—' });
      }
      return;
    }

    if (key === 'description') {
      const desc = toSafeString(value);
      if (desc) {
        const descBox = contentDiv.createDiv({ cls: 'kitap-desc-box' });
        const textEl = descBox.createDiv({
          cls: 'kitap-desc-text kitap-desc-preview is-clamped',
          text: desc,
        });

        if (desc.length > 140) {
          const toggleBtn = descBox.createSpan({
            cls: 'kitap-desc-toggle',
            text: 'Daha fazla göster',
          });
          toggleBtn.addEventListener('click', (e: MouseEvent) => {
            e.stopPropagation();
            const isClamped = textEl.classList.contains('is-clamped');
            if (isClamped) {
              textEl.classList.remove('is-clamped');
              textEl.classList.add('is-expanded');
              toggleBtn.setText('Daha az göster');
            } else {
              textEl.classList.remove('is-expanded');
              textEl.classList.add('is-clamped');
              toggleBtn.setText('Daha fazla göster');
            }
          });
        }
      } else {
        contentDiv.createSpan({ cls: 'kitap-val-empty', text: '—' });
      }
      return;
    }

    if (key === 'rating') {
      const numRating = typeof value === 'number' ? value : Number(toSafeString(value));
      if (!isNaN(numRating) && numRating > 0) {
        contentDiv.createSpan({ cls: 'kitap-val-rating', text: `★ ${numRating}/5` });
      } else {
        contentDiv.createSpan({ cls: 'kitap-val-empty', text: '—' });
      }
      return;
    }

    if (key === 'genres') {
      const arr = Array.isArray(value) ? (value as unknown[]) : [];
      if (arr.length > 0) {
        const pillGroup = contentDiv.createDiv({ cls: 'kitap-genre-pills' });
        for (const g of arr) {
          const gStr = typeof g === 'string' ? g.trim() : typeof g === 'number' ? String(g) : '';
          if (gStr) {
            pillGroup.createSpan({ cls: 'kitap-genre-pill', text: gStr });
          }
        }
      } else {
        contentDiv.createSpan({ cls: 'kitap-val-empty', text: '—' });
      }
      return;
    }

    const formatted = this.formatFieldValue(value, key);
    if (formatted) {
      contentDiv.createSpan({ text: formatted });
    } else {
      contentDiv.createSpan({ cls: 'kitap-val-empty', text: '—' });
    }
  }

  private formatFieldValue(value: unknown, key: keyof BookMetadata): string {
    if (value === undefined || value === null) return '';
    if (key === 'genres' && Array.isArray(value)) {
      return (value as unknown[])
        .map((x) => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : ''))
        .filter(Boolean)
        .join(', ');
    }
    return toSafeString(value);
  }

  /**
   * Belirli bir satırdaki hücrelerin `is-selected` sınıfını günceller.
   */
  private updateRowSelectionClasses(row: HTMLTableRowElement, fieldKey: string): void {
    const selectedProviderId = this.selections[fieldKey];
    const cells = Array.from(row.querySelectorAll<HTMLElement>('.kitap-cell-selectable'));

    for (const cell of cells) {
      if (cell.dataset.providerId === selectedProviderId) {
        cell.addClass('is-selected');
      } else {
        cell.removeClass('is-selected');
      }
    }
  }

  /**
   * Tüm tablodaki hücrelerin seçim durumunu günceller.
   */
  private updateTableSelectionClasses(): void {
    if (!this.tableBodyEl) return;
    const rows = Array.from(
      this.tableBodyEl.querySelectorAll<HTMLTableRowElement>('.kitap-comparison-row')
    );

    for (const row of rows) {
      const fieldKey = row.dataset.field;
      if (fieldKey) {
        this.updateRowSelectionClasses(row, fieldKey);
      }
    }
  }

  /**
   * Alt buton alanını (Vazgeç & Onayla) çizer.
   */
  private renderFooter(container: HTMLElement): void {
    const footerSetting = new Setting(container);
    footerSetting.setClass('kitap-comparison-footer');

    footerSetting.addButton((btn) => {
      btn.setButtonText('Vazgeç').onClick(() => {
        this.isResolved = true;
        this.close();
        this.options.onCancel?.();
      });
    });

    const submitText = this.options.insertIntoActive ? 'Aktif Nota Ekle' : 'Not Oluştur';
    footerSetting.addButton((btn) => {
      btn
        .setButtonText(submitText)
        .setCta()
        .onClick(async () => {
          this.isResolved = true;
          this.close();
          const finalMetadata = this.buildSelectedMetadata();
          await this.options.onConfirm(finalMetadata);
        });
    });
  }

  /**
   * Kullanıcının tablodan seçtiği değerlere göre nihai BookMetadata nesnesini derler.
   */
  buildSelectedMetadata(): BookMetadata {
    const providersMap = new Map<string, BookMetadata>();
    for (const p of this.options.providers) {
      providersMap.set(p.id, p.data);
    }

    const p1 = this.options.providers[0];
    const defaultData = p1?.data || ({} as BookMetadata);

    const getFieldVal = <T>(key: keyof BookMetadata): T | undefined => {
      const selectedId = this.selections[key];
      const source = (selectedId && providersMap.get(selectedId)) || defaultData;
      return source[key] as T | undefined;
    };

    const titleProviderId = this.selections['title'] || p1?.id;
    const primaryData = (titleProviderId && providersMap.get(titleProviderId)) || defaultData;
    const secondaryData = this.options.providers.find((p) => p.id !== titleProviderId)?.data;

    const id = primaryData.id || secondaryData?.id || defaultData.id || '';
    const url = primaryData.url || secondaryData?.url || defaultData.url || '';
    const title = (getFieldVal<string>('title') || defaultData.title || '').trim();
    const author = (getFieldVal<string>('author') || defaultData.author || '').trim();
    const publisher = (getFieldVal<string>('publisher') || defaultData.publisher || '').trim();
    const translator = getFieldVal<string>('translator') || undefined;
    const isbn = (getFieldVal<string>('isbn') || defaultData.isbn || '').trim();
    const pages = getFieldVal<number>('pages');
    const publishDate = getFieldVal<string>('publishDate') || undefined;
    const format = getFieldVal<string>('format') || undefined;
    const language = getFieldVal<string>('language') || undefined;
    const genres = getFieldVal<string[]>('genres') || undefined;
    const price = getFieldVal<string>('price') || undefined;
    const rating = getFieldVal<number>('rating');
    const ratingProviderId = this.selections['rating'];
    const ratingData = (ratingProviderId && providersMap.get(ratingProviderId)) || primaryData;
    const ratingCount =
      ratingData.ratingCount ??
      this.options.providers.find((p) => p.data.ratingCount !== undefined)?.data.ratingCount;
    const coverUrl = getFieldVal<string>('coverUrl') || defaultData.coverUrl || '';
    const description = getFieldVal<string>('description') || undefined;

    return {
      id,
      url,
      title,
      author,
      publisher,
      ...(translator ? { translator } : {}),
      isbn,
      ...(pages !== undefined ? { pages } : {}),
      ...(publishDate ? { publishDate } : {}),
      coverUrl,
      ...(description ? { description } : {}),
      ...(rating !== undefined ? { rating } : {}),
      ...(ratingCount !== undefined ? { ratingCount } : {}),
      ...(price ? { price } : {}),
      ...(format ? { format } : {}),
      ...(genres && genres.length > 0 ? { genres } : {}),
      ...(language ? { language } : {}),
      provider: 'hybrid',
    };
  }

  onClose(): void {
    if (!this.isResolved) {
      this.isResolved = true;
      this.options.onCancel?.();
    }
    this.contentEl.empty();
  }
}
