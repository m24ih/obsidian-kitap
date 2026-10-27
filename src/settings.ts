import { App, DropdownComponent, Notice, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
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
      text: 'Kitap arama, metaveri çekme, özellik eşleme ve şablon seçeneklerini buradan yapılandırabilirsiniz.',
      cls: 'setting-item-description',
    });

    // ----------------------------------------------------
    // Genel Dosya Ayarları (Obsidian rehberine göre en üstte başlıksız)
    // ----------------------------------------------------
    new Setting(containerEl)
      .setName('Hedef klasör')
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
      .setName('Dosya adı şablonu')
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
    // Bölüm: Sağlayıcılar
    // ----------------------------------------------------
    new Setting(containerEl).setName('Sağlayıcılar').setHeading();

    const getActiveProviderCount = (): number => {
      let count = 0;
      if (this.plugin.settings.enableKitapyurdu !== false) count++;
      if (this.plugin.settings.enableDr !== false) count++;
      if (this.plugin.settings.enableOpenLibrary) count++;
      if (this.plugin.settings.enableHardcover) count++;
      return count;
    };

    new Setting(containerEl)
      .setName('Kitapyurdu')
      .setDesc('Kitapyurdu.com üzerinden Türkçe kitap arama ve metaveri çekme.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableKitapyurdu !== false)
          .onChange(async (value) => {
            if (!value && getActiveProviderCount() <= 1) {
              new Notice('En az bir kitap sağlayıcısı aktif olmalıdır.');
              toggle.setValue(true);
              return;
            }
            this.plugin.settings.enableKitapyurdu = value;
            this.plugin.aggregator?.setSettings?.(this.plugin.settings);
            await this.plugin.saveSettings();
            this.refresh();
          })
      );

    new Setting(containerEl)
      .setName('D&R')
      .setDesc('D&R (dr.com.tr) üzerinden Türkçe kitap arama ve metaveri çekme.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableDr !== false)
          .onChange(async (value) => {
            if (!value && getActiveProviderCount() <= 1) {
              new Notice('En az bir kitap sağlayıcısı aktif olmalıdır.');
              toggle.setValue(true);
              return;
            }
            this.plugin.settings.enableDr = value;
            this.plugin.aggregator?.setSettings?.(this.plugin.settings);
            await this.plugin.saveSettings();
            this.refresh();
          })
      );

    new Setting(containerEl)
      .setName('OpenLibrary')
      .setDesc('OpenLibrary.org REST API üzerinden yabancı ve küresel kitap arama.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableOpenLibrary)
          .onChange(async (value) => {
            if (!value && getActiveProviderCount() <= 1) {
              new Notice('En az bir kitap sağlayıcısı aktif olmalıdır.');
              toggle.setValue(true);
              return;
            }
            this.plugin.settings.enableOpenLibrary = value;
            this.plugin.aggregator?.setSettings?.(this.plugin.settings);
            await this.plugin.saveSettings();
            this.refresh();
          })
      );

    new Setting(containerEl)
      .setName('Hardcover')
      .setDesc('Hardcover.app GraphQL API üzerinden yabancı ve küresel kitap arama.')
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.enableHardcover)
          .onChange(async (value) => {
            if (!value && getActiveProviderCount() <= 1) {
              new Notice('En az bir kitap sağlayıcısı aktif olmalıdır.');
              toggle.setValue(true);
              return;
            }
            this.plugin.settings.enableHardcover = value;
            this.plugin.aggregator?.setSettings?.(this.plugin.settings);
            await this.plugin.saveSettings();
            this.refresh();
          })
      );

    if (this.plugin.settings.enableHardcover) {
      if (typeof SecretComponent !== 'undefined') {
        new Setting(containerEl)
          .setName('Hardcover API anahtarı')
          .setDesc(
            'API anahtarınızı Obsidian Secret Storage ile saklayın ve buradan bağlayın (hardcover.app/account/api).'
          )
          .addComponent((el) => {
            const component = new SecretComponent(this.app, el);
            component
              .setValue(this.plugin.settings.hardcoverApiKeyId)
              .onChange(async (data: string | null) => {
                this.plugin.settings.hardcoverApiKeyId = (data || '').trim();
                this.plugin.aggregator?.setSettings?.(this.plugin.settings);
                await this.plugin.saveSettings();
              });
            return component;
          });
      } else {
        new Setting(containerEl)
          .setName('Hardcover API anahtarı')
          .setDesc(
            'Hardcover hesabınızdan aldığınız API anahtarı (hardcover.app/account/api). Boş bırakılırsa Hardcover araması çalıştırılmaz.'
          )
          .addText((text) => {
            text.inputEl.type = 'password';
            text
              .setPlaceholder('Hardcover API anahtarınızı girin...')
              .setValue(this.plugin.settings.hardcoverApiKey)
              .onChange(async (value) => {
                this.plugin.settings.hardcoverApiKey = value.trim();
                this.plugin.aggregator?.setSettings?.(this.plugin.settings);
                await this.plugin.saveSettings();
              });
          });
      }
    }

    // ----------------------------------------------------
    // Bölüm: Kapaklar
    // ----------------------------------------------------
    new Setting(containerEl).setName('Kapaklar').setHeading();

    new Setting(containerEl)
      .setName('Kapak görsellerini indir')
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
        .setName('Kapak klasörü')
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
    // Bölüm: Okuma Durumu
    // ----------------------------------------------------
    new Setting(containerEl).setName('Okuma durumu').setHeading();

    let defaultStatusDropdown: DropdownComponent | null = null;

    new Setting(containerEl)
      .setName('Durum seçenekleri')
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
      .setName('Varsayılan durum')
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
    // Bölüm: Şablon
    // ----------------------------------------------------
    new Setting(containerEl).setName('Şablon').setHeading();

    const currentMode = this.plugin.settings.templateMode || 'static';

    new Setting(containerEl)
      .setName('Şablon modu')
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
      modeDesc.setText('Standart statik Markdown şablonu etkindir. Ek eklenti gerektirmeden sade ve kalıcı notlar üretir.');

      new Setting(containerEl)
        .setName('Şablonu özelleştir')
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
      const alertBox = containerEl.createDiv({ cls: 'kitap-callout kitap-callout-warning' });
      const headerEl = alertBox.createDiv({ cls: 'kitap-callout-header' });
      headerEl.createSpan({ cls: 'kitap-callout-icon', text: '⚠️' });
      headerEl.createSpan({ cls: 'kitap-callout-title', text: 'Önemli gereksinim: Dataview ve Templater' });

      alertBox.createDiv({
        cls: 'kitap-callout-body',
        text: 'Reaktif şablonun dinamik okuma ilerlemesi (%), okuma günlüğü ve kitap kartı özelliklerinin eksiksiz çalışabilmesi için hem Dataview hem de Templater topluluk eklentilerinin kurulu ve etkin olması gereklidir.',
      });

      new Setting(containerEl)
        .setName('Şablonu özelleştir')
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
        .setName('Şablon dosyası')
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
        .setName('Not şablonu')
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
        .setName('Şablonu sıfırla')
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
    // Bölüm: Templater
    // ----------------------------------------------------
    new Setting(containerEl).setName('Templater').setHeading();

    new Setting(containerEl)
      .setName('Templater entegrasyonu')
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
    // Bölüm: Özellik Eşlemeleri
    // ----------------------------------------------------
    new Setting(containerEl).setName('Özellik eşlemeleri').setHeading();

    new Setting(containerEl)
      .setName('Varsayılan frontmatter')
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
      { tag: '{{puan}} / {{rating}}', desc: 'Kitap okur puanı (0-5)' },
      { tag: '{{aciklama}} / {{description}}', desc: 'Kitap açıklaması / tanıtım bülteni' },
      { tag: '{{url}}', desc: 'Kitap detay veya ürün sayfası bağlantısı' },
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
