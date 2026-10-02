import { Prisma } from "../app/generated/prisma/client";
import { prisma } from "./prisma";

export const MAX_GROTTO_IMAGES = 300;

export async function activeGrottoImageCount() {
  return prisma.grottoImage.count({ where: { deletedAt: null } });
}

export async function grottoCapacity() {
  const count = await activeGrottoImageCount();
  return {
    count,
    limit: MAX_GROTTO_IMAGES,
    remaining: Math.max(0, MAX_GROTTO_IMAGES - count),
    full: count >= MAX_GROTTO_IMAGES,
  };
}

export async function assertGrottoCapacity(required = 1) {
  const count = await activeGrottoImageCount();
  if (count + required > MAX_GROTTO_IMAGES) {
    throw new Error(`The Grotto is limited to ${MAX_GROTTO_IMAGES} images. Delete images before creating or uploading more.`);
  }
  return { count, remaining: MAX_GROTTO_IMAGES - count };
}

export async function createGrottoImageWithinLimit<T>(
  data: Prisma.GrottoImageCreateInput,
  select: T,
) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(907300)`);
    const count = await tx.grottoImage.count({ where: { deletedAt: null } });
    if (count >= MAX_GROTTO_IMAGES) {
      throw new Error(`The Grotto is limited to ${MAX_GROTTO_IMAGES} images. Delete images before creating or uploading more.`);
    }
    return tx.grottoImage.create({ data, select: select as never });
  }, { maxWait: 10_000, timeout: 20_000 });
}
