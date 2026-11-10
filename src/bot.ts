import {
  Client,
  Events,
  GatewayIntentBits,
  PermissionFlagsBits,
  type Message,
} from "discord.js";
import type { Config } from "./config.ts";
import { fingerprint, SpamDetector, type PostRef } from "./detector.ts";

const NOTICE_TTL_MS = 30_000;
const SWEEP_INTERVAL_MS = 60_000;
const UNKNOWN_MESSAGE = 10008;

export function formatDuration(ms: number): string {
  const minutes = ms / 60_000;
  if (minutes >= 1 && Number.isInteger(minutes)) return `${minutes} minute${minutes === 1 ? "" : "s"}`;
  const seconds = Math.round(ms / 1000);
  return `${seconds} second${seconds === 1 ? "" : "s"}`;
}

export function noticeText(guildName: string, channelCount: number, timeoutMs: number | null): string {
  return (
    `Spam protection: you posted the same message in ${channelCount} channels in **${guildName}**, so those messages were deleted` +
    (timeoutMs ? ` and you have been timed out for ${formatDuration(timeoutMs)}. ` : ". ") +
    "If you didn't send them, your account may be compromised. Change your password and enable 2FA."
  );
}

export function createBot(config: Config): Client {
  const detector = new SpamDetector({ minChannels: config.minChannels, maxDeltaMs: config.maxDeltaMs });
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent, // privileged: enable in the Developer Portal
    ],
  });

  async function deleteMessage(post: PostRef): Promise<boolean> {
    try {
      const channel = await client.channels.fetch(post.channelId);
      if (!channel?.isTextBased()) return false;
      await channel.messages.delete(post.messageId);
      return true;
    } catch (err) {
      if ((err as { code?: number }).code !== UNKNOWN_MESSAGE) {
        console.error(`Failed to delete ${post.messageId} in ${post.channelId}:`, err);
      }
      return false;
    }
  }

  async function timeoutUser(msg: Message<true>): Promise<boolean> {
    if (config.timeoutMs <= 0) return false;
    try {
      const member = msg.member ?? (await msg.guild.members.fetch(msg.author.id));
      if (!member.moderatable) {
        console.warn(
          `Cannot time out ${msg.author.tag}: bot lacks Moderate Members, or their role is at or above the bot's`,
        );
        return false;
      }
      await member.timeout(config.timeoutMs, "Spam protection: same message posted in multiple channels");
      return true;
    } catch (err) {
      console.error(`Failed to time out ${msg.author.tag}:`, err);
      return false;
    }
  }

  async function notifyUser(msg: Message<true>, text: string): Promise<void> {
    try {
      await msg.author.send(text);
      console.log(`Notified ${msg.author.tag} by DM`);
      return;
    } catch {
      // DMs closed; fall back to a short-lived notice in the channel.
    }
    try {
      if (!msg.channel.isSendable()) return;
      const notice = await msg.channel.send({
        content: `<@${msg.author.id}> ${text}`,
        allowedMentions: { users: [msg.author.id] },
      });
      console.log(`Notified ${msg.author.tag} in #${msg.channel.name} (DMs closed)`);
      setTimeout(() => notice.delete().catch(() => {}), NOTICE_TTL_MS).unref();
    } catch (err) {
      console.error("Failed to notify user:", err);
    }
  }

  async function report(text: string): Promise<void> {
    console.log(text);
    if (!config.logChannelId) return;
    try {
      const ch = await client.channels.fetch(config.logChannelId);
      if (ch?.isSendable()) await ch.send({ content: text, allowedMentions: { parse: [] } });
    } catch (err) {
      console.error("Failed to send to log channel:", err);
    }
  }

  async function handle(msg: Message): Promise<void> {
    if (!msg.inGuild() || msg.author.bot || msg.system) return;

    const hash = fingerprint({
      content: msg.content,
      attachments: [...msg.attachments.values()].map((a) => ({ name: a.name, size: a.size })),
    });
    if (!hash) return;

    const verdict = detector.record({
      guildId: msg.guildId,
      userId: msg.author.id,
      channelId: msg.channelId,
      messageId: msg.id,
      createdAt: msg.createdTimestamp,
      hash,
    });

    if (verdict.action === "delete") {
      await deleteMessage(verdict.post);
      return;
    }
    if (verdict.action !== "spam") return;

    const results = await Promise.all(verdict.posts.map(deleteMessage));
    const deleted = results.filter(Boolean).length;
    const timedOut = await timeoutUser(msg);
    await notifyUser(msg, noticeText(msg.guild.name, verdict.channelIds.length, timedOut ? config.timeoutMs : null));

    const channels = verdict.channelIds.map((id) => `<#${id}>`).join(", ");
    const timeoutNote = timedOut ? ` and timed them out for ${formatDuration(config.timeoutMs)}` : "";
    await report(
      `Cross-post spam: deleted ${deleted} message(s) from <@${msg.author.id}> (${msg.author.tag}) ` +
        `across ${verdict.channelIds.length} channels: ${channels}${timeoutNote}\n> ${msg.content.slice(0, 200)}`,
    );
  }

  /** Runs recent channel history through the detector, catching spam posted while the bot was offline. */
  async function scanHistory(): Promise<void> {
    if (config.scanLookbackMs <= 0) return;
    const cutoff = Date.now() - config.scanLookbackMs;
    const recent: Message[] = [];

    for (const guild of client.guilds.cache.values()) {
      const me = await guild.members.fetchMe();
      const channels = await guild.channels.fetch();
      const threads = await guild.channels.fetchActiveThreads().catch(() => null);
      const targets = [...channels.values(), ...(threads?.threads.values() ?? [])];

      for (const ch of targets) {
        if (!ch?.isTextBased()) continue;
        const perms = ch.permissionsFor(me);
        if (!perms?.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.ReadMessageHistory)) {
          console.warn(`Scan: no access to #${ch.name}, skipping`);
          continue;
        }
        try {
          const msgs = await ch.messages.fetch({ limit: 100 });
          for (const m of msgs.values()) if (m.createdTimestamp >= cutoff) recent.push(m);
        } catch (err) {
          console.warn(`Scan: failed to read #${ch.name}:`, (err as Error).message);
        }
      }
    }

    recent.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    console.log(`Scan: checking ${recent.length} recent message(s)`);
    for (const m of recent) await handle(m);
    console.log("Scan: done");
  }

  client.once(Events.ClientReady, (c) => {
    console.log(
      `Logged in as ${c.user.tag}. Deleting messages posted in ${config.minChannels}+ channels ` +
        `within ${formatDuration(config.maxDeltaMs)}; timeout ${config.timeoutMs > 0 ? formatDuration(config.timeoutMs) : "disabled"}.`,
    );
    scanHistory().catch((err) => console.error("Scan error:", err));
  });

  client.on(Events.MessageCreate, (msg) => {
    handle(msg).catch((err) => console.error("Handler error:", err));
  });

  setInterval(() => detector.sweep(Date.now()), SWEEP_INTERVAL_MS).unref();

  return client;
}
