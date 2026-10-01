import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "node --experimental-strip-types prisma/seed.mjs",
  },
  datasource: {
    // Generation and installation do not need a live database. Migration
    // commands still fail closed when neither real connection is configured.
    url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "postgresql://wizard:unused@127.0.0.1:5432/wizard",
  },
});
