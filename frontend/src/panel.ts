import { LitElement, css, html, nothing } from "lit";

import "./preview";
import "./scenes";
import type { Colors, Hass, SceneInfo, Status, Zone } from "./types";

const DOMAIN = "ha_hue_entertainment";
const INTEGRATION_PAGE = `/config/integrations/integration/${DOMAIN}`;

class HueEntertainmentPanel extends LitElement {
  // Set by Home Assistant.
  hass?: Hass;
  narrow = false;

  private status?: Status;
  private zones: Zone[] = [];
  private scenes: SceneInfo[] = [];
  private message?: string; // last failed action, shown until the next success
  private busy = false; // an action is in flight
  private colors: Colors = { channels: {}, brightness: 1 };
  private paintColor = "#ff7a00";
  private brightnessDraft?: number; // while dragging; live updates must not reset it
  private unsubscribe?: () => Promise<void>;

  static properties = {
    hass: { attribute: false },
    narrow: { type: Boolean },
    status: { state: true },
    zones: { state: true },
    scenes: { state: true },
    message: { state: true },
    busy: { state: true },
    colors: { state: true },
    paintColor: { state: true },
    brightnessDraft: { state: true },
  };

  updated(changed: Map<string, unknown>) {
    if (changed.has("hass") && this.hass && !this.unsubscribe) {
      this.connect();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.unsubscribe?.();
    this.unsubscribe = undefined;
  }

  downloadJson(filename: string, data: unknown) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    URL.revokeObjectURL(url);
  }

  private async connect() {
    try {
      this.unsubscribe = await this.hass!.connection.subscribeMessage<
        ({ type: "status" } & Status) | ({ type: "colors" } & Colors)
      >(
        (msg) => {
          if (msg.type === "status") this.status = msg;
          else if (msg.type === "colors") this.colors = msg;
        },
        { type: `${DOMAIN}/subscribe`, colors: true },
      );
      [this.zones, this.scenes] = await Promise.all([
        this.call<Zone[]>("zones"),
        this.call<SceneInfo[]>("scenes"),
      ]);
    } catch (err) {
      this.message = errorText(err);
    }
  }

  private call<T = unknown>(command: string, data: Record<string, unknown> = {}) {
    return this.hass!.connection.sendMessagePromise<T>({
      type: `${DOMAIN}/${command}`,
      ...data,
    });
  }

  /** Run an action; keep its error visible until the next one succeeds. */
  private async act(command: string, data: Record<string, unknown> = {}) {
    this.busy = true;
    try {
      await this.call(command, data);
      this.message = undefined;
    } catch (err) {
      this.message = errorText(err);
    } finally {
      this.busy = false;
    }
  }

  private navigate(path: string) {
    history.pushState(null, "", path);
    window.dispatchEvent(new CustomEvent("location-changed"));
  }

  render() {
    return html`
      <div class="toolbar">
        <ha-menu-button .hass=${this.hass} .narrow=${this.narrow}></ha-menu-button>
        <div class="title">Hue Entertainment</div>
        ${this.renderStatePill()}
      </div>
      <div class="content">
        ${
          this.status
            ? html`<div class="cards">
                  ${this.renderBridge()} ${this.renderZone()} ${this.renderToggles()}
                </div>
                ${this.renderMessage()} ${this.renderPreview()} ${this.renderScenes()}`
            : this.message
              ? this.renderMessage()
              : html`<ha-card><div class="card-content">Loading…</div></ha-card>`
        }
      </div>
    `;
  }

  private renderStatePill() {
    const st = this.status?.streaming;
    if (!st) return nothing;
    const live = this.status?.live;
    const label =
      st.state === "streaming" && live
        ? `Live · ${live.client}`
        : st.state === "streaming"
          ? `Streaming · ${Math.round(st.send_fps)}/s`
          : st.state === "reconnecting"
            ? "Reconnecting"
            : "Off";
    return html`<span class="pill ${st.state}">${label}</span>`;
  }

  private renderBridge() {
    const bridge = this.status!.bridge;
    return html`
      <ha-card
        ><div class="card-content">
          <div class="label">Bridge</div>
          <div class="row">
            <span class="value">${bridge?.name ?? "Not paired"}</span>
            <span class="secondary">${bridge?.host ?? ""}</span>
          </div>
          <a
            class="link"
            href=${INTEGRATION_PAGE}
            @click=${(e: Event) => {
              e.preventDefault();
              this.navigate(INTEGRATION_PAGE);
            }}
            >Manage in Devices and services</a
          >
        </div></ha-card
      >
    `;
  }

