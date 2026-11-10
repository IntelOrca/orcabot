import { createHash } from "node:crypto";

export interface MessageContent {
  content: string;
  attachments: ReadonlyArray<{ name: string; size: number }>;
}

/**
 * Returns a stable hash for a message's content, or null if there is nothing to compare
 * (e.g. a sticker-only message). Case and whitespace are ignored; attachments are matched
 * by name and size, regardless of order.
 */
export function fingerprint(msg: MessageContent): string | null {
  const text = msg.content.trim().toLowerCase().replace(/\s+/g, " ");
  const attachments = msg.attachments
    .map((a) => `${a.name}:${a.size}`)
    .sort()
    .join("|");
  if (!text && !attachments) return null;
  return createHash("sha256").update(`${text}\n${attachments}`).digest("hex");
}

export interface Post {
  guildId: string;
  userId: string;
  channelId: string;
  messageId: string;
  /** Message creation time in ms since epoch. */
  createdAt: number;
  hash: string;
}

export interface PostRef {
  channelId: string;
  messageId: string;
  createdAt: number;
}

export type Verdict =
  | { action: "none" }
  /** Threshold just reached: delete every tracked copy and punish the user. */
  | { action: "spam"; posts: PostRef[]; channelIds: string[] }
  /** Threshold was already reached in this window: delete this copy only. */
  | { action: "delete"; post: PostRef };

interface Entry {
  posts: PostRef[];
  flagged: boolean;
}

export interface DetectorOptions {
  minChannels: number;
  maxDeltaMs: number;
}

/** Tracks posts per (guild, user, content) and decides when they are cross-post spam. */
export class SpamDetector {
  private readonly entries = new Map<string, Entry>();
  private readonly options: DetectorOptions;

  constructor(options: DetectorOptions) {
    this.options = options;
  }

  record(post: Post): Verdict {
    const key = `${post.guildId}:${post.userId}:${post.hash}`;
    const entry = this.entries.get(key) ?? { posts: [], flagged: false };
    this.entries.set(key, entry);

    if (entry.posts.some((p) => p.messageId === post.messageId)) return { action: "none" };

    const ref: PostRef = { channelId: post.channelId, messageId: post.messageId, createdAt: post.createdAt };
    entry.posts.push(ref);
    entry.posts.sort((a, b) => a.createdAt - b.createdAt);
    const newest = entry.posts[entry.posts.length - 1]!.createdAt;
    this.prune(entry, newest);
    if (!entry.posts.includes(ref)) return { action: "none" }; // older than the window
    if (entry.posts.length === 1) entry.flagged = false;

    if (entry.flagged) return { action: "delete", post: ref };

    const channelIds = [...new Set(entry.posts.map((p) => p.channelId))];
    if (channelIds.length < this.options.minChannels) return { action: "none" };

    entry.flagged = true;
    return { action: "spam", posts: [...entry.posts], channelIds };
  }

  /** Drops entries with no posts inside the window ending at `now`. */
  sweep(now: number): void {
    for (const [key, entry] of this.entries) {
      this.prune(entry, now);
      if (entry.posts.length === 0) this.entries.delete(key);
    }
  }

  get size(): number {
    return this.entries.size;
  }

  private prune(entry: Entry, reference: number): void {
    entry.posts = entry.posts.filter((p) => reference - p.createdAt <= this.options.maxDeltaMs);
  }
}
