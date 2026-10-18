// The parts of Home Assistant's frontend objects the panel uses.

export interface HassConnection {
  sendMessagePromise<T = unknown>(msg: Record<string, unknown>): Promise<T>;
  subscribeMessage<T = unknown>(
    callback: (msg: T) => void,
    msg: Record<string, unknown>,
  ): Promise<() => Promise<void>>;
}

export interface Hass {
  connection: HassConnection;
  themes: { darkMode: boolean };
}

export interface Channel {
  id: number;
  position: { x: number; y: number; z: number };
  lights: string[];
  light_id?: string; // same for all segments of one gradient light
  light?: string;
  segment?: number;
  segments?: number[]; // light segments this channel covers
  placed?: { x: number; y: number; z: number }; // spot along the light as placed
}

export interface LightInfo {
  id: string;
  name: string;
  positions: { x: number; y: number; z: number }[]; // gradient lights: start and end
  segment_count: number;
}

export interface Colors {
  channels: Record<string, string>; // channel id -> "#rrggbb"
  brightness: number; // 0..1
}

export interface Status {
  paired: boolean;
  bridge: { host: string; id: string; name: string } | null;
  zone: { id: string; name: string; channels: number } | null;
  zone_layout: {
    id: string;
    name: string;
    channels: Channel[];
    lights?: LightInfo[];
  } | null;
  streaming: {
    active: boolean;
    state: "off" | "streaming" | "reconnecting";
    target_fps: number | null;
    send_fps: number;
    error: string | null;
  };
  scene: {
    id: string | null;
    params: Record<string, unknown> | null;
    speed: number;
    overlays: number;
  };
  allow_override: boolean;
}

export interface Zone {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  channel_count: number;
}

export interface SceneParameter {
  type: "color" | "number" | "choice";
  default: unknown;
  min?: number;
  max?: number;
  options?: unknown[];
}

export interface SceneInfo {
  id: string;
  name: string;
  description: string;
  author: string;
  builtin: boolean;
  duration: number | null;
  parameters: Record<string, SceneParameter>;
}
