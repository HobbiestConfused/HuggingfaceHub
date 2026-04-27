import { int, mysqlEnum, mysqlTable, text, timestamp, varchar, boolean, json } from "drizzle-orm/mysql-core";

// ─── Users ───────────────────────────────────────────────────────────────────
export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  ageVerified: boolean("ageVerified").default(false).notNull(),
  dateOfBirth: varchar("dateOfBirth", { length: 10 }), // YYYY-MM-DD
  avatarUrl: text("avatarUrl"),
  bio: text("bio"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

// ─── API Keys (pluggable per-user) ──────────────────────────────────────────
export const apiKeys = mysqlTable("api_keys", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  provider: mysqlEnum("provider", ["replicate", "fal_ai", "stability_ai"]).notNull(),
  apiKey: text("apiKey").notNull(), // encrypted in practice
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type ApiKey = typeof apiKeys.$inferSelect;
export type InsertApiKey = typeof apiKeys.$inferInsert;

// ─── Media (uploads + generated) ────────────────────────────────────────────
export const media = mysqlTable("media", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  type: mysqlEnum("type", ["image", "video"]).notNull(),
  source: mysqlEnum("source", ["upload", "generated"]).notNull(),
  url: text("url").notNull(),
  fileKey: text("fileKey").notNull(),
  filename: text("filename"),
  mimeType: varchar("mimeType", { length: 128 }),
  fileSize: int("fileSize"), // bytes
  width: int("width"),
  height: int("height"),
  thumbnailUrl: text("thumbnailUrl"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type Media = typeof media.$inferSelect;
export type InsertMedia = typeof media.$inferInsert;

// ─── AI Generations (job tracking) ──────────────────────────────────────────
export const generations = mysqlTable("generations", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  tool: mysqlEnum("tool", [
    "text_to_image",
    "text_to_video",
    "image_to_video",
    "video_extension",
    "face_swap",
    "virtual_try_on",
    "image_upscale",
  ]).notNull(),
  provider: mysqlEnum("gen_provider", ["replicate", "fal_ai", "stability_ai"]).notNull(),
  status: mysqlEnum("status", ["pending", "processing", "completed", "failed"]).default("pending").notNull(),
  prompt: text("prompt"),
  inputParams: json("inputParams"), // tool-specific params
  inputMediaId: int("inputMediaId"), // reference to uploaded input
  outputMediaId: int("outputMediaId"), // reference to generated output
  externalJobId: varchar("externalJobId", { length: 255 }), // provider job ID
  errorMessage: text("errorMessage"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  completedAt: timestamp("completedAt"),
});

export type Generation = typeof generations.$inferSelect;
export type InsertGeneration = typeof generations.$inferInsert;

// ─── Couples Game Sessions ──────────────────────────────────────────────────
export const gameSessions = mysqlTable("game_sessions", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  category: mysqlEnum("category", [
    "romance",
    "adventurous",
    "kinky",
    "roleplay",
    "fantasy",
    "quickie",
  ]).notNull(),
  spiceLevel: mysqlEnum("spiceLevel", ["mild", "medium", "hot", "extreme"]).default("medium").notNull(),
  currentPrompt: text("currentPrompt"),
  promptHistory: json("promptHistory"), // array of past prompts
  isActive: boolean("isActive").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type GameSession = typeof gameSessions.$inferSelect;
export type InsertGameSession = typeof gameSessions.$inferInsert;

// ─── User Preferences ───────────────────────────────────────────────────────
export const userPreferences = mysqlTable("user_preferences", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("userId").notNull(),
  defaultProvider: mysqlEnum("defaultProvider", ["replicate", "fal_ai", "stability_ai"]).default("replicate").notNull(),
  defaultSpiceLevel: mysqlEnum("defaultSpiceLevel", ["mild", "medium", "hot", "extreme"]).default("medium").notNull(),
  defaultCategories: json("defaultCategories"), // array of preferred categories
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export type UserPreference = typeof userPreferences.$inferSelect;
export type InsertUserPreference = typeof userPreferences.$inferInsert;
