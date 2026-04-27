import { useState, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import {
  ArrowLeft,
  Wand2,
  Loader2,
  ImageIcon,
  Video,
  Film,
  FastForward,
  Users,
  Shirt,
  ZoomIn,
  Upload,
  X,
  Download,
  RefreshCw,
  BookOpen,
  Clock,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useLocation } from "wouter";

type ToolType = "text_to_image" | "text_to_video" | "image_to_video" | "video_extension" | "face_swap" | "virtual_try_on" | "image_upscale";

const toolConfig: Record<string, {
  tool: ToolType;
  title: string;
  description: string;
  modelInfo: string;
  icon: any;
  hasPrompt: boolean;
  hasImageInput: boolean;
  hasVideoInput: boolean;
  hasNegativePrompt: boolean;
  hasDimensions: boolean;
  hasAspectRatio: boolean;
  hasSteps: boolean;
  hasGuidance: boolean;
  hasDuration: boolean;
  outputType: "image" | "video";
}> = {
  "text-to-image": {
    tool: "text_to_image",
    title: "Text to Image",
    description: "Describe what you want to see and let AI create it. No filters, no limits.",
    modelInfo: "FLUX.1 Dev via fal.ai • ~$0.04/image",
    icon: ImageIcon,
    hasPrompt: true,
    hasImageInput: false,
    hasVideoInput: false,
    hasNegativePrompt: true,
    hasDimensions: false,
    hasAspectRatio: true,
    hasSteps: false,
    hasGuidance: false,
    hasDuration: false,
    outputType: "image",
  },
  "text-to-video": {
    tool: "text_to_video",
    title: "Text to Video",
    description: "Describe a scene and watch it come to life as a video.",
    modelInfo: "Kling v2.1 via fal.ai • ~$0.10/video",
    icon: Video,
    hasPrompt: true,
    hasImageInput: false,
    hasVideoInput: false,
    hasNegativePrompt: false,
    hasDimensions: false,
    hasAspectRatio: true,
    hasSteps: false,
    hasGuidance: false,
    hasDuration: true,
    outputType: "video",
  },
  "image-to-video": {
    tool: "image_to_video",
    title: "Image to Video",
    description: "Upload a still image and animate it into a video.",
    modelInfo: "Kling v2.1 via fal.ai • ~$0.10/video",
    icon: Film,
    hasPrompt: true,
    hasImageInput: true,
    hasVideoInput: false,
    hasNegativePrompt: false,
    hasDimensions: false,
    hasAspectRatio: false,
    hasSteps: false,
    hasGuidance: false,
    hasDuration: true,
    outputType: "video",
  },
  "video-extension": {
    tool: "video_extension",
    title: "Video Extension",
    description: "Extend an existing video with AI-generated continuation.",
    modelInfo: "Kling v2.1 via fal.ai • ~$0.10/video",
    icon: FastForward,
    hasPrompt: true,
    hasImageInput: false,
    hasVideoInput: true,
    hasNegativePrompt: false,
    hasDimensions: false,
    hasAspectRatio: false,
    hasSteps: false,
    hasGuidance: false,
    hasDuration: true,
    outputType: "video",
  },
  "face-swap": {
    tool: "face_swap",
    title: "Face Swap",
    description: "Upload a source face and a target image to swap faces.",
    modelInfo: "Face Swap via fal.ai • ~$0.02/swap",
    icon: Users,
    hasPrompt: false,
    hasImageInput: true,
    hasVideoInput: false,
    hasNegativePrompt: false,
    hasDimensions: false,
    hasAspectRatio: false,
    hasSteps: false,
    hasGuidance: false,
    hasDuration: false,
    outputType: "image",
  },
  "virtual-try-on": {
    tool: "virtual_try_on",
    title: "Virtual Try-On",
    description: "Upload a photo and a garment to see how it looks on you.",
    modelInfo: "CatVTON via fal.ai • ~$0.03/try-on",
    icon: Shirt,
    hasPrompt: false,
    hasImageInput: true,
    hasVideoInput: false,
    hasNegativePrompt: false,
    hasDimensions: false,
    hasAspectRatio: false,
    hasSteps: false,
    hasGuidance: false,
    hasDuration: false,
    outputType: "image",
  },
  "image-upscale": {
    tool: "image_upscale",
    title: "Image Upscale",
    description: "Enhance and upscale image resolution with AI.",
    modelInfo: "ESRGAN via fal.ai • ~$0.01/upscale",
    icon: ZoomIn,
    hasPrompt: false,
    hasImageInput: true,
    hasVideoInput: false,
    hasNegativePrompt: false,
    hasDimensions: false,
    hasAspectRatio: false,
    hasSteps: false,
    hasGuidance: false,
    hasDuration: false,
    outputType: "image",
  },
};

export default function CreateTool({ toolSlug }: { toolSlug: string }) {
  const [, setLocation] = useLocation();
  const config = toolConfig[toolSlug];

  const [prompt, setPrompt] = useState("");
  const [negativePrompt, setNegativePrompt] = useState("");
  const [provider, setProvider] = useState("fal_ai");
  const [width, setWidth] = useState(1024);
  const [height, setHeight] = useState(1024);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [duration, setDuration] = useState("5");
  const [steps, setSteps] = useState([30]);
  const [guidance, setGuidance] = useState([7]);
  const [inputImage, setInputImage] = useState<string | null>(null);
  const [inputImagePreview, setInputImagePreview] = useState<string | null>(null);
  const [secondImage, setSecondImage] = useState<string | null>(null);
  const [secondImagePreview, setSecondImagePreview] = useState<string | null>(null);
  const [inputVideo, setInputVideo] = useState<string | null>(null);
  const [generationId, setGenerationId] = useState<number | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);

  const createMutation = trpc.generation.create.useMutation();

  // Fetch prompt templates for this tool
  const templatesQuery = trpc.promptTemplates.list.useQuery(
    { tool: config?.tool },
    { enabled: !!config }
  );

  // Poll for generation status
  const statusQuery = trpc.generation.status.useQuery(
    { id: generationId! },
    {
      enabled: generationId !== null,
      refetchInterval: (query) => {
        const data = query.state.data;
        if (data?.status === "completed" || data?.status === "failed") return false;
        return 2000;
      },
    }
  );

  // Get the output media if generation is complete
  const outputMediaQuery = trpc.media.getById.useQuery(
    { id: statusQuery.data?.outputMediaId! },
    { enabled: statusQuery.data?.status === "completed" && !!statusQuery.data?.outputMediaId }
  );

  const handleFileUpload = useCallback((file: File, setImage: (v: string | null) => void, setPreview: (v: string | null) => void) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const base64 = (e.target?.result as string).split(",")[1];
      setImage(base64);
      setPreview(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  }, []);

  const handleGenerate = async () => {
    if (config.hasPrompt && !prompt.trim() && !inputImage) {
      toast.error("Please enter a prompt or upload an image.");
      return;
    }
    if (config.hasImageInput && !inputImage) {
      toast.error("Please upload an image.");
      return;
    }

    setIsGenerating(true);
    setGenerationId(null);

    try {
      const inputParams: Record<string, any> = {};
      if (negativePrompt) inputParams.negative_prompt = negativePrompt;
      if (config.hasDimensions) {
        inputParams.width = width;
        inputParams.height = height;
      }
      if (config.hasAspectRatio) {
        inputParams.aspect_ratio = aspectRatio;
        const [aw, ah] = aspectRatio.split(":").map(Number);
        if (aw > ah) { inputParams.width = 1280; inputParams.height = 720; }
        else if (ah > aw) { inputParams.width = 720; inputParams.height = 1280; }
        else { inputParams.width = 1024; inputParams.height = 1024; }
      }
      if (config.hasDuration) {
        inputParams.duration = duration;
      }
      if (config.hasSteps) inputParams.num_inference_steps = steps[0];
      if (config.hasGuidance) inputParams.guidance_scale = guidance[0];
      if (inputImage) inputParams.input_image = `data:image/png;base64,${inputImage}`;
      if (secondImage) inputParams.target_image = `data:image/png;base64,${secondImage}`;

      const result = await createMutation.mutateAsync({
        tool: config.tool,
        provider: provider as any,
        prompt: prompt || undefined,
        inputParams,
      });

      if (result.success && result.generationId) {
        setGenerationId(result.generationId);
        toast.success("Generation started! Processing...");
      } else {
        toast.error(result.error || "Failed to start generation.");
        setIsGenerating(false);
      }
    } catch (error: any) {
      toast.error(error.message || "Failed to start generation.");
      setIsGenerating(false);
    }
  };

  // Reset generating state when complete
  const isComplete = statusQuery.data?.status === "completed";
  const isFailed = statusQuery.data?.status === "failed";

  if (!config) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-6">
        <p className="text-muted-foreground">Tool not found.</p>
        <Button variant="ghost" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-4 w-4 mr-2" /> Back
        </Button>
      </div>
    );
  }

  const Icon = config.icon;
  const templates = templatesQuery.data || [];

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")} className="shrink-0">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h1 className="font-semibold text-lg">{config.title}</h1>
            <p className="text-sm text-muted-foreground">{config.description}</p>
            <p className="text-xs text-primary/70 mt-0.5">{config.modelInfo}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        {/* Provider Selection */}
        <Card className="glass-card border-border/30">
          <CardContent className="p-4">
            <Label className="text-sm font-medium mb-2 block">AI Provider</Label>
            <Select value={provider} onValueChange={setProvider}>
              <SelectTrigger className="bg-secondary/30">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fal_ai">fal.ai (Recommended)</SelectItem>
                <SelectItem value="replicate">Replicate</SelectItem>
                <SelectItem value="stability_ai">Stability AI</SelectItem>
              </SelectContent>
            </Select>
            {provider === "replicate" && (
              <p className="text-xs text-yellow-400/80 mt-2">
                Note: Replicate may block some NSFW content. fal.ai is recommended for uncensored generation.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Prompt Templates */}
        {config.hasPrompt && templates.length > 0 && (
          <Card className="glass-card border-border/30">
            <CardContent className="p-4">
              <button
                onClick={() => setShowTemplates(!showTemplates)}
                className="flex items-center gap-2 w-full text-left"
              >
                <BookOpen className="h-4 w-4 text-primary" />
                <span className="text-sm font-medium flex-1">Prompt Templates</span>
                <span className="text-xs text-muted-foreground">{templates.length} templates</span>
                {showTemplates ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>

              {showTemplates && (
                <div className="mt-3 grid gap-2 max-h-60 overflow-y-auto">
                  {templates.map((template) => (
                    <button
                      key={template.id}
                      onClick={() => {
                        setPrompt(template.prompt);
                        setShowTemplates(false);
                        toast.success(`Template "${template.name}" loaded!`);
                      }}
                      className="text-left p-3 rounded-lg border border-border/30 bg-secondary/20 hover:bg-secondary/40 hover:border-primary/30 transition-all"
                    >
                      <p className="text-sm font-medium text-foreground">{template.name}</p>
                      <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{template.prompt}</p>
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Aspect Ratio Selection */}
        {config.hasAspectRatio && (
          <Card className="glass-card border-border/30">
            <CardContent className="p-4">
              <Label className="text-sm font-medium mb-3 block">Aspect Ratio</Label>
              <div className="flex gap-2 flex-wrap">
                {["1:1", "16:9", "9:16", "4:3", "3:4", "3:2", "2:3"].map((ratio) => (
                  <button
                    key={ratio}
                    onClick={() => setAspectRatio(ratio)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
                      aspectRatio === ratio
                        ? "bg-primary text-primary-foreground shadow-lg shadow-primary/25"
                        : "bg-secondary/50 text-muted-foreground hover:bg-secondary"
                    }`}
                  >
                    {ratio}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Video Duration Selection */}
        {config.hasDuration && (
          <Card className="glass-card border-border/30">
            <CardContent className="p-4">
              <Label className="text-sm font-medium mb-3 block flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" />
                Video Duration
              </Label>
              <div className="flex gap-3">
                <button
                  onClick={() => setDuration("5")}
                  className={`flex-1 py-3 rounded-xl border text-center transition-all ${
                    duration === "5"
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/30 bg-secondary/20 text-muted-foreground hover:border-border/60"
                  }`}
                >
                  <p className="text-lg font-bold">5s</p>
                  <p className="text-xs opacity-70">Standard</p>
                </button>
                <button
                  onClick={() => setDuration("10")}
                  className={`flex-1 py-3 rounded-xl border text-center transition-all ${
                    duration === "10"
                      ? "border-primary/50 bg-primary/10 text-primary"
                      : "border-border/30 bg-secondary/20 text-muted-foreground hover:border-border/60"
                  }`}
                >
                  <p className="text-lg font-bold">10s</p>
                  <p className="text-xs opacity-70">Extended (~2x cost)</p>
                </button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Prompt Input */}
        {config.hasPrompt && (
          <Card className="glass-card border-border/30">
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-medium">Prompt</Label>
              <Textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                placeholder="Describe what you want to create... Be as detailed as you like. No censorship."
                className="min-h-[100px] bg-secondary/30 resize-none"
              />
              {config.hasNegativePrompt && (
                <>
                  <Label className="text-sm font-medium text-muted-foreground">Negative Prompt (optional)</Label>
                  <Textarea
                    value={negativePrompt}
                    onChange={(e) => setNegativePrompt(e.target.value)}
                    placeholder="What to avoid in the generation..."
                    className="min-h-[60px] bg-secondary/30 resize-none"
                  />
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Image Upload */}
        {config.hasImageInput && (
          <Card className="glass-card border-border/30">
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-medium">
                {config.tool === "face_swap" ? "Source Face Image" : config.tool === "virtual_try_on" ? "Your Photo" : "Input Image"}
              </Label>
              {inputImagePreview ? (
                <div className="relative inline-block">
                  <img src={inputImagePreview} alt="Input" className="max-h-48 rounded-lg" />
                  <button
                    onClick={() => { setInputImage(null); setInputImagePreview(null); }}
                    className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ) : (
                <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border/50 rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-secondary/20">
                  <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                  <span className="text-sm text-muted-foreground">Click to upload image</span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileUpload(file, setInputImage, setInputImagePreview);
                    }}
                  />
                </label>
              )}

              {/* Second image for face swap (target) or try-on (garment) */}
              {(config.tool === "face_swap" || config.tool === "virtual_try_on") && (
                <>
                  <Label className="text-sm font-medium">
                    {config.tool === "face_swap" ? "Target Image" : "Garment Image"}
                  </Label>
                  {secondImagePreview ? (
                    <div className="relative inline-block">
                      <img src={secondImagePreview} alt="Second" className="max-h-48 rounded-lg" />
                      <button
                        onClick={() => { setSecondImage(null); setSecondImagePreview(null); }}
                        className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-1"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border/50 rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-secondary/20">
                      <Upload className="h-6 w-6 text-muted-foreground mb-2" />
                      <span className="text-sm text-muted-foreground">
                        Click to upload {config.tool === "face_swap" ? "target image" : "garment"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) handleFileUpload(file, setSecondImage, setSecondImagePreview);
                        }}
                      />
                    </label>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        )}

        {/* Video Upload */}
        {config.hasVideoInput && (
          <Card className="glass-card border-border/30">
            <CardContent className="p-4 space-y-3">
              <Label className="text-sm font-medium">Input Video</Label>
              <label className="flex flex-col items-center justify-center h-32 border-2 border-dashed border-border/50 rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-secondary/20">
                <Video className="h-6 w-6 text-muted-foreground mb-2" />
                <span className="text-sm text-muted-foreground">
                  {inputVideo ? "Video uploaded" : "Click to upload video"}
                </span>
                <input
                  type="file"
                  accept="video/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      const reader = new FileReader();
                      reader.onload = (ev) => setInputVideo((ev.target?.result as string).split(",")[1]);
                      reader.readAsDataURL(file);
                    }
                  }}
                />
              </label>
            </CardContent>
          </Card>
        )}

        {/* Advanced Settings */}
        {(config.hasDimensions || config.hasSteps || config.hasGuidance) && (
          <Card className="glass-card border-border/30">
            <CardContent className="p-4 space-y-4">
              <Label className="text-sm font-medium">Advanced Settings</Label>

              {config.hasDimensions && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">Width</Label>
                    <Select value={String(width)} onValueChange={(v) => setWidth(Number(v))}>
                      <SelectTrigger className="bg-secondary/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[512, 768, 1024, 1280, 1536].map(w => (
                          <SelectItem key={w} value={String(w)}>{w}px</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">Height</Label>
                    <Select value={String(height)} onValueChange={(v) => setHeight(Number(v))}>
                      <SelectTrigger className="bg-secondary/30">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {[512, 768, 1024, 1280, 1536].map(h => (
                          <SelectItem key={h} value={String(h)}>{h}px</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              {config.hasSteps && (
                <div>
                  <div className="flex justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">Inference Steps</Label>
                    <span className="text-xs text-muted-foreground">{steps[0]}</span>
                  </div>
                  <Slider value={steps} onValueChange={setSteps} min={10} max={50} step={1} />
                </div>
              )}

              {config.hasGuidance && (
                <div>
                  <div className="flex justify-between mb-2">
                    <Label className="text-xs text-muted-foreground">Guidance Scale</Label>
                    <span className="text-xs text-muted-foreground">{guidance[0]}</span>
                  </div>
                  <Slider value={guidance} onValueChange={setGuidance} min={1} max={20} step={0.5} />
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* Generate Button */}
        <Button
          onClick={handleGenerate}
          disabled={isGenerating && !isComplete && !isFailed}
          size="lg"
          className="w-full glow-primary"
        >
          {isGenerating && !isComplete && !isFailed ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              {statusQuery.data?.status === "processing" ? "Processing..." : "Starting..."}
            </>
          ) : (
            <>
              <Wand2 className="h-5 w-5 mr-2" />
              Generate
            </>
          )}
        </Button>

        {/* Result Display */}
        {isComplete && outputMediaQuery.data && (
          <Card className="glass-card border-primary/30">
            <CardContent className="p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium text-primary">Generation Complete</span>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setGenerationId(null);
                      setIsGenerating(false);
                    }}
                  >
                    <RefreshCw className="h-4 w-4 mr-1" /> New
                  </Button>
                  <a href={outputMediaQuery.data.url} download target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-1" /> Save
                    </Button>
                  </a>
                </div>
              </div>
              {config.outputType === "image" ? (
                <img
                  src={outputMediaQuery.data.url}
                  alt="Generated"
                  className="w-full rounded-lg"
                />
              ) : (
                <video
                  src={outputMediaQuery.data.url}
                  controls
                  className="w-full rounded-lg"
                />
              )}
            </CardContent>
          </Card>
        )}

        {/* Error Display */}
        {isFailed && (
          <Card className="glass-card border-destructive/30">
            <CardContent className="p-4">
              <p className="text-sm text-destructive font-medium mb-2">Generation Failed</p>
              <p className="text-xs text-muted-foreground">{statusQuery.data?.errorMessage || "An error occurred."}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2"
                onClick={() => { setGenerationId(null); setIsGenerating(false); }}
              >
                <RefreshCw className="h-4 w-4 mr-1" /> Try Again
              </Button>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
