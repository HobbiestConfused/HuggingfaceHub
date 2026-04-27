import { describe, expect, it, vi, beforeEach } from "vitest";
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

// ─── Auth Tests ────────────────────────────────────────────────────────────

describe("auth.me", () => {
  it("returns null when not authenticated", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeNull();
  });

  it("returns user when authenticated", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.me();
    expect(result).toBeDefined();
    expect(result?.openId).toBe("test-user-123");
    expect(result?.name).toBe("Test User");
    expect(result?.email).toBe("test@example.com");
  });
});

describe("auth.logout", () => {
  it("clears cookie and returns success", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);
    const result = await caller.auth.logout();
    expect(result).toEqual({ success: true });
  });
});

// ─── Age Verification Tests ────────────────────────────────────────────────

describe("user.verifyAge", () => {
  // Mock the db function
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

  it("rejects users under 18", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    // Set DOB to 10 years ago (under 18)
    const tenYearsAgo = new Date();
    tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
    const dob = tenYearsAgo.toISOString().split("T")[0];

    const result = await caller.user.verifyAge({ dateOfBirth: dob });
    expect(result.success).toBe(false);
    expect(result.message).toContain("18 or older");
  });

  it("accepts users 18 or older", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    // Set DOB to 25 years ago (over 18)
    const twentyFiveYearsAgo = new Date();
    twentyFiveYearsAgo.setFullYear(twentyFiveYearsAgo.getFullYear() - 25);
    const dob = twentyFiveYearsAgo.toISOString().split("T")[0];

    const result = await caller.user.verifyAge({ dateOfBirth: dob });
    expect(result.success).toBe(true);
    expect(result.message).toContain("verified");
  });

  it("rejects exactly 17 year olds", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const seventeenYearsAgo = new Date();
    seventeenYearsAgo.setFullYear(seventeenYearsAgo.getFullYear() - 17);
    const dob = seventeenYearsAgo.toISOString().split("T")[0];

    const result = await caller.user.verifyAge({ dateOfBirth: dob });
    expect(result.success).toBe(false);
  });

  it("accepts exactly 18 year olds", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const eighteenYearsAgo = new Date();
    eighteenYearsAgo.setFullYear(eighteenYearsAgo.getFullYear() - 18);
    // Use a date earlier in the year to ensure they've turned 18
    eighteenYearsAgo.setMonth(0);
    eighteenYearsAgo.setDate(1);
    const dob = eighteenYearsAgo.toISOString().split("T")[0];

    const result = await caller.user.verifyAge({ dateOfBirth: dob });
    expect(result.success).toBe(true);
  });

  it("requires authentication", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.user.verifyAge({ dateOfBirth: "1990-01-01" })
    ).rejects.toThrow();
  });
});

// ─── User Profile Tests ────────────────────────────────────────────────────

describe("user.updateProfile", () => {
  it("updates profile successfully", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.user.updateProfile({
      name: "New Name",
      bio: "New bio text",
    });
    expect(result.success).toBe(true);
  });

  it("requires authentication", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.user.updateProfile({ name: "Test" })
    ).rejects.toThrow();
  });
});

// ─── API Keys Tests ────────────────────────────────────────────────────────

describe("apiKeys", () => {
  it("lists API keys (empty)", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("upserts an API key", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.upsert({
      provider: "replicate",
      apiKey: "r8_test_key_12345",
    });
    expect(result.success).toBe(true);
  });

  it("deletes an API key", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.apiKeys.delete({ provider: "replicate" });
    expect(result.success).toBe(true);
  });

  it("validates provider enum", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.apiKeys.upsert({
        provider: "invalid_provider" as any,
        apiKey: "test",
      })
    ).rejects.toThrow();
  });

  it("requires non-empty API key", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.apiKeys.upsert({
        provider: "replicate",
        apiKey: "",
      })
    ).rejects.toThrow();
  });

  it("requires authentication for list", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.apiKeys.list()).rejects.toThrow();
  });
});

