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

  constructor(containerEl: HTMLElement) {
    this.settingEl = containerEl.createDiv({ cls: "setting-item" });
  }

  setName(name: string) {
    this.name = name;
    this.settingEl.createDiv({ cls: "setting-item-name", text: name });
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

export class SuggestModal {
  app: unknown;
  inputEl: HTMLInputElement;
  resultContainerEl: HTMLElement;
  emptyStateText = "";
  placeholder = "";

  constructor(app: unknown) {
    this.app = app;
    this.inputEl = document.createElement("input");
    this.resultContainerEl = document.createElement("div");
  }
  setPlaceholder(placeholder: string): void {
    this.placeholder = placeholder;
    this.inputEl.placeholder = placeholder;
  }
  setInstructions(_instructions: Array<{ command: string; purpose: string }>): void {}
  open(): void {}
  close(): void {}
}

export class Notice {
  constructor(public message: string) {
    lastNotices.push(message);
  }
}

export class App {
  workspace: unknown;
  vault: unknown;
}

export const requestUrl = vi.fn();
export const normalizePath = (path: string): string =>
  path.replace(/\\/g, "/").replace(/\/+/g, "/");
export const parseYaml = (yaml: string): Record<string, unknown> => ({});
export const stringifyYaml = (data: unknown): string => JSON.stringify(data);
export class TFile {}
export class TFolder {}

// Mock Obsidian runtime host module for vi
if (typeof vi !== "undefined") {
  vi.mock("obsidian", () => ({
    Plugin,
    PluginSettingTab,
    Setting,
    SuggestModal,
    Notice,
    App,
    requestUrl,
    normalizePath,
    parseYaml,
    stringifyYaml,
    TFile,
    TFolder,
    lastNotices,
    MockSetting,
  }));
}

