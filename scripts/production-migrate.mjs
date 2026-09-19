import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping production database migration outside Vercel production.");
  process.exit(0);
}

console.log("Applying production Prisma migrations before build.");

const command = process.platform === "win32" ? "npx.cmd" : "npx";
const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [0, 5000, 15000];

for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
  const delay = BACKOFF_MS[attempt - 1] ?? 0;
  if (delay > 0) {
    console.warn(`Retrying production migration in ${Math.round(delay / 1000)}s (attempt ${attempt}/${MAX_ATTEMPTS}).`);
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  const result = spawnSync(command, ["prisma", "migrate", "deploy"], {
    stdio: "inherit",
    env: process.env,
  });

  if (!result.error && result.status === 0) {
    if (attempt > 1) console.log(`Production migration succeeded on attempt ${attempt}.`);
    process.exit(0);
  }

  if (result.error) {
    console.error(result.error);
  }

  if (attempt < MAX_ATTEMPTS) {
    console.warn(`Production migration attempt ${attempt}/${MAX_ATTEMPTS} failed. The build will retry without changing migration semantics.`);
    continue;
  }

  console.error(`Production migration failed after ${MAX_ATTEMPTS} attempts.`);
  process.exit(result.status ?? 1);
}
