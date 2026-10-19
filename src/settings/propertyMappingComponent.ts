import { Component, setIcon } from 'obsidian';
import {
  PropertyMappingData,
  PropertyMappingOption,
  PROPERTY_MAPPING_OPTIONS,
  validatePropertyMappings,
} from './propertyMapping';

interface PropertyMappingComponentProps {
  mappings: PropertyMappingData[];
  save: (mappings: PropertyMappingData[]) => Promise<void>;
}

export class PropertyMappingComponent extends Component {
  private containerEl: HTMLElement;
  private mappings: PropertyMappingData[];
  private readonly save: (mappings: PropertyMappingData[]) => Promise<void>;
  private unsavedChanges = false;

  private saveButtonEl!: HTMLButtonElement;
  private unsavedChangesEl!: HTMLElement;
  private validationEl!: HTMLElement;

  constructor(containerEl: HTMLElement, props: PropertyMappingComponentProps) {
    super();
    this.containerEl = containerEl;
    this.mappings = structuredClone(props.mappings);
    this.save = props.save;
  }

  override onload(): void {
    this.render();
  }

  override onunload(): void {
    this.containerEl.empty();
  }

  private get validationResult(): { res: boolean; err?: string } {
    return validatePropertyMappings(this.mappings);
  }

  private async handleSave(): Promise<void> {
    const val = this.validationResult;
    if (!val.res) return;

    await this.save(structuredClone(this.mappings));
    this.unsavedChanges = false;
    this.updateStateUI();
  }

  /**
   * Input odağını (focus) ve cursor pozisyonunu kaybetmeden
   * yalnızca buton, uyarı ve değişiklik bildirim durumlarını günceller.
   */
  private updateStateUI(): void {
    const validation = this.validationResult;

    if (this.unsavedChangesEl) {
      this.unsavedChangesEl.style.display = this.unsavedChanges ? 'inline-block' : 'none';
    }

    if (this.saveButtonEl) {
      if (validation.res) {
        this.saveButtonEl.disabled = false;
        this.saveButtonEl.classList.remove('mod-muted');
        this.saveButtonEl.classList.add('mod-cta');
      } else {
        this.saveButtonEl.disabled = true;
        this.saveButtonEl.classList.remove('mod-cta');
        this.saveButtonEl.classList.add('mod-muted');
      }
    }

    if (this.validationEl) {
      if (!validation.res && validation.err) {
        this.validationEl.style.display = 'block';
        this.validationEl.textContent = `Hata: ${validation.err}`;
      } else {
        this.validationEl.style.display = 'none';
        this.validationEl.textContent = '';
      }
    }
  }

  private renderNewNameCell(cellEl: HTMLElement, index: number, autoFocus = false): void {
    cellEl.empty();
    const prop = this.mappings[index];

    if (prop.mapping === PropertyMappingOption.Map) {
      const mappingToEl = cellEl.createDiv('kitap-property-mapping-to');
      const iconWrapperEl = mappingToEl.createDiv('kitap-icon-wrapper');
      try {
        setIcon(iconWrapperEl, 'arrow-right');
      } catch {
        iconWrapperEl.setText('→');
      }

      const inputEl = mappingToEl.createEl('input', {
        cls: 'kitap-property-mapping-input',
        type: 'text',
      });
      inputEl.placeholder = 'Yeni YAML anahtarı';
      inputEl.spellcheck = false;
      inputEl.value = prop.newProperty;
      inputEl.addEventListener('input', (e) => {
        const target = e.currentTarget as HTMLInputElement;
        this.mappings[index].newProperty = target.value;
        this.unsavedChanges = true;
        this.updateStateUI();
      });

      if (autoFocus) {
        setTimeout(() => inputEl.focus(), 0);
      }
    } else {
      cellEl.createSpan({
        cls: 'kitap-property-mapping-disabled-text',
        text: '—',
      });
    }
  }

  private renderWikilinkCell(cellEl: HTMLElement, index: number): void {
    cellEl.empty();
    const prop = this.mappings[index];

    if (prop.mapping === PropertyMappingOption.Remove) {
      cellEl.createSpan({
        cls: 'kitap-property-mapping-disabled-text',
        text: '—',
      });
    } else {
      const wikilinkLabelEl = cellEl.createEl('label', {
        cls: 'kitap-property-mapping-wikilink-label',
        attr: { title: 'Değeri [[wikilink]] biçiminde sarar' },
      });
      const wikilinkInputEl = wikilinkLabelEl.createEl('input', { type: 'checkbox' });
      wikilinkInputEl.checked = Boolean(prop.wikilink);
      wikilinkInputEl.addEventListener('change', (e) => {
        const target = e.currentTarget as HTMLInputElement;
        this.mappings[index].wikilink = target.checked;
        this.unsavedChanges = true;
        this.updateStateUI();
      });
    }
  }

