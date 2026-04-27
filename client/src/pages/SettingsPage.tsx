import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Settings,
  Key,
  User,
  Sliders,
  Loader2,
  Check,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
} from "lucide-react";

const providers = [
  {
    id: "replicate" as const,
    name: "Replicate",
    description: "Run open-source models in the cloud",
    url: "https://replicate.com/account/api-tokens",
    placeholder: "r8_...",
  },
  {
    id: "fal_ai" as const,
    name: "fal.ai",
    description: "Fast inference for generative AI",
    url: "https://fal.ai/dashboard/keys",
    placeholder: "fal-...",
  },
  {
    id: "stability_ai" as const,
    name: "Stability AI",
    description: "Stable Diffusion and more",
    url: "https://platform.stability.ai/account/keys",
    placeholder: "sk-...",
  },
];

export default function SettingsPage() {
  const { user } = useAuth();

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Settings className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium text-primary">Settings</span>
        </div>
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          Settings
        </h1>
        <p className="text-muted-foreground text-sm">
          Manage your API keys, profile, and preferences.
        </p>
      </div>

      <Tabs defaultValue="api-keys">
        <TabsList className="bg-secondary/30 mb-4">
          <TabsTrigger value="api-keys" className="gap-2">
            <Key className="h-4 w-4" /> API Keys
          </TabsTrigger>
          <TabsTrigger value="profile" className="gap-2">
            <User className="h-4 w-4" /> Profile
          </TabsTrigger>
          <TabsTrigger value="preferences" className="gap-2">
            <Sliders className="h-4 w-4" /> Preferences
          </TabsTrigger>
        </TabsList>

        <TabsContent value="api-keys">
          <ApiKeysTab />
        </TabsContent>

        <TabsContent value="profile">
          <ProfileTab />
        </TabsContent>

        <TabsContent value="preferences">
          <PreferencesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ApiKeysTab() {
  const apiKeysQuery = trpc.apiKeys.list.useQuery();
  const upsertMutation = trpc.apiKeys.upsert.useMutation();
  const deleteMutation = trpc.apiKeys.delete.useMutation();
  const utils = trpc.useUtils();

  const [editingProvider, setEditingProvider] = useState<string | null>(null);
  const [keyValue, setKeyValue] = useState("");
  const [showKeys, setShowKeys] = useState<Record<string, boolean>>({});

  const handleSave = async (providerId: "replicate" | "fal_ai" | "stability_ai") => {
    if (!keyValue.trim()) {
      toast.error("Please enter an API key.");
      return;
    }
    try {
      await upsertMutation.mutateAsync({ provider: providerId, apiKey: keyValue.trim() });
      toast.success("API key saved!");
      setEditingProvider(null);
      setKeyValue("");
      utils.apiKeys.list.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Failed to save.");
    }
  };

  const handleDelete = async (providerId: "replicate" | "fal_ai" | "stability_ai") => {
    try {
      await deleteMutation.mutateAsync({ provider: providerId });
      toast.success("API key removed.");
      utils.apiKeys.list.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Failed to delete.");
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground mb-4">
        Connect your AI provider API keys to enable content generation. Your keys are stored securely and never shared.
      </p>

      {providers.map(provider => {
        const existingKey = apiKeysQuery.data?.find(k => k.provider === provider.id);
        const isEditing = editingProvider === provider.id;

        return (
          <Card key={provider.id} className="glass-card border-border/30">
            <CardContent className="p-4">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-medium text-foreground">{provider.name}</h3>
                  <p className="text-xs text-muted-foreground">{provider.description}</p>
                </div>
                <div className="flex items-center gap-2">
                  {existingKey && (
                    <span className="flex items-center gap-1 text-xs text-primary">
                      <Check className="h-3 w-3" /> Connected
                    </span>
                  )}
                  <a href={provider.url} target="_blank" rel="noopener noreferrer">
                    <Button variant="ghost" size="sm" className="h-7 text-xs">
                      Get Key <ExternalLink className="h-3 w-3 ml-1" />
                    </Button>
                  </a>
                </div>
              </div>

              {existingKey && !isEditing ? (
                <div className="flex items-center gap-2">
                  <div className="flex-1 bg-secondary/30 rounded-lg px-3 py-2 text-sm font-mono text-muted-foreground">
                    {showKeys[provider.id] ? existingKey.maskedKey : "••••••••••••"}
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => setShowKeys(prev => ({ ...prev, [provider.id]: !prev[provider.id] }))}
                  >
                    {showKeys[provider.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8"
                    onClick={() => { setEditingProvider(provider.id); setKeyValue(""); }}
                  >
                    Update
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-destructive hover:text-destructive"
                    onClick={() => handleDelete(provider.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Input
                    value={keyValue}
                    onChange={(e) => setKeyValue(e.target.value)}
                    placeholder={provider.placeholder}
                    type="password"
                    className="bg-secondary/30 font-mono text-sm"
                    autoFocus={isEditing}
                  />
                  <Button
                    size="sm"
                    onClick={() => handleSave(provider.id)}
                    disabled={upsertMutation.isPending}
                  >
                    {upsertMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                  {isEditing && (
                    <Button variant="ghost" size="sm" onClick={() => setEditingProvider(null)}>
                      Cancel
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

function ProfileTab() {
  const { user } = useAuth();
  const [name, setName] = useState(user?.name || "");
  const [bio, setBio] = useState("");
  const updateMutation = trpc.user.updateProfile.useMutation();
  const utils = trpc.useUtils();

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({ name, bio });
      toast.success("Profile updated!");
      utils.auth.me.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Failed to update.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="glass-card border-border/30">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-sm font-medium">Display Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-secondary/30 mt-1"
              placeholder="Your name"
            />
          </div>
          <div>
            <Label className="text-sm font-medium">Bio</Label>
            <Textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              className="bg-secondary/30 mt-1 resize-none"
              placeholder="Tell us about yourself..."
              rows={3}
            />
          </div>
          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Profile
          </Button>
        </CardContent>
      </Card>

      <Card className="glass-card border-border/30">
        <CardContent className="p-4">
          <h3 className="font-medium text-foreground mb-2">Account Info</h3>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Email</span>
              <span className="text-foreground">{user?.email || "Not set"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Role</span>
              <span className="text-foreground capitalize">{user?.role || "user"}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Member since</span>
              <span className="text-foreground">
                {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "Unknown"}
              </span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreferencesTab() {
  const prefsQuery = trpc.preferences.get.useQuery();
  const updateMutation = trpc.preferences.update.useMutation();
  const utils = trpc.useUtils();

  const [defaultProvider, setDefaultProvider] = useState<string>(prefsQuery.data?.defaultProvider || "replicate");
  const [defaultSpice, setDefaultSpice] = useState<string>(prefsQuery.data?.defaultSpiceLevel || "medium");

  const handleSave = async () => {
    try {
      await updateMutation.mutateAsync({
        defaultProvider: defaultProvider as any,
        defaultSpiceLevel: defaultSpice as any,
      });
      toast.success("Preferences saved!");
      utils.preferences.get.invalidate();
    } catch (error: any) {
      toast.error(error.message || "Failed to save.");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="glass-card border-border/30">
        <CardContent className="p-4 space-y-4">
          <div>
            <Label className="text-sm font-medium">Default AI Provider</Label>
            <Select value={defaultProvider} onValueChange={setDefaultProvider}>
              <SelectTrigger className="bg-secondary/30 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="replicate">Replicate</SelectItem>
                <SelectItem value="fal_ai">fal.ai</SelectItem>
                <SelectItem value="stability_ai">Stability AI</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-sm font-medium">Default Spice Level (Game Mode)</Label>
            <Select value={defaultSpice} onValueChange={setDefaultSpice}>
              <SelectTrigger className="bg-secondary/30 mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mild">Mild</SelectItem>
                <SelectItem value="medium">Medium</SelectItem>
                <SelectItem value="hot">Hot</SelectItem>
                <SelectItem value="extreme">Extreme</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Button onClick={handleSave} disabled={updateMutation.isPending}>
            {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
            Save Preferences
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