// ─── Media Gallery Tests ───────────────────────────────────────────────────

describe("media", () => {
  it("lists media (empty)", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.media.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("lists media with filters", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.media.list({
      type: "image",
      source: "generated",
      limit: 10,
      offset: 0,
    });
    expect(Array.isArray(result)).toBe(true);
  });

  it("deletes media", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.media.delete({ id: 1 });
    expect(result.success).toBe(true);
  });

  it("requires authentication", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.media.list()).rejects.toThrow();
  });
});

// ─── Generation Tests ──────────────────────────────────────────────────────

describe("generation", () => {
  it("rejects generation without API key when no env fallback", async () => {
    // Temporarily clear any env vars that could act as fallback
    const origReplicate = process.env.REPLICATE_API_TOKEN;
    const origReplicate2 = process.env.REPLICATE;
    delete process.env.REPLICATE_API_TOKEN;
    delete process.env.REPLICATE;

    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.generation.create({
      tool: "text_to_image",
      provider: "replicate",
      prompt: "A beautiful sunset",
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain("No API key");

    // Restore env vars
    if (origReplicate) process.env.REPLICATE_API_TOKEN = origReplicate;
    if (origReplicate2) process.env.REPLICATE = origReplicate2;
  });

  it("lists generations (empty)", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.generation.list();
    expect(Array.isArray(result)).toBe(true);
  });

  it("validates tool enum", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.generation.create({
        tool: "invalid_tool" as any,
        provider: "replicate",
        prompt: "test",
      })
    ).rejects.toThrow();
  });

  it("validates provider enum", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.generation.create({
        tool: "text_to_image",
        provider: "invalid" as any,
        prompt: "test",
      })
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.generation.create({
        tool: "text_to_image",
        provider: "replicate",
        prompt: "test",
      })
    ).rejects.toThrow();
  });
});

// ─── Couples Game Tests ────────────────────────────────────────────────────

describe("game", () => {
  it("gets active session (null when none)", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.game.activeSession();
    expect(result).toBeNull();
  });

  it("gets game history (empty)", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.game.history();
    expect(Array.isArray(result)).toBe(true);
  });

  it("ends session successfully", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.game.endSession();
    expect(result.success).toBe(true);
  });

  it("validates category enum", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.game.generatePrompt({
        category: "invalid" as any,
        spiceLevel: "medium",
      })
    ).rejects.toThrow();
  });

  it("validates spice level enum", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.game.generatePrompt({
        category: "romance",
        spiceLevel: "nuclear" as any,
      })
    ).rejects.toThrow();
  });

  it("requires authentication for generatePrompt", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(
      caller.game.generatePrompt({
        category: "romance",
        spiceLevel: "medium",
      })
    ).rejects.toThrow();
  });

  it("requires authentication for activeSession", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.game.activeSession()).rejects.toThrow();
  });
});

// ─── Preferences Tests ─────────────────────────────────────────────────────

describe("preferences", () => {
  it("gets preferences (null when none)", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.preferences.get();
    expect(result).toBeNull();
  });

  it("updates preferences", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    const result = await caller.preferences.update({
      defaultProvider: "fal_ai",
      defaultSpiceLevel: "hot",
    });
    expect(result.success).toBe(true);
  });

  it("validates provider enum in preferences", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.preferences.update({
        defaultProvider: "invalid" as any,
      })
    ).rejects.toThrow();
  });

  it("validates spice level enum in preferences", async () => {
    const user = createTestUser();
    const ctx = createMockContext(user);
    const caller = appRouter.createCaller(ctx);

    await expect(
      caller.preferences.update({
        defaultSpiceLevel: "nuclear" as any,
      })
    ).rejects.toThrow();
  });

  it("requires authentication", async () => {
    const ctx = createMockContext(null);
    const caller = appRouter.createCaller(ctx);
    await expect(caller.preferences.get()).rejects.toThrow();
  });
});
