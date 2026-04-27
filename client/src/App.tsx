import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch, useParams } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { useAuth } from "./_core/hooks/useAuth";
import { useState, useEffect } from "react";
import AgeGate from "./pages/AgeGate";
import AppLayout from "./components/AppLayout";
import Home from "./pages/Home";
import CreateTool from "./pages/CreateTool";
import UploadMedia from "./pages/UploadMedia";
import Game from "./pages/Game";
import Gallery from "./pages/Gallery";
import SettingsPage from "./pages/SettingsPage";
import { trpc } from "./lib/trpc";
import { PWAInstallBanner } from "./components/PWAInstallBanner";

// Register service worker for PWA
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("SW registration failed:", err);
    });
  });
}

const AGE_VERIFIED_KEY = "expose_age_verified";

function CreateToolRoute() {
  const params = useParams<{ tool: string }>();
  return <CreateTool toolSlug={params.tool || ""} />;
}

function AgeGateWrapper({ children }: { children: React.ReactNode }) {
  const [ageVerified, setAgeVerified] = useState(() => {
    return localStorage.getItem(AGE_VERIFIED_KEY) === "true";
  });
  const { user } = useAuth();
  const verifyMutation = trpc.user.verifyAge.useMutation();

  // Check if user already verified in DB
  useEffect(() => {
    if (user && (user as any).ageVerified) {
      setAgeVerified(true);
      localStorage.setItem(AGE_VERIFIED_KEY, "true");
    }
  }, [user]);

  const handleVerified = async (dob: string) => {
    // Save locally first for immediate access
    setAgeVerified(true);
    localStorage.setItem(AGE_VERIFIED_KEY, "true");

    // If logged in, persist to DB
    if (user) {
      try {
        await verifyMutation.mutateAsync({ dateOfBirth: dob });
      } catch (e) {
        // Non-blocking — local verification is sufficient
        console.warn("Failed to persist age verification:", e);
      }
    }
  };

  if (!ageVerified) {
    return <AgeGate onVerified={handleVerified} />;
  }

  return <>{children}</>;
}

function Router() {
  return (
    <AgeGateWrapper>
      <AppLayout>
        <Switch>
          <Route path="/" component={Home} />
          <Route path="/create/upload" component={UploadMedia} />
          <Route path="/create/:tool" component={CreateToolRoute} />
          <Route path="/game" component={Game} />
          <Route path="/gallery" component={Gallery} />
          <Route path="/settings" component={SettingsPage} />
          <Route path="/404" component={NotFound} />
          <Route component={NotFound} />
        </Switch>
      </AppLayout>
    </AgeGateWrapper>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <Toaster />
          <Router />
          <PWAInstallBanner />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
