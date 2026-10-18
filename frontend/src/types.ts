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
}

export interface Status {
  paired: boolean;
  bridge: { host: string; id: string; name: string } | null;
  zone: { id: string; name: string; channels: number } | null;
  zone_layout: { id: string; name: string; channels: Channel[] } | null;
  streaming: {
    active: boolean;
    state: "off" | "streaming" | "reconnecting";
    target_fps: number | null;
    send_fps: number;
    error: string | null;
  };
  scene: { id: string | null; speed: number; overlays: number };
  allow_override: boolean;
}

export interface Zone {
  id: string;
  name: string;
  type: string;
  status: "active" | "inactive";
  channel_count: number;
}
