# orcabot

A Discord bot that stops cross-post spam, the kind hacked accounts send. When one user posts the same message in several channels within a short time, orcabot:

1. Deletes every copy, plus any further copies posted within the same time window.
2. Times the user out (15 minutes by default).
3. Tells the user why by DM. If their DMs are closed, it posts a notice in the channel instead and deletes it after 30 seconds. The notice suggests changing their password in case the account was compromised.
4. Optionally reports what it did in a log channel.

On startup it also scans recent channel history, so spam posted while the bot was offline is cleaned up.

Two messages count as the same when their text matches, ignoring case and extra whitespace, and their attachments match by file name and size. Other bots are ignored.

## Discord setup

1. Create an application at https://discord.com/developers/applications. On the **Bot** page, copy the token and turn on **Message Content Intent**.
2. Invite the bot with this URL, replacing `CLIENT_ID` with your application ID:

   ```
   https://discord.com/oauth2/authorize?client_id=CLIENT_ID&scope=bot&permissions=1099511704576
   ```

   That grants View Channels, Send Messages, Manage Messages, Read Message History and Moderate Members.
3. In **Server Settings → Roles**, drag the bot's role above the roles of the members it should moderate. Discord won't let a bot moderate members whose roles are higher than its own, and server owners and administrators can never be timed out.
4. Make sure the bot can see every channel it should protect, including private channels and voice channel chats.

## Configuration

Copy `.env.example` to `.env` and fill it in. Environment variables set in other ways also work.

| Variable | Default | Description |
| --- | --- | --- |
| `DISCORD_TOKEN` | (required) | Bot token |
| `MIN_CHANNELS` | `3` | Minimum number of different channels the same message must appear in to count as spam |
| `MAX_DELTA_SECONDS` | `300` | All copies must be posted within this many seconds of each other |
| `TIMEOUT_MINUTES` | `15` | How long to time out the sender. `0` disables timeouts |
| `SCAN_LOOKBACK_HOURS` | `24` | How far back to scan history on startup. `0` disables the scan |
| `LOG_CHANNEL_ID` | (unset) | Channel ID where the bot reports deletions |

The bot keeps its state in memory, so a restart forgets messages it saw before. The startup scan covers the last 100 messages in each channel.

## Running

orcabot reads `.env` from the directory you run it from.

### Single-file bundle (recommended)

Download `orcabot.js` from [Releases](https://github.com/IntelOrca/orcabot/releases) and run `node orcabot.js`. It is about 1.3 MB, includes every dependency, and needs Node.js 22.18 or newer.

### Standalone executable

[Releases](https://github.com/IntelOrca/orcabot/releases) also has executables for Linux, Windows and macOS that need neither Node nor Bun installed. They are about 100 MB each because they include the Bun runtime.

### From source

Requires Node.js 22.18 or newer.

```sh
npm install
npm run build
npm start
```

## Development

```sh
npm run dev        # run from source without building (Node strips the types)
npm test           # unit tests (node:test)
npm run typecheck  # type check everything, including tests
npm run bundle     # build dist/orcabot.js, a single file with all dependencies (requires Bun)
npm run build:exe  # build a standalone executable for this machine (requires Bun)
```

Pushing a `v*` tag runs the release workflow. It builds `orcabot.js` and the executables for Linux, Windows and macOS, and attaches them to a GitHub release.

## License

MIT
