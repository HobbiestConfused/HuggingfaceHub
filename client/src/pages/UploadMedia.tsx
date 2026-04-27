import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";
import { ArrowLeft, Upload, Loader2, CheckCircle, ImageIcon, Video } from "lucide-react";
import { useLocation } from "wouter";

export default function UploadMedia() {
  const [, setLocation] = useLocation();
  const [files, setFiles] = useState<{ file: File; preview: string; type: "image" | "video" }[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadedCount, setUploadedCount] = useState(0);

  const uploadMutation = trpc.media.upload.useMutation();

  const handleFiles = useCallback((fileList: FileList) => {
    const newFiles = Array.from(fileList).map(file => ({
      file,
      preview: URL.createObjectURL(file),
      type: (file.type.startsWith("video") ? "video" : "image") as "image" | "video",
    }));
    setFiles(prev => [...prev, ...newFiles]);
  }, []);

  const handleUpload = async () => {
    if (files.length === 0) {
      toast.error("Please select files to upload.");
      return;
    }

    setUploading(true);
    setUploadedCount(0);

    for (const { file, type } of files) {
      try {
        const reader = new FileReader();
        const base64 = await new Promise<string>((resolve) => {
          reader.onload = (e) => resolve((e.target?.result as string).split(",")[1]);
          reader.readAsDataURL(file);
        });

        await uploadMutation.mutateAsync({
          filename: file.name,
          mimeType: file.type,
          base64Data: base64,
          type,
        });

        setUploadedCount(prev => prev + 1);
      } catch (error: any) {
        toast.error(`Failed to upload ${file.name}: ${error.message}`);
      }
    }

    toast.success(`${files.length} file(s) uploaded successfully!`);
    setUploading(false);
    setFiles([]);
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="font-semibold text-lg">Upload Media</h1>
          <p className="text-sm text-muted-foreground">Upload images and videos to use with AI tools</p>
        </div>
      </div>

      <Card className="glass-card border-border/30">
        <CardContent className="p-6">
          <label className="flex flex-col items-center justify-center h-48 border-2 border-dashed border-border/50 rounded-xl cursor-pointer hover:border-primary/50 transition-colors bg-secondary/20">
            <Upload className="h-8 w-8 text-muted-foreground mb-3" />
            <span className="text-sm font-medium text-foreground">Drop files here or click to browse</span>
            <span className="text-xs text-muted-foreground mt-1">Images and videos supported</span>
            <input
              type="file"
              accept="image/*,video/*"
              multiple
              className="hidden"
              onChange={(e) => e.target.files && handleFiles(e.target.files)}
            />
          </label>

          {files.length > 0 && (
            <div className="mt-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                {files.map((f, i) => (
                  <div key={i} className="relative rounded-lg overflow-hidden bg-secondary/30 aspect-square">
                    {f.type === "image" ? (
                      <img src={f.preview} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <Video className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    {uploading && uploadedCount > i && (
                      <div className="absolute inset-0 bg-background/60 flex items-center justify-center">
                        <CheckCircle className="h-6 w-6 text-primary" />
                      </div>
                    )}
                  </div>
                ))}
              </div>

              <Button onClick={handleUpload} disabled={uploading} className="w-full glow-primary">
                {uploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading {uploadedCount}/{files.length}...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload {files.length} file(s)
                  </>
                )}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
