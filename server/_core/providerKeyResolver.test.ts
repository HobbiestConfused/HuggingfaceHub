import { describe, expect, it } from "vitest";
import {
  getProviderKeyEnvVar,
  resolveProviderApiKey,
  supportsProviderModality,
} from "./providerKeyResolver";

describe("providerKeyResolver", () => {
  it("maps required env vars for requested provider/modality paths", () => {
    expect(getProviderKeyEnvVar("openrouter", "chat")).toBe("OPENROUTER_API_KEY");
    expect(getProviderKeyEnvVar("venice", "chat")).toBe("VENICE_API_KEY");
    expect(getProviderKeyEnvVar("venice", "image")).toBe("VENICE_API_KEY");
    expect(getProviderKeyEnvVar("venice", "video")).toBe("VENICE_API_KEY");
    expect(getProviderKeyEnvVar("atlas", "video")).toBe("ATLASCLOUD_API_KEY");
  });

  it("rejects unsupported provider/modality pairs", () => {
    expect(supportsProviderModality("atlas", "image")).toBe(false);
    expect(() =>
      resolveProviderApiKey({
        provider: "atlas",
        modality: "image",
        env: {},
      }),
    ).toThrow('Provider "atlas" does not support image generation.');
  });

  it("fails with actionable missing key error naming required env var", () => {
    expect(() =>
      resolveProviderApiKey({
        provider: "atlas",
        modality: "video",
        env: {},
      }),
    ).toThrow("ATLASCLOUD_API_KEY");
  });

  it("accepts legacy fallback env keys for backward compatibility", () => {
    expect(
      resolveProviderApiKey({
        provider: "openrouter",
        modality: "chat",
        env: {
          BUILT_IN_FORGE_API_KEY: "legacy-forge-key",
        } as NodeJS.ProcessEnv,
      }),
    ).toBe("legacy-forge-key");
  });
});
