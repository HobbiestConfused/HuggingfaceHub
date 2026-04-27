import { usePWAInstall } from "@/hooks/usePWAInstall";
import { Button } from "@/components/ui/button";
import { Download, X } from "lucide-react";
import { useState } from "react";

export function PWAInstallBanner() {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [dismissed, setDismissed] = useState(false);

  if (!isInstallable || isInstalled || dismissed) return null;

  return (
    <div className="fixed bottom-20 left-4 right-4 z-50 md:bottom-6 md:left-auto md:right-6 md:max-w-sm">
      <div className="bg-card border border-primary/30 rounded-xl p-4 shadow-2xl shadow-primary/10 backdrop-blur-sm">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
            <Download className="w-5 h-5 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-foreground">Install Expose</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Add to your home screen for the full app experience
            </p>
          </div>
          <button
            onClick={() => setDismissed(true)}
            className="text-muted-foreground hover:text-foreground p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <div className="flex gap-2 mt-3">
          <Button
            size="sm"
            variant="outline"
            className="flex-1 text-xs"
            onClick={() => setDismissed(true)}
          >
            Not now
          </Button>
          <Button
            size="sm"
            className="flex-1 text-xs bg-primary hover:bg-primary/90"
            onClick={install}
          >
            Install App
          </Button>
        </div>
      </div>
    </div>
  );
}