  render(): void {
    this.containerEl.empty();

    const rootEl = this.containerEl.createDiv('kitap-property-mappings-container');

    // Başlık ve Eylemler
    const headerEl = rootEl.createDiv('kitap-property-mappings-header');
    const titleEl = headerEl.createDiv({ cls: 'setting-item-name', text: 'Kitap Özellik Eşlemeleri (Property Mappings)' });
    titleEl.createDiv({
      cls: 'setting-item-description',
      text: 'Her alanın YAML frontmatter içerisinde nasıl adlandırılacağını veya kaldırılacağını belirleyin.',
    });

    const actionsEl = headerEl.createDiv('kitap-property-mappings-actions');
    this.unsavedChangesEl = actionsEl.createDiv({
      cls: 'kitap-property-mapping-unsaved-changes',
      text: 'Kaydedilmemiş değişiklikler var',
    });
    this.unsavedChangesEl.style.display = this.unsavedChanges ? 'inline-block' : 'none';

    this.saveButtonEl = actionsEl.createEl('button', {
      cls: 'kitap-property-mappings-save-button mod-cta',
      text: 'Eşlemeleri Kaydet',
    });
    this.saveButtonEl.addEventListener('click', () => {
      void this.handleSave();
    });

    // Doğrulama Hatası Bildirimi
    this.validationEl = rootEl.createDiv({
      cls: 'kitap-property-mapping-validation',
    });
    this.validationEl.style.display = 'none';

    // Tablo
    const tableContainerEl = rootEl.createDiv('kitap-property-mappings-table-container');
    const tableEl = tableContainerEl.createEl('table', 'kitap-property-mappings-table');
    const tableHeadEl = tableEl.createEl('thead');
    const headerRowEl = tableHeadEl.createEl('tr');
    headerRowEl.createEl('th', { cls: 'col-property', text: 'Özellik (Key)' });
    headerRowEl.createEl('th', { cls: 'col-mapping', text: 'Eşleme Kuralı' });
    headerRowEl.createEl('th', { cls: 'col-new-name', text: 'Yeni Ad' });
    headerRowEl.createEl('th', { cls: 'col-wikilink', text: 'Wikilink ([[...]])' });

    const tableBodyEl = tableEl.createEl('tbody');

    for (let i = 0; i < this.mappings.length; i++) {
      const prop = this.mappings[i];
      const rowEl = tableBodyEl.createEl('tr');

      // 1. Özellik Adı
      const propertyCellEl = rowEl.createEl('td', 'col-property');
      propertyCellEl.createEl('code', { text: prop.property });

      // Kilitli kontrolü
      if (prop.locked) {
        const lockedCellEl = rowEl.createEl('td', 'col-locked');
        lockedCellEl.colSpan = 3;
        lockedCellEl.createDiv({
          cls: 'kitap-property-binding-text',
          text: 'Bu özellik kilitlidir ve değiştirilemez.',
        });
        continue;
      }

      // 2. Eşleme Seçimi (dropdown)
      const mappingCellEl = rowEl.createEl('td', 'col-mapping');
      const selectEl = mappingCellEl.createEl('select', 'dropdown');

      const optionLabels: Record<PropertyMappingOption, string> = {
        [PropertyMappingOption.Default]: 'Varsayılan',
        [PropertyMappingOption.Map]: 'Yeniden Adlandır',
        [PropertyMappingOption.Remove]: 'Kaldır',
      };

      for (const opt of PROPERTY_MAPPING_OPTIONS) {
        selectEl.createEl('option', {
          attr: { value: opt },
          text: optionLabels[opt],
        });
      }
      selectEl.value = prop.mapping;

      const newNameCellEl = rowEl.createEl('td', 'col-new-name');
      const wikilinkCellEl = rowEl.createEl('td', 'col-wikilink');

      this.renderNewNameCell(newNameCellEl, i, false);
      this.renderWikilinkCell(wikilinkCellEl, i);

      selectEl.addEventListener('change', (e) => {
        const target = e.currentTarget as HTMLSelectElement;
        const newMapping = target.value as PropertyMappingOption;
        this.mappings[i].mapping = newMapping;
        if (newMapping !== PropertyMappingOption.Map) {
          this.mappings[i].newProperty = '';
        }

        this.renderNewNameCell(newNameCellEl, i, newMapping === PropertyMappingOption.Map);
        this.renderWikilinkCell(wikilinkCellEl, i);

        this.unsavedChanges = true;
        this.updateStateUI();
      });
    }

    this.updateStateUI();
  }
}
