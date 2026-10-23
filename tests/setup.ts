import { GlobalRegistrator } from "@happy-dom/global-registrator";
import { vi } from "vitest";

// Register DOMParser, document, and window for Node and Bun test runners
GlobalRegistrator.register();

// Augment HTMLElement prototype with Obsidian DOM helper extensions
if (typeof HTMLElement !== "undefined") {
  const proto = HTMLElement.prototype as any;
  if (!proto.empty) {
    proto.empty = function () {
      while (this.firstChild) {
        this.removeChild(this.firstChild);
      }
    };
  }

  if (!proto.createEl) {
    proto.createEl = function (
      tag: string,
      o?: { text?: string; cls?: string; attr?: Record<string, string> }
    ) {
      const el = document.createElement(tag);
      if (o?.text) el.textContent = o.text;
      if (o?.cls) el.className = o.cls;
      if (o?.attr) {
        for (const [key, val] of Object.entries(o.attr)) {
          el.setAttribute(key, val);
        }
      }
      this.appendChild(el);
      return el;
    };
  }

  if (!proto.createDiv) {
    proto.createDiv = function (
      o?: { text?: string; cls?: string; attr?: Record<string, string> }
    ) {
      return this.createEl("div", o);
    };
  }

  if (!proto.createSpan) {
    proto.createSpan = function (
      o?: { text?: string; cls?: string; attr?: Record<string, string> }
    ) {
      return this.createEl("span", o);
    };
  }

  if (!proto.appendText) {
    proto.appendText = function (text: string) {
      const node = document.createTextNode(text);
      this.appendChild(node);
      return node;
    };
  }

  if (!proto.addClass) {
    proto.addClass = function (cls: string) {
      this.classList.add(cls);
    };
  }

  if (!proto.removeClass) {
    proto.removeClass = function (cls: string) {
      this.classList.remove(cls);
    };
  }

  if (!proto.setText) {
    proto.setText = function (text: string) {
      this.textContent = text;
    };
  }
}

// Mock components for Setting
export class MockTextComponent {
  inputEl = document.createElement("input");
  placeholder = "";
  value = "";
  onChangeHandler?: (value: string) => void | Promise<void>;

  constructor() {
    (this.inputEl as any).component = this;
    this.inputEl.type = "text";
    const trigger = async (e?: Event) => {
      const val = (e?.target as HTMLInputElement)?.value ?? this.inputEl.value;
      this.value = val;
      if (this.onChangeHandler) {
        await this.onChangeHandler(val);
      }
    };
    this.inputEl.oninput = trigger;
    this.inputEl.onchange = trigger;
  }

  setPlaceholder(p: string) {
    this.placeholder = p;
    this.inputEl.placeholder = p;
    return this;
  }
  setValue(v: string) {
    this.value = v;
    this.inputEl.value = v;
    return this;
  }
  onChange(cb: (val: string) => void | Promise<void>) {
    this.onChangeHandler = cb;
    return this;
  }
  async simulateChange(val: string) {
    this.value = val;
    this.inputEl.value = val;
    if (this.onChangeHandler) {
      await this.onChangeHandler(val);
    }
  }
}

export class MockTextAreaComponent {
  inputEl = document.createElement("textarea");
  placeholder = "";
  value = "";
  onChangeHandler?: (value: string) => void | Promise<void>;

  constructor() {
    (this.inputEl as any).component = this;
    const trigger = async (e?: Event) => {
      const val = (e?.target as HTMLTextAreaElement)?.value ?? this.inputEl.value;
      this.value = val;
      if (this.onChangeHandler) {
        await this.onChangeHandler(val);
      }
    };
    this.inputEl.oninput = trigger;
    this.inputEl.onchange = trigger;
  }

  setPlaceholder(p: string) {
    this.placeholder = p;
    this.inputEl.placeholder = p;
    return this;
  }
  setValue(v: string) {
    this.value = v;
    this.inputEl.value = v;
    return this;
  }
  onChange(cb: (val: string) => void | Promise<void>) {
    this.onChangeHandler = cb;
    return this;
  }
  async simulateChange(val: string) {
    this.value = val;
    this.inputEl.value = val;
    if (this.onChangeHandler) {
      await this.onChangeHandler(val);
    }
  }
}

export class MockToggleComponent {
  inputEl = document.createElement("input");
  value = false;
  onChangeHandler?: (value: boolean) => void | Promise<void>;

