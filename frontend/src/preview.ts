import { LitElement, css, html, svg } from "lit";

import type { Channel, LightInfo } from "./types";

// Orthographic room view like the Hue app: the TV wall (y = +1) and the left
// wall (x = -1) are the two back walls; z is height (-1 floor .. +1 ceiling).
const W = 440;
const KX = 98; // screen px per unit along the floor diagonals
const KY = 50;
const KZ = 42; // screen px per unit of height (lower = flatter room)
const H = 4 * KY + 2 * KZ + 28; // far wall top to near floor corner, with margin
const CX = W / 2;
const CY = 2 * KY + KZ + 14;
type P3 = { x: number; y: number; z: number };
const proj = (p: P3): Point => ({
  x: CX + (p.x + p.y) * KX,
  y: CY + (p.x - p.y) * KY - p.z * KZ,
});
const pts = (ps: P3[]) => ps.map((p) => `${proj(p).x},${proj(p).y}`).join(" ");
// draw far lights first: the far corner is (x = -1, y = +1)
const depth = (ps: P3[]) => ps.reduce((a, p) => a + p.x - p.y, 0) / ps.length;

interface Light {
  id: string;
  name: string;
  channels: Channel[]; // in segment order
  positions: P3[]; // placement; 2+ points = drawn as a bar
  segmentCount: number;
}

const at = (ch: Channel) => ch.placed ?? ch.position;

type Point = { x: number; y: number };

/** The part of a polyline between fractions a and b of its length. */
function slice(line: Point[], a: number, b: number): Point[] {
  const seg = line.slice(1).map((p, i) => Math.hypot(p.x - line[i].x, p.y - line[i].y));
  const total = seg.reduce((s, l) => s + l, 0);
  const pointAt = (t: number): Point => {
    let left = t * total;
    for (let i = 0; i < seg.length; i++) {
      if (left <= seg[i] || i === seg.length - 1) {
        const f = seg[i] ? Math.min(1, left / seg[i]) : 0;
        return {
          x: line[i].x + (line[i + 1].x - line[i].x) * f,
          y: line[i].y + (line[i + 1].y - line[i].y) * f,
        };
      }
      left -= seg[i];
    }
    return line[line.length - 1];
  };
  return [pointAt(a), pointAt(b)];
}

/**
 * Orthographic view of an entertainment area. Single lights are dots, gradient lights a
 * bar through their segments, with a legend underneath. Clicking a light,
 * segment or legend entry fires "paint" with the channel ids.
 */
class HueRoomPreview extends LitElement {
  channels: Channel[] = [];
  lightInfo: LightInfo[] = [];
  colors: Record<string, string> = {};
  active = false; // syncing: live colours; otherwise faded
  private hovered?: Light;

  static properties = {
    channels: { attribute: false },
    lightInfo: { attribute: false },
    colors: { attribute: false },
    active: { type: Boolean },
    hovered: { state: true },
  };

