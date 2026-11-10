import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadConfig } from "./config.ts";

describe("loadConfig", () => {
  it("requires a token", () => {
    assert.throws(() => loadConfig({}), /DISCORD_TOKEN/);
    assert.throws(() => loadConfig({ DISCORD_TOKEN: "  " }), /DISCORD_TOKEN/);
  });

  it("applies defaults", () => {
    assert.deepEqual(loadConfig({ DISCORD_TOKEN: "t" }), {
      token: "t",
      minChannels: 3,
      maxDeltaMs: 300_000,
      timeoutMs: 15 * 60_000,
      scanLookbackMs: 24 * 3_600_000,
      logChannelId: undefined,
    });
  });

  it("treats empty values as defaults", () => {
    const config = loadConfig({ DISCORD_TOKEN: "t", MIN_CHANNELS: "", LOG_CHANNEL_ID: "" });
    assert.equal(config.minChannels, 3);
    assert.equal(config.logChannelId, undefined);
  });

  it("reads overrides", () => {
    const config = loadConfig({
      DISCORD_TOKEN: "t",
      MIN_CHANNELS: "4",
      MAX_DELTA_SECONDS: "30",
      TIMEOUT_MINUTES: "60",
      SCAN_LOOKBACK_HOURS: "0",
      LOG_CHANNEL_ID: "123",
    });
    assert.equal(config.minChannels, 4);
    assert.equal(config.maxDeltaMs, 30_000);
    assert.equal(config.timeoutMs, 3_600_000);
    assert.equal(config.scanLookbackMs, 0);
    assert.equal(config.logChannelId, "123");
  });

  it("allows disabling timeouts", () => {
    assert.equal(loadConfig({ DISCORD_TOKEN: "t", TIMEOUT_MINUTES: "0" }).timeoutMs, 0);
  });

  it("rejects invalid numbers", () => {
    assert.throws(() => loadConfig({ DISCORD_TOKEN: "t", MIN_CHANNELS: "abc" }), /MIN_CHANNELS/);
    assert.throws(() => loadConfig({ DISCORD_TOKEN: "t", MIN_CHANNELS: "1" }), /MIN_CHANNELS/);
    assert.throws(() => loadConfig({ DISCORD_TOKEN: "t", MIN_CHANNELS: "2.5" }), /MIN_CHANNELS/);
    assert.throws(() => loadConfig({ DISCORD_TOKEN: "t", MAX_DELTA_SECONDS: "0" }), /MAX_DELTA_SECONDS/);
    assert.throws(() => loadConfig({ DISCORD_TOKEN: "t", TIMEOUT_MINUTES: "-1" }), /TIMEOUT_MINUTES/);
  });
});