  constructor() {
    this.inputEl.type = "checkbox";
    (this.inputEl as any).component = this;
    const trigger = async (e?: Event) => {
      const val = (e?.target as HTMLInputElement)?.checked ?? this.inputEl.checked;
      if (this.value !== val) {
        this.value = val;
        if (this.onChangeHandler) {
          await this.onChangeHandler(val);
        }
      }
    };
    this.inputEl.onchange = trigger;
    this.inputEl.onclick = trigger;
  }

  setValue(v: boolean) {
    this.value = v;
    this.inputEl.checked = v;
    return this;
  }
  onChange(cb: (val: boolean) => void | Promise<void>) {
    this.onChangeHandler = cb;
    return this;
  }
  async simulateToggle(v: boolean) {
    this.value = v;
    this.inputEl.checked = v;
    if (this.onChangeHandler) {
      await this.onChangeHandler(v);
    }
  }
}

export class MockDropdownComponent {
  selectEl = document.createElement("select");
  value = "";
  options: Record<string, string> = {};
  onChangeHandler?: (value: string) => void | Promise<void>;

  constructor() {
    (this.selectEl as any).component = this;
    this.selectEl.onchange = async () => {
      this.value = this.selectEl.value;
      if (this.onChangeHandler) {
        await this.onChangeHandler(this.value);
      }
    };
  }

  addOption(value: string, display: string) {
    this.options[value] = display;
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = display;
    this.selectEl.appendChild(opt);
    if (!this.value) {
      this.value = value;
      this.selectEl.value = value;
    }
    return this;
  }

  setValue(val: string) {
    this.value = val;
    this.selectEl.value = val;
    return this;
  }

  onChange(cb: (val: string) => void | Promise<void>) {
    this.onChangeHandler = cb;
    return this;
  }

  async simulateChange(val: string) {
    this.value = val;
    this.selectEl.value = val;
    if (this.onChangeHandler) {
      await this.onChangeHandler(val);
    }
  }
}

export class MockSliderComponent {
  inputEl = document.createElement("input");
  min = 0;
  max = 100;
  step = 1;
  value = 0;
  onChangeHandler?: (value: number) => void | Promise<void>;

  constructor() {
    this.inputEl.type = "range";
    (this.inputEl as any).component = this;
    this.inputEl.min = "0";
    this.inputEl.max = "100";
    this.inputEl.step = "1";
    this.inputEl.value = "0";

    const trigger = async (e?: Event) => {
      const rawVal = (e?.target as HTMLInputElement)?.value ?? this.inputEl.value;
      const val = Number(rawVal);
      this.value = val;
      if (this.onChangeHandler) {
        await this.onChangeHandler(val);
      }
    };
    this.inputEl.oninput = trigger;
    this.inputEl.onchange = trigger;
  }

  setLimits(min: number, max: number, step: number) {
    this.min = min;
    this.max = max;
    this.step = step;
    this.inputEl.min = String(min);
    this.inputEl.max = String(max);
    this.inputEl.step = String(step);
    return this;
  }
  setValue(v: number) {
    this.value = v;
    this.inputEl.value = String(v);
    return this;
  }
  setDynamicTooltip() {
    return this;
  }
  onChange(cb: (val: number) => void | Promise<void>) {
    this.onChangeHandler = cb;
    return this;
  }
  async simulateChange(val: number) {
    this.value = val;
    this.inputEl.value = String(val);
    if (this.onChangeHandler) {
      await this.onChangeHandler(val);
    }
  }
}

export class MockButtonComponent {
  buttonEl = document.createElement("button");
  text = "";
  warning = false;
  onClickHandler?: () => void | Promise<void>;

  constructor() {
    (this.buttonEl as any).component = this;
    this.buttonEl.onclick = async () => {
      if (this.onClickHandler) {
        return await this.onClickHandler();
      }
    };
  }

  setButtonText(text: string) {
    this.text = text;
    this.buttonEl.textContent = text;
    return this;
  }
  setCta() {
    this.buttonEl.classList.add("mod-cta");
    return this;
  }
  setWarning() {
    this.warning = true;
    this.buttonEl.classList.add("mod-warning");
    return this;
  }
  onClick(cb: () => void | Promise<void>) {
    this.onClickHandler = cb;
    return this;
  }
  async simulateClick() {
    if (this.onClickHandler) {
      await this.onClickHandler();
    }
  }
}

