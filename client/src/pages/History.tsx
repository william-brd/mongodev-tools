import { useEffect, useState } from "react";
import { Layout } from "@/components/Layout";
import { useExecution, useExecutions } from "@/hooks/use-mongo";
import { format } from "date-fns";
import type { ExecutionSummary } from "@shared/schema";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Loader2, AlertCircle, CheckCircle2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { highlight, languages } from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-javascript";
import { sanitizePrism } from "@/lib/sanitize";

export default function History() {
  const pageSize = 10;
  const [offset, setOffset] = useState(0);
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const [selectedExecutionId, setSelectedExecutionId] = useState<number | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);

  const { data: executionsQueryData, isLoading, isFetching } = useExecutions({ limit: pageSize, offset });
  const { data: executionDetails, isLoading: isLoadingExecution, isError: isExecutionError } =
    useExecution(dialogOpen ? selectedExecutionId : null);

  const executionResultText =
    executionDetails !== undefined
      ? JSON.stringify(executionDetails?.result ?? null, null, 2)
      : "";

  useEffect(() => {
    if (!executionsQueryData) return;
    const nextPage = executionsQueryData.slice(0, pageSize);
    setHasMore(executionsQueryData.length === pageSize);
    setExecutions((prev) => (offset === 0 ? nextPage : [...prev, ...nextPage]));
  }, [executionsQueryData, offset]);

  if (isLoading && executions.length === 0) {
    return (
      <Layout>
        <div className="h-full flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="p-8 max-w-7xl mx-auto space-y-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Execution History</h1>
          <p className="text-muted-foreground">Log of all script executions and their results.</p>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Executado por</TableHead>
                <TableHead>Data & Hora</TableHead>
                <TableHead>Código</TableHead>
                <TableHead>Duração</TableHead>
                <TableHead className="text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                    Nenhuma execução registrada.
                  </TableCell>
                </TableRow>
              ) : (
                executions.map((exec) => (
                  <TableRow key={exec.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {exec.status === "success" ? (
                          <CheckCircle2 className="w-4 h-4 text-green-500" />
                        ) : (
                          <AlertCircle className="w-4 h-4 text-red-500" />
                        )}
                        <span className={exec.status === "success" ? "text-green-500" : "text-red-500 capitalize"}>
                          {exec.status}
                        </span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground font-mono">
                      {exec.executedBy ?? "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {exec.executedAt && format(new Date(exec.executedAt), "dd/MM/yyyy HH:mm:ss")}
                    </TableCell>
                    <TableCell className="max-w-[280px]">
                      <code className="block truncate text-xs text-muted-foreground font-mono">
                        {exec.code ? exec.code.replace(/\s+/g, " ").trim().slice(0, 120) : "—"}
                      </code>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">
                      {exec.durationMs}ms
                    </TableCell>
                    <TableCell className="text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          setSelectedExecutionId(exec.id);
                          setDialogOpen(true);
                        }}
                      >
                        Ver detalhes
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <Dialog
          open={dialogOpen}
          onOpenChange={(open) => {
            setDialogOpen(open);
            if (!open) setSelectedExecutionId(null);
          }}
        >
          <DialogContent className="max-w-3xl max-h-[85vh]">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                Detalhes da Execução
                {executionDetails?.status === "success" ? (
                  <Badge variant="outline" className="text-green-500 border-green-500/20 bg-green-500/10">
                    Success
                  </Badge>
                ) : executionDetails ? (
                  <Badge variant="destructive">Error</Badge>
                ) : null}
                {executionDetails?.executedBy && (
                  <span className="text-xs font-normal text-muted-foreground ml-auto">
                    por {executionDetails.executedBy}
                  </span>
                )}
              </DialogTitle>
            </DialogHeader>

            {isLoadingExecution ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Carregando...
              </div>
            ) : isExecutionError ? (
              <div className="text-sm text-red-400 py-4">Erro ao carregar detalhes.</div>
            ) : (
              <Tabs defaultValue="code" className="flex-1">
                <TabsList className="mb-2">
                  <TabsTrigger value="code">Código</TabsTrigger>
                  <TabsTrigger value="result">Resultado</TabsTrigger>
                </TabsList>

                <TabsContent value="code">
                  <ScrollArea className="h-[55vh] rounded-md border border-border bg-[#1e1e1e] p-4">
                    {executionDetails?.code ? (
                      <pre
                        className="font-mono text-sm text-yellow-200"
                        dangerouslySetInnerHTML={{
                          __html: sanitizePrism(highlight(executionDetails.code, languages.javascript, "javascript")),
                        }}
                      />
                    ) : (
                      <p className="text-muted-foreground text-sm">Código não registrado.</p>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="result">
                  <ScrollArea className="h-[55vh] rounded-md border border-border bg-[#1e1e1e] p-4">
                    <pre
                      className={`font-mono text-sm ${
                        executionDetails?.status === "error" ? "text-red-400" : "text-green-300"
                      }`}
                      dangerouslySetInnerHTML={{
                        __html: sanitizePrism(highlight(executionResultText, languages.json, "json")),
                      }}
                    />
                  </ScrollArea>
                </TabsContent>
              </Tabs>
            )}
          </DialogContent>
        </Dialog>

        {executions.length > 0 && (
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setOffset((prev) => prev + pageSize)}
              disabled={!hasMore || isFetching}
            >
              Carregar mais 10
            </Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
