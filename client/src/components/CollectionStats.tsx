import { useCollectionStats } from "@/hooks/use-databases";
import { Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useQueryClient } from "@tanstack/react-query";

function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / 1024 / 1024).toFixed(2)} MB`;
  return `${(n / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

function StatRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex justify-between items-center py-2 border-b border-border/50 last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-mono font-medium">{String(value)}</span>
    </div>
  );
}

interface CollectionStatsProps {
  db: string;
  col: string;
}

export function CollectionStats({ db, col }: CollectionStatsProps) {
  const qc = useQueryClient();
  const { data: stats, isLoading } = useCollectionStats(db, col);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!stats) return null;

  const s = stats as Record<string, unknown>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Estatísticas</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => qc.invalidateQueries({ queryKey: ["col-stats", db, col] })}
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card p-4">
        <StatRow label="Documentos" value={String(s["count"] ?? 0)} />
        <StatRow label="Tamanho" value={bytes(Number(s["size"] ?? 0))} />
        <StatRow label="Tamanho médio por doc" value={bytes(Number(s["avgObjSize"] ?? 0))} />
        <StatRow label="Tamanho total (com índices)" value={bytes(Number(s["totalSize"] ?? 0))} />
        <StatRow label="Tamanho dos índices" value={bytes(Number(s["totalIndexSize"] ?? 0))} />
        <StatRow label="Número de índices" value={String(s["nindexes"] ?? 0)} />
        <StatRow label="Namespace" value={String(s["ns"] ?? `${db}.${col}`)} />
      </div>

      {s["wiredTiger"] ? (
        <div className="rounded-lg border border-border bg-card p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">WiredTiger</p>
          {Object.entries(((s["wiredTiger"] as Record<string, unknown>)?.["cache"] as Record<string, unknown>) ?? {})
            .slice(0, 4)
            .map(([k, v]) => (
              <StatRow key={k} label={k} value={typeof v === "number" ? bytes(v) : String(v)} />
            ))}
        </div>
      ) : null}
    </div>
  );
}