  private renderZone() {
    const current = this.status!.zone?.id ?? "";
    return html`
      <ha-card
        ><div class="card-content">
          <label class="label" for="zone">Entertainment area</label>
          <select
            id="zone"
            .value=${current}
            ?disabled=${this.busy || !this.zones.length}
            @change=${(e: Event) =>
              this.act("zone/select", {
                zone_id: (e.target as HTMLSelectElement).value,
              })}
          >
            ${current ? nothing : html`<option value="" selected>Choose an area</option>`}
            ${this.zones.map(
              (z) =>
                html`<option value=${z.id} ?selected=${z.id === current}>
                  ${z.name} · ${z.channel_count} channels
                </option>`,
            )}
          </select>
          ${
            this.zones.length
              ? nothing
              : html`<div class="secondary small">
                  No entertainment areas. Create one in the Hue app under Settings,
                  Entertainment areas.
                </div>`
          }
        </div></ha-card
      >
    `;
  }

  private renderToggles() {
    const s = this.status!;
    const syncing = s.streaming.target_fps !== null;
    return html`
      <ha-card
        ><div class="card-content toggles">
          ${this.toggle("Sync", syncing, !s.zone, (on) => this.act("sync", { on }))}
          ${this.toggle(
            "Allow override",
            s.allow_override,
            false,
            (allow) => this.act("override", { allow }),
            "Starting sync may stop another app, like a Hue Sync Box",
          )}
        </div></ha-card
      >
    `;
  }

  private toggle(
    label: string,
    checked: boolean,
    disabled: boolean,
    onChange: (value: boolean) => void,
    hint?: string,
  ) {
    return html`
      <label class="toggle-row" title=${hint ?? ""}>
        <span>${label}</span>
        <ha-switch
          .checked=${checked}
          ?disabled=${disabled || this.busy}
          @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)}
        ></ha-switch>
      </label>
    `;
  }

  private renderPreview() {
    const s = this.status!;
    const syncing = s.streaming.target_fps !== null;
    const brightness = this.brightnessDraft ?? Math.round(this.colors.brightness * 100);
    return html`
      <ha-card
        ><div class="card-content">
          <div class="row">
            <span class="value">Live preview</span>
            <span class="secondary small">
              ${
                syncing
                  ? "Select a light to paint it."
                  : "Sync is off. Showing the colours sync starts with."
              }
            </span>
          </div>
          <hue-room-preview
            .channels=${s.zone_layout?.channels ?? []}
            .lightInfo=${s.zone_layout?.lights ?? []}
            .colors=${this.colors.channels}
            ?active=${syncing}
            @paint=${(e: CustomEvent<{ channels: number[] }>) =>
              this.act("colors/set", {
                channels: Object.fromEntries(
                  e.detail.channels.map((id) => [id, this.paintColor]),
                ),
                // draw on top of a running scene or live control instead of replacing it
                overlay: s.scene.id !== null || s.live !== null,
              })}
          ></hue-room-preview>
          <div class="row controls">
            <label class="row">
              <input
                type="color"
                .value=${this.paintColor}
                @input=${(e: Event) =>
                  (this.paintColor = (e.target as HTMLInputElement).value)}
              />
              <span class="secondary small">Paint colour</span>
            </label>
            <label class="row grow">
              <span class="secondary small">Brightness</span>
              <ha-slider
                class="grow"
                min="0"
                max="100"
                step="1"
                .value=${brightness}
                @input=${(e: Event) =>
                  (this.brightnessDraft = Number((e.target as HTMLInputElement).value))}
                @change=${async (e: Event) => {
                  await this.act("colors/set", {
                    brightness: Number((e.target as HTMLInputElement).value) / 100,
                    start: false,
                  });
                  this.brightnessDraft = undefined;
                }}
              ></ha-slider>
              <span class="small">${brightness}%</span>
            </label>
          </div>
        </div></ha-card
      >
    `;
  }

