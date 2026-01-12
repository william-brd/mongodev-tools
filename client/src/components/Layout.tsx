import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Terminal, Clock, LayoutDashboard, LogOut, Code2, Database } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";

interface SidebarItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  active?: boolean;
}

function SidebarItem({ href, icon: Icon, label, active }: SidebarItemProps) {
  return (
    <Link href={href} className={cn(
      "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200 group",
      active 
        ? "bg-primary text-primary-foreground font-medium shadow-sm" 
        : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
    )}>
      <Icon className={cn("w-4 h-4", active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
      <span>{label}</span>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout, user } = useAuth();

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside className="w-64 border-r border-border bg-card/50 backdrop-blur-xl flex flex-col">
        <div className="p-6 border-b border-border/50">
          <div className="flex items-center gap-2 text-foreground font-bold text-xl tracking-tight">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/20">
              <Database className="w-4 h-4 text-white" />
            </div>
            MongoDev
          </div>
        </div>

        <nav className="flex-1 px-4 py-6 space-y-1">
          <SidebarItem 
            href="/" 
            icon={LayoutDashboard} 
            label="Workbench" 
            active={location === "/"} 
          />
          <SidebarItem 
            href="/scripts" 
            icon={Code2} 
            label="Saved Scripts" 
            active={location === "/scripts"} 
          />
          <SidebarItem 
            href="/history" 
            icon={Clock} 
            label="Execution History" 
            active={location === "/history"} 
          />
        </nav>

        <div className="p-4 border-t border-border/50 bg-muted/20">
          <div className="flex items-center gap-3 mb-4">
             <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center border border-border text-sm font-bold text-accent-foreground">
                {user?.firstName?.[0] || "U"}
             </div>
             <div className="flex-1 overflow-hidden">
               <p className="text-sm font-medium truncate">{user?.firstName || "User"}</p>
               <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
             </div>
          </div>
          <button 
            onClick={() => logout()}
            className="w-full flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors px-2 py-1.5 rounded hover:bg-destructive/10"
          >
            <LogOut className="w-3 h-3" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto relative scroll-smooth">
        {children}
      </main>
    </div>
  );
}
