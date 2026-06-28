import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { CodeEditor } from "@/components/CodeEditor";
import { ResultViewer } from "@/components/ResultViewer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useExecuteScript, useCreateScript, useScript, useUpdateScript } from "@/hooks/use-mongo";
import { useQueryClient } from "@tanstack/react-query";
import { useDatabases } from "@/hooks/use-databases";
import { Play, Save, Loader2, Database } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const scriptId = searchParams.get("id") ? parseInt(searchParams.get("id")!) : null;

  const { data: existingScript, isLoading: isLoadingScript } = useScript(scriptId);
  const { data: databases } = useDatabases();

  const [code, setCode] = useState("// Write your MongoDB query here\n// e.g. db.collection('users').find({})\n\n");
  const [type, setType] = useState<"query" | "aggregation">("query");
  const [dbName, setDbName] = useState<string>("");
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [duration, setDuration] = useState<number | undefined>();

  // Save Dialog State
  const [saveOpen, setSaveOpen] = useState(false);
  const [scriptName, setScriptName] = useState("");
  const [scriptDesc, setScriptDesc] = useState("");

  const queryClient = useQueryClient();
  const executeMutation = useExecuteScript();
  const createMutation = useCreateScript();
  const updateMutation = useUpdateScript();

  useEffect(() => {
    if (existingScript) {
      setCode(existingScript.code);
      setType(existingScript.type as "query" | "aggregation");
      setScriptName(existingScript.name);
      setScriptDesc(existingScript.description || "");
    }
  }, [existingScript]);

  // Palavras-chave que indicam mudança de estrutura → invalidar cache do sidebar
  const STRUCTURAL_KEYWORDS = /rename|drop|create|insert|remove|delete|update|save|copyTo|convertToCapped/i;

  const handleExecute = () => {
    executeMutation.mutate(
      { code, type, dbName: dbName || undefined, scriptId },
      {
        onSuccess: (data) => {
          setResult(data.result);
          setStatus(data.status);
          setDuration(data.durationMs);
          // Invalida o cache de coleções/databases se o código pode ter alterado estrutura
          if (STRUCTURAL_KEYWORDS.test(code)) {
            queryClient.invalidateQueries({ queryKey: ["databases"] });
            queryClient.invalidateQueries({ queryKey: ["collections"] });
          }
        },
        onError: (error) => {
          setResult({ error: error.message });
          setStatus("error");
          setDuration(0);
        },
      }
    );
  };

  const handleSave = () => {
    if (scriptId) {
      updateMutation.mutate(
        { id: scriptId, name: scriptName, description: scriptDesc, code, type },
        { onSuccess: () => setSaveOpen(false) }
      );
    } else {
      createMutation.mutate(
        { name: scriptName, description: scriptDesc, code, type },
        { onSuccess: () => setSaveOpen(false) }
      );
    }
  };

  if (scriptId && isLoadingScript) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Carregando script...
      </div>
    );
  }

  const activeDatabaseName = dbName || "(padrão da URL)";

  return (
    <Layout>
      <div className="flex flex-col h-full p-6 gap-4">
        <header className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Workbench</h1>
            <p className="text-muted-foreground text-sm">
              Execute queries e aggregations MongoDB diretamente.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {/* Database selector */}
            <div className="flex items-center gap-1.5">
              <Database className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <Select
                value={dbName || "__default__"}
                onValueChange={(v) => setDbName(v === "__default__" ? "" : v)}
              >
                <SelectTrigger className="w-[160px] bg-card h-9 text-sm">
                  <SelectValue>
                    {dbName ? (
                      <span className="font-mono">{dbName}</span>
                    ) : (
                      <span className="text-muted-foreground">Database padrão</span>
                    )}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__default__">
                    <span className="text-muted-foreground">Database padrão</span>
                  </SelectItem>
                  {databases?.map((db) => (
                    <SelectItem key={db.name} value={db.name}>
                      <span className="font-mono">{db.name}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Query type selector */}
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger className="w-[140px] bg-card h-9">
                <SelectValue placeholder="Tipo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="query">Query</SelectItem>
                <SelectItem value="aggregation">Aggregation</SelectItem>
              </SelectContent>
            </Select>

            {/* Save dialog */}
            <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="gap-2 h-9">
                  <Save className="w-4 h-4" />
                  {scriptId ? "Atualizar" : "Salvar"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{scriptId ? "Atualizar Script" : "Salvar Script"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Nome</Label>
                    <Input
                      placeholder="ex: Buscar usuários ativos"
                      value={scriptName}
                      onChange={(e) => setScriptName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Descrição</Label>
                    <Input
                      placeholder="Descrição opcional..."
                      value={scriptDesc}
                      onChange={(e) => setScriptDesc(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button
                    onClick={handleSave}
                    disabled={createMutation.isPending || updateMutation.isPending}
                  >
                    {createMutation.isPending || updateMutation.isPending ? "Salvando..." : "Salvar"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* Run button */}
            <Button
              onClick={handleExecute}
              disabled={executeMutation.isPending}
              className="gap-2 min-w-[100px] h-9 shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
            >
              {executeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              Executar
            </Button>
          </div>
        </header>

        {/* Active DB indicator */}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span>Contexto:</span>
          <Badge variant="outline" className="font-mono text-xs px-1.5 py-0 h-5">
            {activeDatabaseName}
          </Badge>
          {dbName && (
            <span className="text-muted-foreground">
              — <code className="text-foreground">db.collection</code> aponta para este database
            </span>
          )}
          {!dbName && (
            <span>
              — use o seletor acima ou <code className="text-foreground/80">db.getSiblingDB('nome')</code> no código
            </span>
          )}
        </div>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-4 min-h-0">
          <div className="flex flex-col gap-2 min-h-0">
            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">
              Editor
            </Label>
            <CodeEditor code={code} onChange={setCode} className="flex-1 shadow-md" />
          </div>

          <div className="flex flex-col gap-2 min-h-0">
            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">
              Resultado
            </Label>
            <ResultViewer data={result} status={status} duration={duration} />
          </div>
        </div>
      </div>
    </Layout>
  );
}
