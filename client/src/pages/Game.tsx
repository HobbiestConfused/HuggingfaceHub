import { useState, useMemo, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Heart,
  Flame,
  Sparkles,
  Loader2,
  RefreshCw,
  History,
  Dice5,
  ChevronDown,
  ChevronUp,
  Users,
  Settings2,
} from "lucide-react";

type Category = "romance" | "adventurous" | "kinky" | "roleplay" | "fantasy" | "quickie";
type SpiceLevel = "mild" | "medium" | "hot" | "extreme";

const categories: { id: Category; label: string; emoji: string; description: string }[] = [
  { id: "romance", label: "Romance", emoji: "💕", description: "Deep connection & passion" },
  { id: "adventurous", label: "Adventurous", emoji: "🔥", description: "Spontaneous & exciting" },
  { id: "kinky", label: "Kinky", emoji: "⛓️", description: "Power dynamics & taboo" },
  { id: "roleplay", label: "Role Play", emoji: "🎭", description: "Characters & scenarios" },
  { id: "fantasy", label: "Fantasy", emoji: "✨", description: "Imaginative & surreal" },
  { id: "quickie", label: "Quickie", emoji: "⚡", description: "Fast & urgent" },
];

const spiceLevels: { id: SpiceLevel; label: string; color: string; description: string }[] = [
  { id: "mild", label: "Mild", color: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30", description: "Flirty & teasing" },
  { id: "medium", label: "Medium", color: "bg-orange-500/20 text-orange-400 border-orange-500/30", description: "Sensual & seductive" },
  { id: "hot", label: "Hot", color: "bg-red-500/20 text-red-400 border-red-500/30", description: "Explicitly passionate" },
  { id: "extreme", label: "Extreme", color: "bg-purple-500/20 text-purple-400 border-purple-500/30", description: "No limits" },
];

export default function Game() {
  const [category, setCategory] = useState<Category>("romance");
  const [spiceLevel, setSpiceLevel] = useState<SpiceLevel>("medium");
  const [customContext, setCustomContext] = useState("");
  const [currentPrompt, setCurrentPrompt] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [showPartnerSetup, setShowPartnerSetup] = useState(false);
  const [partner1, setPartner1] = useState("");
  const [partner2, setPartner2] = useState("");
  const [savedPartner1, setSavedPartner1] = useState("");
  const [savedPartner2, setSavedPartner2] = useState("");

  const generateMutation = trpc.game.generatePrompt.useMutation();
  const historyQuery = trpc.game.history.useQuery({ limit: 20 });
  const preferencesQuery = trpc.preferences.get.useQuery();
  const updatePreferencesMutation = trpc.preferences.update.useMutation();

  // Load saved partner names from preferences
  useEffect(() => {
    if (preferencesQuery.data) {
      const prefs = preferencesQuery.data as any;
      if (prefs.partnerNames?.partner1) {
        setPartner1(prefs.partnerNames.partner1);
        setSavedPartner1(prefs.partnerNames.partner1);
      }
      if (prefs.partnerNames?.partner2) {
        setPartner2(prefs.partnerNames.partner2);
        setSavedPartner2(prefs.partnerNames.partner2);
      }
    }
  }, [preferencesQuery.data]);

  const handleSavePartners = async () => {
    if (!partner1.trim() || !partner2.trim()) {
      toast.error("Please enter both names.");
      return;
    }
    try {
      await updatePreferencesMutation.mutateAsync({
        partnerNames: { partner1: partner1.trim(), partner2: partner2.trim() },
      });
      setSavedPartner1(partner1.trim());
      setSavedPartner2(partner2.trim());
      setShowPartnerSetup(false);
      toast.success(`Partners saved: ${partner1.trim()} & ${partner2.trim()}`);
    } catch {
      toast.error("Failed to save partner names.");
    }
  };

  const handleGenerate = async () => {
    try {
      const result = await generateMutation.mutateAsync({
        category,
        spiceLevel,
        customContext: customContext || undefined,
        partnerNames: savedPartner1 && savedPartner2
          ? { partner1: savedPartner1, partner2: savedPartner2 }
          : undefined,
      });

      if (result.success && result.prompt) {
        setCurrentPrompt(result.prompt);
      } else {
        toast.error(result.error || "Failed to generate prompt.");
      }
    } catch (error: any) {
      toast.error(error.message || "Something went wrong.");
    }
  };

  const selectedSpice = spiceLevels.find(s => s.id === spiceLevel)!;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium text-primary">Couples' Game</span>
          </div>
          {/* Partner Names Badge */}
          <button
            onClick={() => setShowPartnerSetup(!showPartnerSetup)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 hover:bg-primary/20 transition-colors"
          >
            <Users className="h-3.5 w-3.5 text-primary" />
            {savedPartner1 && savedPartner2 ? (
              <span className="text-xs font-medium text-primary">
                {savedPartner1} & {savedPartner2}
              </span>
            ) : (
              <span className="text-xs text-muted-foreground">Set Names</span>
            )}
          </button>
        </div>
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          Dare to Play?
        </h1>
        <p className="text-muted-foreground text-sm">
          Spice things up with AI-generated dares, role-play scenarios, and erotic prompts.
          {savedPartner1 && savedPartner2 && (
            <span className="text-primary"> Personalized for {savedPartner1} & {savedPartner2}.</span>
          )}
        </p>
      </div>

      {/* Partner Setup Panel */}
      {showPartnerSetup && (
        <Card className="glass-card border-primary/30 mb-6">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <Users className="h-4 w-4 text-primary" />
              <Label className="text-sm font-medium">Partner Profiles</Label>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Enter your names so dares are personalized just for you two.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Partner 1</Label>
                <Input
                  value={partner1}
                  onChange={(e) => setPartner1(e.target.value)}
                  placeholder="e.g., Justin"
                  className="bg-secondary/30"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground mb-1 block">Partner 2</Label>
                <Input
                  value={partner2}
                  onChange={(e) => setPartner2(e.target.value)}
                  placeholder="e.g., Simone"
                  className="bg-secondary/30"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={handleSavePartners}
                size="sm"
                disabled={!partner1.trim() || !partner2.trim()}
                className="flex-1"
              >
                Save Names
              </Button>
              {savedPartner1 && savedPartner2 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowPartnerSetup(false)}
                >
                  Cancel
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Current Prompt Display */}
      {currentPrompt && (
        <Card className="glass-card border-primary/30 mb-6 overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-primary via-red-400 to-primary" />
          <CardContent className="p-6">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10 shrink-0 mt-1">
                <Flame className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-primary mb-2">Your Dare</p>
                <p className="text-foreground text-base leading-relaxed font-serif italic">
                  "{currentPrompt}"
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Selection */}
      <div className="mb-4">
        <Label className="text-sm font-medium mb-3 block">Category</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {categories.map(cat => (
            <button
              key={cat.id}
              onClick={() => setCategory(cat.id)}
              className={`p-3 rounded-xl border text-left transition-all ${
                category === cat.id
                  ? "border-primary/50 bg-primary/10"
                  : "border-border/30 bg-secondary/20 hover:border-border/60"
              }`}
            >
              <span className="text-lg">{cat.emoji}</span>
              <p className="text-sm font-medium mt-1">{cat.label}</p>
              <p className="text-xs text-muted-foreground">{cat.description}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Spice Level */}
      <div className="mb-4">
        <Label className="text-sm font-medium mb-3 block">Spice Level</Label>
        <div className="grid grid-cols-4 gap-2">
          {spiceLevels.map(level => (
            <button
              key={level.id}
              onClick={() => setSpiceLevel(level.id)}
              className={`p-3 rounded-xl border text-center transition-all ${
                spiceLevel === level.id
                  ? `${level.color} border`
                  : "border-border/30 bg-secondary/20 hover:border-border/60"
              }`}
            >
              <div className="flex justify-center mb-1">
                {level.id === "mild" && <Flame className="h-4 w-4" />}
                {level.id === "medium" && <><Flame className="h-4 w-4" /><Flame className="h-4 w-4" /></>}
                {level.id === "hot" && <><Flame className="h-4 w-4" /><Flame className="h-4 w-4" /><Flame className="h-4 w-4" /></>}
                {level.id === "extreme" && <Sparkles className="h-4 w-4" />}
              </div>
              <p className="text-xs font-medium">{level.label}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Custom Context Toggle */}
      <button
        onClick={() => setShowCustom(!showCustom)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-4"
      >
        {showCustom ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        Add custom context (optional)
      </button>

      {showCustom && (
        <Card className="glass-card border-border/30 mb-4">
          <CardContent className="p-4">
            <Textarea
              value={customContext}
              onChange={(e) => setCustomContext(e.target.value)}
              placeholder="Add any context... e.g., 'We're at home on the couch', 'It's our anniversary', 'We like being watched'..."
              className="min-h-[80px] bg-secondary/30 resize-none"
            />
          </CardContent>
        </Card>
      )}

      {/* Generate Button */}
      <Button
        onClick={handleGenerate}
        disabled={generateMutation.isPending}
        size="lg"
        className="w-full glow-primary mb-4"
      >
        {generateMutation.isPending ? (
          <>
            <Loader2 className="h-5 w-5 mr-2 animate-spin" />
            Generating...
          </>
        ) : (
          <>
            <Dice5 className="h-5 w-5 mr-2" />
            {currentPrompt ? "Next Dare" : "Generate Dare"}
          </>
        )}
      </Button>

      {/* History Toggle */}
      <button
        onClick={() => setShowHistory(!showHistory)}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-2"
      >
        <History className="h-4 w-4" />
        {showHistory ? "Hide History" : "Show History"}
      </button>

      {/* History */}
      {showHistory && historyQuery.data && (
        <div className="mt-4 space-y-2">
          {historyQuery.data.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No history yet. Start playing!</p>
          ) : (
            historyQuery.data.map((session) => (
              <Card key={session.id} className="glass-card border-border/20">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-primary capitalize">{session.category}</span>
                    <span className="text-xs text-muted-foreground">·</span>
                    <span className="text-xs text-muted-foreground capitalize">{session.spiceLevel}</span>
                  </div>
                  {session.currentPrompt && (
                    <p className="text-sm text-foreground/80 italic">"{session.currentPrompt}"</p>
                  )}
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}
