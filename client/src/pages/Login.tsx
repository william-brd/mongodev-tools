import { Database, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Login() {
  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-900/30">
            <Database className="w-8 h-8 text-white" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-foreground">MongoDev Tools</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Plataforma de gerenciamento MongoDB
            </p>
          </div>

          <div className="w-full rounded-xl border border-border bg-card p-6 shadow-sm space-y-4">
            <p className="text-sm text-center text-muted-foreground">
              Faça login via Keycloak para continuar
            </p>
            <Button
              className="w-full gap-2 shadow-lg shadow-primary/20"
              onClick={() => { window.location.href = "/api/login"; }}
            >
              Entrar com Keycloak
            </Button>
          </div>

          <p className="text-xs text-muted-foreground text-center">
            Acesso controlado. Apenas usuários autorizados.
          </p>
        </div>
      </div>
    </div>
  );
}
