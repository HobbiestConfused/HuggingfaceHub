import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Images,
  ImageIcon,
  Video,
  Download,
  Trash2,
  Filter,
  Loader2,
  X,
  Sparkles,
  Upload,
} from "lucide-react";

type FilterType = "all" | "image" | "video";
type SourceFilter = "all" | "upload" | "generated";

export default function Gallery() {
  const [typeFilter, setTypeFilter] = useState<FilterType>("all");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedMedia, setSelectedMedia] = useState<any | null>(null);

  const queryInput = useMemo(() => ({
    type: typeFilter === "all" ? undefined : typeFilter as "image" | "video",
    source: sourceFilter === "all" ? undefined : sourceFilter as "upload" | "generated",
    limit: 50,
    offset: 0,
  }), [typeFilter, sourceFilter]);

  const mediaQuery = trpc.media.list.useQuery(queryInput);
  const deleteMutation = trpc.media.delete.useMutation();
  const utils = trpc.useUtils();

  const handleDelete = async (id: number) => {
    try {
      await deleteMutation.mutateAsync({ id });
      toast.success("Media deleted.");
      utils.media.list.invalidate();
      setSelectedMedia(null);
    } catch (error: any) {
      toast.error(error.message || "Failed to delete.");
    }
  };

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-2">
          <Images className="h-5 w-5 text-primary" />
          <span className="text-sm font-medium text-primary">Gallery</span>
        </div>
        <h1 className="font-serif text-3xl font-bold text-foreground mb-2">
          Your Collection
        </h1>
        <p className="text-muted-foreground text-sm">
          All your generated and uploaded media in one place.
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 mb-6">
        <div className="flex gap-1 bg-secondary/30 rounded-lg p-1">
          {(["all", "image", "video"] as FilterType[]).map(f => (
            <button
              key={f}
              onClick={() => setTypeFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                typeFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All" : f === "image" ? "Images" : "Videos"}
            </button>
          ))}
        </div>
        <div className="flex gap-1 bg-secondary/30 rounded-lg p-1">
          {(["all", "generated", "upload"] as SourceFilter[]).map(f => (
            <button
              key={f}
              onClick={() => setSourceFilter(f)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                sourceFilter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "all" ? "All Sources" : f === "generated" ? "AI Generated" : "Uploaded"}
            </button>
          ))}
        </div>
      </div>

      {/* Media Grid */}
      {mediaQuery.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : mediaQuery.data && mediaQuery.data.length > 0 ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {mediaQuery.data.map(item => (
            <div
              key={item.id}
              className="relative aspect-square rounded-xl overflow-hidden bg-secondary/30 cursor-pointer group border border-border/20 hover:border-primary/30 transition-all"
              onClick={() => setSelectedMedia(item)}
            >
              {item.type === "image" ? (
                <img src={item.url} alt="" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Video className="h-8 w-8 text-muted-foreground" />
                </div>
              )}
              {/* Overlay */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity">
                <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between">
                  <span className="text-xs text-white/80 flex items-center gap-1">
                    {item.source === "generated" ? (
                      <><Sparkles className="h-3 w-3" /> AI</>
                    ) : (
                      <><Upload className="h-3 w-3" /> Upload</>
                    )}
                  </span>
                  <span className="text-xs text-white/60">
                    {item.type === "image" ? <ImageIcon className="h-3 w-3" /> : <Video className="h-3 w-3" />}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-16 h-16 rounded-2xl bg-secondary/30 flex items-center justify-center mb-4">
            <Images className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="font-medium text-foreground mb-1">No media yet</h3>
          <p className="text-sm text-muted-foreground max-w-xs">
            Start creating with the AI tools or upload your own media to build your collection.
          </p>
        </div>
      )}

      {/* Media Detail Dialog */}
      <Dialog open={!!selectedMedia} onOpenChange={() => setSelectedMedia(null)}>
        <DialogContent className="max-w-2xl bg-card border-border/50">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selectedMedia?.source === "generated" ? (
                <><Sparkles className="h-4 w-4 text-primary" /> AI Generated</>
              ) : (
                <><Upload className="h-4 w-4 text-primary" /> Uploaded</>
              )}
            </DialogTitle>
          </DialogHeader>
          {selectedMedia && (
            <div>
              {selectedMedia.type === "image" ? (
                <img src={selectedMedia.url} alt="" className="w-full rounded-lg mb-4" />
              ) : (
                <video src={selectedMedia.url} controls className="w-full rounded-lg mb-4" />
              )}
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {selectedMedia.filename && <span>{selectedMedia.filename}</span>}
                  {selectedMedia.fileSize && (
                    <span className="ml-2">({(selectedMedia.fileSize / 1024 / 1024).toFixed(1)} MB)</span>
                  )}
                </div>
                <div className="flex gap-2">
                  <a href={selectedMedia.url} download target="_blank" rel="noopener noreferrer">
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-1" /> Download
                    </Button>
                  </a>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => handleDelete(selectedMedia.id)}
                    disabled={deleteMutation.isPending}
                  >
                    {deleteMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <><Trash2 className="h-4 w-4 mr-1" /> Delete</>
                    )}
                  </Button>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
