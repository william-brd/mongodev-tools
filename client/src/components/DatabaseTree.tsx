import { useState } from "react";
import { useLocation } from "wouter";
import {
  ChevronRight,
  Database,
  TableProperties,
  RefreshCw,
  Plus,
  Trash2,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useDatabases, useCollections, useCreateCollection, useDropCollection } from "@/hooks/use-databases";
import { useAuth } from "@/hooks/use-auth";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useQueryClient } from "@tanstack/react-query";

function CollectionItem({
  db,
  col,
  active,
}: {
  db: string;
  col: string;
  active: boolean;
}) {
  const [, navigate] = useLocation();
  const { isAdmin } = useAuth();
  const [confirmDrop, setConfirmDrop] = useState(false);
  const dropCol = useDropCollection(db);

  return (
    <>
      <div
        className={cn(
          "group flex items-center gap-2 pl-7 pr-2 py-1 rounded-md cursor-pointer text-sm transition-colors",
          active
            ? "bg-primary/15 text-primary font-medium"
            : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
        )}
        onClick={() => navigate(`/collection/${db}/${col}`)}
      >
        <TableProperties className="w-3.5 h-3.5 shrink-0 opacity-60" />
        <span className="flex-1 truncate">{col}</span>
        {isAdmin && (
          <button
            className="opacity-0 group-hover:opacity-100 hover:text-destructive transition-opacity"
            onClick={(e) => { e.stopPropagation(); setConfirmDrop(true); }}
          >
            <Trash2 className="w-3 h-3" />
          </button>
        )}
      </div>

      <AlertDialog open={confirmDrop} onOpenChange={setConfirmDrop}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir coleção</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir <strong>{col}</strong>? Esta ação é irreversível e remove todos os documentos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => dropCol.mutate(col)}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function DatabaseItem({
  db,
  currentPath,
}: {
  db: string;
  currentPath: string;
}) {
  const [open, setOpen] = useState(false);
  const { isAdmin } = useAuth();
  const { data: collections, isLoading, refetch } = useCollections(open ? db : null);
  const createCol = useCreateCollection(db);

  const [showCreate, setShowCreate] = useState(false);
  const [newColName, setNewColName] = useState("");

  const handleCreate = () => {
    if (!newColName.trim()) return;
    createCol.mutate(newColName.trim(), {
      onSuccess: () => { setShowCreate(false); setNewColName(""); },
    });
  };

  const isDbActive = currentPath.startsWith(`/collection/${db}/`);

  return (
    <>
      <div>
        <button
          className={cn(
            "w-full flex items-center gap-1.5 px-2 py-1.5 rounded-md text-sm font-medium transition-colors",
            isDbActive
              ? "text-foreground bg-muted/50"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/30"
          )}
          onClick={() => setOpen((v) => !v)}
        >
          <ChevronRight
            className={cn("w-3.5 h-3.5 shrink-0 transition-transform", open && "rotate-90")}
          />
          <Database className="w-3.5 h-3.5 shrink-0" />
          <span className="flex-1 text-left truncate">{db}</span>
          {isAdmin && open && (
            <button
              className="hover:text-primary transition-colors"
              onClick={(e) => { e.stopPropagation(); setShowCreate(true); }}
            >
              <Plus className="w-3 h-3" />
            </button>
          )}
        </button>

        {open && (
          <div className="mt-0.5 space-y-0.5">
            {isLoading ? (
              <div className="pl-7 py-1">
                <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />
              </div>
            ) : (
              collections?.map((c) => (
                <CollectionItem
                  key={c.name}
                  db={db}
                  col={c.name}
                  active={currentPath === `/collection/${db}/${c.name}`}
                />
              ))
            )}
            {collections?.length === 0 && (
              <p className="pl-7 py-1 text-xs text-muted-foreground">Sem coleções</p>
            )}
          </div>
        )}
      </div>

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nova coleção em {db}</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Nome da coleção"
            value={newColName}
            onChange={(e) => setNewColName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>Cancelar</Button>
            <Button onClick={handleCreate} disabled={createCol.isPending}>
              {createCol.isPending ? "Criando..." : "Criar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function DatabaseTree() {
  const [location] = useLocation();
  const { data: databases, isLoading, refetch, isFetching } = useDatabases();
  const qc = useQueryClient();

  const handleRefresh = () => {
    qc.invalidateQueries({ queryKey: ["databases"] });
    refetch();
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/50">
        <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Databases
        </span>
        <button
          onClick={handleRefresh}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title="Atualizar"
        >
          <RefreshCw className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : databases?.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">
            Nenhum database encontrado
          </p>
        ) : (
          databases?.map((db) => (
            <DatabaseItem key={db.name} db={db.name} currentPath={location} />
          ))
        )}
      </div>
    </div>
  );
}
