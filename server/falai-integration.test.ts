import { describe, expect, it, vi } from "vitest";
import { appRouter } from "./routers";
import type { TrpcContext } from "./_core/context";
import type { User } from "../drizzle/schema";

// ─── Test Helpers ──────────────────────────────────────────────────────────

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

// Mock DB functions
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

// ─── fal.ai API Key Validation ────────────────────────────────────────────

describe("fal.ai API key validation", () => {
  it("FAL_AI env var is set and has correct format", () => {
    const falKey = process.env.FAL_AI || process.env.FAL_KEY;
    expect(falKey).toBeDefined();
    expect(typeof falKey).toBe("string");
    // fal.ai keys are in UUID:hash format
    expect(falKey!.length).toBeGreaterThan(10);
    expect(falKey).toContain(":");
  });

  it("fal.ai env var fallback works for generation", async () => {
    // Ensure FAL_AI env is set
    const origFalAi = process.env.FAL_AI;
    process.env.FAL_AI = "test-uuid:test-hash";

    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    // This should NOT fail with "No API key" because FAL_AI env is set
    const result = await caller.generation.create({
      tool: "text_to_image",
      provider: "fal_ai",
      prompt: "A test image",
    });
    expect(result.success).toBe(true);
    expect(result.generationId).toBeDefined();

    // Restore
    if (origFalAi) process.env.FAL_AI = origFalAi;
    else delete process.env.FAL_AI;
  });

  it("generation fails without fal.ai key when env not set", async () => {
    const origFalAi = process.env.FAL_AI;
    const origFalKey = process.env.FAL_KEY;
    delete process.env.FAL_AI;
    delete process.env.FAL_KEY;

    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.generation.create({
      tool: "text_to_image",
      provider: "fal_ai",
      prompt: "A test image",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No API key");

    // Restore
    if (origFalAi) process.env.FAL_AI = origFalAi;
    if (origFalKey) process.env.FAL_KEY = origFalKey;
  });
});

// ─── Prompt Templates Tests ───────────────────────────────────────────────

describe("promptTemplates", () => {
  it("lists all prompt templates", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.promptTemplates.list();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
  });

  it("filters templates by category", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.promptTemplates.list({ category: "couples_portraits" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    result.forEach(t => {
      expect(t.category).toBe("couples_portraits");
    });
  });

  it("filters templates by tool", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.promptTemplates.list({ tool: "text_to_video" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    result.forEach(t => {
      expect(t.tools).toContain("text_to_video");
    });
  });

  it("returns empty for non-existent category", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.promptTemplates.list({ category: "nonexistent" });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("each template has required fields", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.promptTemplates.list();
    result.forEach(t => {
      expect(t.id).toBeDefined();
      expect(t.name).toBeDefined();
      expect(t.prompt).toBeDefined();
      expect(t.category).toBeDefined();
      expect(Array.isArray(t.tools)).toBe(true);
      expect(t.tools.length).toBeGreaterThan(0);
    });
  });
});

// ─── Game Partner Names Tests ─────────────────────────────────────────────

describe("game with partner names", () => {
  it("accepts partner names in generatePrompt input", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    // This should not throw — partner names are optional
    // (The actual LLM call will fail in test, but input validation should pass)
    try {
      await caller.game.generatePrompt({
        category: "romance",
        spiceLevel: "medium",
        partnerNames: {
          partner1: "Justin",
          partner2: "Simone",
        },
      });
    } catch (e: any) {
      // LLM mock not set up — that's fine, we're testing input validation
      // If it throws, it should NOT be a Zod validation error
      expect(e.code).not.toBe("BAD_REQUEST");
    }
  });

  it("works without partner names (backward compatible)", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    try {
      await caller.game.generatePrompt({
        category: "romance",
        spiceLevel: "medium",
      });
    } catch (e: any) {
      // LLM mock not set up — that's fine
      expect(e.code).not.toBe("BAD_REQUEST");
    }
  });
});

// ─── Preferences with Partner Names Tests ─────────────────────────────────

describe("preferences with partner names", () => {
  it("accepts partner names in preferences update", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.preferences.update({
      partnerNames: {
        partner1: "Justin",
        partner2: "Simone",
      },
    });
    expect(result.success).toBe(true);
  });

  it("accepts combined preferences with partner names", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.preferences.update({
      defaultProvider: "fal_ai",
      defaultSpiceLevel: "hot",
      partnerNames: {
        partner1: "Justin",
        partner2: "Simone",
      },
    });
    expect(result.success).toBe(true);
  });
});

// ─── fal.ai Model Mapping Tests ──────────────────────────────────────────

describe("fal.ai model mapping", () => {
  it("accepts all 7 tool types with fal_ai provider", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    // Set env var for fal.ai
    const origFalAi = process.env.FAL_AI;
    process.env.FAL_AI = "test-uuid:test-hash";

    const tools = [
      "text_to_image",
      "text_to_video",
      "image_to_video",
      "video_extension",
      "face_swap",
      "virtual_try_on",
      "image_upscale",
    ] as const;

    for (const tool of tools) {
      const result = await caller.generation.create({
        tool,
        provider: "fal_ai",
        prompt: "Test prompt",
      });
      expect(result.success).toBe(true);
      expect(result.generationId).toBeDefined();
    }

    // Restore
    if (origFalAi) process.env.FAL_AI = origFalAi;
    else delete process.env.FAL_AI;
  });
});
