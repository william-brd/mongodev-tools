import { useState } from "react";
import { useIndexes, useCreateIndex, useDropIndex } from "@/hooks/use-databases";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Loader2, Plus, Trash2, RefreshCw } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { useQueryClient } from "@tanstack/react-query";

function formatIndexKeys(key: Record<string, unknown>) {
  return Object.entries(key)
    .map(([k, v]) => `${k}: ${v}`)
    .join(", ");
}

interface IndexManagerProps {
  db: string;
  col: string;
}

export function IndexManager({ db, col }: IndexManagerProps) {
  const { isAdmin } = useAuth();
  const qc = useQueryClient();
  const { data: indexes, isLoading } = useIndexes(db, col);
  const createIdx = useCreateIndex(db, col);
  const dropIdx = useDropIndex(db, col);

  const [showCreate, setShowCreate] = useState(false);
  const [keysText, setKeysText] = useState('{ "field": 1 }');
  const [indexName, setIndexName] = useState("");
  const [unique, setUnique] = useState(false);
  const [sparse, setSparse] = useState(false);
  const [keysError, setKeysError] = useState<string | null>(null);
  const [confirmDrop, setConfirmDrop] = useState<string | null>(null);

  const handleCreate = () => {
    setKeysError(null);
    let keys: Record<string, unknown>;
    try {
      keys = JSON.parse(keysText);
    } catch {
      setKeysError("JSON inválido");
      return;
    }
    createIdx.mutate(
      { keys, name: indexName || undefined, unique, sparse },
      { onSuccess: () => { setShowCreate(false); setKeysText('{ "field": 1 }'); setIndexName(""); setUnique(false); setSparse(false); } }
    );
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Índices ({indexes?.length ?? 0})</h3>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7"
            onClick={() => qc.invalidateQueries({ queryKey: ["indexes", db, col] })}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </Button>
          {isAdmin && (
            <Button size="sm" className="gap-1.5 h-7" onClick={() => setShowCreate(true)}>
              <Plus className="w-3.5 h-3.5" /> Criar índice
            </Button>
          )}
        </div>
      </div>

      <div className="space-y-2">
        {indexes?.map((idx: any) => (
          <div
            key={idx.name}
            className="flex items-start justify-between p-3 rounded-lg border border-border bg-card hover:bg-muted/20 transition-colors"
          >
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-mono font-medium">{idx.name}</span>
                {idx.unique && <Badge variant="secondary" className="text-[10px]">unique</Badge>}
                {idx.sparse && <Badge variant="outline" className="text-[10px]">sparse</Badge>}
                {idx.name === "_id_" && <Badge className="text-[10px] bg-blue-600">_id</Badge>}
              </div>
              <p className="text-xs text-muted-foreground font-mono">
                {formatIndexKeys(idx.key ?? {})}
              </p>
            </div>

            {isAdmin && idx.name !== "_id_" && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive"
                onClick={() => setConfirmDrop(idx.name)}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        ))}
      </div>

      {/* Create Index Dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Criar índice — {col}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Keys (JSON)</Label>
              <Input
                value={keysText}
                onChange={(e) => setKeysText(e.target.value)}
                className="font-mono text-sm"
                placeholder='{ "field": 1 }'
              />
              <p className="text-xs text-muted-foreground">1 = ascendente, -1 = descendente, "text" = text index</p>
              {keysError && <p className="text-xs text-destructive">{keysError}</p>}
            </div>
            <div className="space-y-2">
              <Label>Nome (opcional)</Label>
              <Input
                value={indexName}
                onChange={(e) => setIndexName(e.target.value)}
                placeholder="nome_do_indice"
              />
            </div>
            <div className="flex items-center gap-6">
              <div className="flex items-center gap-2">
                <Switch id="unique" checked={unique} onCheckedChange={setUnique} />
                <Label htmlFor="unique">Unique</Label>
              </div>
              <div className="flex items-center gap-2">
                <Switch id="sparse" checked={sparse} onCheckedChange={setSparse} />
                <Label htmlFor="sparse">Sparse</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createIdx.isPending}>
              {createIdx.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drop confirm */}
      <AlertDialog open={!!confirmDrop} onOpenChange={(v) => !v && setConfirmDrop(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover índice</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja remover o índice <strong>{confirmDrop}</strong>?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => { if (confirmDrop) dropIdx.mutate(confirmDrop); setConfirmDrop(null); }}
            >
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
