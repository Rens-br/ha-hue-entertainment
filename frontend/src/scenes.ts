import { LitElement, css, html, nothing } from "lit";

import type { SceneInfo, SceneParameter } from "./types";

type Values = Record<string, unknown>;

/**
 * Scene list with play/stop and speed, and a parameter form generated from the
 * selected scene. Fires "play" {scene, params}, "stop" and "speed" {speed}.
 */
class HueScenePanel extends LitElement {
  scenes: SceneInfo[] = [];
  playing: string | null = null;
  playingParams: Values | null = null;
  speed = 1;
  disabled = false;

  private selected?: string;
  private drafts: Record<string, Values> = {}; // per scene, edits not yet played
  private speedDraft?: number;

  static properties = {
    scenes: { attribute: false },
    playing: { attribute: false },
    playingParams: { attribute: false },
    speed: { type: Number },
    disabled: { type: Boolean },
    selected: { state: true },
    drafts: { state: true },
    speedDraft: { state: true },
  };

  private get current(): SceneInfo | undefined {
    const id = this.selected ?? this.playing ?? this.scenes[0]?.id;
    return this.scenes.find((s) => s.id === id);
  }

  /** Form values: your edits, else what is playing, else the scene's defaults. */
  private values(scene: SceneInfo): Values {
    const defaults = Object.fromEntries(
      Object.entries(scene.parameters).map(([k, p]) => [k, p.default]),
    );
    const playing = scene.id === this.playing ? (this.playingParams ?? {}) : {};
    return { ...defaults, ...playing, ...(this.drafts[scene.id] ?? {}) };
  }

  private setValue(scene: SceneInfo, name: string, value: unknown) {
    this.drafts = {
      ...this.drafts,
      [scene.id]: { ...(this.drafts[scene.id] ?? {}), [name]: value },
    };
  }

  private fire(type: string, detail: unknown = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }

  private play(scene: SceneInfo, params?: Values) {
    this.fire("play", { scene: scene.id, params });
  }

  private reloadScenes() {
    this.fire("reload-scenes");
  }

  private downloadScene(scene: SceneInfo) {
    this.fire("download-scene", { scene: scene.id });
  }

  private uploadScene() {
    const input = this.shadowRoot?.getElementById("scene-upload") as HTMLInputElement;
    input?.click();
  }

