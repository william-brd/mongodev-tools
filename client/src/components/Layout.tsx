import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Terminal,
  Clock,
  LayoutDashboard,
  LogOut,
  Code2,
  Database,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { DatabaseTree } from "@/components/DatabaseTree";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";

interface SidebarItemProps {
  href: string;
  icon: React.ElementType;
  label: string;
  active?: boolean;
}

function SidebarItem({ href, icon: Icon, label, active }: SidebarItemProps) {
  return (
    <Link
      href={href}
      className={cn(
        "flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-150 group text-sm",
        active
          ? "bg-primary text-primary-foreground font-medium shadow-sm"
          : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
      )}
    >
      <Icon
        className={cn(
          "w-4 h-4 shrink-0",
          active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground"
        )}
      />
      <span>{label}</span>
    </Link>
  );
}

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { logout, user, isAdmin } = useAuth();
  const [treeOpen, setTreeOpen] = useState(true);

  return (
    <div className="flex h-screen bg-background overflow-hidden">
      {/* Sidebar */}
      <aside
        className={cn(
          "border-r border-border bg-card/50 backdrop-blur-xl flex flex-col transition-all duration-200",
          treeOpen ? "w-72" : "w-64"
        )}
      >
        {/* Logo */}
        <div className="p-4 border-b border-border/50 flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/20 shrink-0">
            <Database className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="text-foreground font-bold text-base tracking-tight">MongoDev Tools</span>
          {!isAdmin && (
            <Badge variant="secondary" className="ml-auto text-[10px] px-1.5 py-0">
              read-only
            </Badge>
          )}
        </div>

        {/* Nav */}
        <nav className="px-3 pt-4 pb-2 space-y-0.5 border-b border-border/50">
          <SidebarItem href="/" icon={LayoutDashboard} label="Workbench" active={location === "/"} />
          <SidebarItem href="/scripts" icon={Code2} label="Scripts Salvos" active={location === "/scripts"} />
          <SidebarItem href="/history" icon={Clock} label="Histórico" active={location === "/history"} />
        </nav>

        {/* Database Tree */}
        <div className="flex-1 min-h-0 flex flex-col">
          <button
            className="flex items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setTreeOpen((v) => !v)}
          >
            <span>Banco de Dados</span>
            {treeOpen ? <ChevronLeft className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          </button>
          {treeOpen && (
            <div className="flex-1 min-h-0">
              <DatabaseTree />
            </div>
          )}
        </div>

        {/* User footer */}
        <div className="p-3 border-t border-border/50 bg-muted/20">
          <div className="flex items-center gap-2.5 mb-2">
            <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center border border-border text-xs font-bold text-accent-foreground shrink-0">
              {user?.firstName?.[0] ?? "U"}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate text-foreground">
                {user ? `${user.firstName} ${user.lastName}`.trim() || user.email : "—"}
              </p>
              <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
            </div>
          </div>
          <button
            onClick={logout}
            className="w-full flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-destructive transition-colors px-2 py-1 rounded hover:bg-destructive/10"
          >
            <LogOut className="w-3 h-3" />
            Sair
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-auto relative">
        {children}
      </main>
    </div>
  );
}
