import { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Upload, FileJson } from "lucide-react";
import { useImportDocuments } from "@/hooks/use-databases";
import { cn } from "@/lib/utils";

interface ImportDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  db: string;
  col: string;
}

export function ImportDialog({ open, onOpenChange, db, col }: ImportDialogProps) {
  const [mode, setMode] = useState<"insert" | "upsert">("insert");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsed, setParsed] = useState<unknown[] | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const importMutation = useImportDocuments(db, col);

  const processFile = (file: File) => {
    setParseError(null);
    setParsed(null);
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const content = e.target?.result as string;
        const data = JSON.parse(content);
        const arr = Array.isArray(data) ? data : [data];
        setParsed(arr);
      } catch (err: any) {
        setParseError(`Erro ao parsear JSON: ${err.message}`);
      }
    };
    reader.readAsText(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) processFile(file);
  };

  const handleImport = () => {
    if (!parsed) return;
    importMutation.mutate({ documents: parsed, mode }, {
      onSuccess: () => {
        onOpenChange(false);
        setParsed(null);
        setFileName(null);
      },
    });
  };

  const handleClose = (v: boolean) => {
    if (!v) { setParsed(null); setFileName(null); setParseError(null); }
    onOpenChange(v);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Importar para — {col}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div
            className={cn(
              "border-2 border-dashed rounded-lg p-6 text-center cursor-pointer transition-colors",
              dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
            )}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileRef.current?.click()}
          >
            <input ref={fileRef} type="file" accept=".json" className="hidden" onChange={handleFileChange} />
            {fileName ? (
              <div className="flex items-center justify-center gap-2 text-sm text-foreground">
                <FileJson className="w-5 h-5 text-primary" />
                {fileName}
                {parsed && (
                  <span className="text-xs text-muted-foreground">({parsed.length} documentos)</span>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <Upload className="w-8 h-8 mx-auto text-muted-foreground" />
                <p className="text-sm text-muted-foreground">
                  Arraste um arquivo JSON ou clique para selecionar
                </p>
                <p className="text-xs text-muted-foreground">Suporta array ou objeto único</p>
              </div>
            )}
          </div>

          {parseError && <p className="text-xs text-destructive">{parseError}</p>}

          <div className="space-y-2">
            <Label>Modo de importação</Label>
            <RadioGroup value={mode} onValueChange={(v: any) => setMode(v)} className="space-y-1">
              <div className="flex items-start gap-2">
                <RadioGroupItem value="insert" id="insert" className="mt-0.5" />
                <div>
                  <Label htmlFor="insert" className="cursor-pointer text-sm">Inserir</Label>
                  <p className="text-xs text-muted-foreground">Insere todos como novos documentos (pode duplicar)</p>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <RadioGroupItem value="upsert" id="upsert" className="mt-0.5" />
                <div>
                  <Label htmlFor="upsert" className="cursor-pointer text-sm">Upsert</Label>
                  <p className="text-xs text-muted-foreground">Atualiza pelo _id se existir, insere se não</p>
                </div>
              </div>
            </RadioGroup>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => handleClose(false)}>Cancelar</Button>
          <Button
            onClick={handleImport}
            disabled={!parsed || importMutation.isPending}
            className="gap-2"
          >
            <Upload className="w-4 h-4" />
            {importMutation.isPending ? "Importando..." : `Importar ${parsed?.length ?? 0} doc(s)`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
