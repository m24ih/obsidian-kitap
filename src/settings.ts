import {
  App,
  DropdownComponent,
  Notice,
  PluginSettingTab,
  SecretComponent,
  type SettingDefinitionItem,
} from 'obsidian';
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

  override getSettingDefinitions(): SettingDefinitionItem[] {
    const getActiveProviderCount = (): number => {
      let count = 0;
      if (this.plugin.settings.enableKitapyurdu !== false) count++;
      if (this.plugin.settings.enableDr !== false) count++;
      if (this.plugin.settings.enableOpenLibrary) count++;
      if (this.plugin.settings.enableHardcover) count++;
      return count;
    };

    let defaultStatusDropdown: DropdownComponent | null = null;
    const currentMode = this.plugin.settings.templateMode || 'static';

    const variables: { tag: string; desc: string }[] = [
      { tag: '{{baslik}} / {{title}}', desc: 'Kitap Başlığı' },
      { tag: '{{yazar}} / {{author}}', desc: 'Yazar(lar)' },
      { tag: '{{yayinevi}} / {{publisher}}', desc: 'Yayınevi' },
      { tag: '{{cevirmen}} / {{translator}}', desc: 'Çevirmen (varsa)' },
      { tag: '{{isbn}}', desc: '13 haneli ISBN numarası' },
      { tag: '{{sayfa}} / {{pages}}', desc: 'Toplam sayfa sayısı' },
      { tag: '{{okunan_sayfa}}', desc: 'Okunan mevcut sayfa (varsayılan: 0)' },
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

    const definitions: SettingDefinitionItem[] = [
      // ----------------------------------------------------
      // Genel Dosya Ayarları
      // ----------------------------------------------------
      {
        name: 'Hedef klasör',
        desc: 'Oluşturulan kitap notlarının kaydedileceği vault klasörü. Klasör mevcut değilse otomatik olarak oluşturulur.',
        render: (setting) => {
          setting.addText((text) => {
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
        },
      },
      {
        name: 'Dosya adı şablonu',
        desc: 'Oluşturulacak kitap notu dosyasının adı formatı. Kullanılabilir değişkenler: {{baslik}}, {{yazar}}, {{yayinevi}}, {{isbn}}, {{yayin_tarihi}} (İngilizce takma adlar: {{title}}, {{author}}).',
        render: (setting) => {
          setting.addText((text) =>
            text
              .setPlaceholder('{{baslik}} - {{yazar}}')
              .setValue(this.plugin.settings.fileNameTemplate)
              .onChange(async (value) => {
                this.plugin.settings.fileNameTemplate = value.trim();
                await this.plugin.saveSettings();
              })
          );
        },
      },

      // ----------------------------------------------------
      // Bölüm: Sağlayıcılar
      // ----------------------------------------------------
      {
        type: 'group',
        heading: 'Sağlayıcılar',
        items: [
          {
            name: 'Kitapyurdu',
            desc: 'Kitapyurdu.com üzerinden Türkçe kitap arama ve metaveri çekme.',
            render: (setting) => {
              setting.addToggle((toggle) =>
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
            },
          },
          {
            name: 'D&R',
            desc: 'D&R (dr.com.tr) üzerinden Türkçe kitap arama ve metaveri çekme.',
            render: (setting) => {
              setting.addToggle((toggle) =>
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
            },
          },
          {
            name: 'OpenLibrary',
            desc: 'OpenLibrary.org REST API üzerinden yabancı ve küresel kitap arama.',
            render: (setting) => {
              setting.addToggle((toggle) =>
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
            },
          },
          {
            name: 'Hardcover',
            desc: 'Hardcover.app GraphQL API üzerinden yabancı ve küresel kitap arama.',
            render: (setting) => {
              setting.addToggle((toggle) =>
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
            },
          },
          {
            name: 'Hardcover API anahtarı',
            desc: 'API anahtarınızı Obsidian Secret Storage ile saklayın ve buradan bağlayın (hardcover.app/account/api).',
            visible: () => Boolean(this.plugin.settings.enableHardcover),
            render: (setting) => {
              if (typeof SecretComponent !== 'undefined') {
                setting.addComponent((el) => {
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
                setting
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
            },
          },
        ],
      },

      // ----------------------------------------------------
      // Bölüm: Kapaklar
      // ----------------------------------------------------
      {
        type: 'group',
        heading: 'Kapaklar',
        items: [
          {
            name: 'Kapak görsellerini indir',
            desc: 'Yeni kitap notları oluşturulurken kapak görselini yerel olarak indirir ve vault içine kaydeder. Böylece her kitap için harici bağlantıya gerek kalmaz.',
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle
                  .setValue(this.plugin.settings.downloadCovers)
                  .onChange(async (value) => {
                    this.plugin.settings.downloadCovers = value;
                    await this.plugin.saveSettings();
                    this.refresh();
                  })
              );
            },
          },
          {
            name: 'Kapak klasörü',
            desc: 'İndirilen kitap kapaklarının kaydedileceği vault klasörü. Klasör mevcut değilse otomatik olarak oluşturulur.',
            visible: () => Boolean(this.plugin.settings.downloadCovers),
            render: (setting) => {
              setting
                .setClass('kitap-setting-wide-control')
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
            },
          },
        ],
      },

      // ----------------------------------------------------
      // Bölüm: Okuma Durumu
      // ----------------------------------------------------
      {
        type: 'group',
        heading: 'Okuma durumu',
        items: [
          {
            name: 'Durum seçenekleri',
            desc: 'Kitaplar için kullanabileceğiniz durum seçenekleri (virgülle ayırarak girin). Örn: Okunacak, Okunuyor, Okundu veya TBR, Reading, Read.',
            render: (setting) => {
              setting.addText((text) =>
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
            },
          },
          {
            name: 'Varsayılan durum',
            desc: 'Yeni eklenen kitap notuna otomatik atanacak başlangıç okuma durumu.',
            render: (setting) => {
              setting.addDropdown((dropdown) => {
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
            },
          },
        ],
      },

      // ----------------------------------------------------
      // Bölüm: Şablon
      // ----------------------------------------------------
      {
        type: 'group',
        heading: 'Şablon',
        items: [
          {
            name: 'Şablon modu',
            desc: 'Kitap notları oluşturulurken kullanılacak şablon yapısı.',
            render: (setting) => {
              setting.addDropdown((dropdown) => {
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
            },
          },
          {
            name: 'Şablonu özelleştir',
            desc: 'Statik şablonu temel alarak düzenlemek için Özel Şablon moduna aktarın.',
            visible: () => currentMode === 'static',
            render: (setting) => {
              setting.addButton((btn) => {
                btn.setButtonText('Özel Şablona Kopyala ve Düzenle').onClick(async () => {
                  this.plugin.settings.templateMode = 'custom';
                  this.plugin.settings.noteTemplate = DEFAULT_STATIC_TEMPLATE;
                  await this.plugin.saveSettings();
                  new Notice('Statik şablon düzenlenebilir özel şablon alanına kopyalandı.');
                  this.refresh();
                });
              });
            },
          },
          {
            name: 'Önemli gereksinim: Dataview ve Templater',
            desc: 'Reaktif şablonun dinamik okuma ilerlemesi (%), okuma günlüğü ve kitap kartı özelliklerinin eksiksiz çalışabilmesi için hem Dataview hem de Templater topluluk eklentilerinin kurulu ve etkin olması gereklidir.',
            visible: () => currentMode === 'reactive',
            render: (setting) => {
              setting.settingEl.addClass('kitap-callout', 'kitap-callout-warning');
              setting.addButton((btn) => {
                btn.setButtonText('Özel Şablona Kopyala ve Düzenle').onClick(async () => {
                  this.plugin.settings.templateMode = 'custom';
                  this.plugin.settings.noteTemplate = DEFAULT_REACTIVE_TEMPLATE;
                  await this.plugin.saveSettings();
                  new Notice('Reaktif şablon düzenlenebilir özel şablon alanına kopyalandı.');
                  this.refresh();
                });
              });
            },
          },
          {
            name: 'Şablon dosyası',
            desc: 'Kitap notları oluşturulurken kullanılacak vault içi Markdown şablon dosyası (.md). Belirtilirse aşağıdaki metin şablonu yerine bu dosya kullanılır.',
            visible: () => currentMode === 'custom',
            render: (setting) => {
              setting
                .setClass('kitap-setting-wide-control')
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
            },
          },
          {
            name: 'Not şablonu',
            desc: 'Şablon dosyası seçilmediğinde veya bulunamadığında kullanılacak standart metin şablonu.',
            visible: () => currentMode === 'custom',
            render: (setting) => {
              setting
                .setClass('kitap-setting-stacked')
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
            },
          },
          {
            name: 'Şablonu sıfırla',
            desc: 'Özel metin şablonunu yerleşik şablonlardan birine dönüştürür.',
            visible: () => currentMode === 'custom',
            render: (setting) => {
              setting
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
            },
          },
        ],
      },

      // ----------------------------------------------------
      // Bölüm: Templater
      // ----------------------------------------------------
      {
        type: 'group',
        heading: 'Templater',
        items: [
          {
            name: 'Templater entegrasyonu',
            desc: 'Templater eklentisi ile entegrasyon sağlar. Not oluşturulduğunda Templater otomatik çalıştırılır ve şablonlarınızda `book` objesine (<%* const b = book; %>) erişebilirsiniz. (Templater eklentisinin kurulu olması gerekir).',
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle
                  .setValue(this.plugin.settings.enableTemplaterIntegration)
                  .onChange(async (value) => {
                    this.plugin.settings.enableTemplaterIntegration = value;
                    await this.plugin.saveSettings();
                  })
              );
            },
          },
        ],
      },

      // ----------------------------------------------------
      // Bölüm: Özellik Eşlemeleri
      // ----------------------------------------------------
      {
        type: 'group',
        heading: 'Özellik eşlemeleri',
        items: [
          {
            name: 'Varsayılan frontmatter',
            desc: 'Etkinleştirildiğinde, aşağıdaki özellik eşlemelerine göre otomatik YAML frontmatter oluşturulur. Devre dışı bırakılırsa yalnızca şablonda tanımlı frontmatter kullanılır.',
            render: (setting) => {
              setting.addToggle((toggle) =>
                toggle
                  .setValue(this.plugin.settings.useDefaultFrontMatter)
                  .onChange(async (value) => {
                    this.plugin.settings.useDefaultFrontMatter = value;
                    await this.plugin.saveSettings();
                    this.refresh();
                  })
              );
            },
          },
          {
            name: '',
            visible: () => Boolean(this.plugin.settings.useDefaultFrontMatter),
            render: (setting) => {
              setting.setClass('kitap-setting-full-width');
              setting.settingEl.querySelector('.setting-item-info')?.remove();
              const mappingContainer = setting.settingEl.createDiv('kitap-property-mappings-section');
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
            },
          },
        ],
      },

      // ----------------------------------------------------
      // Bölüm: Değişkenler Rehberi
      // ----------------------------------------------------
      {
        type: 'group',
        heading: 'Kullanılabilir şablon değişkenleri',
        items: [
          {
            name: '',
            render: (setting) => {
              setting.setClass('kitap-setting-full-width');
              setting.settingEl.querySelector('.setting-item-info')?.remove();
              const list = setting.settingEl.createEl('ul', { cls: 'kitap-vars-list' });
              for (const v of variables) {
                const item = list.createEl('li');
                item.createEl('code', { text: v.tag });
                item.appendText(`: ${v.desc}`);
              }
            },
          },
        ],
      },
    ];

    return definitions;
  }

  /**
   * Ayarlar sekmesini güvenle yeniden çizer.
   */
  private refresh(): void {
    this.update();
  }
}
