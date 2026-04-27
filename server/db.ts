import { eq, and, desc } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import {
  InsertUser, users,
  apiKeys, InsertApiKey,
  media, InsertMedia,
  generations, InsertGeneration,
  gameSessions, InsertGameSession,
  userPreferences, InsertUserPreference,
} from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

// ─── Users ───────────────────────────────────────────────────────────────────

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) throw new Error("User openId is required for upsert");
  const db = await getDb();
  if (!db) { console.warn("[Database] Cannot upsert user: database not available"); return; }

  try {
    const values: InsertUser = { openId: user.openId };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];
    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };
    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) { values.lastSignedIn = user.lastSignedIn; updateSet.lastSignedIn = user.lastSignedIn; }
    if (user.role !== undefined) { values.role = user.role; updateSet.role = user.role; }
    else if (user.openId === ENV.ownerOpenId) { values.role = 'admin'; updateSet.role = 'admin'; }
    if (!values.lastSignedIn) values.lastSignedIn = new Date();
    if (Object.keys(updateSet).length === 0) updateSet.lastSignedIn = new Date();

    await db.insert(users).values(values).onDuplicateKeyUpdate({ set: updateSet });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function updateUserProfile(userId: number, data: { name?: string; bio?: string; avatarUrl?: string; ageVerified?: boolean; dateOfBirth?: string }) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set(data).where(eq(users.id, userId));
}

export async function verifyUserAge(userId: number, dateOfBirth: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(users).set({ ageVerified: true, dateOfBirth }).where(eq(users.id, userId));
}

// ─── API Keys ────────────────────────────────────────────────────────────────

export async function getUserApiKeys(userId: number) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(apiKeys).where(eq(apiKeys.userId, userId));
}

export async function upsertApiKey(data: InsertApiKey) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.userId, data.userId), eq(apiKeys.provider, data.provider)))
    .limit(1);
  if (existing.length > 0) {
    await db.update(apiKeys).set({ apiKey: data.apiKey, isActive: true }).where(eq(apiKeys.id, existing[0].id));
    return existing[0].id;
  } else {
    const result = await db.insert(apiKeys).values(data);
    return result[0].insertId;
  }
}

export async function deleteApiKey(userId: number, provider: string) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(apiKeys).where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider as any)));
}

export async function getActiveApiKey(userId: number, provider: string) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(apiKeys)
    .where(and(eq(apiKeys.userId, userId), eq(apiKeys.provider, provider as any), eq(apiKeys.isActive, true)))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Media ───────────────────────────────────────────────────────────────────

export async function createMedia(data: InsertMedia) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(media).values(data);
  return result[0].insertId;
}

export async function getUserMedia(userId: number, type?: "image" | "video", source?: "upload" | "generated", limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  let conditions = [eq(media.userId, userId)];
  if (type) conditions.push(eq(media.type, type));
  if (source) conditions.push(eq(media.source, source));
  return db.select().from(media).where(and(...conditions)).orderBy(desc(media.createdAt)).limit(limit).offset(offset);
}

export async function getMediaById(id: number, userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(media).where(and(eq(media.id, id), eq(media.userId, userId))).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function deleteMedia(id: number, userId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.delete(media).where(and(eq(media.id, id), eq(media.userId, userId)));
}

// ─── Generations ─────────────────────────────────────────────────────────────

export async function createGeneration(data: InsertGeneration) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(generations).values(data);
  return result[0].insertId;
}

export async function updateGeneration(id: number, data: Partial<InsertGeneration>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(generations).set(data).where(eq(generations.id, id));
}

export async function getUserGenerations(userId: number, tool?: string, limit = 50, offset = 0) {
  const db = await getDb();
  if (!db) return [];
  let conditions = [eq(generations.userId, userId)];
  if (tool) conditions.push(eq(generations.tool, tool as any));
  return db.select().from(generations).where(and(...conditions)).orderBy(desc(generations.createdAt)).limit(limit).offset(offset);
}

export async function getGenerationById(id: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(generations).where(eq(generations.id, id)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

// ─── Game Sessions ───────────────────────────────────────────────────────────

export async function createGameSession(data: InsertGameSession) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const result = await db.insert(gameSessions).values(data);
  return result[0].insertId;
}

export async function updateGameSession(id: number, data: Partial<InsertGameSession>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  await db.update(gameSessions).set(data).where(eq(gameSessions.id, id));
}

export async function getActiveGameSession(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(gameSessions)
    .where(and(eq(gameSessions.userId, userId), eq(gameSessions.isActive, true)))
    .orderBy(desc(gameSessions.updatedAt))
    .limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function getUserGameHistory(userId: number, limit = 20) {
  const db = await getDb();
  if (!db) return [];
  return db.select().from(gameSessions).where(eq(gameSessions.userId, userId)).orderBy(desc(gameSessions.createdAt)).limit(limit);
}

// ─── User Preferences ───────────────────────────────────────────────────────

export async function getUserPreferences(userId: number) {
  const db = await getDb();
  if (!db) return undefined;
  const result = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  return result.length > 0 ? result[0] : undefined;
}

export async function upsertUserPreferences(userId: number, data: Partial<InsertUserPreference>) {
  const db = await getDb();
  if (!db) throw new Error("Database not available");
  const existing = await db.select().from(userPreferences).where(eq(userPreferences.userId, userId)).limit(1);
  if (existing.length > 0) {
    await db.update(userPreferences).set(data).where(eq(userPreferences.id, existing[0].id));
  } else {
    await db.insert(userPreferences).values({ userId, ...data } as InsertUserPreference);
  }
}
