import { createBot } from "./bot.ts";
import { loadConfig } from "./config.ts";

// Load ./.env if present. Variables already set in the environment take precedence.
try {
  process.loadEnvFile?.();
} catch {
  // No .env file; rely on the environment.
}

let config;
try {
  config = loadConfig(process.env);
} catch (err) {
  console.error(`Config error: ${(err as Error).message}. See .env.example.`);
  process.exit(1);
}

const client = createBot(config);

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    console.log(`Received ${signal}, shutting down`);
    void client.destroy().finally(() => process.exit(0));
  });
}

await client.login(config.token);
