import { useAuth } from "@/_core/hooks/useAuth";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { getLoginUrl } from "@/const";
import { Button } from "@/components/ui/button";
import {
  Wand2,
  Heart,
  Images,
  Settings,
  LogOut,
  Sparkles,
} from "lucide-react";
import { useLocation } from "wouter";

const navItems = [
  { icon: Wand2, label: "Create", path: "/" },
  { icon: Heart, label: "Game", path: "/game" },
  { icon: Images, label: "Gallery", path: "/gallery" },
  { icon: Settings, label: "Settings", path: "/settings" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading, logout } = useAuth();
  const [location, setLocation] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 rounded-xl overflow-hidden animate-pulse">
            <img src="/manus-storage/expose-logo_c704eb5f.jpg" alt="Expose" className="w-full h-full object-cover" />
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary animate-pulse" />
            <span className="text-muted-foreground text-sm">Loading...</span>
          </div>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="flex flex-col items-center gap-8 max-w-md w-full">
          <div className="w-20 h-20 rounded-2xl overflow-hidden glow-primary">
            <img src="/manus-storage/expose-logo_c704eb5f.jpg" alt="Expose" className="w-full h-full object-cover" />
          </div>
          <div className="text-center">
            <h1 className="font-serif text-3xl font-bold text-gradient mb-2">Expose</h1>
            <p className="text-muted-foreground text-sm">Sign in to access the creative studio</p>
          </div>
          <Button
            onClick={() => { window.location.href = getLoginUrl(); }}
            size="lg"
            className="w-full max-w-xs glow-primary"
          >
            Sign In
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-50 border-b border-border/50 bg-background/80 backdrop-blur-xl">
        <div className="flex items-center justify-between h-14 px-4 max-w-7xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg overflow-hidden">
              <img src="/manus-storage/expose-logo_c704eb5f.jpg" alt="Expose" className="w-full h-full object-cover" />
            </div>
            <span className="font-serif text-xl font-bold text-gradient hidden sm:block">Expose</span>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden md:flex items-center gap-1">
            {navItems.map(item => {
              const isActive = location === item.path;
              return (
                <button
                  key={item.path}
                  onClick={() => setLocation(item.path)}
                  className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </button>
              );
            })}
          </nav>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex items-center gap-2 rounded-full hover:bg-secondary/50 p-1 transition-colors">
                <Avatar className="h-8 w-8 border border-border/50">
                  <AvatarImage src={undefined} />
                  <AvatarFallback className="bg-primary/10 text-primary text-xs font-medium">
                    {user.name?.charAt(0).toUpperCase() || "U"}
                  </AvatarFallback>
                </Avatar>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <div className="px-2 py-1.5 border-b border-border/50 mb-1">
                <p className="text-sm font-medium truncate">{user.name || "User"}</p>
                <p className="text-xs text-muted-foreground truncate">{user.email || ""}</p>
              </div>
              <DropdownMenuItem onClick={logout} className="text-destructive focus:text-destructive">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 pb-24 md:pb-4">
        {children}
      </main>

      {/* Mobile Bottom Tab Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-[9999] border-t border-border/50 bg-background backdrop-blur-xl" style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}>
        <div className="flex items-center justify-around h-16 px-1 max-w-lg mx-auto">
          {navItems.map(item => {
            const isActive = location === item.path;
            return (
              <button
                key={item.path}
                onClick={() => setLocation(item.path)}
                className={`flex flex-col items-center justify-center gap-0.5 py-2 rounded-lg transition-all flex-1 ${
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                }`}
              >
                <item.icon className={`h-5 w-5 ${isActive ? "drop-shadow-[0_0_6px_oklch(0.55_0.25_25)]" : ""}`} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
