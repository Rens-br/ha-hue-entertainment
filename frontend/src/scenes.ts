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
      <div class="card">
        <div class="row">
          <span class="value">Scenes</span>
          <span>
            <button
              @click=${(e: Event) => {
                e.stopPropagation();
                this.reloadScenes();
              }}
            >
              Reload Scenes
            </button>
            <span class="secondary small">${this.scenes.length} available</span>
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
                <div class="info">
                  <div class="name">${s.name}</div>
                  ${
                    s.description
                      ? html`<div class="secondary small">${s.description}</div>`
                      : nothing
                  }
                </div>
                <span class="tag">${s.builtin ? "built-in" : "yours"}</span>
                <button
                  class=${on ? "stop" : "play"}
                  ?disabled=${this.disabled}
                  @click=${(e: Event) => {
                    e.stopPropagation();
                    if (on) this.fire("stop");
                    else this.play(s, this.drafts[s.id] ? this.values(s) : undefined);
                  }}
                >
                  ${on ? "Stop" : "Play"}
                </button>
              </div>
            `;
          })}
        </div>
        <label class="row speed">
          <span class="secondary small">Speed</span>
          <input
            type="range"
            min="0.1"
            max="4"
            step="0.1"
            .value=${String(speed)}
            ?disabled=${this.disabled}
            @input=${(e: Event) =>
              (this.speedDraft = Number((e.target as HTMLInputElement).value))}
            @change=${(e: Event) => {
              this.fire("speed", {
                speed: Number((e.target as HTMLInputElement).value),
              });
              this.speedDraft = undefined;
            }}
          />
          <span class="small">${speed.toFixed(1)}×</span>
        </label>
      </div>
    `;
  }

  private renderForm(scene: SceneInfo) {
    const entries = Object.entries(scene.parameters);
    const values = this.values(scene);
    return html`
      <div class="card">
        <div class="row">
          <span class="value">${scene.name}</span>
          <span class="secondary small">
            ${scene.author ? `by ${scene.author}` : ""}
            ${scene.duration ? ` · plays ${scene.duration} s` : ""}
          </span>
        </div>
        ${
          entries.length
            ? html`<div class="form">
                ${entries.map(([name, p]) => this.field(scene, name, p, values[name]))}
              </div>`
            : html`<div class="secondary small">This scene has no settings.</div>`
        }
        <div class="row actions">
          <button
            ?disabled=${!this.drafts[scene.id]}
            @click=${() => {
              const rest = { ...this.drafts };
              delete rest[scene.id];
              this.drafts = rest;
            }}
          >
            Reset
          </button>
          <button
            class="primary"
            ?disabled=${this.disabled}
            @click=${() => this.play(scene, values)}
          >
            ${scene.id === this.playing ? "Apply" : "Play with these"}
          </button>
        </div>
      </div>
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
          <input
            type="range"
            min=${min}
            max=${max}
            step=${step}
            .value=${String(num)}
            @input=${(e: Event) => set(Number((e.target as HTMLInputElement).value))}
          />
          <span class="small num">${formatNumber(num)}</span>
        </label>
      `;
    }
    const options = p.options ?? [];
    if (options.length === 2 && options.every((o) => typeof o === "boolean")) {
      return html`
        <label class="field">
          <span>${label}</span>
          <input
            type="checkbox"
            role="switch"
            .checked=${Boolean(value)}
            @change=${(e: Event) => set((e.target as HTMLInputElement).checked)}
          />
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
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
      gap: 16px;
    }
    .card {
      background: var(--card-background-color, #fff);
      border-radius: var(--ha-card-border-radius, 12px);
      border: 1px solid var(--divider-color);
      padding: 16px;
      display: grid;
      gap: 12px;
      align-content: start;
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
    .info {
      flex: 1;
      min-width: 0;
    }
    .tag {
      font-size: 12px;
      color: var(--secondary-text-color);
    }
    button {
      font: inherit;
      font-size: 13px;
      padding: 5px 12px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: none;
      color: var(--primary-text-color);
      cursor: pointer;
    }
    button.primary,
    button.stop {
      background: var(--primary-color);
      border-color: var(--primary-color);
      color: var(--text-primary-color, #fff);
    }
    button:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .speed input {
      flex: 1;
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
    .field input[type="range"] {
      flex: 1;
    }
    .num {
      min-width: 36px;
      text-align: right;
    }
    .actions {
      justify-content: flex-end;
    }
    input[type="range"] {
      accent-color: var(--primary-color);
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
    select {
      font: inherit;
      color: inherit;
      padding: 6px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color, transparent);
    }
    input[role="switch"] {
      appearance: none;
      width: 36px;
      height: 20px;
      border-radius: 10px;
      background: var(--disabled-color, #bdbdbd);
      position: relative;
      cursor: pointer;
    }
    input[role="switch"]::after {
      content: "";
      position: absolute;
      top: 2px;
      left: 2px;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      background: #fff;
      transition: left 0.15s;
    }
    input[role="switch"]:checked {
      background: var(--primary-color);
    }
    input[role="switch"]:checked::after {
      left: 18px;
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
