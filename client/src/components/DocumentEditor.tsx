import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { AlertCircle } from "lucide-react";

interface DocumentEditorProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  initialValue?: unknown;
  onSave: (doc: unknown) => void;
  isPending?: boolean;
}

export function DocumentEditor({
  open,
  onOpenChange,
  title,
  initialValue,
  onSave,
  isPending,
}: DocumentEditorProps) {
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      try {
        setText(initialValue !== undefined ? JSON.stringify(initialValue, null, 2) : "{\n  \n}");
      } catch {
        setText("{}");
      }
      setError(null);
    }
  }, [open, initialValue]);

  const handleSave = () => {
    try {
      const parsed = JSON.parse(text);
      setError(null);
      onSave(parsed);
    } catch (e: any) {
      setError(`JSON inválido: ${e.message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs text-muted-foreground">JSON do documento</Label>
          <Textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setError(null); }}
            className="font-mono text-sm min-h-[320px] resize-y bg-[#1e1e1e] text-green-300 border-border"
            spellCheck={false}
          />
          {error && (
            <div className="flex items-center gap-2 text-destructive text-xs">
              <AlertCircle className="w-3.5 h-3.5" />
              {error}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={isPending}>
            {isPending ? "Salvando..." : "Salvar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
