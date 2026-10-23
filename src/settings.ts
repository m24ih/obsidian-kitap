import { App, DropdownComponent, Notice, PluginSettingTab, Setting } from 'obsidian';
import type KitapPlugin from './main';
import {
  DEFAULT_STATIC_TEMPLATE,
  DEFAULT_REACTIVE_TEMPLATE,
} from './types';
import { FileSuggest } from './settings/fileSuggest';
import { FolderSuggest } from './settings/folderSuggest';
import { PropertyMappingComponent } from './settings/propertyMappingComponent';
import { PropertyMappingData } from './settings/propertyMapping';
import { adaptTemplateToPropertyMappings } from './templates/templateAdapter';

export class KitapSettingTab extends PluginSettingTab {
  plugin: KitapPlugin;

  constructor(app: App, plugin: KitapPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl('p', {
      text: 'Kitapyurdu üzerinden kitap arama, metaveri çekme, YAML özellik eşleme ve şablon seçeneklerini buradan özelleştirebilirsiniz.',
      cls: 'setting-item-description',
    });

    // ----------------------------------------------------
    // Bölüm 1: Genel Dosya Ayarları
    // ----------------------------------------------------
    new Setting(containerEl).setName('Genel dosya ayarları').setHeading();

    new Setting(containerEl)
      .setName('Hedef Klasör')
      .setDesc('Oluşturulan kitap notlarının kaydedileceği vault klasörü. Klasör mevcut değilse otomatik olarak oluşturulur.')
      .addText((text) => {
        const suggester = new FolderSuggest(this.app, text.inputEl);
        suggester.onSelect(async (folder) => {
          text.setValue(folder.path);
          this.plugin.settings.targetFolder = folder.path.trim();
          await this.plugin.saveSettings();
          suggester.close();
        });
        text
          .setPlaceholder('Kitaplar')
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value) => {
            this.plugin.settings.targetFolder = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Dosya Adı Şablonu')
      .setDesc('Oluşturulacak kitap notu dosyasının adı formatı. Kullanılabilir değişkenler: {{baslik}}, {{yazar}}, {{yayinevi}}, {{isbn}}, {{yayin_tarihi}} (İngilizce takma adlar: {{title}}, {{author}}).')
      .addText((text) =>
        text
          .setPlaceholder('{{baslik}} - {{yazar}}')
          .setValue(this.plugin.settings.fileNameTemplate)
          .onChange(async (value) => {
            this.plugin.settings.fileNameTemplate = value.trim();
            await this.plugin.saveSettings();
          })
      );

    // ----------------------------------------------------
    // Bölüm: Metaveri Sağlayıcı Ayarları
    // ----------------------------------------------------
    new Setting(containerEl).setName('Metaveri sağlayıcı ayarları').setHeading();

    new Setting(containerEl)
      .setName('Varsayılan Metaveri Sağlayıcı')
      .setDesc('Kitap arama ve bilgi çekme işlemlerinde varsayılan olarak kullanılacak veri sağlayıcı.')
      .addDropdown((dropdown) => {
        const providers = this.plugin.aggregator?.getAvailableProviders?.() ?? [
          { id: 'kitapyurdu', name: 'Kitapyurdu' },
        ];
        for (const provider of providers) {
          dropdown.addOption(provider.id, provider.name);
        }
        const currentSetting = this.plugin.settings.defaultProvider || 'kitapyurdu';
        const hasCurrent = providers.some((p) => p.id === currentSetting);
        const resolvedValue = hasCurrent ? currentSetting : (providers[0]?.id ?? 'kitapyurdu');
        dropdown
          .setValue(resolvedValue)
          .onChange(async (value) => {
            this.plugin.settings.defaultProvider = value;
            this.plugin.aggregator?.setDefaultProvider?.(value);
            await this.plugin.saveSettings();
          });
      });

    // ----------------------------------------------------
    // Bölüm: Kapak Görselleri
    // ----------------------------------------------------
    new Setting(containerEl).setName('Kapak görselleri').setHeading();

    new Setting(containerEl)
      .setName('Kapak Görsellerini İndir')
      .setDesc('Yeni kitap notları oluşturulurken kapak görselini yerel olarak indirir ve vault içine kaydeder. Böylece her kitap için harici bağlantıya gerek kalmaz.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.downloadCovers)
          .onChange(async (value) => {
            this.plugin.settings.downloadCovers = value;
            await this.plugin.saveSettings();
            this.refresh();
          })
      );

    if (this.plugin.settings.downloadCovers) {
      new Setting(containerEl)
        .setClass('kitap-setting-wide-control')
        .setName('Kapak Klasörü')
        .setDesc('İndirilen kitap kapaklarının kaydedileceği vault klasörü. Klasör mevcut değilse otomatik olarak oluşturulur.')
        .addSearch((cb) => {
          const suggester = new FolderSuggest(this.app, cb.inputEl);
          suggester.onSelect(async (folder) => {
            cb.setValue(folder.path);
            this.plugin.settings.coverFolder = folder.path.trim();
            await this.plugin.saveSettings();
            suggester.close();
          });
          cb.setPlaceholder('Kitaplar/Kapaklar')
            .setValue(this.plugin.settings.coverFolder)
            .onChange(async (value) => {
              this.plugin.settings.coverFolder = value.trim();
              await this.plugin.saveSettings();
            });
        });
    }

    // ----------------------------------------------------
    // Bölüm: Okuma Durumu Ayarları
    // ----------------------------------------------------
    new Setting(containerEl).setName('Okuma durumu ayarları').setHeading();

    let defaultStatusDropdown: DropdownComponent | null = null;

    new Setting(containerEl)
      .setName('Okuma Durumu Seçenekleri')
      .setDesc('Kitaplar için kullanabileceğiniz durum seçenekleri (virgülle ayırarak girin). Örn: Okunacak, Okunuyor, Okundu veya TBR, Reading, Read.')
      .addText((text) =>
        text
          .setPlaceholder('Okunacak, Okunuyor, Okundu')
          .setValue(this.plugin.settings.readingStatusOptions.join(', '))
          .onChange(async (value) => {
            const rawOpts = value.split(',').map((s) => s.trim()).filter(Boolean);
            const options = rawOpts.length > 0 ? rawOpts : ['Okunacak'];
            this.plugin.settings.readingStatusOptions = options;
            if (!options.includes(this.plugin.settings.defaultReadingStatus)) {
              this.plugin.settings.defaultReadingStatus = options[0];
            }
            await this.plugin.saveSettings();

            // Sayfayı yeniden çizmek (this.display) odak kaybına yol açtığı için
            // sadece açılır kutu (dropdown) seçeneklerini yerinde güncelliyoruz.
            if (defaultStatusDropdown) {
              const selectEl = defaultStatusDropdown.selectEl;
              selectEl.empty();
              const internalDropdown = defaultStatusDropdown as unknown as { options?: Record<string, string> };
              if (internalDropdown.options) {
                internalDropdown.options = {};
              }
              for (const opt of options) {
                defaultStatusDropdown.addOption(opt, opt);
              }
              if (!options.includes(this.plugin.settings.defaultReadingStatus)) {
                defaultStatusDropdown.addOption(this.plugin.settings.defaultReadingStatus, this.plugin.settings.defaultReadingStatus);
              }
              defaultStatusDropdown.setValue(this.plugin.settings.defaultReadingStatus);
            }
          })
      );

    new Setting(containerEl)
      .setName('Varsayılan Okuma Durumu')
      .setDesc('Yeni eklenen kitap notuna otomatik atanacak başlangıç okuma durumu.')
      .addDropdown((dropdown) => {
        defaultStatusDropdown = dropdown;
        const opts = this.plugin.settings.readingStatusOptions;
        for (const opt of opts) {
          dropdown.addOption(opt, opt);
        }
        if (!opts.includes(this.plugin.settings.defaultReadingStatus)) {
          dropdown.addOption(this.plugin.settings.defaultReadingStatus, this.plugin.settings.defaultReadingStatus);
        }
        dropdown
          .setValue(this.plugin.settings.defaultReadingStatus)
          .onChange(async (value) => {
            this.plugin.settings.defaultReadingStatus = value;
            await this.plugin.saveSettings();
          });
      });

    // ----------------------------------------------------
    // Bölüm 2: Not Şablonu ve Biçimlendirme
    // ----------------------------------------------------
    new Setting(containerEl).setName('Not şablonu ve biçimlendirme').setHeading();

    const currentMode = this.plugin.settings.templateMode || 'static';

    new Setting(containerEl)
      .setName('Şablon Modu')
      .setDesc('Kitap notları oluşturulurken kullanılacak şablon yapısı.')
      .addDropdown((dropdown) => {
        dropdown
          .addOption('static', 'Statik Şablon (Standart Markdown)')
          .addOption('reactive', 'Reaktif Şablon (Dataview & Templater)')
          .addOption('custom', 'Özel Şablon (Vault İçi Dosya veya Metin)')
          .setValue(currentMode)
          .onChange(async (value) => {
            this.plugin.settings.templateMode = value as 'static' | 'reactive' | 'custom';
            await this.plugin.saveSettings();
            this.refresh();
          });
      });

    if (currentMode === 'static') {
      const modeDesc = containerEl.createDiv({ cls: 'setting-item-description kitap-mode-desc' });
      modeDesc.setText('ℹ️ Standart Statik Markdown şablonu etkindir. Ek eklenti gerektirmeden sade ve kalıcı notlar üretir.');

      new Setting(containerEl)
        .setName('Bu Şablonu Özelleştir')
        .setDesc('Statik şablonu temel alarak düzenlemek için Özel Şablon moduna aktarın.')
        .addButton((btn) => {
          btn.setButtonText('Özel Şablona Kopyala ve Düzenle').onClick(async () => {
            this.plugin.settings.templateMode = 'custom';
            this.plugin.settings.noteTemplate = DEFAULT_STATIC_TEMPLATE;
            await this.plugin.saveSettings();
            new Notice('Statik şablon düzenlenebilir özel şablon alanına kopyalandı.');
            this.refresh();
          });
        });
    } else if (currentMode === 'reactive') {
      const modeDesc = containerEl.createDiv({ cls: 'setting-item-description kitap-mode-desc' });
      modeDesc.setText('✨ Reaktif şablon etkindir. Dataview / DataviewJS ve Templater desteğiyle dinamik okuma ilerlemesi (%), okuma günlüğü ve alıntılar tablosu sunar.');

      new Setting(containerEl)
        .setName('Bu Şablonu Özelleştir')
        .setDesc('Reaktif şablonu temel alarak düzenlemek için Özel Şablon moduna aktarın.')
        .addButton((btn) => {
          btn.setButtonText('Özel Şablona Kopyala ve Düzenle').onClick(async () => {
            this.plugin.settings.templateMode = 'custom';
            this.plugin.settings.noteTemplate = DEFAULT_REACTIVE_TEMPLATE;
            await this.plugin.saveSettings();
            new Notice('Reaktif şablon düzenlenebilir özel şablon alanına kopyalandı.');
            this.refresh();
          });
        });
    } else {
      // custom modu: Hem dosya hem doğrudan metin alanı
      new Setting(containerEl)
        .setClass('kitap-setting-wide-control')
        .setName('Şablon Dosyası (Vault İçi)')
        .setDesc('Kitap notları oluşturulurken kullanılacak vault içi Markdown şablon dosyası (.md). Belirtilirse aşağıdaki metin şablonu yerine bu dosya kullanılır.')
        .addSearch((cb) => {
          const suggester = new FileSuggest(this.app, cb.inputEl);
          suggester.onSelect(async (file) => {
            cb.setValue(file.path);
            this.plugin.settings.templateFile = file.path.trim();
            await this.plugin.saveSettings();
            suggester.close();
          });
          cb.setPlaceholder('Örnek: Sablonlar/KitapSablonu.md')
            .setValue(this.plugin.settings.templateFile || '')
            .onChange(async (value) => {
              this.plugin.settings.templateFile = value.trim();
              await this.plugin.saveSettings();
            });
        });

      new Setting(containerEl)
        .setClass('kitap-setting-stacked')
        .setName('Doğrudan Not Şablonu (Markdown)')
        .setDesc('Şablon dosyası seçilmediğinde veya bulunamadığında kullanılacak standart metin şablonu.')
        .addTextArea((textArea) => {
          textArea
            .setPlaceholder('Markdown şablonunuzu buraya girin...')
            .setValue(this.plugin.settings.noteTemplate)
            .onChange(async (value) => {
              this.plugin.settings.noteTemplate = value;
              await this.plugin.saveSettings();
            });
          textArea.inputEl.rows = 14;
        });

      new Setting(containerEl)
        .setName('Şablonu Sıfırla / İçe Aktar')
        .setDesc('Özel metin şablonunu yerleşik şablonlardan birine dönüştürür.')
        .addButton((button) =>
          button
            .setButtonText('Statik Şablona Dönüştür')
            .onClick(async () => {
              this.plugin.settings.noteTemplate = DEFAULT_STATIC_TEMPLATE;
              await this.plugin.saveSettings();
              new Notice('Not şablonu orijinal Statik şablona dönüştürüldü.');
              this.refresh();
            })
        )
        .addButton((button) =>
          button
            .setButtonText('Reaktif Şablona Dönüştür')
            .onClick(async () => {
              this.plugin.settings.noteTemplate = DEFAULT_REACTIVE_TEMPLATE;
              await this.plugin.saveSettings();
              new Notice('Not şablonu Reaktif şablona dönüştürüldü.');
              this.refresh();
            })
        );
    }

    // ----------------------------------------------------
    // Bölüm 3: Templater Entegrasyonu
    // ----------------------------------------------------
    new Setting(containerEl).setName('Templater entegrasyonu').setHeading();

    new Setting(containerEl)
      .setName('Templater Entegrasyonunu Etkinleştir')
      .setDesc(
        'Templater eklentisi ile entegrasyon sağlar. Not oluşturulduğunda Templater otomatik çalıştırılır ve şablonlarınızda `book` objesine (<%* const b = book; %>) erişebilirsiniz. (Templater eklentisinin kurulu olması gerekir).'
      )
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableTemplaterIntegration)
          .onChange(async (value) => {
            this.plugin.settings.enableTemplaterIntegration = value;
            await this.plugin.saveSettings();
          })
      );

    // ----------------------------------------------------
    // Bölüm 4: YAML Frontmatter & Özellik Eşlemeleri (Property Mappings)
    // ----------------------------------------------------
    new Setting(containerEl).setName('YAML frontmatter ve özellik eşlemeleri').setHeading();

    new Setting(containerEl)
      .setName('Varsayılan Frontmatter Oluştur')
      .setDesc('Etkinleştirildiğinde, aşağıdaki özellik eşlemelerine göre otomatik YAML frontmatter oluşturulur. Devre dışı bırakılırsa yalnızca şablonda tanımlı frontmatter kullanılır.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.useDefaultFrontMatter)
          .onChange(async (value) => {
            this.plugin.settings.useDefaultFrontMatter = value;
            await this.plugin.saveSettings();
            this.refresh();
          })
      );

    if (this.plugin.settings.useDefaultFrontMatter) {
      const mappingContainer = containerEl.createDiv('kitap-property-mappings-section');
      const comp = new PropertyMappingComponent(mappingContainer, {
        mappings: this.plugin.settings.propertyMappings,
        save: async (updated: PropertyMappingData[]) => {
          this.plugin.settings.propertyMappings = updated;
          if (this.plugin.settings.noteTemplate) {
            this.plugin.settings.noteTemplate = adaptTemplateToPropertyMappings(
              this.plugin.settings.noteTemplate,
              updated
            );
          }
          await this.plugin.saveSettings();
          new Notice('Özellik eşlemeleri kaydedildi ve şablon etiketleri güncellendi.');
        },
      });
      comp.onload();
    }

    // ----------------------------------------------------
    // Bölüm 5: Değişkenler Rehberi (Bilgi Kutusu)
    // ----------------------------------------------------
    const infoContainer = containerEl.createDiv({ cls: 'kitap-settings-guide' });

    new Setting(infoContainer).setName('Kullanılabilir şablon değişkenleri').setHeading();
    const list = infoContainer.createEl('ul', { cls: 'kitap-vars-list' });

    const variables: { tag: string; desc: string }[] = [
      { tag: '{{baslik}} / {{title}}', desc: 'Kitap Başlığı' },
      { tag: '{{yazar}} / {{author}}', desc: 'Yazar(lar)' },
      { tag: '{{yayinevi}} / {{publisher}}', desc: 'Yayınevi' },
      { tag: '{{cevirmen}} / {{translator}}', desc: 'Çevirmen (varsa)' },
      { tag: '{{isbn}}', desc: '13 haneli ISBN numarası' },
      { tag: '{{sayfa}} / {{pages}}', desc: 'Sayfa sayısı' },
      { tag: '{{okunan_sayfa}}', desc: 'Okunan mevcut sayfa (varsayılan: 0)' },
      { tag: '{{toplam_sayfa}}', desc: 'Toplam sayfa sayısı' },
      { tag: '{{yayin_tarihi}} / {{publishDate}}', desc: 'Yayın tarihi' },
      { tag: '{{kapak}} / {{coverUrl}}', desc: 'Kapak görseli bağlantısı (indirildiğinde vault içi wikilink formatı)' },
      { tag: '{{coverPath}}', desc: 'İndirilen kapak görselinin vault içi ham dosya yolu' },
      { tag: '{{okuma_durumu}} / {{readingStatus}}', desc: 'Kitap okuma durumu (örn: Okunacak, Okunuyor)' },
      { tag: '{{fiyat}} / {{price}}', desc: 'Kitap liste veya satış fiyatı (örn: 220.35 TRY)' },
      { tag: '{{format}}', desc: 'Cilt tipi / baskı formatı (örn: Karton Kapak, Ciltli)' },
      { tag: '{{tur}} / {{genres}}', desc: 'Kategoriler / Türler (örn: Edebiyat, Bilimkurgu)' },
      { tag: '{{orijinal_baslik}} / {{originalTitle}}', desc: 'Kitabın orijinal adı (Dune vb.)' },
      { tag: '{{dil}} / {{language}}', desc: 'Basım dili (TÜRKÇE vb.)' },
      { tag: '{{puan}} / {{rating}}', desc: 'Kitapyurdu okur puanı (0-5)' },
      { tag: '{{aciklama}} / {{description}}', desc: 'Kitap açıklaması / tanıtım bülteni' },
      { tag: '{{url}}', desc: 'Kitapyurdu ürün sayfası bağlantısı' },
    ];

    for (const v of variables) {
      const item = list.createEl('li');
      item.createEl('code', { text: v.tag });
      item.appendText(`: ${v.desc}`);
    }
  }

  /**
   * Ayarlar sekmesini güvenle yeniden çizer.
   */
  private refresh(): void {
    this.display();
  }
}
