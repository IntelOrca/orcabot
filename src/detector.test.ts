import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fingerprint, SpamDetector, type Post } from "./detector.ts";

const SECOND = 1000;

function detector(minChannels = 3, maxDeltaMs = 300 * SECOND) {
  return new SpamDetector({ minChannels, maxDeltaMs });
}

let nextId = 0;
function post(channelId: string, createdAt: number, overrides: Partial<Post> = {}): Post {
  return {
    guildId: "g1",
    userId: "u1",
    channelId,
    messageId: `m${nextId++}`,
    createdAt,
    hash: "h1",
    ...overrides,
  };
}

describe("fingerprint", () => {
  it("ignores case and whitespace", () => {
    const a = fingerprint({ content: "Free  Nitro\nhere", attachments: [] });
    const b = fingerprint({ content: "  free nitro here ", attachments: [] });
    assert.equal(a, b);
  });

  it("distinguishes different text", () => {
    assert.notEqual(
      fingerprint({ content: "hello", attachments: [] }),
      fingerprint({ content: "goodbye", attachments: [] }),
    );
  });

  it("matches attachments regardless of order", () => {
    const x = { name: "a.png", size: 10 };
    const y = { name: "b.png", size: 20 };
    assert.equal(
      fingerprint({ content: "", attachments: [x, y] }),
      fingerprint({ content: "", attachments: [y, x] }),
    );
  });

  it("distinguishes attachments of different size", () => {
    assert.notEqual(
      fingerprint({ content: "@everyone", attachments: [{ name: "a.png", size: 10 }] }),
      fingerprint({ content: "@everyone", attachments: [{ name: "a.png", size: 11 }] }),
    );
  });

  it("returns null when there is nothing to compare", () => {
    assert.equal(fingerprint({ content: "   ", attachments: [] }), null);
  });
});

describe("SpamDetector", () => {
  it("flags the same message in the minimum number of channels", () => {
    const d = detector();
    assert.equal(d.record(post("c1", 0)).action, "none");
    assert.equal(d.record(post("c2", 1 * SECOND)).action, "none");
    const verdict = d.record(post("c3", 2 * SECOND));
    assert.equal(verdict.action, "spam");
    assert.ok(verdict.action === "spam");
    assert.equal(verdict.posts.length, 3);
    assert.deepEqual(verdict.channelIds.sort(), ["c1", "c2", "c3"]);
  });

  it("respects a custom channel threshold", () => {
    const d = detector(2);
    d.record(post("c1", 0));
    assert.equal(d.record(post("c2", SECOND)).action, "spam");
  });

  it("does not flag repeats within the same channel", () => {
    const d = detector();
    for (let i = 0; i < 5; i++) assert.equal(d.record(post("c1", i * SECOND)).action, "none");
    assert.equal(d.record(post("c2", 6 * SECOND)).action, "none");
  });

  it("includes same-channel repeats in the deletion once flagged", () => {
    const d = detector();
    d.record(post("c1", 0));
    d.record(post("c1", SECOND));
    d.record(post("c2", 2 * SECOND));
    const verdict = d.record(post("c3", 3 * SECOND));
    assert.ok(verdict.action === "spam");
    assert.equal(verdict.posts.length, 4);
  });

  it("deletes further copies after flagging", () => {
    const d = detector();
    d.record(post("c1", 0));
    d.record(post("c2", SECOND));
    d.record(post("c3", 2 * SECOND));
    const extra = post("c4", 3 * SECOND);
    const verdict = d.record(extra);
    assert.ok(verdict.action === "delete");
    assert.equal(verdict.post.messageId, extra.messageId);
  });

  it("ignores copies spread out beyond the max delta", () => {
    const d = detector(3, 10 * SECOND);
    d.record(post("c1", 0));
    d.record(post("c2", 6 * SECOND));
    assert.equal(d.record(post("c3", 12 * SECOND)).action, "none");
  });

  it("counts copies exactly at the max delta", () => {
    const d = detector(3, 10 * SECOND);
    d.record(post("c1", 0));
    d.record(post("c2", 5 * SECOND));
    assert.equal(d.record(post("c3", 10 * SECOND)).action, "spam");
  });

  it("resets after the window passes", () => {
    const d = detector(3, 10 * SECOND);
    d.record(post("c1", 0));
    d.record(post("c2", SECOND));
    d.record(post("c3", 2 * SECOND));
    assert.equal(d.record(post("c4", 60 * SECOND)).action, "none");
  });

  it("tracks users separately", () => {
    const d = detector();
    d.record(post("c1", 0, { userId: "a" }));
    d.record(post("c2", SECOND, { userId: "b" }));
    assert.equal(d.record(post("c3", 2 * SECOND, { userId: "c" })).action, "none");
  });

  it("tracks guilds separately", () => {
    const d = detector();
    d.record(post("c1", 0, { guildId: "a" }));
    d.record(post("c2", SECOND, { guildId: "b" }));
    assert.equal(d.record(post("c3", 2 * SECOND, { guildId: "a" })).action, "none");
  });

  it("tracks different content separately", () => {
    const d = detector();
    d.record(post("c1", 0, { hash: "x" }));
    d.record(post("c2", SECOND, { hash: "y" }));
    assert.equal(d.record(post("c3", 2 * SECOND, { hash: "x" })).action, "none");
  });

  it("ignores the same message recorded twice", () => {
    const d = detector();
    const p = post("c1", 0);
    d.record(p);
    d.record(p);
    d.record(p);
    assert.equal(d.record(post("c2", SECOND)).action, "none");
  });

  it("handles posts recorded out of order", () => {
    const d = detector(3, 10 * SECOND);
    d.record(post("c3", 8 * SECOND));
    d.record(post("c1", 0));
    assert.equal(d.record(post("c2", 4 * SECOND)).action, "spam");
  });

  it("sweep drops stale entries", () => {
    const d = detector(3, 10 * SECOND);
    d.record(post("c1", 0));
    d.record(post("c1", 0, { hash: "other" }));
    assert.equal(d.size, 2);
    d.sweep(5 * SECOND);
    assert.equal(d.size, 2);
    d.sweep(11 * SECOND);
    assert.equal(d.size, 0);
  });
});