export class MockSetting {
  settingEl: HTMLElement;
  name = "";
  desc = "";
  textComponent?: MockTextComponent;
  textAreaComponent?: MockTextAreaComponent;
  toggleComponent?: MockToggleComponent;
  sliderComponent?: MockSliderComponent;
  buttonComponent?: MockButtonComponent;
  dropdownComponent?: MockDropdownComponent;

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv({ cls: "setting-item" });
  }

  setName(name: string) {
    this.name = name;
    this.settingEl.createDiv({ cls: "setting-item-name", text: name });
    return this;
  }

  setHeading() {
    this.settingEl.classList.add("setting-item-heading");
    return this;
  }

  setClass(cls: string) {
    this.settingEl.classList.add(cls);
    return this;
  }

  setDesc(desc: string) {
    this.desc = desc;
    this.settingEl.createDiv({ cls: "setting-item-description", text: desc });
    return this;
  }

  addText(cb: (text: MockTextComponent) => void) {
    this.textComponent = new MockTextComponent();
    this.settingEl.appendChild(this.textComponent.inputEl);
    cb(this.textComponent);
    return this;
  }

  addSearch(cb: (search: MockTextComponent) => void) {
    this.textComponent = new MockTextComponent();
    this.settingEl.appendChild(this.textComponent.inputEl);
    cb(this.textComponent);
    return this;
  }

  addTextArea(cb: (ta: MockTextAreaComponent) => void) {
    this.textAreaComponent = new MockTextAreaComponent();
    this.settingEl.appendChild(this.textAreaComponent.inputEl);
    cb(this.textAreaComponent);
    return this;
  }

  addToggle(cb: (toggle: MockToggleComponent) => void) {
    this.toggleComponent = new MockToggleComponent();
    this.settingEl.appendChild(this.toggleComponent.inputEl);
    cb(this.toggleComponent);
    return this;
  }

  addSlider(cb: (slider: MockSliderComponent) => void) {
    this.sliderComponent = new MockSliderComponent();
    this.settingEl.appendChild(this.sliderComponent.inputEl);
    cb(this.sliderComponent);
    return this;
  }

  addButton(cb: (button: MockButtonComponent) => void) {
    this.buttonComponent = new MockButtonComponent();
    this.settingEl.appendChild(this.buttonComponent.buttonEl);
    cb(this.buttonComponent);
    return this;
  }

  addDropdown(cb: (dropdown: MockDropdownComponent) => void) {
    this.dropdownComponent = new MockDropdownComponent();
    this.settingEl.appendChild(this.dropdownComponent.selectEl);
    cb(this.dropdownComponent);
    return this;
  }
}

export const lastNotices: string[] = [];

// Named exports for Obsidian module mock
export class Plugin {
  app: unknown;
  manifest: unknown;
  constructor(app: unknown, manifest: unknown) {
    this.app = app;
    this.manifest = manifest;
  }
  loadData(): Promise<unknown> {
    return Promise.resolve({});
  }
  saveData(): Promise<void> {
    return Promise.resolve();
  }
  addSettingTab(): void {}
  addRibbonIcon(): HTMLElement {
    const el = document.createElement("div");
    (el as any).addClass = vi.fn();
    return el;
  }
  addCommand(): void {}
}

export class PluginSettingTab {
  app: unknown;
  plugin: unknown;
  containerEl: HTMLElement;
  constructor(app: unknown, plugin: unknown) {
    this.app = app;
    this.plugin = plugin;
    this.containerEl = document.createElement("div");
  }
  display(): void {}
  hide(): void {}
}

export const Setting = MockSetting;

export class Scope {
  keys: Array<{ modifiers: string[] | null; key: string | null; func: (evt: KeyboardEvent) => unknown }> = [];
  register(modifiers: string[] | null, key: string | null, func: (evt: KeyboardEvent) => unknown) {
    const handler = { modifiers, key, func };
    this.keys.push(handler);
    return handler;
  }
  unregister(handler: any) {
    const idx = this.keys.indexOf(handler);
    if (idx !== -1) this.keys.splice(idx, 1);
  }
  handleKey(evt: KeyboardEvent) {
    for (const handler of this.keys) {
      if (handler.key === null || handler.key === evt.key) {
        const res = handler.func(evt);
        if (res === false) return false;
      }
    }
    return true;
  }
}

export class Modal {
  app: unknown;
  contentEl: HTMLElement;
  titleEl: HTMLElement;
  containerEl: HTMLElement;
  scope: Scope;

  constructor(app: unknown) {
    this.app = app;
    this.scope = new Scope();
    this.containerEl = document.createElement("div");
    this.titleEl = document.createElement("div");
    this.contentEl = document.createElement("div");
    this.containerEl.appendChild(this.titleEl);
    this.containerEl.appendChild(this.contentEl);
  }

