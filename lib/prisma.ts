import { PrismaNeon } from "@prisma/adapter-neon";
import { PrismaClient } from "../app/generated/prisma/client";

function requireDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    throw new Error("Missing required environment variable: DATABASE_URL");
  }
  return value;
}

const adapter = new PrismaNeon({
  connectionString: requireDatabaseUrl(),
});

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
