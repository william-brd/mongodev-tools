import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/use-auth";
import { Loader2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";

import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/Dashboard";
import ScriptsList from "@/pages/ScriptsList";
import History from "@/pages/History";

function LoginPage() {
  return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0a0a0b] text-foreground p-4">
      <div className="w-full max-w-md space-y-8 text-center">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-2xl shadow-blue-900/50">
            <Lock className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-bold tracking-tight">MongoDev Tools</h1>
          <p className="text-muted-foreground">Secure access to development database utilities.</p>
        </div>
        
        <div className="bg-card border border-border p-8 rounded-xl shadow-xl">
          <Button 
            onClick={() => window.location.href = "/api/login"}
            className="w-full h-12 text-base font-semibold bg-white text-black hover:bg-gray-200"
          >
            Sign In with Replit
          </Button>
          <p className="mt-4 text-xs text-muted-foreground">
            Authentication is required to access execution capabilities.
          </p>
        </div>
      </div>
    </div>
  );
}

function AuthenticatedRoute({ component: Component }: { component: React.ComponentType }) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-background">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  return <Component />;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/scripts" component={ScriptsList} />
      <Route path="/history" component={History} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
