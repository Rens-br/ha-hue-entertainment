import { LitElement, css, html, nothing } from "lit";

import type { Hass, Status, Zone } from "./types";

const DOMAIN = "ha_hue_entertainment";
const INTEGRATION_PAGE = `/config/integrations/integration/${DOMAIN}`;

class HueEntertainmentPanel extends LitElement {
  // Set by Home Assistant.
  hass?: Hass;
  narrow = false;

  private status?: Status;
  private zones: Zone[] = [];
  private message?: string; // last failed action, shown until the next success
  private busy = false; // an action is in flight
  private unsubscribe?: () => Promise<void>;

  static properties = {
    hass: { attribute: false },
    narrow: { type: Boolean },
    status: { state: true },
    zones: { state: true },
    message: { state: true },
    busy: { state: true },
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

  private async connect() {
    try {
      this.unsubscribe = await this.hass!.connection.subscribeMessage<
        { type: string } & Status
      >(
        (msg) => {
          if (msg.type === "status") this.status = msg;
        },
        { type: `${DOMAIN}/subscribe`, colors: false },
      );
      this.zones = await this.call<Zone[]>("zones");
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
                ${this.renderMessage()}`
            : this.message
              ? this.renderMessage()
              : html`<div class="card">Loading…</div>`
        }
      </div>
    `;
  }

  private renderStatePill() {
    const st = this.status?.streaming;
    if (!st) return nothing;
    const label =
      st.state === "streaming"
        ? `Streaming · ${Math.round(st.send_fps)}/s`
        : st.state === "reconnecting"
          ? "Reconnecting"
          : "Off";
    return html`<span class="pill ${st.state}">${label}</span>`;
  }

  private renderBridge() {
    const bridge = this.status!.bridge;
    return html`
      <div class="card">
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
      </div>
    `;
  }

  private renderZone() {
    const current = this.status!.zone?.id ?? "";
    return html`
      <div class="card">
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
      </div>
    `;
  }

  private renderToggles() {
    const s = this.status!;
    const syncing = s.streaming.target_fps !== null;
    return html`
      <div class="card toggles">
        ${this.toggle("Sync", syncing, !s.zone, (on) => this.act("sync", { on }))}
        ${this.toggle(
          "Allow override",
          s.allow_override,
          false,
          (allow) => this.act("override", { allow }),
          "Starting sync may stop another app, like a Hue Sync Box",
        )}
      </div>
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
        <input
          type="checkbox"
          role="switch"
          .checked=${checked}
          ?disabled=${disabled || this.busy}
          @change=${(e: Event) => onChange((e.target as HTMLInputElement).checked)}
        />
      </label>
    `;
  }

  private renderMessage() {
    const text = this.message ?? this.status?.streaming.error;
    if (!text) return nothing;
    return html`<div class="message" role="alert">${text}</div>`;
  }

  static styles = css`
    :host {
      display: block;
      min-height: 100vh;
      background: var(--primary-background-color);
      color: var(--primary-text-color);
    }
    .toolbar {
      display: flex;
      align-items: center;
      gap: 12px;
      height: var(--header-height, 56px);
      padding: 0 12px;
      background: var(--app-header-background-color, var(--primary-color));
      color: var(--app-header-text-color, var(--text-primary-color));
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
    .card {
      background: var(--card-background-color, #fff);
      border-radius: var(--ha-card-border-radius, 12px);
      border: 1px solid var(--divider-color);
      padding: 16px;
      display: grid;
      gap: 10px;
      align-content: start;
    }
    .label {
      font-size: 13px;
      color: var(--secondary-text-color);
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
    .link {
      font-size: 13px;
      color: var(--primary-color);
      text-decoration: none;
    }
    select {
      font: inherit;
      color: inherit;
      padding: 8px;
      border-radius: 8px;
      border: 1px solid var(--divider-color);
      background: var(--secondary-background-color, transparent);
    }
    .toggles {
      gap: 14px;
    }
    .toggle-row span {
      font-size: 15px;
    }
    input[role="switch"] {
      appearance: none;
      width: 36px;
      height: 20px;
      border-radius: 10px;
      background: var(--disabled-color, #bdbdbd);
      position: relative;
      cursor: pointer;
      transition: background 0.15s;
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
    input[role="switch"]:disabled {
      opacity: 0.5;
      cursor: default;
    }
    .message {
      padding: 10px 14px;
      border-radius: 8px;
      background: rgba(255, 166, 0, 0.15);
      border: 1px solid var(--warning-color, #ffa600);
    }
  `;
}

function errorText(err: unknown): string {
  return (err as { message?: string }).message ?? String(err);
}

customElements.define("ha-hue-entertainment-panel", HueEntertainmentPanel);
