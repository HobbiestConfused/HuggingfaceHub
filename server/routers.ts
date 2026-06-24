import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
  updateUserProfile, verifyUserAge,
  getUserApiKeys, upsertApiKey, deleteApiKey, getActiveApiKey,
  createMedia, getUserMedia, getMediaById, deleteMedia,
  createGeneration, updateGeneration, getUserGenerations, getGenerationById,
  createGameSession, updateGameSession, getActiveGameSession, getUserGameHistory,
  getUserPreferences, upsertUserPreferences,
} from "./db";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

// Updated providers: Venice (primary), Hugging Face (special), FAL (fallback)
const providerSchema = z.enum(["venice", "huggingface", "fal_ai"]);

const mediaTypeSchema = z.enum(["image", "video"]);
const generationToolSchema = z.enum([
  "text_to_image",
  "text_to_video",
  "image_to_video",
  "video_extension",
  "face_swap",
  "virtual_try_on",
  "image_upscale",
]);

const generationInputSchema = z.object({
  tool: generationToolSchema,
  provider: providerSchema,
  prompt: z.string().max(5000).optional(),
  inputParams: z.record(z.string(), z.any()).optional(),
  inputMediaId: z.number().int().positive().optional(),
});

type GenerationInput = z.infer<typeof generationInputSchema>;
type ProviderResult = { url: string; type: "image" | "video" };

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query((opts) => opts.ctx.user),
    logout: publicProcedure.mutation(({ ctx }) => {
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return { success: true } as const;
    }),
  }),

  // ─── User Profile & Age Verification ─────────────────────────────────────
  user: router({
    verifyAge: protectedProcedure
      .input(z.object({ dateOfBirth: z.string() }))
      .mutation(async ({ ctx, input }) => {
        const dob = new Date(input.dateOfBirth);
        if (Number.isNaN(dob.getTime())) {
          return { success: false, message: "Please enter a valid date of birth." };
        }

        const today = new Date();
        let age = today.getFullYear() - dob.getFullYear();
        const monthDiff = today.getMonth() - dob.getMonth();
        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
          age--;
        }

        if (age < 18) {
          return { success: false, message: "You must be 18 or older to access this platform." };
        }

        await verifyUserAge(ctx.user.id, input.dateOfBirth);
        return { success: true, message: "Age verified successfully." };
      }),

    updateProfile: protectedProcedure
      .input(z.object({
        name: z.string().max(120).optional(),
        bio: z.string().max(1000).optional(),
        avatarUrl: z.string().url().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await updateUserProfile(ctx.user.id, input);
        return { success: true };
      }),
  }),

  // ─── API Keys Management ─────────────────────────────────────────────────
  apiKeys: router({
    list: protectedProcedure.query(async ({ ctx }) => {
      const keys = await getUserApiKeys(ctx.user.id);
      return keys.map((k) => ({
        id: k.id,
        provider: k.provider,
        isActive: k.isActive,
        maskedKey: k.apiKey ? `${k.apiKey.slice(0, 6)}...${k.apiKey.slice(-4)}` : "",
        createdAt: k.createdAt,
      }));
    }),

    upsert: protectedProcedure
      .input(z.object({
        provider: providerSchema,
        apiKey: z.string().min(1).max(500),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertApiKey({ userId: ctx.user.id, provider: input.provider, apiKey: input.apiKey });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ provider: providerSchema }))
      .mutation(async ({ ctx, input }) => {
        await deleteApiKey(ctx.user.id, input.provider);
        return { success: true };
      }),
  }),

  // ─── Media Gallery ────────────────────────────────────────────────────────
  media: router({
    list: protectedProcedure
      .input(z.object({
        type: mediaTypeSchema.optional(),
        source: z.enum(["upload", "generated"]).optional(),
        limit: z.number().int().min(1).max(100).default(50),
        offset: z.number().int().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        return getUserMedia(ctx.user.id, input?.type, input?.source, input?.limit ?? 50, input?.offset ?? 0);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ ctx, input }) => {
        return getMediaById(input.id, ctx.user.id);
      }),

    upload: protectedProcedure
      .input(z.object({
        filename: z.string().min(1).max(255),
        mimeType: z.string().min(1).max(120),
        base64Data: z.string().min(1),
        type: mediaTypeSchema,
      }))
      .mutation(async ({ ctx, input }) => {
        const estimatedBytes = Math.floor((input.base64Data.length * 3) / 4);
        if (estimatedBytes > MAX_UPLOAD_BYTES) {
          return { success: false, error: "File is too large. Maximum upload size is 25MB." };
        }

        const buffer = Buffer.from(input.base64Data, "base64");
        if (buffer.length > MAX_UPLOAD_BYTES) {
          return { success: false, error: "File is too large. Maximum upload size is 25MB." };
        }

        const safeFilename = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
        const fileKey = `user-${ctx.user.id}/uploads/${Date.now()}-${safeFilename}`;
        const { key, url } = await storagePut(fileKey, buffer, input.mimeType);

        const mediaId = await createMedia({
          userId: ctx.user.id,
          type: input.type,
          source: "upload",
          url,
          fileKey: key,
          filename: safeFilename,
          mimeType: input.mimeType,
          fileSize: buffer.length,
        });

        return { success: true, id: mediaId, url, fileKey: key };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .mutation(async ({ ctx, input }) => {
        await deleteMedia(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── AI Generation ────────────────────────────────────────────────────────
  generation: router({
    create: protectedProcedure
      .input(generationInputSchema)
      .mutation(async ({ ctx, input }) => {
        const userApiKey = await getActiveApiKey(ctx.user.id, input.provider);
        const envFallbackKeys: Record<string, string | undefined> = {
          venice: process.env.VENICE_API_KEY,
          huggingface: process.env.HUGGINGFACE_API_KEY,
          fal_ai: process.env.FAL_KEY,
        };

        const resolvedKey = userApiKey?.apiKey || envFallbackKeys[input.provider];
        if (!resolvedKey) {
          return {
            success: false,
            error: `No API key configured for ${input.provider}. Please add one in Settings > API Keys.`,
          };
        }

        const genId = await createGeneration({
          userId: ctx.user.id,
          tool: input.tool,
          provider: input.provider,
          prompt: input.prompt,
          inputParams: input.inputParams,
          inputMediaId: input.inputMediaId,
          status: "pending",
        });

        processGeneration(genId, ctx.user.id, input, resolvedKey).catch((err) => {
          console.error(`[Generation] Job ${genId} failed:`, err);
        });

        return { success: true, generationId: genId };
      }),

    list: protectedProcedure
      .input(z.object({
        tool: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20),
        offset: z.number().int().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        return getUserGenerations(ctx.user.id, input?.tool, input?.limit ?? 20, input?.offset ?? 0);
      }),

    status: protectedProcedure
      .input(z.object({ id: z.number().int().positive() }))
      .query(async ({ input }) => {
        return getGenerationById(input.id);
      }),
  }),

  // ─── Couples Game ─────────────────────────────────────────────────────────
  game: router({
    generatePrompt: protectedProcedure
      .input(z.object({
        category: z.enum(["romance", "adventurous", "kinky", "roleplay", "fantasy", "quickie"]),
        spiceLevel: z.enum(["mild", "medium", "hot", "extreme"]),
        customContext: z.string().max(1000).optional(),
        partnerNames: z.object({
          partner1: z.string().min(1).max(80),
          partner2: z.string().min(1).max(80),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const spiceDescriptions: Record<typeof input.spiceLevel, string> = {
          mild: "Playful, flirty, and teasing. Suggestive but not explicit.",
          medium: "Sensual and seductive. Physical and intimate with graphic detail.",
          hot: "Passionate and adult-oriented. Foreplay, explicit descriptions.",
          extreme: "Intense, boundary-pushing. Group, public, fetish scenarios.",
        };

        const categoryDescriptions: Record<typeof input.category, string> = {
          romance: "Romantic and emotionally intimate scenarios.",
          adventurous: "Exciting, spontaneous scenarios in unexpected places.",
          kinky: "Power dynamics and fetish-friendly scenarios.",
          roleplay: "Character-based adult scenarios.",
          fantasy: "Supernatural, sci-fi, or dream-like adult scenarios.",
          quickie: "Fast, urgent scenarios between consenting adults.",
        };

        const nameInstruction = input.partnerNames?.partner1 && input.partnerNames?.partner2
          ? `Use the names "${input.partnerNames.partner1}" and "${input.partnerNames.partner2}" directly.`
          : "Address the couple directly using 'you' and 'your partner'.";

        const systemPrompt = `You are an adults-only couples game master. Generate one dare, scenario, or prompt for consenting adults.
Category: ${categoryDescriptions[input.category]}
Spice level: ${spiceDescriptions[input.spiceLevel]}
${nameInstruction}
${input.customContext ? `Additional context: ${input.customContext}` : ""}
Keep it to 2-4 sentences. Make it actionable right now.`;

        try {
          const response = await invokeLLM({
            messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: `Generate a ${input.spiceLevel} ${input.category} dare/prompt for a couple.` },
            ],
          });

          const promptText = typeof response.choices[0]?.message?.content === "string"
            ? response.choices[0].message.content
            : "";

          const existingSession = await getActiveGameSession(ctx.user.id);
          if (existingSession) {
            const history = (existingSession.promptHistory as string[]) || [];
            if (existingSession.currentPrompt) history.push(existingSession.currentPrompt);
            await updateGameSession(existingSession.id, {
              currentPrompt: promptText,
              promptHistory: history,
              category: input.category,
              spiceLevel: input.spiceLevel,
            });
          } else {
            await createGameSession({
              userId: ctx.user.id,
              category: input.category,
              spiceLevel: input.spiceLevel,
              currentPrompt: promptText,
              promptHistory: [],
            });
          }

          return { success: true, prompt: promptText };
        } catch (error) {
          console.error("[Game] Prompt generation failed:", error);
          return { success: false, prompt: "", error: "Failed to generate prompt. Please try again." };
        }
      }),

    activeSession: protectedProcedure.query(async ({ ctx }) => {
      return getActiveGameSession(ctx.user.id);
    }),

    history: protectedProcedure
      .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }).optional())
      .query(async ({ ctx, input }) => {
        return getUserGameHistory(ctx.user.id, input?.limit ?? 20);
      }),

    endSession: protectedProcedure.mutation(async ({ ctx }) => {
      const session = await getActiveGameSession(ctx.user.id);
      if (session) await updateGameSession(session.id, { isActive: false });
      return { success: true };
    }),
  }),

  // ─── User Preferences ────────────────────────────────────────────────────
  preferences: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getUserPreferences(ctx.user.id);
    }),

    update: protectedProcedure
      .input(z.object({
        defaultProvider: providerSchema.optional(),
        defaultSpiceLevel: z.enum(["mild", "medium", "hot", "extreme"]).optional(),
        defaultCategories: z.array(z.string()).optional(),
        partnerNames: z.object({
          partner1: z.string().min(1).max(80),
          partner2: z.string().min(1).max(80),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertUserPreferences(ctx.user.id, input);
        return { success: true };
      }),
  }),
});

// ─── Async Generation Processing ────────────────────────────────────────────

async function processGeneration(
  genId: number,
  userId: number,
  input: { tool: string; provider: string; prompt?: string; inputParams?: any; inputMediaId?: number },
  apiKeyValue: string
) {
  try {
    await updateGeneration(genId, { status: "processing" });

    let result: ProviderResult | null = null;

    if (input.provider === "venice") {
      result = await callVeniceApi(input, apiKeyValue);
    } else if (input.provider === "huggingface") {
      result = await callHuggingFaceApi(input, apiKeyValue);
    } else if (input.provider === "fal_ai") {
      result = await callFalApi(input, apiKeyValue);
    }

    if (!result) {
      await updateGeneration(genId, {
        status: "failed",
        errorMessage: "No result returned from provider",
      });
      return;
    }

    const response = await fetch(result.url);
    if (!response.ok) {
      throw new Error(`Failed to download provider result: ${response.status}`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    const ext = result.type === "video" ? "mp4" : "png";
    const fileKey = `user-${userId}/generated/${Date.now()}-${input.tool}.${ext}`;
    const mimeType = result.type === "video" ? "video/mp4" : "image/png";
    const { key, url } = await storagePut(fileKey, buffer, mimeType);

    const mediaId = await createMedia({
      userId,
      type: result.type,
      source: "generated",
      url,
      fileKey: key,
      filename: `${input.tool}-${Date.now()}.${ext}`,
      mimeType,
      fileSize: buffer.length,
    });

    await updateGeneration(genId, {
      status: "completed",
      outputMediaId: mediaId,
      completedAt: new Date(),
    });
  } catch (error: any) {
    console.error(`[Generation] Processing failed for ${genId}:`, error);
    await updateGeneration(genId, {
      status: "failed",
      errorMessage: error?.message || "Generation failed",
    });
  }
}

// ─── Venice API Caller ─────────────────────────────────────────────────────

const VENICE_MODELS: Record<string, { model: string; type: "image" | "video" }> = {
  text_to_image: { model: "flux-dev", type: "image" },
  text_to_video: { model: "wan-2.1-t2v", type: "video" },
  image_to_video: { model: "wan-2.1-i2v", type: "video" },
  image_upscale: { model: "upscale", type: "image" },
};

async function callVeniceApi(
  input: { tool: string; prompt?: string; inputParams?: any; inputMediaId?: number },
  apiKey: string
): Promise<ProviderResult | null> {
  const modelConfig = VENICE_MODELS[input.tool];
  if (!modelConfig) {
    throw new Error(`Tool ${input.tool} not supported by Venice API`);
  }

  // Use correct endpoint based on tool type
  const isVideo = modelConfig.type === "video";
  const apiUrl = isVideo 
    ? "https://api.venice.ai/api/v1/video/generations"
    : "https://api.venice.ai/api/v1/image/generations";

  const requestBody: any = {
    model: modelConfig.model,
    prompt: input.prompt || "A beautiful image",
  };

  // Handle image input for image-to-video
  if (input.inputParams?.input_image) {
    requestBody.image = input.inputParams.input_image;
  }

  // Handle aspect ratio
  if (input.inputParams?.aspect_ratio) {
    requestBody.aspect_ratio = input.inputParams.aspect_ratio;
  } else if (input.inputParams?.width && input.inputParams?.height) {
    const w = input.inputParams.width;
    const h = input.inputParams.height;
    if (w === h) requestBody.aspect_ratio = "1:1";
    else if (w > h) requestBody.aspect_ratio = "16:9";
    else requestBody.aspect_ratio = "9:16";
  }

  // Handle other params
  if (input.inputParams?.negative_prompt) {
    requestBody.negative_prompt = input.inputParams.negative_prompt;
  }
  if (input.inputParams?.seed) {
    requestBody.seed = input.inputParams.seed;
  }

  const response = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Venice API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  
  // Handle both image and video responses
  if (data.data && data.data.length > 0) {
    const item = data.data[0];
    if (item.url) {
      return { url: item.url, type: modelConfig.type };
    } else if (item.b64_json) {
      const dataUrl = `data:${modelConfig.type === "video" ? "video/mp4" : "image/png"};base64,${item.b64_json}`;
      return { url: dataUrl, type: modelConfig.type };
    }
  }

  throw new Error("No data returned from Venice API");
}

// ─── Hugging Face API Caller ───────────────────────────────────────────────

async function callHuggingFaceApi(
  input: { tool: string; prompt?: string; inputParams?: any },
  apiKey: string
): Promise<ProviderResult | null> {
  // Hugging Face Inference API for special models
  const modelId = input.inputParams?.model_id || "stabilityai/stable-diffusion-xl-base-1.0";
  
  const response = await fetch(`https://api-inference.huggingface.co/models/${modelId}`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ inputs: input.prompt || "A beautiful image" }),
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Hugging Face API error: ${response.status} - ${errText}`);
  }

  const buffer = await response.arrayBuffer();
  const base64 = Buffer.from(buffer).toString("base64");
  const dataUrl = `data:image/png;base64,${base64}`;
  
  return { url: dataUrl, type: "image" };
}

// ─── FAL API Caller ─────────────────────────────────────────────────────────

async function callFalApi(
  input: { tool: string; prompt?: string; inputParams?: any; inputMediaId?: number },
  api
