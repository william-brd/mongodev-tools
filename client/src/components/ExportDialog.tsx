import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Download } from "lucide-react";

interface ExportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  db: string;
  col: string;
}

export function ExportDialog({ open, onOpenChange, db, col }: ExportDialogProps) {
  const [format, setFormat] = useState<"json" | "csv">("json");
  const [filter, setFilter] = useState("{}");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleExport = async () => {
    setError(null);
    try {
      JSON.parse(filter);
    } catch {
      setError("Filtro JSON inválido");
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({ format, filter });
      const res = await fetch(
        `/api/mongo/databases/${db}/collections/${col}/export?${params}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.message);
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const disposition = res.headers.get("content-disposition") ?? "";
      const match = disposition.match(/filename="(.+?)"/);
      a.download = match?.[1] ?? `${col}.${format}`;
      a.href = url;
      a.click();
      URL.revokeObjectURL(url);
      onOpenChange(false);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Exportar — {col}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Formato</Label>
            <RadioGroup value={format} onValueChange={(v: any) => setFormat(v)} className="flex gap-4">
              <div className="flex items-center gap-2">
                <RadioGroupItem value="json" id="json" />
                <Label htmlFor="json" className="cursor-pointer">JSON</Label>
              </div>
              <div className="flex items-center gap-2">
                <RadioGroupItem value="csv" id="csv" />
                <Label htmlFor="csv" className="cursor-pointer">CSV</Label>
              </div>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label>Filtro (MongoDB query)</Label>
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder='{ "status": "active" }'
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">Use <code>{"{}"}</code> para exportar todos os documentos.</p>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleExport} disabled={loading} className="gap-2">
            <Download className="w-4 h-4" />
            {loading ? "Exportando..." : "Exportar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