  private renderScenes() {
    const s = this.status!;
    return html`
      <hue-scene-panel
        .scenes=${this.scenes}
        .playing=${s.scene.id}
        .playingParams=${s.scene.params}
        .speed=${s.scene.speed}
        ?disabled=${this.busy || !s.zone}
        @play=${(e: CustomEvent<{ scene: string; params?: Record<string, unknown> }>) =>
          this.act("scene/play", {
            scene: e.detail.scene,
            ...(e.detail.params ? { params: e.detail.params } : {}),
          })}
        @stop=${() => this.act("scene/stop")}
        @speed=${(e: CustomEvent<{ speed: number }>) =>
          this.act("speed", { speed: e.detail.speed })}
        @reload-scenes=${async () => {
          try {
            this.scenes = await this.call<SceneInfo[]>("scenes/reload");
            this.message = undefined;
          } catch (err) {
            this.message = errorText(err);
          }
        }}
        @download-scene=${(e: CustomEvent<{ scene: string }>) => {
          this.call<Record<string, unknown>>("scene", { scene: e.detail.scene })
            .then((scene) => {
              this.downloadJson(`${e.detail.scene}.json`, scene);
            })
            .catch((err) => {
              this.message = errorText(err);
            });
        }}
        @upload-scene=${async (e: CustomEvent<{ scene: Record<string, unknown> }>) => {
          try {
            this.scenes = await this.call<SceneInfo[]>("scenes/upload", {
              scene: e.detail.scene,
            });
            this.message = undefined;
          } catch (err) {
            this.message = errorText(err);
          }
        }}
        @delete-scene=${async (e: CustomEvent<{ scene: string }>) => {
          if (!confirm(`Delete scene ${e.detail.scene}?`)) return;
          try {
            this.scenes = await this.call<SceneInfo[]>("scenes/delete", {
              scene_id: e.detail.scene,
            });
            this.message = undefined;
          } catch (err) {
            this.message = errorText(err);
          }
        }}
      ></hue-scene-panel>
    `;
  }

  private renderMessage() {
    const live = this.status?.live;
    const text = this.message ?? this.status?.streaming.error;
    return html`
      ${
        live
          ? html`<div class="live-bar">
              <span
                >Live control by <b>${live.client}</b> since
                ${new Date(live.since * 1000).toLocaleTimeString()}. Painting draws on
                top.</span
              >
              <ha-button
                appearance="accent"
                size="s"
                ?disabled=${this.busy}
                @click=${() => this.act("live/revoke")}
              >
                Take over
              </ha-button>
            </div>`
          : nothing
      }
      ${text ? html`<div class="message" role="alert">${text}</div>` : nothing}
    `;
  }

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
    }
    .card-content {
      padding: 16px;
      display: grid;
      grid-template-columns: minmax(0, 1fr);
      gap: 12px;
    }
    .row,
    .toggle-row {
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
    .toolbar {
      box-sizing: border-box;
      display: flex;
      align-items: center;
      gap: 12px;
      height: var(--header-height, 56px);
      padding: 0 12px;
      background: var(--app-header-background-color, var(--primary-color));
      color: var(--app-header-text-color, var(--text-primary-color));
      border-bottom: var(--app-header-border-bottom);
      font-size: 20px;
    }
    .title {
      flex: 1;
    }
    .pill {
      font-size: 13px;
      padding: 3px 10px;
      border-radius: 12px;
      background: rgba(127, 127, 127, 0.25);
    }
    .pill.streaming {
      background: var(--success-color, #43a047);
      color: #fff;
    }
    .pill.reconnecting {
      background: var(--warning-color, #ffa600);
      color: #000;
    }
    .content {
      padding: 16px;
      max-width: 1100px;
      margin: 0 auto;
      display: grid;
      gap: 16px;
    }
    .cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
      gap: 16px;
    }
    .label {
      font-size: 13px;
      color: var(--secondary-text-color);
    }
    .link {
      font-size: 13px;
      color: var(--primary-color);
      text-decoration: none;
    }
    .toggles {
      gap: 14px;
    }
    .toggle-row span {
      font-size: 15px;
    }
    .controls {
      flex-wrap: wrap;
    }
    .grow {
      flex: 1;
      min-width: 0;
    }
    .live-bar {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(3, 169, 244, 0.12);
      border: 1px solid var(--info-color, #039be5);
    }
    .message {
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(255, 166, 0, 0.15);
      border: 1px solid var(--warning-color, #ffa600);
    }
    ha-button {
      --ha-icon-button-size: 24px;
      --mdc-icon-button-size: 24px;
      --mdc-icon-size: 16px;
    }
  `;
}

function errorText(err: unknown): string {
  return (err as { message?: string }).message ?? String(err);
}

customElements.define("ha-hue-entertainment-panel", HueEntertainmentPanel);