  private lights(): Light[] {
    const info = new Map(this.lightInfo.map((l) => [l.id, l]));
    const byId = new Map<string, Light>();
    for (const ch of this.channels) {
      const id = ch.light_id ?? `ch${ch.id}`;
      if (!byId.has(id)) {
        const li = info.get(id);
        byId.set(id, {
          id,
          name: ch.light ?? ch.lights[0],
          channels: [],
          positions: li?.positions.length ? li.positions : [],
          segmentCount: li?.segment_count ?? 1,
        });
      }
      byId.get(id)!.channels.push(ch);
    }
    for (const light of byId.values()) {
      light.channels.sort((a, b) => (a.segment ?? 0) - (b.segment ?? 0));
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  private color(ch: Channel) {
    return this.colors[String(ch.id)] ?? "#000000";
  }

  private paint(channels: Channel[]) {
    this.dispatchEvent(
      new CustomEvent("paint", { detail: { channels: channels.map((c) => c.id) } }),
    );
  }

  private hover(light?: Light) {
    this.hovered = light;
  }

  render() {
    if (!this.channels.length) {
      return html`<div class="empty">
        Choose an entertainment area to see its lights.
      </div>`;
    }
    const lights = this.lights();
    const ordered = [...lights].sort(
      (a, b) =>
        depth(a.positions.length ? a.positions : a.channels.map(at)) -
        depth(b.positions.length ? b.positions : b.channels.map(at)),
    );
    return html`
      <div class="stage">
        <svg viewBox="0 0 ${W} ${H}" class=${this.active ? "live" : "faded"}>
          <polygon
            class="wall left"
            points=${pts([
              { x: -1, y: 1, z: -1 },
              { x: -1, y: -1, z: -1 },
              { x: -1, y: -1, z: 1 },
              { x: -1, y: 1, z: 1 },
            ])}
          ></polygon>
          <polygon
            class="wall front"
            points=${pts([
              { x: -1, y: 1, z: -1 },
              { x: 1, y: 1, z: -1 },
              { x: 1, y: 1, z: 1 },
              { x: -1, y: 1, z: 1 },
            ])}
          ></polygon>
          <polygon
            class="floor"
            points=${pts([
              { x: -1, y: 1, z: -1 },
              { x: 1, y: 1, z: -1 },
              { x: 1, y: -1, z: -1 },
              { x: -1, y: -1, z: -1 },
            ])}
          ></polygon>
          <!-- 16:9 on screen (walls are drawn flatter than the floor), at the height
               the Hue app shows it: TV backlights around the middle of the screen -->
          <polygon
            class="tv"
            points=${pts([
              { x: -0.3, y: 1, z: -0.42 },
              { x: 0.3, y: 1, z: -0.42 },
              { x: 0.3, y: 1, z: 0.46 },
              { x: -0.3, y: 1, z: 0.46 },
            ])}
          ></polygon>
          ${ordered.map((l) => (l.positions.length > 1 ? this.bar(l) : this.dot(l)))}
        </svg>
        <div class="hint">
          ${
            this.hovered
              ? `${this.hovered.name} · channel ${this.hovered.channels.map((c) => c.id).join(", ")}`
              : " "
          }
        </div>
      </div>
      <div class="legend">
        ${lights.map(
          (l) => html`
            <button
              class="chip"
              title="Paint ${l.name}"
              @click=${() => this.paint(l.channels)}
              @mouseenter=${() => this.hover(l)}
              @mouseleave=${() => this.hover()}
            >
              <span class="swatch">
                ${l.channels.map(
                  (c) => html`<span style="background:${this.color(c)}"></span>`,
                )}
              </span>
              <span class="chip-name">${l.name}</span>
              <span class="ids">${l.channels.map((c) => c.id).join(", ")}</span>
            </button>
          `,
        )}
      </div>
    `;
  }

  /** A pole from the floor up to the light, so height reads at a glance. */
  private pole(p: P3) {
    if (p.z <= -0.97) return svg``;
    const foot = proj({ ...p, z: -1 });
    const top = proj(p);
    return svg`
      <line class="pole" x1=${foot.x} y1=${foot.y} x2=${top.x} y2=${top.y}></line>
      <ellipse class="foot" cx=${foot.x} cy=${foot.y} rx="4.5" ry="2.2"></ellipse>
    `;
  }

  private dot(light: Light) {
    const ch = light.channels[0];
    const p = light.positions[0] ?? at(ch);
    const { x, y } = proj(p);
    const c = this.color(ch);
    const hot = this.hovered === light;
    return svg`
      <g class="light" @click=${() => this.paint([ch])}
        @mouseenter=${() => this.hover(light)} @mouseleave=${() => this.hover()}>
        ${this.pole(p)}
        <circle cx=${x} cy=${y} r="14" fill=${c} class="glow"></circle>
        <circle cx=${x} cy=${y} r="7" fill=${c} class=${hot ? "core hot" : "core"}></circle>
      </g>
    `;
  }

  private bar(light: Light) {
    // The line as placed in the Hue app, coloured as a smooth gradient with the
    // channels evenly spaced. Clicks hit equal parts of the bar, one per channel.
    const line = light.positions.map(proj);
    const path = (ps: Point[]) =>
      ps.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
    const first = line[0];
    const last = line[line.length - 1];
    const gradId = `g-${light.id}`;
    const n = light.channels.length;
    const stops = light.channels.map(
      (ch, i) =>
        svg`<stop offset=${n > 1 ? i / (n - 1) : 0} stop-color=${this.color(ch)}></stop>`,
    );
    const hot = this.hovered === light;
    return svg`
      <g class="light" @mouseenter=${() => this.hover(light)} @mouseleave=${() => this.hover()}>
        ${this.pole(light.positions[0])} ${this.pole(light.positions[light.positions.length - 1])}
        <defs>
          <linearGradient id=${gradId} gradientUnits="userSpaceOnUse"
            x1=${first.x} y1=${first.y} x2=${last.x} y2=${last.y}>${stops}</linearGradient>
        </defs>
        <path d=${path(line)} stroke=${`url(#${gradId})`} class="bar-glow"></path>
        <path d=${path(line)} class="bar-edge"></path>
        <path d=${path(line)} stroke=${`url(#${gradId})`} class=${hot ? "bar hot" : "bar"}></path>
        ${light.channels.map(
          (
            ch,
            i,
          ) => svg`<path class="hit-bar" d=${path(slice(line, i / n, (i + 1) / n))}
            @click=${() => this.paint([ch])}></path>`,
        )}
      </g>
    `;
  }

  static styles = css`
    .stage {
      max-width: 600px;
      margin: 0 auto;
    }
    svg {
      width: 100%;
      height: auto;
      display: block;
    }
    .wall,
    .floor {
      stroke: var(--divider-color);
      stroke-width: 0.75;
    }
    .wall.left {
      fill: var(--secondary-background-color, rgba(127, 127, 127, 0.08));
    }
    .wall.front {
      fill: var(--primary-background-color, rgba(127, 127, 127, 0.04));
    }
    .floor {
      fill: var(--secondary-background-color, rgba(127, 127, 127, 0.12));
    }
    .tv {
      fill: var(--secondary-text-color);
      opacity: 0.35;
    }
    .pole {
      stroke: var(--secondary-text-color);
      stroke-width: 1.5;
      stroke-linecap: round;
      opacity: 0.5;
    }
    .foot {
      fill: var(--secondary-text-color);
      opacity: 0.35;
    }
    .glow {
      opacity: 0.3;
    }
    .core {
      stroke: #fff;
      stroke-width: 1.5;
    }
    .bar {
      fill: none;
      stroke-width: 7;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .bar-edge {
      fill: none;
      stroke: #fff;
      stroke-width: 10;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    .faded .bar-edge {
      opacity: 0.6;
    }
    .bar-glow {
      fill: none;
      stroke-width: 18;
      stroke-linecap: round;
      opacity: 0.18;
    }
    .faded .glow,
    .faded .bar-glow {
      display: none;
    }
    .faded .core,
    .faded .bar {
      opacity: 0.45;
    }
    .light {
      cursor: pointer;
    }
    .hit-bar {
      fill: none;
      stroke: transparent;
      stroke-width: 26;
      pointer-events: stroke;
    }
    .core.hot {
      stroke: var(--primary-text-color);
      stroke-width: 2;
    }
    .bar.hot {
      stroke-width: 10;
    }
    .hint {
      text-align: center;
      font-size: 13px;
      color: var(--secondary-text-color);
      min-height: 18px;
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      justify-content: center;
      margin-top: 8px;
    }
    .chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px 4px 6px;
      border-radius: 14px;
      border: 1px solid var(--divider-color);
      background: none;
      color: var(--primary-text-color);
      font: inherit;
      font-size: 13px;
      cursor: pointer;
    }
    .chip:hover {
      border-color: var(--primary-color);
    }
    .swatch {
      display: inline-flex;
      border-radius: 50%;
      overflow: hidden;
      width: 16px;
      height: 16px;
      border: 1px solid var(--divider-color);
    }
    .swatch span {
      flex: 1;
    }
    .ids {
      color: var(--secondary-text-color);
      font-size: 12px;
    }
    .empty {
      color: var(--secondary-text-color);
      padding: 24px 0;
      text-align: center;
    }
  `;
}

customElements.define("hue-room-preview", HueRoomPreview);