  open(): void {
    if (typeof document !== "undefined" && document.body) {
      document.body.appendChild(this.containerEl);
    }
    this.onOpen();
  }
  onOpen(): void {}
  close(): void {
    if (this.containerEl.parentNode) {
      this.containerEl.remove();
    }
    this.onClose();
  }
  onClose(): void {}
}

export class SuggestModal {
  app: unknown;
  inputEl: HTMLInputElement;
  resultContainerEl: HTMLElement;
  emptyStateText = "";
  placeholder = "";
  scope: Scope;

  constructor(app: unknown) {
    this.app = app;
    this.scope = new Scope();
    this.inputEl = document.createElement("input");
    this.resultContainerEl = document.createElement("div");
  }
  setPlaceholder(placeholder: string): void {
    this.placeholder = placeholder;
    this.inputEl.placeholder = placeholder;
  }
  setInstructions(_instructions: Array<{ command: string; purpose: string }>): void {}
  open(): void {
    this.onOpen();
  }
  onOpen(): void {}
  close(): void {}
}

export class Notice {
  constructor(public message: string) {
    lastNotices.push(message);
  }
}

export class App {
  workspace: any = {
    getActiveFile: () => null,
    getLeaf: () => ({ openFile: () => {} }),
  };
  vault: unknown;
}

export const requestUrl = vi.fn();
export const normalizePath = (path: string): string =>
  path.replace(/\\/g, "/").replace(/\/+/g, "/");
export class Component {
  onload(): void {}
  onunload(): void {}
  addChild<T extends Component>(component: T): T {
    component.onload();
    return component;
  }
}

export abstract class AbstractInputSuggest<T> {
  protected onSelectCallback?: (value: T, evt?: any) => any;
  constructor(public app: unknown, public textInputEl: HTMLInputElement) {
    (textInputEl as any).suggester = this;
  }
  abstract renderSuggestion(value: T, el: HTMLElement): void;
  setValue(value: string): void {
    this.textInputEl.value = value;
  }
  onSelect(callback: (value: T, evt?: any) => any): this {
    this.onSelectCallback = callback;
    return this;
  }
  selectSuggestion(value: T, evt?: any): void {
    this.setValue((value as any).path ?? (value as any).toString());
    this.onSelectCallback?.(value, evt);
    this.close();
  }
  close(): void {}
}

export const setIcon = (parent: HTMLElement, iconId: string): void => {
  parent.setAttribute('data-icon', iconId);
};

export const parseYaml = (yaml: string): Record<string, unknown> => {
  const result: Record<string, unknown> = {};
  if (!yaml) return result;
  const lines = yaml.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim();
      let val: any = trimmed.slice(colonIdx + 1).trim();
      if (val.startsWith('"') && val.endsWith('"')) {
        val = val.slice(1, -1);
      } else if (val === 'true') {
        val = true;
      } else if (val === 'false') {
        val = false;
      } else if (val !== '' && !isNaN(Number(val))) {
        val = Number(val);
      }
      result[key] = val;
    }
  }
  return result;
};

export const stringifyYaml = (data: unknown): string => {
  if (!data || typeof data !== 'object') return '';
  const lines: string[] = [];
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (value === undefined) continue;
    if (value === null || value === '') {
      lines.push(`${key}: `);
    } else if (typeof value === 'string') {
      lines.push(`${key}: "${value}"`);
    } else if (typeof value === 'number' || typeof value === 'boolean') {
      lines.push(`${key}: ${value}`);
    } else if (Array.isArray(value)) {
      lines.push(`${key}:`);
      for (const item of value) {
        lines.push(`  - ${typeof item === 'string' ? `"${item}"` : item}`);
      }
    } else {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }
  return lines.join('\n');
};

export class TFile {
  path = '';
  name = '';
  basename = '';
  extension = 'md';
}
export class TFolder {
  path = '';
  name = '';
}

// Mock Obsidian runtime host module for vi
if (typeof vi !== "undefined") {
  vi.mock("obsidian", () => ({
    Plugin,
    PluginSettingTab,
    Setting,
    Modal,
    SuggestModal,
    Notice,
    App,
    requestUrl,
    normalizePath,
    parseYaml,
    stringifyYaml,
    Component,
    AbstractInputSuggest,
    setIcon,
    TFile,
    TFolder,
    lastNotices,
    MockSetting,
    DropdownComponent: MockDropdownComponent,
  }));
}

