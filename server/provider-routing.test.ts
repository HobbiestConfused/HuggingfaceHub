import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

function createTestUser(overrides: Partial<User> = {}): User {
  return {
    id: 1,
    openId: "test-user-123",
    email: "test@example.com",
    name: "Test User",
    loginMethod: "manus",
    role: "user",
    ageVerified: false,
    dateOfBirth: null,
    avatarUrl: null,
    bio: null,
    createdAt: new Date("2025-01-01"),
    updatedAt: new Date("2025-01-01"),
    lastSignedIn: new Date("2025-01-01"),
    ...overrides,
  };
}

function createMockContext(user: User | null = null): TrpcContext {
  return {
    user,
    req: {
      protocol: "https",
      headers: {},
    } as TrpcContext["req"],
    res: {
      clearCookie: vi.fn(),
    } as unknown as TrpcContext["res"],
  };
}

vi.mock("./db", async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    verifyUserAge: vi.fn().mockResolvedValue(undefined),
    updateUserProfile: vi.fn().mockResolvedValue(undefined),
    getUserApiKeys: vi.fn().mockResolvedValue([]),
    upsertApiKey: vi.fn().mockResolvedValue(1),
    deleteApiKey: vi.fn().mockResolvedValue(undefined),
    getActiveApiKey: vi.fn().mockResolvedValue(undefined),
    createMedia: vi.fn().mockResolvedValue(1),
    getUserMedia: vi.fn().mockResolvedValue([]),
    getMediaById: vi.fn().mockResolvedValue(undefined),
    deleteMedia: vi.fn().mockResolvedValue(undefined),
    createGeneration: vi.fn().mockResolvedValue(1),
    updateGeneration: vi.fn().mockResolvedValue(undefined),
    getUserGenerations: vi.fn().mockResolvedValue([]),
    getGenerationById: vi.fn().mockResolvedValue(undefined),
    createGameSession: vi.fn().mockResolvedValue(1),
    updateGameSession: vi.fn().mockResolvedValue(undefined),
    getActiveGameSession: vi.fn().mockResolvedValue(null),
    getUserGameHistory: vi.fn().mockResolvedValue([]),
    getUserPreferences: vi.fn().mockResolvedValue(null),
    upsertUserPreferences: vi.fn().mockResolvedValue(undefined),
  };
});

describe("generation provider key routing", () => {
  it("returns ATLASCLOUD_API_KEY error when atlas video key is missing", async () => {
    const originalAtlas = process.env.ATLASCLOUD_API_KEY;
    delete process.env.ATLASCLOUD_API_KEY;

    const caller = appRouter.createCaller(createMockContext(createTestUser()));
    const result = await caller.generation.create({
      tool: "image_to_video",
      provider: "atlas",
      prompt: "test",
      inputParams: {
        images: ["https://example.com/image.png"],
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("ATLASCLOUD_API_KEY");

    if (originalAtlas) process.env.ATLASCLOUD_API_KEY = originalAtlas;
  });

  it("returns VENICE_API_KEY error when venice key is missing", async () => {
    const originalVenice = process.env.VENICE_API_KEY;
    delete process.env.VENICE_API_KEY;

    const caller = appRouter.createCaller(createMockContext(createTestUser()));
    const result = await caller.generation.create({
      tool: "text_to_image",
      provider: "venice",
      prompt: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("VENICE_API_KEY");

    if (originalVenice) process.env.VENICE_API_KEY = originalVenice;
  });

  it("fails early when atlas provider is used with non-supported tool", async () => {
    const caller = appRouter.createCaller(createMockContext(createTestUser()));
    const result = await caller.generation.create({
      tool: "text_to_video",
      provider: "atlas",
      prompt: "test",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("supports only image_to_video");
  });
});
