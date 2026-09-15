import { spawnSync } from "node:child_process";

if (process.env.VERCEL_ENV !== "production") {
  console.log("Skipping production database migration outside Vercel production.");
  process.exit(0);
}

console.log("Applying production Prisma migrations before build.");
const command = process.platform === "win32" ? "npx.cmd" : "npx";
const result = spawnSync(command, ["prisma", "migrate", "deploy"], {
  stdio: "inherit",
  env: process.env,
});

if (result.error) {
  console.error(result.error);
  process.exit(1);
}

process.exit(result.status ?? 1);
