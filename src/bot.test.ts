import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { formatDuration, noticeText } from "./bot.ts";

describe("formatDuration", () => {
  it("formats whole minutes", () => {
    assert.equal(formatDuration(60_000), "1 minute");
    assert.equal(formatDuration(15 * 60_000), "15 minutes");
  });

  it("falls back to seconds", () => {
    assert.equal(formatDuration(1000), "1 second");
    assert.equal(formatDuration(90_000), "90 seconds");
  });
});

describe("noticeText", () => {
  it("mentions the timeout when one was applied", () => {
    const text = noticeText("Orca Land", 3, 15 * 60_000);
    assert.match(text, /3 channels in \*\*Orca Land\*\*/);
    assert.match(text, /timed out for 15 minutes/);
  });

  it("omits the timeout when none was applied", () => {
    assert.doesNotMatch(noticeText("Orca Land", 3, null), /timed out/);
  });
});
