export type ProviderModality = "chat" | "image" | "video";

export type ProviderName =
  | "openrouter"
  | "venice"
  | "atlas"
  | "huggingface"
  | "fal_ai";

type ProviderKeyConfig = {
  envVar: string;
  fallbackEnvVars?: string[];
};

const PROVIDER_KEY_CONFIG: Record<
  ProviderName,
  Partial<Record<ProviderModality, ProviderKeyConfig>>
> = {
  openrouter: {
    chat: {
      envVar: "OPENROUTER_API_KEY",
      fallbackEnvVars: ["BUILT_IN_FORGE_API_KEY", "OPENAI_API_KEY"],
    },
  },
  venice: {
    chat: { envVar: "VENICE_API_KEY" },
    image: { envVar: "VENICE_API_KEY" },
    video: { envVar: "VENICE_API_KEY" },
  },
  atlas: {
    video: { envVar: "ATLASCLOUD_API_KEY" },
  },
  huggingface: {
    image: { envVar: "HUGGINGFACE_API_KEY" },
  },
  fal_ai: {
    image: {
      envVar: "FAL_KEY",
      fallbackEnvVars: ["FAL_AI"],
    },
    video: {
      envVar: "FAL_KEY",
      fallbackEnvVars: ["FAL_AI"],
    },
  },
};

type ResolveProviderApiKeyInput = {
  provider: ProviderName;
  modality: ProviderModality;
  userApiKey?: string | null;
  env?: NodeJS.ProcessEnv;
};

const readEnvValue = (env: NodeJS.ProcessEnv, envName: string): string | null => {
  const value = env[envName];
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
};

export const getProviderKeyEnvVar = (
  provider: ProviderName,
  modality: ProviderModality,
): string | null => {
  return PROVIDER_KEY_CONFIG[provider]?.[modality]?.envVar ?? null;
};

export const supportsProviderModality = (
  provider: ProviderName,
  modality: ProviderModality,
): boolean => {
  return Boolean(PROVIDER_KEY_CONFIG[provider]?.[modality]);
};

export const resolveProviderApiKey = ({
  provider,
  modality,
  userApiKey,
  env = process.env,
}: ResolveProviderApiKeyInput): string => {
  const normalizedUserKey = userApiKey?.trim();
  if (normalizedUserKey) {
    return normalizedUserKey;
  }

  const providerConfig = PROVIDER_KEY_CONFIG[provider]?.[modality];
  if (!providerConfig) {
    throw new Error(`Provider "${provider}" does not support ${modality} generation.`);
  }

  const directEnvValue = readEnvValue(env, providerConfig.envVar);
  if (directEnvValue) {
    return directEnvValue;
  }

  for (const fallbackEnvVar of providerConfig.fallbackEnvVars ?? []) {
    const fallbackValue = readEnvValue(env, fallbackEnvVar);
    if (fallbackValue) {
      return fallbackValue;
    }
  }

  throw new Error(
    `Missing API key for ${provider}/${modality}. Set ${providerConfig.envVar} or add a provider key in Settings > API Keys.`,
  );
};
