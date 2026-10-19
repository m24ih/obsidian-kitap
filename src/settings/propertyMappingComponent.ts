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
    this.render();
  }

  private onModelUpdate(): void {
    this.unsavedChanges = true;
    this.render();
  }

  render(): void {
    this.containerEl.empty();

    const validation = this.validationResult;
    const rootEl = this.containerEl.createDiv('kitap-property-mappings-container');

    // Başlık ve Eylemler
    const headerEl = rootEl.createDiv('kitap-property-mappings-header');
    const titleEl = headerEl.createDiv({ cls: 'setting-item-name', text: 'Kitap Özellik Eşlemeleri (Property Mappings)' });
    titleEl.createDiv({
      cls: 'setting-item-description',
      text: 'Her alanın YAML frontmatter içerisinde nasıl adlandırılacağını veya kaldırılacağını belirleyin.',
    });

    const actionsEl = headerEl.createDiv('kitap-property-mappings-actions');
    if (this.unsavedChanges) {
      actionsEl.createDiv({ cls: 'kitap-property-mapping-unsaved-changes', text: 'Kaydedilmemiş değişiklikler var' });
    }

    const saveButtonEl = actionsEl.createEl('button', {
      cls: `kitap-property-mappings-save-button ${validation.res ? 'mod-cta' : 'mod-muted'}`,
      text: 'Eşlemeleri Kaydet',
    });
    if (!validation.res) {
      saveButtonEl.disabled = true;
    }
    saveButtonEl.addEventListener('click', () => {
      void this.handleSave();
    });

    // Doğrulama Hatası Bildirimi
    if (!validation.res && validation.err) {
      rootEl.createDiv({
        cls: 'kitap-property-mapping-validation',
        text: `Hata: ${validation.err}`,
      });
    }

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
        [PropertyMappingOption.Default]: 'Varsayılan (default)',
        [PropertyMappingOption.Map]: 'Yeniden Adlandır (remap)',
        [PropertyMappingOption.Remove]: 'Kaldır (remove)',
      };

      for (const opt of PROPERTY_MAPPING_OPTIONS) {
        selectEl.createEl('option', {
          attr: { value: opt },
          text: optionLabels[opt],
        });
      }
      selectEl.value = prop.mapping;
      selectEl.addEventListener('change', (e) => {
        const target = e.currentTarget as HTMLSelectElement;
        this.mappings[i].mapping = target.value as PropertyMappingOption;
        if (target.value !== PropertyMappingOption.Map) {
          this.mappings[i].newProperty = '';
        }
        this.onModelUpdate();
      });

      // 3. Yeni Ad (input)
      const newNameCellEl = rowEl.createEl('td', 'col-new-name');
      if (prop.mapping === PropertyMappingOption.Map) {
        const mappingToEl = newNameCellEl.createDiv('kitap-property-mapping-to');
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
          this.mappings[i].newProperty = target.value;
          this.onModelUpdate();
        });
      } else {
        newNameCellEl.createSpan({
          cls: 'kitap-property-mapping-disabled-text',
          text: '—',
        });
      }

      // 4. Wikilink (checkbox)
      const wikilinkCellEl = rowEl.createEl('td', 'col-wikilink');
      if (prop.mapping === PropertyMappingOption.Remove) {
        wikilinkCellEl.createSpan({
          cls: 'kitap-property-mapping-disabled-text',
          text: '—',
        });
      } else {
        const wikilinkLabelEl = wikilinkCellEl.createEl('label', {
          cls: 'kitap-property-mapping-wikilink-label',
          attr: { title: 'Değeri [[wikilink]] biçiminde sarar' },
        });
        const wikilinkInputEl = wikilinkLabelEl.createEl('input', { type: 'checkbox' });
        wikilinkInputEl.checked = Boolean(prop.wikilink);
        wikilinkInputEl.addEventListener('change', (e) => {
          const target = e.currentTarget as HTMLInputElement;
          this.mappings[i].wikilink = target.checked;
          this.onModelUpdate();
        });
      }
    }
  }
}
