import { App, Modal, Setting } from 'obsidian';
import { BookMetadata } from '../types';
import { mergeBookMetadata, resolveBestValue } from '../providers/matcher';

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
    const p1 = this.options.providers[0];
    const p2 = this.options.providers[1];

    if (!p1) return;

    for (const field of COMPARISON_FIELDS) {
      if (p2) {
        const best = resolveBestValue(p1.data[field.key], p2.data[field.key], field.key);
        this.selections[field.key] = best.source === 'dr' ? p2.id : p1.id;
      } else {
        this.selections[field.key] = p1.id;
      }
    }
  }

  onOpen(): void {
    const { contentEl, titleEl } = this;
    contentEl.empty();
    contentEl.addClass('kitap-comparison-modal');

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
      const d1 = this.options.providers[0].data;
      const d2 = this.options.providers[1].data;
      for (const f of COMPARISON_FIELDS) {
        if (this.formatFieldValue(d1[f.key], f.key) !== this.formatFieldValue(d2[f.key], f.key)) {
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
      const th = headerRow.createEl('th', { cls: 'col-provider-header' });
      th.createSpan({ cls: `kitap-badge kitap-badge-${p.id}`, text: p.name });
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

      const isDiff =
        this.options.providers.length >= 2 &&
        this.formatFieldValue(this.options.providers[0].data[field.key], field.key) !==
          this.formatFieldValue(this.options.providers[1].data[field.key], field.key);

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
        const preview = desc.length > 140 ? `${desc.slice(0, 140)}...` : desc;
        contentDiv.createSpan({ cls: 'kitap-desc-preview', text: preview });
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
    const p1 = this.options.providers[0];
    const p2 = this.options.providers[1];

    if (!p2) {
      return { ...p1.data };
    }

    // Typed selection map for mergeBookMetadata
    const typedSelections: Record<string, 'kitapyurdu' | 'dr'> = {};
    for (const [key, providerId] of Object.entries(this.selections)) {
      typedSelections[key] = providerId === 'dr' ? 'dr' : 'kitapyurdu';
    }

    const kyData = p1.id === 'kitapyurdu' ? p1.data : p2.data;
    const drData = p1.id === 'dr' ? p1.data : p2.data;

    return mergeBookMetadata(kyData, drData, typedSelections);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
