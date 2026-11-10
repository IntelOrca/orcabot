export interface Config {
  token: string;
  /** Number of distinct channels the same message must appear in to count as spam. */
  minChannels: number;
  /** All copies must be posted within this span (ms) to count together. */
  maxDeltaMs: number;
  /** How long to time out a spammer (ms). 0 disables timeouts. */
  timeoutMs: number;
  /** How far back to scan channel history on startup (ms). 0 disables the scan. */
  scanLookbackMs: number;
  /** Optional channel to report deletions in. */
  logChannelId: string | undefined;
}

export const DEFAULTS = {
  MIN_CHANNELS: 3,
  MAX_DELTA_SECONDS: 300,
  TIMEOUT_MINUTES: 15,
  SCAN_LOOKBACK_HOURS: 24,
} as const;

type Env = Record<string, string | undefined>;

function readNumber(env: Env, name: keyof typeof DEFAULTS, min: number, integer: boolean): number {
  const raw = env[name]?.trim();
  if (raw === undefined || raw === "") return DEFAULTS[name];
  const value = Number(raw);
  if (!Number.isFinite(value) || value < min || (integer && !Number.isInteger(value))) {
    throw new Error(`${name} must be ${integer ? "an integer" : "a number"} >= ${min}, got "${raw}"`);
  }
  return value;
}

export function loadConfig(env: Env): Config {
  const token = env.DISCORD_TOKEN?.trim();
  if (!token) throw new Error("DISCORD_TOKEN is not set");

  return {
    token,
    minChannels: readNumber(env, "MIN_CHANNELS", 2, true),
    maxDeltaMs: readNumber(env, "MAX_DELTA_SECONDS", 1, false) * 1000,
    timeoutMs: readNumber(env, "TIMEOUT_MINUTES", 0, false) * 60_000,
    scanLookbackMs: readNumber(env, "SCAN_LOOKBACK_HOURS", 0, false) * 3_600_000,
    logChannelId: env.LOG_CHANNEL_ID?.trim() || undefined,
  };
}
