import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent } from "@/components/ui/card";
import {
  ImageIcon,
  Video,
  Film,
  FastForward,
  Users,
  Shirt,
  ZoomIn,
  Upload,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";

const tools = [
  {
    id: "text-to-image",
    icon: ImageIcon,
    label: "Text to Image",
    description: "Generate images from text prompts",
    path: "/create/text-to-image",
    color: "from-red-500/20 to-rose-500/10",
  },
  {
    id: "text-to-video",
    icon: Video,
    label: "Text to Video",
    description: "Create videos from text descriptions",
    path: "/create/text-to-video",
    color: "from-purple-500/20 to-pink-500/10",
  },
  {
    id: "image-to-video",
    icon: Film,
    label: "Image to Video",
    description: "Animate still images into video",
    path: "/create/image-to-video",
    color: "from-orange-500/20 to-red-500/10",
  },
  {
    id: "video-extension",
    icon: FastForward,
    label: "Video Extension",
    description: "Extend and continue existing videos",
    path: "/create/video-extension",
    color: "from-blue-500/20 to-indigo-500/10",
  },
  {
    id: "face-swap",
    icon: Users,
    label: "Face Swap",
    description: "Swap faces in photos and videos",
    path: "/create/face-swap",
    color: "from-emerald-500/20 to-teal-500/10",
  },
  {
    id: "virtual-try-on",
    icon: Shirt,
    label: "Virtual Try-On",
    description: "Try on clothing and costumes",
    path: "/create/virtual-try-on",
    color: "from-pink-500/20 to-fuchsia-500/10",
  },
  {
    id: "image-upscale",
    icon: ZoomIn,
    label: "Image Upscale",
    description: "Enhance image resolution and quality",
    path: "/create/image-upscale",
    color: "from-amber-500/20 to-yellow-500/10",
  },
  {
    id: "upload",
    icon: Upload,
    label: "Upload Media",
    description: "Upload your own images and videos",
    path: "/create/upload",
    color: "from-cyan-500/20 to-sky-500/10",
  },
];

export default function Home() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Hero Section */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium text-primary">AI Creative Studio</span>
        </div>
        <h1 className="font-serif text-3xl md:text-4xl font-bold text-foreground mb-2">
          What will you create{user?.name ? `, ${user.name.split(" ")[0]}` : ""}?
        </h1>
        <p className="text-muted-foreground text-sm md:text-base max-w-xl">
          Unleash your imagination with our suite of AI-powered creative tools. No filters, no limits — just pure creative freedom.
        </p>
      </div>

      {/* Tool Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
        {tools.map(tool => (
          <Card
            key={tool.id}
            className="glass-card border-border/30 hover:border-primary/30 transition-all duration-300 cursor-pointer group overflow-hidden"
            onClick={() => setLocation(tool.path)}
          >
            <CardContent className="p-4 md:p-5">
              <div className={`w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br ${tool.color} flex items-center justify-center mb-3 group-hover:scale-110 transition-transform duration-300`}>
                <tool.icon className="h-5 w-5 md:h-6 md:w-6 text-foreground" />
              </div>
              <h3 className="font-semibold text-sm md:text-base text-foreground mb-1">
                {tool.label}
              </h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                {tool.description}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Stats */}
      <div className="mt-8 grid grid-cols-3 gap-3">
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gradient">8</p>
          <p className="text-xs text-muted-foreground mt-1">AI Tools</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gradient">3</p>
          <p className="text-xs text-muted-foreground mt-1">AI Providers</p>
        </div>
        <div className="glass-card rounded-xl p-4 text-center">
          <p className="text-2xl font-bold text-gradient">0</p>
          <p className="text-xs text-muted-foreground mt-1">Filters</p>
        </div>
      </div>
    </div>
  );
}