  private handleUpload(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files?.length) return;
    const file = input.files[0];
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const scene = JSON.parse(reader.result as string);
        this.fire("upload-scene", { scene });
      } catch (err) {
        console.error("Failed to parse scene file", err);
      }
    };
    reader.readAsText(file);
  }

  render() {
    const scene = this.current;
    return html`
      <div class="grid">
        ${this.renderList()} ${scene ? this.renderForm(scene) : nothing}
      </div>
    `;
  }

  private renderList() {
    const speed = this.speedDraft ?? this.speed;
    return html`
      <input
        type="file"
        id="scene-upload"
        accept=".json"
        style="display: none"
        @change=${(e: Event) => this.handleUpload(e)}
      />
      <ha-card
        ><div class="card-content">
          <div class="row">
            <span class="value">Scenes</span>
            <span>
              <ha-button
                appearance="plain"
                variant="secondary"
                size="xs"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this.reloadScenes();
                }}
              >
                <ha-icon icon="mdi:reload"></ha-icon>
              </ha-button>
              <ha-button
                appearance="filled"
                variant="brand"
                size="xs"
                @click=${(e: Event) => {
                  e.stopPropagation();
                  this.uploadScene();
                }}
              >
                <ha-icon icon="mdi:upload"></ha-icon>
                Upload Scene
              </ha-button>
            </span>
          </div>
          <div class="list">
            ${this.scenes.map((s) => {
              const on = s.id === this.playing;
              return html`
                <div
                  class="scene ${on ? "on" : ""} ${
                    s.id === this.current?.id ? "selected" : ""
                  }"
                  @click=${() => (this.selected = s.id)}
                >
                  <div class="scene-text">
                    <div class="name">${s.name}</div>
                    ${
                      s.description
                        ? html`<div class="secondary small">${s.description}</div>`
                        : nothing
                    }
                  </div>
                  <span class="tag">${s.builtin ? "built-in" : "yours"}</span>
                  <ha-button
                    size="xs"
                    appearance=${on ? "accent" : "outlined"}
                    ?disabled=${this.disabled}
                    @click=${(e: Event) => {
                      e.stopPropagation();
                      if (on) this.fire("stop");
                      else this.play(s, this.drafts[s.id] ? this.values(s) : undefined);
                    }}
                  >
                    ${on ? "Stop" : "Play"}
                  </ha-button>
                </div>
              `;
            })}
          </div>
          <label class="row speed">
            <span class="secondary small">Speed</span>
            <ha-slider
              min="0.1"
              max="4"
              step="0.1"
              .value=${speed}
              ?disabled=${this.disabled}
              @input=${(e: Event) =>
                (this.speedDraft = Number((e.target as HTMLInputElement).value))}
              @change=${(e: Event) => {
                this.fire("speed", {
                  speed: Number((e.target as HTMLInputElement).value),
                });
                this.speedDraft = undefined;
              }}
            ></ha-slider>
            <span class="small">${speed.toFixed(1)}×</span>
          </label>
        </div></ha-card
      >
    `;
  }

  private renderForm(scene: SceneInfo) {
    const entries = Object.entries(scene.parameters);
    const values = this.values(scene);
    return html`
      <ha-card
        ><div class="card-content">
          <div class="row">
            <span class="value">${scene.name}</span>
            <div class="row actions">
              <ha-icon-button
                .label=${"Download"}
                @click=${() => this.downloadScene(scene)}
              >
                <ha-icon icon="mdi:download"></ha-icon>
              </ha-icon-button>
              ${
                scene.builtin
                  ? nothing
                  : html`
                      <ha-button
                        size="xs"
                        appearance="plain"
                        variant="danger"
                        @click=${() => this.fire("delete-scene", { scene: scene.id })}
                      >
                        <ha-icon icon="mdi:delete"></ha-icon>
                        Delete</ha-button
                      >
                    `
              }
            </div>
          </div>
          ${
            entries.length
              ? html`<div class="form">
                  ${entries.map(([name, p]) => this.field(scene, name, p, values[name]))}
                </div>`
              : html`<div class="secondary small">This scene has no settings.</div>`
          }
          <div class="row actions">
            <ha-button
              size="s"
              appearance="plain"
              ?disabled=${!this.drafts[scene.id]}
              @click=${() => {
                const rest = { ...this.drafts };
                delete rest[scene.id];
                this.drafts = rest;
              }}
            >
              Reset
            </ha-button>
            <ha-button
              size="s"
              appearance="accent"
              ?disabled=${this.disabled}
              @click=${() => this.play(scene, values)}
            >
              ${scene.id === this.playing ? "Apply" : "Play with these"}
            </ha-button>
          </div>
        </div></ha-card
      >
    `;
  }

  private field(scene: SceneInfo, name: string, p: SceneParameter, value: unknown) {
    const label = name.replace(/_/g, " ");
    const set = (v: unknown) => this.setValue(scene, name, v);
    if (p.type === "color") {
      return html`
        <label class="field">
          <span>${label}</span>
          <input
            type="color"
            .value=${toHex(value)}
            @input=${(e: Event) => set((e.target as HTMLInputElement).value)}
          />
        </label>
      `;
    }
    if (p.type === "number") {
      const num = Number(value);
      const min = p.min ?? 0;
      const max = p.max ?? Math.max(1, Number(p.default) * 2);
      const step = (max - min) / 100;
      return html`
        <label class="field">
          <span>${label}</span>
          <ha-slider
            min=${min}
            max=${max}
            step=${step}
            .value=${num}
            @input=${(e: Event) => set(Number((e.target as HTMLInputElement).value))}
          ></ha-slider>
          <span class="small num">${formatNumber(num)}</span>
        </label>
      `;
    }
    const options = p.options ?? [];
    if (options.length === 2 && options.every((o) => typeof o === "boolean")) {
      return html`
        <label class="field">
          <span>${label}</span>
          <ha-switch
            .checked=${Boolean(value)}
            @change=${(e: Event) => set((e.target as HTMLInputElement).checked)}
          ></ha-switch>
        </label>
      `;
    }
    return html`
      <label class="field">
        <span>${label}</span>
        <select
          @change=${(e: Event) =>
            set(options[Number((e.target as HTMLSelectElement).value)])}
        >
          ${options.map(
            (o, i) =>
              html`<option value=${i} ?selected=${o === value}>${String(o)}</option>`,
          )}
        </select>
      </label>
    `;
  }

  static styles = css`
    .card-content {
      padding: 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
    .row,
    .field {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
    }
    .value {
      font-size: 16px;
      font-weight: 500;
    }
    .secondary {
      color: var(--secondary-text-color);
    }
    .small {
      font-size: 13px;
    }
    select {
      font: inherit;
      color: inherit;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color, transparent);
    }
    input[type="color"] {
      width: 44px;
      height: 28px;
      padding: 0;
      border: 1px solid var(--divider-color);
      border-radius: 6px;
      background: none;
      cursor: pointer;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    }
    .list {
      display: grid;
    }
    .scene {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 8px;
      border-top: 1px solid var(--divider-color);
      cursor: pointer;
    }
    .scene.selected {
      background: var(--secondary-background-color, rgba(127, 127, 127, 0.08));
      border-radius: 8px;
    }
    .scene.on .name {
      color: var(--primary-color);
      font-weight: 500;
    }
    .scene-text {
      flex: 1;
      min-width: 0;
    }
    .tag {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    ha-icon-button,
    ha-button {
      --ha-icon-button-size: 24px;
      --mdc-icon-button-size: 24px;
      --mdc-icon-size: 16px;
    }
    .speed ha-slider {
      flex: 1;
      min-width: 0;
    }
    .form {
      display: grid;
      gap: 10px;
    }
    .field span:first-child {
      color: var(--secondary-text-color);
      font-size: 14px;
      text-transform: capitalize;
      min-width: 90px;
    }
    .field ha-slider {
      flex: 1;
      min-width: 0;
    }
    .num {
      min-width: 36px;
      text-align: right;
    }
    .actions {
      justify-content: flex-end;
      gap: 8px;
    }
  `;
}

/** Scene colours may be "#rrggbb", "#rrggbbBB" or [r, g, b(, brightness)]. */
function toHex(value: unknown): string {
  if (typeof value === "string" && /^#?[0-9a-f]{6}/i.test(value)) {
    return `#${value.replace("#", "").slice(0, 6)}`;
  }
  if (Array.isArray(value) && value.length >= 3) {
    return `#${value
      .slice(0, 3)
      .map((v) =>
        Math.max(0, Math.min(255, Math.round(Number(v))))
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
  }
  return "#000000";
}

function formatNumber(n: number): string {
  return Math.abs(n) >= 10 ? n.toFixed(0) : String(Number(n.toFixed(2)));
}

customElements.define("hue-scene-panel", HueScenePanel);
