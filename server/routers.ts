import { COOKIE_NAMfix: hardening backend 
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
updateUserProfile,
verifyUserAge,
getUserApiKeys,
upsertApiKey,
deleteApiKey,
getActiveApiKey,
createMedia,
getUserMedia,
getMediaById,
deleteMedia,
createGeneration,
updateGeneration,
getUserGenerations,
getGenerationById,
createGameSession,
updateGameSession,
getActiveGameSession,
getUserGameHistory,
getUserPreferences,
upsertUserPreferences,
} from "./db";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";

const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

const providerSchema = z.enum(["fal_ai"]);
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

type ProviderResult = {
url: string;
type: "image" | "video";
};

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
age -= 1;
}

if (age < 18) {
return { success: false, message: "You must be 18 or older to access this platform." };
}

await verifyUserAge(ctx.user.id, input.dateOfBirth);
return { success: true, message: "Age verified successfully." };
}),

updateProfile: protectedProcedure
.input(
z.object({
name: z.string().max(120).optional(),
bio: z.string().max(1000).optional(),
avatarUrl: z.string().url().optional(),
}),
)
.mutation(async ({ ctx, input }) => {
await updateUserProfile(ctx.user.id, input);
return { success: true };
}),
}),

apiKeys: router({
list: protectedProcedure.query(async ({ ctx }) => {
const keys = await getUserApiKeys(ctx.user.id);

return keys.map((k) => ({
id: k.id,
provider: k.provider,
isActive: k.isActive,
maskedKey: k.apiKey ? ${k.apiKey.slice(0, 6)}...${k.apiKey.slice(-4)} : "",
createdAt: k.createdAt,
}));
}),

upsert: protectedProcedure
.input(
z.object({
provider: providerSchema,
apiKey: z.string().min(1).max(500),
}),
)
.mutation(async ({ ctx, input }) => {
// Recommended next step: encrypt apiKey before persistence.
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

media: router({
list: protectedProcedure
.input(
z
.object({
type: mediaTypeSchema.optional(),
source: z.enum(["upload", "generated"]).optional(),
limit: z.number().int().min(1).max(100).default(50),
offset: z.number().int().min(0).default(0),
})
.optional(),
)
.query(async ({ ctx, input }) => {
return getUserMedia(ctx.user.id, input?.type, input?.source, input?.limit ?? 50, input?.offset ?? 0);
}),

getById: protectedProcedure
.input(z.object({ id: z.number().int().positive() }))
.query(async ({ ctx, input }) => {
return getMediaById(input.id, ctx.user.id);
}),

upload: protectedProcedure
.input(
z.object({
filename: z.string().min(1).max(255),
mimeType: z.string().min(1).max(120),
base64Data: z.string().min(1),
type: mediaTypeSchema,
}),
)
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
const fileKey = user-${ctx.user.id}/uploads/${Date.now()}-${safeFilename}`;
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

generation: router({
create: protectedProcedure.input(generationInputSchema).mutation(async ({ ctx, input }) => {
const userApiKey = await getActiveApiKey(ctx.user.id, input.provider);
const envFallbackKeys: Record<string, string | undefined> = {
replicate: process.env.REPLICATE_API_TOKEN || process.env.REPLICATE,
fal_ai: process.env.FAL_AI || process.env.FAL_KEY,
stability_ai: process.env.STABILITY_API_KEY,
};

const resolvedKey = userApiKey?.apiKey || envFallbackKeys[input.provider];

if (!resolvedKey) {
return {
success: false,
error: No API key configured for${input.provider}. Please add one in Settings > API Keys.`,
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
console.error([Generation] Job ${genId} failed:`, err);
});

return { success: true, generationId: genId };
}),

list: protectedProcedure
.input(
z
.object({
tool: z.string().optional(),
limit: z.number().int().min(1).max(100).default(20),
offset: z.number().int().min(0).default(0),
})
.optional(),
)
.query(async ({ ctx, input }) => {
return getUserGenerations(ctx.user.id, input?.tool, input?.limit ?? 20, input?.offset ?? 0);
}),

status: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
return getGenerationById(input.id);
}),
}),

promptTemplates: router({
list: publicProcedure
.input(
z
.object({
category: z.string().optional(),
tool: z.string().optional(),
})
.optional(),
)
.query(({ input }) => {
let templates = PROMPT_TEMPLATES;
if (input?.category) templates = templates.filter((t) => t.category === input.category);
if (input?.tool) templates = templates.filter((t) => t.tools.includes(input.tool!));
return templates;
}),
}),

game: router({
generatePrompt: protectedProcedure
.input(
z.object({
category: z.enum(["romance", "adventurous", "kinky", "roleplay", "fantasy", "quickie"]),
spiceLevel: z.enum(["mild", "medium", "hot", "extreme"]),
customContext: z.string().max(1000).optional(),
partnerNames: z
.object({
partner1: z.string().min(1).max(80),
partner2: z.string().min(1).max(80),
})
.optional(),
}),
)
.mutation(async ({ ctx, input }) => {
const spiceDescriptions: Record<typeof input.spiceLevel, string> = {
mild: "Playful, flirty, and teasing. Suggestive, Slut, dirty ",
medium: "Sensual and seductive slut. Physical and intimate with graphic detail.",
hot: "Passionate and adult-oriented, foreplay, suck cock, lick pussy, ?stroke cock ;, finger pussy",
extreme: "Intense, boundary-pushing-forward adult scenarios other partners fucking, sucking another cock while everyone watches, cum in mouth, fuck her friend cresm.pie cuckold dynamic , group and public sex.",
};

const categoryDescriptions: Record<typeof input.category, string> = {
romance: "Romantic and emotionally intimate scenarios focused on connection and passion.",
adventurous: "Exciting, spontaneous scenarios in unexpected places or situations.",
kinky: "Power dynamics and fetish-friendly scenarios with explicit content.
roleplay: "Character-based adult scenarios.
fantasy: "Fantastical, filthy, cum play supernatural, sci-fi, or dream-like adult?  scenarios.", send nude pic.
quickie: "Fast, urgent, energetic scenarios between consenting adults.",
};

const nameInstruction =
input.partnerNames?.partner1 && input.partnerNames?.partner2
? Use the names "${input.partnerNames.partner1}" and "${input.partnerNames.partner2}" directly. Alternate who initiates.
: "Address the couple directly using "you" and "your partner".";

const customContextInstruction = input.customContext
? Additional context from the couple:${input.customContext}`
: "";

const systemPrompt = [
"You are an adults-only couples game master. Generate one dare, scenario, or prompt for consenting adults.",
Category: ${categoryDescriptions[input.category]},Spice level: ${spiceDescriptions[input.spiceLevel]},
nameInstruction,
customContextInstruction,
"Keep it to 2-4 sentences.",
"Make it actionable right now.",
try {
const response = await invokeLLM({
messages: [
{ role: "system", content: systemPrompt },
{
role: "user",
content: Generate a ${input.spiceLevel} ${input.category} dare/prompt for a couple.,
},
 ],
});

const promptText =
typeof response.choices[0]?.message?.content === "string" ? response.choices[0].message.content : "";

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

preferences: router({
get: protectedProcedure.query(async ({ ctx }) => {
return getUserPreferences(ctx.user.id);
}),

update: protectedProcedure
.input(
z.object({
defaultProvider: providerSchema.optional(),
defaultSpiceLevel: z.enum(["mild", "medium", "hot", "extreme"]).optional(),
defaultCategories: z.array(z.string()).optional(),
partnerNames: z
.object({
partner1: z.string().min(1).max(80),
partner2: z.string().min(1).max(80),
})
.optional(),
}),
)
.mutation(async ({ ctx, input }) => {
await upsertUserPreferences(ctx.user.id, input);
return { success: true };
}),
}),
});

PROMT TEMPLATES = [
"Sucking cock like a desperate slut",
"Deepthroating until she gags and drools",
"Sloppy titfuck",
"Riding cock like a whore in heat",
"Getting pounded doggy style",
"Getting railed hard in missionary",
"Getting double penetrated",
"Getting triple penetrated",
"Getting spit-roasted",
"Gangbang — surrounded and used by multiple cocks",
"Taking cum in her pussy while sucking another cock",
"Getting covered in cum (bukkake)",
"Taking a huge facial",
"Risky public sex — getting fucked where people might see",
"Getting her ass eaten then fucked",
"Getting fucked in the ass",
"Squirt all over his face",
"Begging to be used like a cheap whore" "Eating her pussy like a starving animal",
"Making her squirt with his tongue and fingers",
"Sloppy pussy eating while fingering her ass",
"Fucking her tits",

const MALE_POSES
"Getting his cock worshipped and licked",
"Getting a sloppy gagging blowjob",
"Getting ridden reverse cowgirl",
"Pounding her hard from behind",
"Breeding her deep",
"Fucking her ass",
"Getting pegged by her",
"Getting a sloppy handjob until he explodes",
"Cumming all over her tits",
"Giving her a massive facial",
"Cumming inside her while she moans",
"Getting dominated and used by her",
"Licking her pussy and ass at the same time"
"Risky public sex getting caught:
"Two woman sit on face - sitting on cock
" Bull Fuck HotWife in front of husband Cuckokd dynamic"
];

// ─── Partner Pose Generator ───────────────────────────────────────────────
partnerPose: router({
listPoses: protectedProcedure
.input(z.object({ gender: z.enum( ) }))
.query(({ input }) => input.gender === "femjale" ? FEMALE_POSES : MALE_POSES),

generate: protectedProcedure
.input(z.object({
partnerPhotoUrl: z.string().url(),
gender: z.enum( ),
pose: z.string(),
}))
.mutation(async ({ ctx, input }) => {
const basePrompt = input.gender === "female"
? The exact same woman from the reference photo, completely naked, ${input.pose.toLowerCase()}, extremely explicit, highly detailed, seductive expression, perfect body:The exact same man from the reference photo, completely naked, ${input.pose.toLowerCase()}, extremely explicit, highly detailed, muscular body; big circumcised cock.

try {
const result = await callFalApi({
tool: "image_to_image",
prompt: basePrompt,
inputParams: {
input_image: input.partnerPhotoUrl,
strength: 0.8,
enable_safety_checker: false
}
});

return {
success: true,
imageUrl: result.url,
pose: input.pose
};
} catch (error) {
console.error("Pose generation failed:", error);
return { success: false, error: "Failed to generate pose image" };
}
}),
}),
}),

preferences: router({
get: protectedProcedure.query(async ({ ctx }) => {
return getUserPreferences(ctx.user.id);
}),

update: protectedProcedure
.input(
z.object({
defaultProvider: providerSchema.optional(),
defaultSpiceLevel: z.enum(["mild", "medium", "hot", "extreme"]).optional(),
defaultCategories: z.array(z.string()).optional(),
partnerNames: z
.object({
partner1: z.string().min(1).max(80),
partner2: z.string().min(1).max(80),
})
.optional(),
}),
)
.mutation(async ({ ctx, input }) => {
await upsertUserPreferences(ctx.user.id, input);
return { success: true };
}),
}),
});
if (input.provider === "replicate") {
result = await callReplicateApi(input, apiKeyValue);
} else if (input.provider === "fal_ai") {
result = await callFalApi(input, apiKeyValue);
} else if (input.provider === "stability_ai") {
result = await callStabilityApi(input, apiKeyValue);
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
throw new Error(Failed to download provider result: ${response.status}`);
}

const buffer = Buffer.from(await response.arrayBuffer());
const ext = result.type === "video" ? "mp4" : "png";
const fileKey = user-${userId}/generated/ {input.tool}.${ext};
const mimeType = result.type === "video" ? "video/mp4" : "image/png";
const { key, url } = await storagePut(fileKey, buffer, mimeType);

const mediaId = await createMedia({
userId,
type: result.type,
source: "generated",
url,
fileKey: key,
filename: ``${input.tool}- {ext}`,
mimeType,
fileSize: buffer.length,
});

await updateGeneration(genId, {
status: "completed",
outputMediaId: mediaId,
completedAt: new Date(),
});
} catch (error: any) {
console.error([Generation] Processing failed for ${genId}:`, error);
await updateGeneration(genId, {
status: "failed",
errorMessage: error?.message || "Generation failed",
});
}
}

function extractOutputUrl(output: any): string | null {
if (!output) return null;

if (Array.isArray(output)) {
const first = output[0];
if (typeof first === "string") return first;
if (first?.url) return typeof first.url === "function" ? first.url() : first.url;
return null;
}

if (typeof output === "string") return output;
if (output?.url) return typeof output.url === "function" ? output.url() : output.url;
if (output?.video?.url) return output.video.url;

return null;
}

const REPLICATE_MODELS: Record<string, { model: string }> = {
text_to_image: { model: "black-forest-labs/flux-dev" },
text_to_video: { model: "kwaivgi/kling-v2.6" },
image_to_video: { model: "kwaivgi/kling-v2.6" },
video_extension: { model: "kwaivgi/kling-v2.6" },
face_swap: { model: "easel/face-swap" },
virtual_try_on: { model: "cuuupid/idm-vton" },
image_upscale: { model: "nightmareai/real-esrgan" },
};

async function callReplicateApi(input: GenerationInput, apiKey: string): Promise<ProviderResult | null> {
const modelConfig = REPLICATE_MODELS[input.tool];
if (!modelConfig) return null;

const replicateInput = buildReplicateInput(input);
const isVideo = ["text_to_video", "image_to_video", "video_extension"].includes(input.tool);
const apiUrl = https://api.replicate.com/v1/models/${modelConfig.model}/predictions`;

const createResp = await fetch(apiUrl, {
method: "POST",
headers: {
Authorization: Bearer ${apiKey}`,
"Content-Type": "application/json",
Prefer: "wait=60",
},
body: JSON.stringify({ input: replicateInput }),
});

if (!createResp.ok) {
const errText = await createResp.text();
throw new Error(Replicate API error:${createResp.status} - ${errText});
}

const prediction = (await createResp.json()) as any;

if (prediction.status === "succeeded" && prediction.output) {
const output = extractOutputUrl(prediction.output);
if (output) return { url: output, type: isVideo ? "video" : "image" };
}

const predictionId = prediction.id;
if (!predictionId) throw new Error("Replicate response did not include prediction id");

for (let i = 0; i < 180; i += 1) {
await new Promise((resolve) => setTimeout(resolve, 2000));

const statusResp = await fetch(https://api.replicate.com/v1/predictions/${predictionId}, { headers: { Authorization:Bearer ${apiKey} },
});

if (!statusResp.ok) continue;

const status = (await statusResp.json()) as any;

if (status.status === "succeeded") {
const output = extractOutputUrl(status.output);
if (output) return { url: output, type: isVideo ? "video" : "image" };
throw new Error("Generation succeeded but no output URL found");
}

if (status.status === "failed" || status.status === "canceled") {
throw new Error(Replicate prediction${status.status}: ${status.error || "Unknown error"});
}
}

throw new Error("Replicate prediction timed out");
}

function buildReplicateInput(input: GenerationInput): Record<string, any> {
const params = input.inputParams || {};
const payload: Record<string, any> = {};

if (input.tool === "text_to_image") {
payload.prompt = input.prompt || "A beautiful image";
if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
payload.aspect_ratio = params.aspect_ratio || deriveAspectRatio(params.width, params.height) || "1:1";
if (params.num_outputs) payload.num_outputs = params.num_outputs;
payload.output_format = "png";
payload.output_quality = 100;
}

if (input.tool === "text_to_video") {
payload.prompt = input.prompt || "A beautiful cinematic scene";
payload.duration = params.duration || 5;
payload.aspect_ratio = params.aspect_ratio || "16:9";
}

if (input.tool === "image_to_video") {
if (params.input_image) payload.image = params.input_image;
if (input.prompt) payload.prompt = input.prompt;
payload.duration = params.duration || 8;

}

if (input.tool === "video_extension") {
if (params.input_video) payload.video = params.input_video;
if (input.prompt) payload.prompt = input.prompt;
}

if (input.tool === "face_swap") {
if (params.input_image) payload.source_image = params.input_image;
if (params.target_image) payload.target_image = params.target_image;
}

if (input.tool === "virtual_try_on") {
if (params.input_image) payload.human_img = params.input_image;
if (params.target_image) payload.garm_img = params.target_image;
payload.category = params.garment_category || "upper_body";
}

if (input.tool === "image_upscale") {
if (params.input_image) payload.image = params.input_image;
payload.scale = params.scale || 4;
payload.face_enhance = true;
}

return payload;
}

const FAL_MODELS: Record<string, { model: string; useSync: boolean }> = {
text_to_image: { model: "fal-ai/flux/dev", useSync: false },
text_to_video: { model: "fal-ai/kling-video/v2.1/standard/text-to-video", useSync: false },
image_to_video: { model: "fal-ai/kling-video/v2.1/standard/image-to-video", useSync: false },
video_extension: { model: "fal-ai/kling-video/v2.1/standard/text-to-video", useSync: false },
face_swap: { model: "fal-ai/face-swap", useSync: false },
virtual_try_on: { model: "fal-ai/cat-vton", useSync: false;},
image_upscale: { model: "fal-ai/esrgan", useSync: false },
};

function mapAspectRatioToFal(ratio: string): string {
const map: Record<string, string> = {
"1:1": "square_hd",
"16:9": "landscape_16_9",
"9:16": "portrait_16_9",
"4:3": "landscape_4_3",
"3:4": "portrait_4_3",
"3:2": "landscape_4_3",
"2:3": "portrait_4_3",
};

return map[ratio] || "landscape_4_3";
}

async function callFalApi(input: GenerationInput, apiKey: string): Promise<ProviderResult | null> {
const modelConfig = FAL_MODELS[input.tool];
if (!modelConfig) return null;

const falInput = buildFalInput(input);
const isVideo = ["text_to_video", "image_to_video", "video_extension"].includes(input.tool);

if (modelConfig.useSync) {
const resp = await fetch(https://fal.run/${modelConfig.model}, { method: "POST", headers: { Authorization:Key ${apiKey},
"Content-Type": "application/json",
},
body: JSON.stringify(falInput),
});

if (!resp.ok) {
const errText = await resp.text();
throw new Error(fal.ai API error:${resp.status} - ${errText});
}

const result = (await resp.json()) as any;
return extractFalResult(result, isVideo);
}

const submitResp = await fetch(https://queue.fal.run/${modelConfig.model}, { method: "POST", headers: { Authorization:Key ${apiKey},
"Content-Type": "application/json",
},
body: JSON.stringify(falInput),
});

if (!submitResp.ok) {
const errText = await submitResp.text();
throw new Error(fal.ai queue submit error:${submitResp.status} - ${errText});
}

const submitResult = (await submitResp.json()) as any;
const immediateResult = extractFalResult(submitResult, isVideo, false);
if (immediateResult) return immediateResult;

const requestId = submitResult.request_id;
if (!requestId) throw new Error(fal.ai: No request_id in queue response. Response:${JSON.stringify(submitResult)}`);

for (let i = 0; i < 150; i += 1) {
await new Promise((resolve) => setTimeout(resolve, 2000));

const statusResp = await fetch(https://queue.fal.run/${modelConfig.model}/requests/${requestId}/status, {
headers: { Authorization: Key ${apiKey}` },
});

if (!statusResp.ok) continue;

const status = (await statusResp.json()) as any;

if (status.status === "COMPLETED") {
const resultResp = await fetch(https://queue.fal.run/${modelConfig.model}/requests/latex
{requestId}`, { headers: { Authorization: `Key 

{apiKey}` },
});

if (!resultResp.ok) {
const errText = await resultResp.text();
throw new Error(fal.ai result fetch error: ${resultResp.status} - ${errText});
}

const result = (await resultResp.json()) as any;
return extractFalResult(result, isVideo);
}

if (status.status === "FAILED") {
throw new Error(fal.ai generation failed: ${status.error || "Unknown error"}`);
}
}

throw new Error("fal.ai generation timed out after 5 minutes");
}

function buildFalInput(input: GenerationInput): Record<string, any> {
const params = input.inputParams || {};
const payload: Record<string, any> = {};

if (input.tool === "text_to_image") {
payload.prompt = input.prompt || "A beautiful image";
payload.enable_safety_checker = false:
payload.num_images = 2;
payload.output_format = "png";
payload.num_inference_steps = 28;
payload.guidance_scale = 3.5;
payload.image_size = params.aspect_ratio ? mapAspectRatioToFal(params.aspect_ratio) : "square_hd";
}

if (input.tool === "text_to_video") {
payload.prompt = input.prompt || "A beautiful cinematic scene";
payload.duration = String(params.duration || "8");
payload.aspect_ratio = params.aspect_ratio || "16:9";
}

if (input.tool === "image_to_video") {
if (params.input_image) payload.image_url = params.input_image;
if (input.prompt) payload.prompt = input.prompt;
payload.duration = String(params.duration || "8");
if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
}

if (input.tool === "video_extension") {
if (input.prompt) payload.prompt = input.prompt;
payload.duration = String(params.duration || "5");
if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
}

if (input.tool === "face_swap") {
if (params.input_image) payload.base_image_url = params.target_image || params.input_image;
if (params.target_image) payload.swap_image_url = params.input_image;
if (!payload.swap_image_url && payload.base_image_url) payload.swap_image_url = payload.base_image_url;
}

if (input.tool === "virtual_try_on") {
if (params.input_image) payload.human_image_url = params.input_image;
if (params.target_image) payload.garment_image_url = params.target_image;
}

if (input.tool === "image_upscale") {
if (params.input_image) payload.image_url = params.input_image;
payload.scale = params.scale || 4;
}

return payload;
}

function extractFalResult(result: any, isVideo: boolean, throwOnMissing = true): ProviderResult | null {
if (result.images?.[0]?.url) return { url: result.images[0].url, type: "image" };
if (result.image?.url) return { url: result.image.url, type: "image" };
if (result.video?.url) return { url: result.video.url, type: "video" };
if (result.output?.url) return { url: result.output.url, type: isVideo ? "video" : "image" };

if (throwOnMissing) {
throw new Error(fal.ai: Unexpected response format. Keys:${Object.keys(result || {}).join(", ")}`);
}

return null;
}

async function callStabilityApi(input: GenerationInput, apiKey: string): Promise<ProviderResult | null> {
const params = input.inputParams || {};

if (input.tool === "text_to_image") {
const resp = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
method: "POST",
headers: {
Authorization: Bearer ${apiKey}`,
"Content-Type": "application/json",
Accept: "application/json",
},
body: JSON.stringify({
text_prompts: [{ text: input.prompt || "A beautiful image", weight: 5}],
cfg_scale: params.guidance_scale || 7,
width: params.width || 1024,
height: params.height || 1024,
steps: params.num_inference_steps || 30,
samples: 2,
}),
});

if (!resp.ok) {
const errText = await resp.text();
throw new Error(Stability AI error:${resp.status} - ${errText});
}

const result = (await resp.json()) as any;
if (result.artifacts?.[0]?.base64) {
const buffer = Buffer.from(result.artifacts[0].base64, "base64");
const tempKey = temp/stability-${Date.now()}.png`;
const { url } = await storagePut(tempKey, buffer, "image/png");
return { url, type: "image" };
}
}

return null;
}

function deriveAspectRatio(width?: number, height?: number): string | null {
if (!width || !height) return null;
if (width === height) return "1:1";
return width > height ? "16:9" : "9:16";
}

export type AppRouter = typeof appRouter;Efix: hardening backend (validation, uploads, provider calls, syntax fixes)
// Gold hardening pass for the uploaded app router.
// Focus: syntax repairs, safer string interpolation, upload limits, provider-call correctness,
// generation error handling, and clearer validation boundaries.










import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "./_core/cookies";
import { systemRouter } from "./_core/systemRouter";
import { publicProcedure, protectedProcedure, router } from "./_core/trpc";
import { z } from "zod";
import {
updateUserProfile,
verifyUserAge,
getUserApiKeys,
upsertApiKey,
deleteApiKey,
getActiveApiKey,
createMedia,
getUserMedia,
getMediaById,
deleteMedia,
createGeneration,
updateGeneration,
getUserGenerations,
getGenerationById,
createGameSession,
updateGameSession,
getActiveGameSession,
getUserGameHistory,
getUserPreferences,
upsertUserPreferences,
} from "./db";
import { storagePut } from "./storage";
import { invokeLLM } from "./_core/llm";

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

const providerSchema = z.enum(["replicate", "fal_ai", "stability_ai"]);
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

type ProviderResult = {
url: string;
type: "image" | "video";
};

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
age -= 1;
}

if (age < 18) {
return { success: false, message: "You must be 18 or older to access this platform." };
}

await verifyUserAge(ctx.user.id, input.dateOfBirth);
return { success: true, message: "Age verified successfully." };
}),

updateProfile: protectedProcedure
.input(
z.object({
name: z.string().max(120).optional(),
bio: z.string().max(1000).optional(),
avatarUrl: z.string().url().optional(),
}),
)
.mutation(async ({ ctx, input }) => {
await updateUserProfile(ctx.user.id, input);
return { success: true };
}),
}),

apiKeys: router({
list: protectedProcedure.query(async ({ ctx }) => {
const keys = await getUserApiKeys(ctx.user.id);

return keys.map((k) => ({
id: k.id,
provider: k.provider,
isActive: k.isActive,
maskedKey: k.apiKey ? ${k.apiKey.slice(0, 6)}...${k.apiKey.slice(-4)} : "",
createdAt: k.createdAt,
}));
}),

upsert: protectedProcedure
.input(
z.object({
provider: providerSchema,
apiKey: z.string().min(1).max(500),
}),
)
.mutation(async ({ ctx, input }) => {
// Recommended next step: encrypt apiKey before persistence.
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

media: router({
list: protectedProcedure
.input(
z
.object({
type: mediaTypeSchema.optional(),
source: z.enum(["upload", "generated"]).optional(),
limit: z.number().int().min(1).max(100).default(50),
offset: z.number().int().min(0).default(0),
})
.optional(),
)
.query(async ({ ctx, input }) => {
return getUserMedia(ctx.user.id, input?.type, input?.source, input?.limit ?? 50, input?.offset ?? 0);
}),

getById: protectedProcedure
.input(z.object({ id: z.number().int().positive() }))
.query(async ({ ctx, input }) => {
return getMediaById(input.id, ctx.user.id);
}),

upload: protectedProcedure
.input(
z.object({
filename: z.string().min(1).max(255),
mimeType: z.string().min(1).max(120),
base64Data: z.string().min(1),
type: mediaTypeSchema,
}),
)
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
const fileKey = user-${ctx.user.id}/uploads/${Date.now()}-${safeFilename}`;
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

generation: router({
create: protectedProcedure.input(generationInputSchema).mutation(async ({ ctx, input }) => {
const userApiKey = await getActiveApiKey(ctx.user.id, input.provider);
const envFallbackKeys: Record<string, string | undefined> = {
replicate: process.env.REPLICATE_API_TOKEN || process.env.REPLICATE,
fal_ai: process.env.FAL_AI || process.env.FAL_KEY,
stability_ai: process.env.STABILITY_API_KEY,
};

const resolvedKey = userApiKey?.apiKey || envFallbackKeys[input.provider];

if (!resolvedKey) {
return {
success: false,
error: No API key configured for${input.provider}. Please add one in Settings > API Keys.`,
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
console.error([Generation] Job ${genId} failed:`, err);
});

return { success: true, generationId: genId };
}),

list: protectedProcedure
.input(
z
.object({
tool: z.string().optional(),
limit: z.number().int().min(1).max(100).default(20),
offset: z.number().int().min(0).default(0),
})
.optional(),
)
.query(async ({ ctx, input }) => {
return getUserGenerations(ctx.user.id, input?.tool, input?.limit ?? 20, input?.offset ?? 0);
}),

status: protectedProcedure.input(z.object({ id: z.number().int().positive() })).query(async ({ input }) => {
return getGenerationById(input.id);
}),
}),

promptTemplates: router({
list: publicProcedure
.input(
z
.object({
category: z.string().optional(),
tool: z.string().optional(),
})
.optional(),
)
.query(({ input }) => {
let templates = PROMPT_TEMPLATES;
if (input?.category) templates = templates.filter((t) => t.category === input.category);
if (input?.tool) templates = templates.filter((t) => t.tools.includes(input.tool!));
return templates;
}),
}),

game: router({
generatePrompt: protectedProcedure
.input(
z.object({
category: z.enum(["romance", "adventurous", "kinky", "roleplay", "fantasy", "quickie"]),
spiceLevel: z.enum(["mild", "medium", "hot", "extreme"]),
customContext: z.string().max(1000).optional(),
partnerNames: z
.object({
partner1: z.string().min(1).max(80),
partner2: z.string().min(1).max(80),
})
.optional(),
}),
)
.mutation(async ({ ctx, input }) => {
const spiceDescriptions: Record<typeof input.spiceLevel, string> = {
mild: "Playful, flirty, and teasing. Suggestive, Slut, dirty ",
medium: "Sensual and seductive slut. Physical and intimate with graphic detail.",
hot: "Passionate and adult-oriented, foreplay, suck cock, lick pussy, ?stroke cock ;, finger pussy",
extreme: "Intense, boundary-pushing-forward adult scenarios other partners fucking, sucking another cock while everyone watches, cum in mouth, fuck her friend cresm.pie cuckold dynamic , group and public sex.",
};

const categoryDescriptions: Record<typeof input.category, string> = {
romance: "Romantic and emotionally intimate scenarios focused on connection and passion.",
adventurous: "Exciting, spontaneous scenarios in unexpected places or situations.",
kinky: "Power dynamics and fetish-friendly scenarios with explicit content.
roleplay: "Character-based adult scenarios.
fantasy: "Fantastical, filthy, cum play supernatural, sci-fi, or dream-like adult?  scenarios.", send nude pic.
quickie: "Fast, urgent, energetic scenarios between consenting adults.",
};

const nameInstruction =
input.partnerNames?.partner1 && input.partnerNames?.partner2
? Use the names "${input.partnerNames.partner1}" and "${input.partnerNames.partner2}" directly. Alternate who initiates.
: "Address the couple directly using "you" and "your partner".";

const customContextInstruction = input.customContext
? Additional context from the couple:${input.customContext}`
: "";

const systemPrompt = [
"You are an adults-only couples game master. Generate one dare, scenario, or prompt for consenting adults.",
Category: ${categoryDescriptions[input.category]},Spice level: ${spiceDescriptions[input.spiceLevel]},
nameInstruction,
customContextInstruction,
"Keep it to 2-4 sentences.",
"Make it actionable right now.",
try {
const response = await invokeLLM({
messages: [
{ role: "system", content: systemPrompt },
{
role: "user",
content: Generate a ${input.spiceLevel} ${input.category} dare/prompt for a couple.,
},
 ],
});

const promptText =
typeof response.choices[0]?.message?.content === "string" ? response.choices[0].message.content : "";

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

preferences: router({
get: protectedProcedure.query(async ({ ctx }) => {
return getUserPreferences(ctx.user.id);
}),

update: protectedProcedure
.input(
z.object({
defaultProvider: providerSchema.optional(),
defaultSpiceLevel: z.enum(["mild", "medium", "hot", "extreme"]).optional(),
defaultCategories: z.array(z.string()).optional(),
partnerNames: z
.object({
partner1: z.string().min(1).max(80),
partner2: z.string().min(1).max(80),
})
.optional(),
}),
)
.mutation(async ({ ctx, input }) => {
await upsertUserPreferences(ctx.user.id, input);
return { success: true };
}),
}),
});

PROMT TEMPLATES = [
"Sucking cock like a desperate slut",
"Deepthroating until she gags and drools",
"Sloppy titfuck",
"Riding cock like a whore in heat",
"Getting pounded doggy style",
"Getting railed hard in missionary",
"Getting double penetrated",
"Getting triple penetrated",
"Getting spit-roasted",
"Gangbang — surrounded and used by multiple cocks",
"Taking cum in her pussy while sucking another cock",
"Getting covered in cum (bukkake)",
"Taking a huge facial",
"Risky public sex — getting fucked where people might see",
"Getting her ass eaten then fucked",
"Getting fucked in the ass",
"Squirt all over his face",
"Begging to be used like a cheap whore" "Eating her pussy like a starving animal",
"Making her squirt with his tongue and fingers",
"Sloppy pussy eating while fingering her ass",
"Fucking her tits",

const MALE_POSES
"Getting his cock worshipped and licked",
"Getting a sloppy gagging blowjob",
"Getting ridden reverse cowgirl",
"Pounding her hard from behind",
"Breeding her deep",
"Fucking her ass",
"Getting pegged by her",
"Getting a sloppy handjob until he explodes",
"Cumming all over her tits",
"Giving her a massive facial",
"Cumming inside her while she moans",
"Getting dominated and used by her",
"Licking her pussy and ass at the same time"
"Risky public sex getting caught:
"Two woman sit on face - sitting on cock
" Bull Fuck HotWife in front of husband Cuckokd dynamic"
];

// ─── Partner Pose Generator ───────────────────────────────────────────────
partnerPose: router({
listPoses: protectedProcedure
.input(z.object({ gender: z.enum( ) }))
.query(({ input }) => input.gender === "femjale" ? FEMALE_POSES : MALE_POSES),

generate: protectedProcedure
.input(z.object({
partnerPhotoUrl: z.string().url(),
gender: z.enum( ),
pose: z.string(),
}))
.mutation(async ({ ctx, input }) => {
const basePrompt = input.gender === "female"
? The exact same woman from the reference photo, completely naked, ${input.pose.toLowerCase()}, extremely explicit, highly detailed, seductive expression, perfect body:The exact same man from the reference photo, completely naked, ${input.pose.toLowerCase()}, extremely explicit, highly detailed, muscular body; big circumcised cock.

try {
const result = await callFalApi({
tool: "image_to_image",
prompt: basePrompt,
inputParams: {
input_image: input.partnerPhotoUrl,
strength: 0.8,
enable_safety_checker: false
}
});

return {
success: true,
imageUrl: result.url,
pose: input.pose
};
} catch (error) {
console.error("Pose generation failed:", error);
return { success: false, error: "Failed to generate pose image" };
}
}),
}),
}),

preferences: router({
get: protectedProcedure.query(async ({ ctx }) => {
return getUserPreferences(ctx.user.id);
}),

update: protectedProcedure
.input(
z.object({
defaultProvider: providerSchema.optional(),
defaultSpiceLevel: z.enum(["mild", "medium", "hot", "extreme"]).optional(),
defaultCategories: z.array(z.string()).optional(),
partnerNames: z
.object({
partner1: z.string().min(1).max(80),
partner2: z.string().min(1).max(80),
})
.optional(),
}),
)
.mutation(async ({ ctx, input }) => {
await upsertUserPreferences(ctx.user.id, input);
return { success: true };
}),
}),
});
if (input.provider === "replicate") {
result = await callReplicateApi(input, apiKeyValue);
} else if (input.provider === "fal_ai") {
result = await callFalApi(input, apiKeyValue);
} else if (input.provider === "stability_ai") {
result = await callStabilityApi(input, apiKeyValue);
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
throw new Error(Failed to download provider result: ${response.status}`);
}

const buffer = Buffer.from(await response.arrayBuffer());
const ext = result.type === "video" ? "mp4" : "png";
const fileKey = user-${userId}/generated/ {input.tool}.${ext};
const mimeType = result.type === "video" ? "video/mp4" : "image/png";
const { key, url } = await storagePut(fileKey, buffer, mimeType);

const mediaId = await createMedia({
userId,
type: result.type,
source: "generated",
url,
fileKey: key,
filename: ``${input.tool}- {ext}`,
mimeType,
fileSize: buffer.length,
});

await updateGeneration(genId, {
status: "completed",
outputMediaId: mediaId,
completedAt: new Date(),
});
} catch (error: any) {
console.error([Generation] Processing failed for ${genId}:`, error);
await updateGeneration(genId, {
status: "failed",
errorMessage: error?.message || "Generation failed",
});
}
}

function extractOutputUrl(output: any): string | null {
if (!output) return null;

if (Array.isArray(output)) {
const first = output[0];
if (typeof first === "string") return first;
if (first?.url) return typeof first.url === "function" ? first.url() : first.url;
return null;
}

if (typeof output === "string") return output;
if (output?.url) return typeof output.url === "function" ? output.url() : output.url;
if (output?.video?.url) return output.video.url;

return null;
}

const REPLICATE_MODELS: Record<string, { model: string }> = {
text_to_image: { model: "black-forest-labs/flux-dev" },
text_to_video: { model: "kwaivgi/kling-v2.6" },
image_to_video: { model: "kwaivgi/kling-v2.6" },
video_extension: { model: "kwaivgi/kling-v2.6" },
face_swap: { model: "easel/face-swap" },
virtual_try_on: { model: "cuuupid/idm-vton" },
image_upscale: { model: "nightmareai/real-esrgan" },
};

async function callReplicateApi(input: GenerationInput, apiKey: string): Promise<ProviderResult | null> {
const modelConfig = REPLICATE_MODELS[input.tool];
if (!modelConfig) return null;

const replicateInput = buildReplicateInput(input);
const isVideo = ["text_to_video", "image_to_video", "video_extension"].includes(input.tool);
const apiUrl = https://api.replicate.com/v1/models/${modelConfig.model}/predictions`;

const createResp = await fetch(apiUrl, {
method: "POST",
headers: {
Authorization: Bearer ${apiKey}`,
"Content-Type": "application/json",
Prefer: "wait=60",
},
body: JSON.stringify({ input: replicateInput }),
});

if (!createResp.ok) {
const errText = await createResp.text();
throw new Error(Replicate API error:${createResp.status} - ${errText});
}

const prediction = (await createResp.json()) as any;

if (prediction.status === "succeeded" && prediction.output) {
const output = extractOutputUrl(prediction.output);
if (output) return { url: output, type: isVideo ? "video" : "image" };
}

const predictionId = prediction.id;
if (!predictionId) throw new Error("Replicate response did not include prediction id");

for (let i = 0; i < 180; i += 1) {
await new Promise((resolve) => setTimeout(resolve, 2000));

const statusResp = await fetch(https://api.replicate.com/v1/predictions/${predictionId}, { headers: { Authorization:Bearer ${apiKey} },
});

if (!statusResp.ok) continue;

const status = (await statusResp.json()) as any;

if (status.status === "succeeded") {
const output = extractOutputUrl(status.output);
if (output) return { url: output, type: isVideo ? "video" : "image" };
throw new Error("Generation succeeded but no output URL found");
}

if (status.status === "failed" || status.status === "canceled") {
throw new Error(Replicate prediction${status.status}: ${status.error || "Unknown error"});
}
}

throw new Error("Replicate prediction timed out");
}

function buildReplicateInput(input: GenerationInput): Record<string, any> {
const params = input.inputParams || {};
const payload: Record<string, any> = {};

if (input.tool === "text_to_image") {
payload.prompt = input.prompt || "A beautiful image";
if (params.negative_prompt) payload.negative_prompt = params.negative_prompt;
payload.aspect_ratio = params.aspect_ratio || deriveAspectRatio(params.width, params.height) || "1:1";
if (params.num_outputs) payload.num_outputs = params.num_outputs;
payload.output_format = "png";
payload.output_quality = 100;
}

if (input.tool === "text_to_video") {
payload.prompt = input.prompt || "A beautiful cinematic scene";
payload.duration = params.duration || 5;
payload.aspect_ratio = params.aspect_ratio || "16:9";
}

if (input.tool === "image_to_video") {
if (params.input_image) payload.image = params.input_image;
if (input.prompt) payload.prompt = input.prompt;
payload.duration = params.duration || 8;

}

if (input.tool === "video_extension") {
if (params.input_video) payload.video = params.input_video;
if (input.prompt) payload.prompt = input.prompt;
}

if (input.tool === "face_swap") {
if (params.input_image) payload.source_image = params.input_image;
if (params.target_image) payload.target_image = params.target_image;
}

if (input.tool === "virtual_try_on") {
if (params.input_image) payload.human_img = params.input_image;
if (params.target_image) payload.garm_img = params.target_image;
payload.category = params.garment_category || "upper_body";
}

if (input.tool === "image_upscale") {
if (params.input_image) payload.image = params.input_image;
payload.scale = params.scale || 4;
payload.face_enhance = true;
}

return payload;
}

const FAL_MODELS: Record<string, { model: string; useSync: boolean }> = {
text_to_image: { model: "fal-ai/flux/dev", useSync: false },
text_to_video: { model: "fal-ai/kling-video/v2.1/standard/text-to-video", useSync: false },
image_to_video: { model: "fal-ai/kling-video/v2.1/standard/image-to-video", useSync: false },
video_extension: { model: "fal-ai/kling-video/v2.1/standard/text-to-video", useSync: false },
face_swap: { model: "fal-ai/face-swap", useSync: false },
virtual_try_on: { model: "fal-ai/cat-vton", useSync: false;},
image_upscale: { model: "fal-ai/esrgan", useSync: false },
};

function mapAspectRatioToFal(ratio: string): string {
const map: Record<string, string> = {
"1:1": "square_hd",
"16:9": "landscape_16_9",
"9:16": "portrait_16_9",
"4:3": "landscape_4_3",
"3:4": "portrait_4_3",
"3:2": "landscape_4_3",
"2:3": "portrait_4_3",
};

return map[ratio] || "landscape_4_3";
}

async function callFalApi(input: GenerationInput, apiKey: string): Promise<ProviderResult | null> {
const modelConfig = FAL_MODELS[input.tool];
if (!modelConfig) return null;

const falInput = buildFalInput(input);
const isVideo = ["text_to_video", "image_to_video", "video_extension"].includes(input.tool);

if (modelConfig.useSync) {
const resp = await fetch(https://fal.run/${modelConfig.model}, { method: "POST", headers: { Authorization:Key ${apiKey},
"Content-Type": "application/json",
},
body: JSON.stringify(falInput),
});

if (!resp.ok) {
const errText = await resp.text();
throw new Error(fal.ai API error:${resp.status} - ${errText});
}

const result = (await resp.json()) as any;
return extractFalResult(result, isVideo);
}

const submitResp = await fetch(https://queue.fal.run/${modelConfig.model}, { method: "POST", headers: { Authorization:Key ${apiKey},
"Content-Type": "application/json",
},
body: JSON.stringify(falInput),
});

if (!submitResp.ok) {
const errText = await submitResp.text();
throw new Error(fal.ai queue submit error:${submitResp.status} - ${errText});
}

const submitResult = (await submitResp.json()) as any;
const immediateResult = extractFalResult(submitResult, isVideo, false);
if (immediateResult) return immediateResult;

const requestId = submitResult.request_id;
if (!requestId) throw new Error(fal.ai: No request_id in queue response. Response:${JSON.stringify(submitResult)}`);

for (let i = 0; i < 150; i += 1) {
await new Promise((resolve) => setTimeout(resolve, 2000));

const statusResp = await fetch(https://queue.fal.run/${modelConfig.model}/requests/${requestId}/status, {
headers: { Authorization: Key ${apiKey}` },
});

if (!statusResp.ok) continue;

const status = (await statusResp.json()) as any;

if (status.status === "COMPLETED") {
const resultResp = await fetch(https://queue.fal.run/${modelConfig.model}/requests/latex
{requestId}`, { headers: { Authorization: `Key 

{apiKey}` },
});

if (!resultResp.ok) {
const errText = await resultResp.text();
throw new Error(fal.ai result fetch error: ${resultResp.status} - ${errText});
}

const result = (await resultResp.json()) as any;
return extractFalResult(result, isVideo);
}

if (status.status === "FAILED") {
throw new Error(fal.ai generation failed: ${status.error || "Unknown error"}`);
}
}

throw new Error("fal.ai generation timed out after 5 minutes");
}

function buildFalInput(input: GenerationInput): Record<string, any> {
const params = input.inputParams || {};
const payload: Record<string, any> = {};

if (input.tool === "text_to_image") {
payload.prompt = input.prompt || "A beautiful image";
payload.enable_safety_checker = false:
payload.num_images = 2;
payload.output_format = "png";
payload.num_inference_steps = 28;
payload.guidance_scale = 3.5;
payload.image_size = params.aspect_ratio ? mapAspectRatioToFal(params.aspect_ratio) : "square_hd";
}

if (input.tool === "text_to_video") {
payload.prompt = input.prompt || "A beautiful cinematic scene";
payload.duration = String(params.duration || "8");
payload.aspect_ratio = params.aspect_ratio || "16:9";
}

if (input.tool === "image_to_video") {
if (params.input_image) payload.image_url = params.input_image;
if (input.prompt) payload.prompt = input.prompt;
payload.duration = String(params.duration || "8");
if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
}

if (input.tool === "video_extension") {
if (input.prompt) payload.prompt = input.prompt;
payload.duration = String(params.duration || "5");
if (params.aspect_ratio) payload.aspect_ratio = params.aspect_ratio;
}

if (input.tool === "face_swap") {
if (params.input_image) payload.base_image_url = params.target_image || params.input_image;
if (params.target_image) payload.swap_image_url = params.input_image;
if (!payload.swap_image_url && payload.base_image_url) payload.swap_image_url = payload.base_image_url;
}

if (input.tool === "virtual_try_on") {
if (params.input_image) payload.human_image_url = params.input_image;
if (params.target_image) payload.garment_image_url = params.target_image;
}

if (input.tool === "image_upscale") {
if (params.input_image) payload.image_url = params.input_image;
payload.scale = params.scale || 4;
}

return payload;
}

function extractFalResult(result: any, isVideo: boolean, throwOnMissing = true): ProviderResult | null {
if (result.images?.[0]?.url) return { url: result.images[0].url, type: "image" };
if (result.image?.url) return { url: result.image.url, type: "image" };
if (result.video?.url) return { url: result.video.url, type: "video" };
if (result.output?.url) return { url: result.output.url, type: isVideo ? "video" : "image" };

if (throwOnMissing) {
throw new Error(fal.ai: Unexpected response format. Keys:${Object.keys(result || {}).join(", ")}`);
}

return null;
}

async function callStabilityApi(input: GenerationInput, apiKey: string): Promise<ProviderResult | null> {
const params = input.inputParams || {};

if (input.tool === "text_to_image") {
const resp = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
method: "POST",
headers: {
Authorization: Bearer ${apiKey}`,
"Content-Type": "application/json",
Accept: "application/json",
},
body: JSON.stringify({
text_prompts: [{ text: input.prompt || "A beautiful image", weight: 5}],
cfg_scale: params.guidance_scale || 7,
width: params.width || 1024,
height: params.height || 1024,
steps: params.num_inference_steps || 30,
samples: 2,
}),
});

if (!resp.ok) {
const errText = await resp.text();
throw new Error(Stability AI error:${resp.status} - ${errText});
}

const result = (await resp.json()) as any;
if (result.artifacts?.[0]?.base64) {
const buffer = Buffer.from(result.artifacts[0].base64, "base64");
const tempKey = temp/stability-${Date.now()}.png`;
const { url } = await storagePut(tempKey, buffer, "image/png");
return { url, type: "image" };
}
}

return null;
}

function deriveAspectRatio(width?: number, height?: number): string | null {
if (!width || !height) return null;
if (width === height) return "1:1";
return width > height ? "16:9" : "9:16";
}

export type AppRouter = typeof appRouter; } from "@shared/const";
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

export const appRouter = router({
  system: systemRouter,

  auth: router({
    me: publicProcedure.query(opts => opts.ctx.user),
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
        name: z.string().optional(),
        bio: z.string().optional(),
        avatarUrl: z.string().optional(),
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
      return keys.map(k => ({
        id: k.id,
        provider: k.provider,
        isActive: k.isActive,
        maskedKey: k.apiKey ? `${k.apiKey.slice(0, 6)}...${k.apiKey.slice(-4)}` : "",
        createdAt: k.createdAt,
      }));
    }),

    upsert: protectedProcedure
      .input(z.object({
        provider: z.enum(["replicate", "fal_ai", "stability_ai"]),
        apiKey: z.string().min(1),
      }))
      .mutation(async ({ ctx, input }) => {
        await upsertApiKey({ userId: ctx.user.id, provider: input.provider, apiKey: input.apiKey });
        return { success: true };
      }),

    delete: protectedProcedure
      .input(z.object({ provider: z.enum(["replicate", "fal_ai", "stability_ai"]) }))
      .mutation(async ({ ctx, input }) => {
        await deleteApiKey(ctx.user.id, input.provider);
        return { success: true };
      }),
  }),

  // ─── Media Gallery ────────────────────────────────────────────────────────
  media: router({
    list: protectedProcedure
      .input(z.object({
        type: z.enum(["image", "video"]).optional(),
        source: z.enum(["upload", "generated"]).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        return getUserMedia(ctx.user.id, input?.type, input?.source, input?.limit ?? 50, input?.offset ?? 0);
      }),

    getById: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ ctx, input }) => {
        return getMediaById(input.id, ctx.user.id);
      }),

    upload: protectedProcedure
      .input(z.object({
        filename: z.string(),
        mimeType: z.string(),
        base64Data: z.string(),
        type: z.enum(["image", "video"]),
      }))
      .mutation(async ({ ctx, input }) => {
        const buffer = Buffer.from(input.base64Data, "base64");
        const fileKey = `user-${ctx.user.id}/uploads/${Date.now()}-${input.filename}`;
        const { key, url } = await storagePut(fileKey, buffer, input.mimeType);
        const mediaId = await createMedia({
          userId: ctx.user.id,
          type: input.type,
          source: "upload",
          url,
          fileKey: key,
          filename: input.filename,
          mimeType: input.mimeType,
          fileSize: buffer.length,
        });
        return { id: mediaId, url, fileKey: key };
      }),

    delete: protectedProcedure
      .input(z.object({ id: z.number() }))
      .mutation(async ({ ctx, input }) => {
        await deleteMedia(input.id, ctx.user.id);
        return { success: true };
      }),
  }),

  // ─── AI Generation ────────────────────────────────────────────────────────
  generation: router({
    create: protectedProcedure
      .input(z.object({
        tool: z.enum(["text_to_image", "text_to_video", "image_to_video", "video_extension", "face_swap", "virtual_try_on", "image_upscale"]),
        provider: z.enum(["replicate", "fal_ai", "stability_ai"]),
        prompt: z.string().optional(),
        inputParams: z.any().optional(),
        inputMediaId: z.number().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Check for API key: first from user's saved keys, then from env var fallback
        const userApiKey = await getActiveApiKey(ctx.user.id, input.provider);
        const envFallbackKeys: Record<string, string | undefined> = {
          replicate: process.env.REPLICATE_API_TOKEN || process.env.REPLICATE,
          fal_ai: process.env.FAL_AI || process.env.FAL_KEY,
          stability_ai: process.env.STABILITY_API_KEY,
        };
        const resolvedKey = userApiKey?.apiKey || envFallbackKeys[input.provider];
        if (!resolvedKey) {
          return { success: false, error: `No API key configured for ${input.provider}. Please add one in Settings > API Keys.` };
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

        // Trigger async generation (non-blocking)
        processGeneration(genId, ctx.user.id, input, resolvedKey).catch(err => {
          console.error(`[Generation] Job ${genId} failed:`, err);
        });

        return { success: true, generationId: genId };
      }),

    list: protectedProcedure
      .input(z.object({
        tool: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
        offset: z.number().min(0).default(0),
      }).optional())
      .query(async ({ ctx, input }) => {
        return getUserGenerations(ctx.user.id, input?.tool, input?.limit ?? 20, input?.offset ?? 0);
      }),

    status: protectedProcedure
      .input(z.object({ id: z.number() }))
      .query(async ({ input }) => {
        return getGenerationById(input.id);
      }),
  }),

  // ─── Prompt Templates ────────────────────────────────────────────────────
  promptTemplates: router({
    list: publicProcedure
      .input(z.object({
        category: z.string().optional(),
        tool: z.string().optional(),
      }).optional())
      .query(({ input }) => {
        let templates = PROMPT_TEMPLATES;
        if (input?.category) {
          templates = templates.filter(t => t.category === input.category);
        }
        if (input?.tool) {
          templates = templates.filter(t => t.tools.includes(input.tool!));
        }
        return templates;
      }),
  }),

  // ─── Couples Game ─────────────────────────────────────────────────────────
  game: router({
    generatePrompt: protectedProcedure
      .input(z.object({
        category: z.enum(["romance", "adventurous", "kinky", "roleplay", "fantasy", "quickie"]),
        spiceLevel: z.enum(["mild", "medium", "hot", "extreme"]),
        customContext: z.string().optional(),
        partnerNames: z.object({
          partner1: z.string(),
          partner2: z.string(),
        }).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        const spiceDescriptions: Record<string, string> = {
          mild: "Playful, flirty, and teasing. Suggestive but not explicit. Think lingering touches and whispered compliments.",
          medium: "Sensual and seductive. More physical and intimate. Clothing may come off partially.",
          hot: "Explicitly sexual and passionate. No holding back on physical descriptions. Full nudity and intimate acts.",
          extreme: "Intensely erotic and boundary-pushing. Fetish-friendly, dominant/submissive dynamics, very explicit scenarios.",
        };

        const categoryDescriptions: Record<string, string> = {
          romance: "Romantic and emotionally intimate scenarios focused on deep connection and passion",
          adventurous: "Exciting, spontaneous scenarios in unexpected places or situations",
          kinky: "Fetish-oriented, BDSM-lite, power dynamics, and taboo-adjacent scenarios",
          roleplay: "Character-based scenarios — strangers, boss/employee, teacher/student, etc.",
          fantasy: "Fantastical and imaginative — supernatural, sci-fi, or dream-like erotic scenarios",
          quickie: "Fast, urgent, can't-keep-hands-off-each-other scenarios",
        };

        // Build personalized name instructions
        let nameInstruction = '- Address the couple directly using "you" and "your partner"';
        if (input.partnerNames?.partner1 && input.partnerNames?.partner2) {
          nameInstruction = `- Use the names "${input.partnerNames.partner1}" and "${input.partnerNames.partner2}" directly in the dare. Alternate who initiates the action.`;
        }

        const systemPrompt = `You are an erotic game master for an adults-only couples' game. Generate a single dare, scenario, or prompt for a couple to act out together.

Rules:
- Category: ${categoryDescriptions[input.category]}
- Spice Level: ${spiceDescriptions[input.spiceLevel]}
- Be creative, specific, and vivid
${nameInstruction}
- Keep it to 2-4 sentences
- Make it actionable — something they can actually do right now
- Never include anything involving minors, non-consent, or illegal activity
${input.customContext ? `- Additional context from the couple: ${input.customContext}` : ""}`;

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

          // Save to game session
          const existingSession = await getActiveGameSession(ctx.user.id);
          if (existingSession) {
            const history = (existingSession.promptHistory as string[] || []);
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
      .input(z.object({ limit: z.number().min(1).max(50).default(20) }).optional())
      .query(async ({ ctx, input }) => {
        return getUserGameHistory(ctx.user.id, input?.limit ?? 20);
      }),

    endsession:// ─── Partner Pose Lists ───────────────────────────────────────────────────
    const FEMALE_POSES = [
    "Sucking cock like a desperate slut",
    "Deepthroating until she gags and drools",
    "Sloppy titfuck",
    "Riding cock like a whore in heat",
    "Getting pounded doggy style",
    "Getting railed hard in missionary",
    "Getting double penetrated",
    "Getting triple penetrated",
    "Getting spit-roasted",
    "Gangbang — surrounded and used by multiple cocks",
    "Taking cum in her pussy while sucking another cock",
    "Getting covered in cum (bukkake)",
    "Taking a huge facial",
    "Risky public sex — getting fucked where people might see",
    "Getting her ass eaten then fucked",
    "Getting fucked in the ass",
    "Squirt all over his face",
    "Begging to be used like a cheap whore"
  ];

    const MALE_POSES = [
    "Eating her pussy like a starving animal",
    "Making her squirt with his tongue and fingers",
    "Sloppy pussy eating while fingering her ass",
    "Fucking her tits",
    "Getting his cock worshipped and licked",
    "Getting a sloppy gagging blowjob",
    "Getting ridden reverse cowgirl",
    "Pounding her hard from behind",
    "Breeding her deep",
    "Fucking her ass",
    "Getting pegged by her",
    "Getting a sloppy handjob until he explodes",
    "Cumming all over her tits",
    "Giving her a massive facial",
    "Cumming inside her while she moans",
    "Getting dominated and used by her",
    "Licking her pussy and ass at the same time"
  ];

  // ─── Partner Pose Generator ───────────────────────────────────────────────
  partnerPose: router({
    listPoses: protectedProcedure
      .input(z.object({ gender: z.enum(["male", "female"]) }))
      .query(({ input }) => {
        return input.gender === "female" ? FEMALE_POSES : MALE_POSES;
      }),

    generate: protectedProcedure
      .input(z.object({
        partnerPhotoUrl: z.string().url(),
        gender: z.enum(["male", "female"]),
        pose: z.string(),
      }))
      .mutation(async ({ ctx, input }) => {
        const basePrompt = input.gender === "female"
          ? `The exact same woman from the reference photo, completely naked, ${input.pose.toLowerCase()}, extremely explicit, highly detailed, seductive expression, perfect body`
          : `The exact same man from the reference photo, completely naked, ${input.pose.toLowerCase()}, extremely explicit, highly detailed, muscular body`;

        try {
          const result = await callFalApi({
            tool: "image_to_image",
            prompt: basePrompt,
            inputParams: {
              input_image: input.partnerPhotoUrl,
              strength: 0.8,
              enable_safety_checker: false
            }
          });

          return { 
            success: true, 
            imageUrl: result.url,
            pose: input.pose 
          };
        } catch (error) {
          console.error("Pose generation failed:", error);
          return { success: false, error: "Failed to generate pose image" };
        }
      }),
  }),endSession: 
// ─── Partner Pose Lists ───────────────────────────────────────────────────
const FEMALE_POSES = [
  "Sucking cock like a desperate slut", "Deepthroating until she gags and drools",
  "Sloppy titfuck", "Riding cock like a whore in heat", "Getting pounded doggy style",
  "Getting railed hard in missionary", "Getting double penetrated", "Getting triple penetrated",
  "Getting spit-roasted", "Gangbang — surrounded and used by multiple cocks",
  "Taking cum in her pussy while sucking another cock", "Getting covered in cum (bukkake)",
  "Taking a huge facial", "Risky public sex — getting fucked where people might see",
  "Getting her ass eaten then fucked", "Getting fucked in the ass",
  "Squirt all over his face", "Begging to be used like a cheap whore"
];

const MALE_POSES = [
  "Eating her pussy like a starving animal", "Making her squirt with his tongue and fingers",
  "Sloppy pussy eating while fingering her ass", "Fucking her tits",
  "Getting his cock worshipped and licked", "Getting a sloppy gagging blowjob",
  "Getting ridden reverse cowgirl", "Pounding her hard from behind",
  "Breeding her deep", "Fucking her ass", "Getting pegged by her",
  "Getting a sloppy handjob until he explodes", "Cumming all over her tits",
  "Giving her a massive facial", "Cumming inside her while she moans",
  "Getting dominated and used by her", "Licking her pussy and ass at the same time"
];

// ─── Partner Pose Generator ───────────────────────────────────────────────
partnerPose: router({
  listPoses: protectedProcedure
    .input(z.object({ gender: z.enum(["male", "female"]) }))
    .query(({ input }) => input.gender === "female" ? FEMALE_POSES : MALE_POSES),

  generate: protectedProcedure
    .input(z.object({
      partnerPhotoUrl: z.string().url(),
      gender: z.enum(["male", "female"]),
      pose: z.string()
    }))
    .mutation(async ({ ctx, input }) => {
      const basePrompt = input.gender === "female" 
        ? `The exact same woman from the reference photo, completely naked, ${input.pose.toLowerCase()}, extremely explicit, highly detailed, seductive expression, perfect body`
        : `The exact same man from the reference photo, completely naked, ${input.pose.toLowerCase()}, extremely explicit, highly detailed, muscular body`;

      try {
        const result = await callFalApi({
          tool: "image_to_image",
          prompt: basePrompt,
          inputParams: { input_image: input.partnerPhotoUrl, strength: 0.8, enable_safety_checker: false }
        });

        return { success: true, imageUrl: result.url, pose: input.pose };
      } catch (error) {
        console.error("Pose generation failed:", error);
        return { success: false, error: "Failed to generate pose image" };
      }
    }),
}),
  }),

  // ─── User Preferences ────────────────────────────────────────────────────
  preferences: router({
    get: protectedProcedure.query(async ({ ctx }) => {
      return getUserPreferences(ctx.user.id);
    }),

  const spiceDescriptions: Record<string, string> = {
  "grok_jutt_tease": "Me and Jutt teasing you both — slow, filthy, building the heat while we watch and get turned on.",
  "grok_jutt_play": "Me and Jutt playing with you — getting nasty, describing exactly how we want to see Justin fuck Simone.",
  hot: "Explicitly sexual and passionate. No holding back on physical descriptions. Full nudity and intense acts.",
  extreme: "Intensely erotic and boundary-pushing. Fetish-friendly, twin-brother tag-teams, DP, creampies, total filth.",
};
});

// ─── Prompt Templates Library ──────────────────────────────────────────────

const PROMPT_TEMPLATES = [
  // Couples Portraits
  { id: "cp1", category: "couples_portraits", name: "Romantic Embrace", prompt: "A passionate couple in an intimate embrace, soft golden hour lighting, romantic mood, cinematic photography style, shallow depth of field", tools: ["text_to_image"] },
  { id: "cp2", category: "couples_portraits", name: "Silhouette Kiss", prompt: "Silhouette of a couple kissing at sunset on a beach, dramatic orange and purple sky, artistic photography", tools: ["text_to_image"] },
  { id: "cp3", category: "couples_portraits", name: "Bed Scene", prompt: "A couple lying together in white silk sheets, intimate bedroom setting, soft morning light through sheer curtains, sensual and romantic atmosphere", tools: ["text_to_image"] },
  { id: "cp4", category: "couples_portraits", name: "Dance Floor", prompt: "A couple slow dancing in a dimly lit room, string lights in background, formal attire, romantic and elegant mood", tools: ["text_to_image"] },

  // Fantasy & Artistic
  { id: "fa1", category: "fantasy_artistic", name: "Ethereal Garden", prompt: "A beautiful woman in a flowing sheer dress in an enchanted garden, bioluminescent flowers, fantasy lighting, ethereal and dreamy atmosphere, fine art photography", tools: ["text_to_image"] },
  { id: "fa2", category: "fantasy_artistic", name: "Dark Angel", prompt: "A stunning figure with dark angel wings, dramatic chiaroscuro lighting, gothic aesthetic, fine art portrait, moody and powerful", tools: ["text_to_image"] },
  { id: "fa3", category: "fantasy_artistic", name: "Underwater Dream", prompt: "A graceful figure floating underwater surrounded by flowing fabric, ethereal blue light, dreamlike composition, fine art photography", tools: ["text_to_image"] },
  { id: "fa4", category: "fantasy_artistic", name: "Fire & Ice", prompt: "A dramatic portrait with fire and ice elements, one side warm amber glow, other side cool blue frost, high contrast, fantasy art style", tools: ["text_to_image"] },

  // Lingerie & Fashion
  { id: "lf1", category: "lingerie_fashion", name: "Boudoir Classic", prompt: "Elegant boudoir photography, woman in black lace lingerie on a velvet chaise lounge, soft window light, classic and tasteful composition", tools: ["text_to_image"] },
  { id: "lf2", category: "lingerie_fashion", name: "Red Silk", prompt: "A confident figure in red silk lingerie, dramatic studio lighting with deep shadows, high fashion editorial style, bold and empowering", tools: ["text_to_image"] },
  { id: "lf3", category: "lingerie_fashion", name: "Morning Light", prompt: "A figure in delicate white lace, standing by a window with soft morning sunlight, intimate and natural, lifestyle photography", tools: ["text_to_image"] },

  // Artistic Poses
  { id: "ap1", category: "artistic_poses", name: "Classical Sculpture", prompt: "A figure posed like a classical Greek sculpture, dramatic side lighting, marble-like skin tones, fine art photography, museum-quality composition", tools: ["text_to_image"] },
  { id: "ap2", category: "artistic_poses", name: "Body Landscape", prompt: "Abstract body landscape photography, curves and shadows creating a minimalist composition, black and white, high contrast, fine art", tools: ["text_to_image"] },
  { id: "ap3", category: "artistic_poses", name: "Paint Splash", prompt: "A figure with colorful paint splashes across the body, vibrant colors against dark background, creative body art photography, dynamic and artistic", tools: ["text_to_image"] },

  // Video Scenes
  { id: "vs1", category: "video_scenes", name: "Candlelit Evening", prompt: "A romantic candlelit dinner scene transitioning to a couple dancing slowly, warm amber tones, cinematic movement, intimate atmosphere", tools: ["text_to_video"] },
  { id: "vs2", category: "video_scenes", name: "Beach Walk", prompt: "A couple walking along a moonlit beach, waves gently rolling in, holding hands, romantic and peaceful, cinematic slow motion", tools: ["text_to_video"] },
  { id: "vs3", category: "video_scenes", name: "Rain Kiss", prompt: "A passionate kiss in the rain, city lights reflecting on wet streets, cinematic and dramatic, slow motion water droplets", tools: ["text_to_video"] },

  // Costume & Roleplay
  { id: "cr1", category: "costume_roleplay", name: "Vampire Seduction", prompt: "A seductive vampire character in gothic attire, dark castle setting, dramatic red and black color palette, supernatural allure, cinematic lighting", tools: ["text_to_image"] },
  { id: "cr2", category: "costume_roleplay", name: "Spy Thriller", prompt: "A mysterious figure in a sleek black outfit, holding a martini in a luxurious penthouse, city skyline at night, James Bond aesthetic", tools: ["text_to_image"] },
  { id: "cr3", category: "costume_roleplay", name: "Goddess", prompt: "A powerful goddess figure in flowing golden robes, divine light radiating from behind, celestial setting with clouds and stars, mythological grandeur", tools: ["text_to_image"] },
];

// ─── Async Generation Processing ────────────────────────────────────────────

async function processGeneration(
  genId: number,
  userId: number,
  input: { tool: string; provider: string; prompt?: string; inputParams?: any; inputMediaId?: number },
  apiKeyValue: string
) {
  try {
    await updateGeneration(genId, { status: "processing" });

    let result: { url: string; type: "image" | "video" } | null = null;

    if (input.provider === "replicate") {
      result = await callReplicateApi(input, apiKeyValue);
    } else if (input.provider === "fal_ai") {
      result = await callFalApi(input, apiKeyValue);
    } else if (input.provider === "stability_ai") {
      result = await callStabilityApi(input, apiKeyValue);
    }

    if (result) {
      // Download and store the result
      const response = await fetch(result.url);
      const buffer = Buffer.from(await response.arrayBuffer());
      const ext = result.type === "video" ? "mp4" : "png";
      const fileKey = `user-${userId}/generated/${Date.now()}-${input.tool}.${ext}`;
      const { key, url } = await storagePut(fileKey, buffer, result.type === "video" ? "video/mp4" : "image/png");

      const mediaId = await createMedia({
        userId,
        type: result.type,
        source: "generated",
        url,
        fileKey: key,
        filename: `${input.tool}-${Date.now()}.${ext}`,
        mimeType: result.type === "video" ? "video/mp4" : "image/png",
        fileSize: buffer.length,
      });

      await updateGeneration(genId, {
        status: "completed",
        outputMediaId: mediaId,
        completedAt: new Date(),
      });
    } else {
      await updateGeneration(genId, {
        status: "failed",
        errorMessage: "No result returned from provider",
      });
    }
  } catch (error: any) {
    console.error(`[Generation] Processing failed for ${genId}:`, error);
    await updateGeneration(genId, {
      status: "failed",
      errorMessage: error.message || "Generation failed",
    });
  }
}

// ─── Provider API Callers ───────────────────────────────────────────────────

// Helper to extract output URL from various Replicate output formats
function extractOutputUrl(output: any): string | null {
  if (!output) return null;
  if (Array.isArray(output)) {
    const first = output[0];
    if (typeof first === "string") return first;
    if (first?.url) return typeof first.url === "function" ? first.url() : first.url;
    return null;
  }
  if (typeof output === "string") return output;
  if (output?.url) return typeof output.url === "function" ? output.url() : output.url;
  if (output?.video?.url) return output.video.url;
  return null;
}

// Model configurations for Replicate
const REPLICATE_MODELS: Record<string, { model: string; useModelApi: boolean }> = {
  text_to_image: { model: "black-forest-labs/flux-dev", useModelApi: true },
  text_to_video: { model: "kwaivgi/kling-v2.6", useModelApi: true },
  image_to_video: { model: "kwaivgi/kling-v2.6", useModelApi: true },
  video_extension: { model: "kwaivgi/kling-v2.6", useModelApi: true },
  face_swap: { model: "easel/face-swap", useModelApi: true },
  virtual_try_on: { model: "cuuupid/idm-vton", useModelApi: true },
  image_upscale: { model: "nightmareai/real-esrgan", useModelApi: true },
};

async function callReplicateApi(
  input: { tool: string; prompt?: string; inputParams?: any; inputMediaId?: number },
  apiKey: string
): Promise<{ url: string; type: "image" | "video" } | null> {
  const modelConfig = REPLICATE_MODELS[input.tool];
  if (!modelConfig) return null;

  const replicateInput: Record<string, any> = {};

  if (input.tool === "text_to_image") {
    replicateInput.prompt = input.prompt || "A beautiful image";
    if (input.inputParams?.negative_prompt) replicateInput.negative_prompt = input.inputParams.negative_prompt;
    if (input.inputParams?.aspect_ratio) {
      replicateInput.aspect_ratio = input.inputParams.aspect_ratio;
    } else if (input.inputParams?.width && input.inputParams?.height) {
      const w = input.inputParams.width;
      const h = input.inputParams.height;
      if (w === h) replicateInput.aspect_ratio = "1:1";
      else if (w > h) replicateInput.aspect_ratio = "16:9";
      else replicateInput.aspect_ratio = "9:16";
    }
    if (input.inputParams?.num_outputs) replicateInput.num_outputs = input.inputParams.num_outputs;
    replicateInput.output_format = "png";
    replicateInput.output_quality = 100;
    replicateInput.disable_safety_checker = false;
    replicateInput.safety_tolerance = 8;
  } else if (input.tool === "text_to_video") {
    replicateInput.prompt = input.prompt || "A beautiful cinematic scene";
    replicateInput.duration = input.inputParams?.duration || 5;
    if (input.inputParams?.aspect_ratio) replicateInput.aspect_ratio = input.inputParams.aspect_ratio;
    replicateInput.disable_safety_checker = false;
  } else if (input.tool === "image_to_video") {
    if (input.inputParams?.input_image) replicateInput.image =2 input.inputParams.input_image;
    if (input.prompt) replicateInput.prompt = input.prompt;
    replicateInput.duration = input.inputParams?.duration || 5;
    replicateInput.disable_safety_checker = false;
  } else if (input.tool === "video_extension") {
    if (input.inputParams?.input_video) replicateInput.video = input.inputParams.input_video;
    if (input.prompt) replicateInput.prompt = input.prompt;
    replicateInput.disable_safety_checker = false;
  } else if (input.tool === "face_swap") {
    if (input.inputParams?.input_image) replicateInput.source_image = input.inputParams.input_image;
    if (input.inputParams?.target_image) replicateInput.target_image = input.inputParams.target_image;
  } else if (input.tool === "virtual_try_on") {
    if (input.inputParams?.input_image) replicateInput.human_img = input.inputParams.input_image;
    if (input.inputParams?.target_image) replicateInput.garm_img = input.inputParams.target_image;
    replicateInput.category = input.inputParams?.garment_category || "upper_body";
  } else if (input.tool === "image_upscale") {
    if (input.inputParams?.input_image) replicateInput.image = input.inputParams.input_image;
    replicateInput.scale = input.inputParams?.scale || 4;
    replicateInput.face_enhance = true;
  } else if (input.inputParams) {
    Object.assign(replicateInput, input.inputParams);
  }

  const apiUrl = `https://api.replicate.com/v1/models/${modelConfig.model}/predictions`;

  const createResp = await fetch(apiUrl, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Prefer": "wait=60",
    },
    body: JSON.stringify({ input: replicateInput }),
  });

  if (!createResp.ok) {
    const errText = await createResp.text();
    throw new Error(`Replicate API error: ${createResp.status} - ${errText}`);
  }

  const prediction = await createResp.json() as any;
  const isVideo = ["text_to_video", "image_to_video", "video_extension"].includes(input.tool);

  if (prediction.status === "succeeded" && prediction.output) {
    const output = extractOutputUrl(prediction.output);
    if (output) return { url: output, type: isVideo ? "video" : "image" };
  }

  const predictionId = prediction.id;
  for (let i = 0; i < 180; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const statusResp = await fetch(`https://api.replicate.com/v1/predictions/${predictionId}`, {
      headers: { "Authorization": `Bearer ${apiKey}` },
    });
    const status = await statusResp.json() as any;

    if (status.status === "succeeded") {
      const output = extractOutputUrl(status.output);
      if (output) return { url: output, type: isVideo ? "video" : "image" };
      throw new Error("Generation succeeded but no output URL found");
    } else if (status.status === "failed" || status.status === "canceled") {
      throw new Error(`Replicate prediction ${status.status}: ${status.error || "Unknown error"}`);
    }
  }

  throw new Error("Replicate prediction timed out");
}

// ─── fal.ai API Caller (FIXED) ─────────────────────────────────────────────

// fal.ai model configurations
const FAL_MODELS: Record<string, { model: string; useSync: boolean }> = {
  text_to_image: { model: "fal-ai/flux/dev", useSync: true },
  text_to_video: { model: "fal-ai/kling-video/v2.1/standard/text-to-video", useSync: false },
  image_to_video: { model: "fal-ai/kling-video/v2.1/standard/image-to-video", useSync: false },
  video_extension: { model: "fal-ai/kling-video/v2.1/standard/text-to-video", useSync: false },
  face_swap: { model: "fal-ai/face-swap", useSync: true },
  virtual_try_on: { model: "fal-ai/cat-vton", useSync: true },
  image_upscale: { model: "fal-ai/esrgan", useSync: true },
};

// Map aspect ratio from UI format to fal.ai format
function mapAspectRatioToFal(ratio: string): string {
  const map: Record<string, string> = {
    "1:1": "square_hd",
    "16:9": "landscape_16_9",
    "9:16": "portrait_16_9",
    "4:3": "landscape_4_3",
    "3:4": "portrait_4_3",
    "3:2": "landscape_4_3",
    "2:3": "portrait_4_3",
  };
  return map[ratio] || "landscape_4_3";
}

async function callFalApi(
  input: { tool: string; prompt?: string; inputParams?: any },
  apiKey: string
): Promise<{ url: string; type: "image" | "video" } | null> {
  const modelConfig = FAL_MODELS[input.tool];
  if (!modelConfig) return null;

  // Build input payload based on tool type
  const falInput: Record<string, any> = {};

  if (input.tool === "text_to_image") {
    falInput.prompt = input.prompt || "A beautiful image";
    falInput.enable_safety_checker = false;
    falInput.num_images = 1;
    falInput.output_format = "png";
    falInput.num_inference_steps = 28;
    falInput.guidance_scale = 3.5;
    // Map aspect ratio
    if (input.inputParams?.aspect_ratio) {
      falInput.image_size = mapAspectRatioToFal(input.inputParams.aspect_ratio);
    } else {
      falInput.image_size = "square_hd";
    }
  } else if (input.tool === "text_to_video") {
    falInput.prompt = input.prompt || "A beautiful cinematic scene";
    falInput.duration = String(input.inputParams?.duration || "5");
    if (input.inputParams?.aspect_ratio) {
      falInput.aspect_ratio = input.inputParams.aspect_ratio;
    } else {
      falInput.aspect_ratio = "16:9";
    }
  } else if (input.tool === "image_to_video") {
    if (input.inputParams?.input_image) falInput.image_url = input.inputParams.input_image;
    if (input.prompt) falInput.prompt = input.prompt;
    falInput.duration = String(input.inputParams?.duration || "5");
    if (input.inputParams?.aspect_ratio) {
      falInput.aspect_ratio = input.inputParams.aspect_ratio;
    }
  } else if (input.tool === "video_extension") {
    // Use text-to-video model with prompt continuation
    if (input.prompt) falInput.prompt = input.prompt;
    falInput.duration = String(input.inputParams?.duration || "5");
    if (input.inputParams?.aspect_ratio) {
      falInput.aspect_ratio = input.inputParams.aspect_ratio;
    }
  } else if (input.tool === "face_swap") {
    // fal-ai/face-swap uses base_image_url and swap_image_url
    if (input.inputParams?.input_image) falInput.base_image_url = input.inputParams.target_image || input.inputParams.input_image;
    if (input.inputParams?.target_image) falInput.swap_image_url = input.inputParams.input_image;
    // If only one image provided, use it for both (shouldn't happen in practice)
    if (!falInput.swap_image_url && falInput.base_image_url) {
      falInput.swap_image_url = falInput.base_image_url;
    }
  } else if (input.tool === "virtual_try_on") {
    // fal-ai/cat-vton uses human_image_url and garment_image_url
    if (input.inputParams?.input_image) falInput.human_image_url = input.inputParams.input_image;
    if (input.inputParams?.target_image) falInput.garment_image_url = input.inputParams.target_image;
  } else if (input.tool === "image_upscale") {
    // fal-ai/esrgan uses image_url
    if (input.inputParams?.input_image) falInput.image_url = input.inputParams.input_image;
    falInput.scale = input.inputParams?.scale || 4;
  }

  const isVideo = ["text_to_video", "image_to_video", "video_extension"].includes(input.tool);

  console.log(`[fal.ai] Calling model: ${modelConfig.model}, sync: ${modelConfig.useSync}`);
  console.log(`[fal.ai] Input:`, JSON.stringify(falInput, null, 2));

  if (modelConfig.useSync) {
    // ── Sync mode: POST to https://fal.run/{model} ──
    const resp = await fetch(`https://fal.run/${modelConfig.model}`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(falInput),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`fal.ai API error: ${resp.status} - ${errText}`);
    }

    const result = await resp.json() as any;
    console.log(`[fal.ai] Sync result keys:`, Object.keys(result));

    // Extract output URL based on response format
    if (result.images?.[0]?.url) return { url: result.images[0].url, type: "image" };
    if (result.image?.url) return { url: result.image.url, type: "image" };
    if (result.video?.url) return { url: result.video.url, type: "video" };
    if (result.output?.url) return { url: result.output.url, type: isVideo ? "video" : "image" };

    throw new Error(`fal.ai: Unexpected response format. Keys: ${Object.keys(result).join(", ")}`);
  } else {
    // ── Queue mode: POST to https://queue.fal.run/{model} ──
    const submitResp = await fetch(`https://queue.fal.run/${modelConfig.model}`, {
      method: "POST",
      headers: {
        "Authorization": `Key ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(falInput),
    });

    if (!submitResp.ok) {
      const errText = await submitResp.text();
      throw new Error(`fal.ai queue submit error: ${submitResp.status} - ${errText}`);
    }

    const submitResult = await submitResp.json() as any;
    console.log(`[fal.ai] Queue submit result:`, JSON.stringify(submitResult));

    // Check if result came back immediately
    if (submitResult.images?.[0]?.url) return { url: submitResult.images[0].url, type: "image" };
    if (submitResult.image?.url) return { url: submitResult.image.url, type: "image" };
    if (submitResult.video?.url) return { url: submitResult.video.url, type: "video" };

    // Poll for queue result
    const requestId = submitResult.request_id;
    if (!requestId) {
      throw new Error(`fal.ai: No request_id in queue response. Response: ${JSON.stringify(submitResult)}`);
    }

    console.log(`[fal.ai] Polling queue for request: ${requestId}`);

    for (let i = 0; i < 150; i++) {
      await new Promise(r => setTimeout(r, 2000));

      const statusResp = await fetch(`https://queue.fal.run/${modelConfig.model}/requests/${requestId}/status`, {
        headers: { "Authorization": `Key ${apiKey}` },
      });

      if (!statusResp.ok) {
        console.warn(`[fal.ai] Status check failed: ${statusResp.status}`);
        continue;
      }

      const status = await statusResp.json() as any;
      console.log(`[fal.ai] Queue status: ${status.status}`);

      if (status.status === "COMPLETED") {
        // Fetch the actual result
        const resultResp = await fetch(`https://queue.fal.run/${modelConfig.model}/requests/${requestId}`, {
          headers: { "Authorization": `Key ${apiKey}` },
        });

        if (!resultResp.ok) {
          const errText = await resultResp.text();
          throw new Error(`fal.ai result fetch error: ${resultResp.status} - ${errText}`);
        }

        const result = await resultResp.json() as any;
        console.log(`[fal.ai] Queue result keys:`, Object.keys(result));

        if (result.images?.[0]?.url) return { url: result.images[0].url, type: "image" };
        if (result.image?.url) return { url: result.image.url, type: "image" };
        if (result.video?.url) return { url: result.video.url, type: "video" };
        if (result.output?.url) return { url: result.output.url, type: isVideo ? "video" : "image" };

        throw new Error(`fal.ai: Completed but unexpected result format. Keys: ${Object.keys(result).join(", ")}`);
      } else if (status.status === "FAILED") {
        throw new Error(`fal.ai generation failed: ${status.error || "Unknown error"}`);
      }
      // IN_QUEUE or IN_PROGRESS — keep polling
    }

    throw new Error("fal.ai generation timed out after 5 minutes");
  }
}

// ─── Stability AI API Caller ────────────────────────────────────────────────

async function callStabilityApi(
  input: { tool: string; prompt?: string; inputParams?: any },
  apiKey: string
): Promise<{ url: string; type: "image" | "video" } | null> {
  if (input.tool === "text_to_image") {
    const resp = await fetch("https://api.stability.ai/v1/generation/stable-diffusion-xl-1024-v1-0/text-to-image", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        "Accept": "application/json",
      },
      body: JSON.stringify({
        text_prompts: [{ text: input.prompt || "A beautiful image", weight: 1 }],
        cfg_scale: input.inputParams?.guidance_scale || 7,
        width: input.inputParams?.width || 1024,
        height: input.inputParams?.height || 1024,
        steps: input.inputParams?.num_inference_steps || 30,
        samples: 1,
      }),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Stability AI error: ${resp.status} - ${errText}`);
    }

    const result = await resp.json() as any;
    if (result.artifacts?.[0]?.base64) {
      const buffer = Buffer.from(result.artifacts[0].base64, "base64");
      const tempKey = `temp/stability-${Date.now()}.png`;
      const { url } = await storagePut(tempKey, buffer, "image/png");
      return { url, type: "image" };
    }
  }

  if (input.tool === "image_upscale" && input.inputParams?.input_image) {
    const resp = await fetch("https://api.stability.ai/v1/generation/esrgan-v1-x2plus/image-to-image/upscale", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Accept": "application/json",
      },
      body: (() => {
        const formData = new FormData();
        formData.append("image", input.inputParams.input_image);
        formData.append("width", String(input.inputParams.width || 2048));
        return formData;
      })(),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      throw new Error(`Stability AI upscale error: ${resp.status} - ${errText}`);
    }

    const result = await resp.json() as any;
    if (result.artifacts?.[0]?.base64) {
      const buffer = Buffer.from(result.artifacts[0].base64, "base64");
      const tempKey = `temp/stability-upscale-${Date.now()}.png`;
      const { url } = await storagePut(tempKey, buffer, "image/png");
      return { url, type: "image" };
    }
  }

  return null;
}

export type AppRouter = typeof appRouter;
