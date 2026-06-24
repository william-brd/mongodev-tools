import { useState, useMemo, useRef, useCallback } from "react";
import { useParams } from "wouter";
import { Layout } from "@/components/Layout";
import { DocumentEditor } from "@/components/DocumentEditor";
import { ExportDialog } from "@/components/ExportDialog";
import { ImportDialog } from "@/components/ImportDialog";
import { IndexManager } from "@/components/IndexManager";
import { CollectionStats } from "@/components/CollectionStats";
import { useDocuments, useInsertDocument, useUpdateDocument, useReplaceDocument, useDeleteDocument, useBulkDelete } from "@/hooks/use-databases";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  Plus,
  Trash2,
  Download,
  Upload,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
  MoreHorizontal,
  Search,
  FileJson,
  Loader2,
  Pencil,
  Copy,
} from "lucide-react";
import { cn } from "@/lib/utils";

const DEFAULT_COL_WIDTH = 180;
const MIN_COL_WIDTH = 60;

function getOid(doc: Record<string, unknown>): string {
  const id = doc["_id"];
  if (!id) return "";
  if (typeof id === "string") return id;
  if (typeof id === "object" && id !== null && "$oid" in id) return String((id as any)["$oid"]);
  return JSON.stringify(id);
}

function cellValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") {
    if ("$oid" in (v as any)) return `ObjectId("${(v as any).$oid}")`;
    if ("$date" in (v as any)) return new Date((v as any).$date).toLocaleString("pt-BR");
    return JSON.stringify(v);
  }
  return String(v);
}

const PAGE_SIZES = [10, 25, 50, 100];

export default function CollectionView() {
  const params = useParams<{ db: string; col: string }>();
  const { db, col } = params;
  const { isAdmin } = useAuth();

  const [filter, setFilter] = useState("{}");
  const [filterInput, setFilterInput] = useState("{}");
  const [sort, setSort] = useState("{}");
  const [sortInput, setSortInput] = useState("{}");
  const [limit, setLimit] = useState(50);
  const [skip, setSkip] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [filterError, setFilterError] = useState<string | null>(null);

  // Dialogs
  const [addOpen, setAddOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<Record<string, unknown> | null>(null);
  const [replaceDoc, setReplaceDoc] = useState<Record<string, unknown> | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const { data, isLoading, error: queryError, refetch, isFetching } = useDocuments(db, col, {
    filter,
    sort,
    limit,
    skip,
  });
  const insertMutation = useInsertDocument(db, col);
  const updateMutation = useUpdateDocument(db, col);
  const replaceMutation = useReplaceDocument(db, col);
  const deleteMutation = useDeleteDocument(db, col);
  const bulkDelete = useBulkDelete(db, col);

  const docs = data?.docs ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const currentPage = Math.floor(skip / limit) + 1;

  const columns = useMemo(() => {
    const keys = new Set<string>();
    docs.slice(0, 20).forEach((d) => Object.keys(d).forEach((k) => keys.add(k)));
    const arr = Array.from(keys);
    const idIdx = arr.indexOf("_id");
    if (idIdx > 0) { arr.splice(idIdx, 1); arr.unshift("_id"); }
    return arr;
  }, [docs]);

  // Redimensionamento de colunas
  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const resizingRef = useRef<{ col: string; startX: number; startW: number } | null>(null);

  const startResize = useCallback((colName: string, e: React.MouseEvent) => {
    e.preventDefault();
    const startW = colWidths[colName] ?? DEFAULT_COL_WIDTH;
    resizingRef.current = { col: colName, startX: e.clientX, startW };

    const onMove = (ev: MouseEvent) => {
      if (!resizingRef.current) return;
      const delta = ev.clientX - resizingRef.current.startX;
      const newW = Math.max(MIN_COL_WIDTH, resizingRef.current.startW + delta);
      setColWidths((prev) => ({ ...prev, [resizingRef.current!.col]: newW }));
    };

    const onUp = () => {
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };

    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, [colWidths]);

  // Normaliza: string vazia ou apenas espaços → "{}"
  const normalizeJson = (value: string) => value.trim() || "{}";

  const applyFilter = () => {
    setFilterError(null);
    const normalizedFilter = normalizeJson(filterInput);
    const normalizedSort = normalizeJson(sortInput);
    try {
      JSON.parse(normalizedFilter);
      JSON.parse(normalizedSort);
      setFilterInput(normalizedFilter);
      setSortInput(normalizedSort);
      setFilter(normalizedFilter);
      setSort(normalizedSort);
      setSkip(0);
      setSelected(new Set());
    } catch (e: any) {
      setFilterError(`JSON inválido: ${e.message}`);
    }
  };

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === docs.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(docs.map(getOid)));
    }
  };

  const handleBulkDelete = () => {
    bulkDelete.mutate(Array.from(selected), {
      onSuccess: () => setSelected(new Set()),
    });
  };

  const handleCopyDoc = (doc: Record<string, unknown>) => {
    const { _id: _, ...rest } = doc;
    navigator.clipboard.writeText(JSON.stringify(rest, null, 2));
  };

  return (
    <Layout>
      <div className="flex flex-col h-full">
        {/* Header */}
        <header className="px-6 py-4 border-b border-border flex items-center justify-between gap-4 shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold">{col}</h1>
              <Badge variant="outline" className="font-mono text-xs">{db}</Badge>
              {total > 0 && (
                <Badge variant="secondary" className="text-xs">{total.toLocaleString()} docs</Badge>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setExportOpen(true)}>
              <Download className="w-3.5 h-3.5" /> Exportar
            </Button>
            {isAdmin && (
              <>
                <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => setImportOpen(true)}>
                  <Upload className="w-3.5 h-3.5" /> Importar
                </Button>
                <Button size="sm" className="gap-1.5 h-8" onClick={() => setAddOpen(true)}>
                  <Plus className="w-3.5 h-3.5" /> Inserir
                </Button>
              </>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              onClick={() => refetch()}
              disabled={isFetching}
            >
              <RefreshCw className={cn("w-4 h-4", isFetching && "animate-spin")} />
            </Button>
          </div>
        </header>

        <Tabs defaultValue="documents" className="flex flex-col flex-1 min-h-0">
          <div className="px-6 pt-2 border-b border-border shrink-0">
            <TabsList className="h-9">
              <TabsTrigger value="documents" className="text-xs">Documentos</TabsTrigger>
              <TabsTrigger value="indexes" className="text-xs">Índices</TabsTrigger>
              <TabsTrigger value="stats" className="text-xs">Estatísticas</TabsTrigger>
            </TabsList>
          </div>

          {/* Documents tab */}
          <TabsContent value="documents" className="flex flex-col flex-1 min-h-0 mt-0">
            {/* Filter bar */}
            <div className="px-4 py-3 border-b border-border shrink-0 space-y-2">
              <div className="flex items-center gap-2">
                <div className="relative flex-1">
                  <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={filterInput}
                    onChange={(e) => setFilterInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyFilter()}
                    placeholder='Filtro: { "campo": "valor" }'
                    className="pl-8 font-mono text-xs h-8"
                  />
                </div>
                <div className="w-48">
                  <Input
                    value={sortInput}
                    onChange={(e) => setSortInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && applyFilter()}
                    placeholder='Sort: { "campo": -1 }'
                    className="font-mono text-xs h-8"
                  />
                </div>
                <Button size="sm" className="h-8 gap-1.5" onClick={applyFilter}>
                  <Search className="w-3.5 h-3.5" /> Filtrar
                </Button>
                {(filter !== "{}" || sort !== "{}") && (
                  <Button variant="ghost" size="sm" className="h-8" onClick={() => {
                    setFilterInput("{}"); setSortInput("{}"); setFilter("{}"); setSort("{}"); setSkip(0);
                  }}>
                    Limpar
                  </Button>
                )}
              </div>
              {filterError && (
                <p className="text-xs text-destructive">
                  {filterError}
                </p>
              )}
              {!filterError && queryError && (
                <p className="text-xs text-destructive">
                  Erro do servidor: {(queryError as Error).message}
                </p>
              )}

              {selected.size > 0 && isAdmin && (
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">{selected.size} selecionado(s)</span>
                  <Button
                    variant="destructive"
                    size="sm"
                    className="h-7 gap-1"
                    onClick={handleBulkDelete}
                    disabled={bulkDelete.isPending}
                  >
                    <Trash2 className="w-3 h-3" />
                    Excluir selecionados
                  </Button>
                </div>
              )}
            </div>

            {/* Table */}
            {isLoading ? (
              <div className="flex items-center justify-center flex-1">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
              </div>
            ) : docs.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 text-muted-foreground">
                <FileJson className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Nenhum documento encontrado</p>
              </div>
            ) : (
              <div className="flex-1 overflow-auto">
                <table className="text-sm border-collapse" style={{ tableLayout: "fixed", minWidth: "100%" }}>
                  <colgroup>
                    {isAdmin && <col style={{ width: 36 }} />}
                    {columns.map((c) => (
                      <col key={c} style={{ width: colWidths[c] ?? DEFAULT_COL_WIDTH }} />
                    ))}
                    <col style={{ width: 40 }} />
                  </colgroup>
                  <thead className="sticky top-0 bg-card/95 backdrop-blur z-10">
                    <tr className="border-b border-border">
                      {isAdmin && (
                        <th className="px-3 py-2 w-9">
                          <Checkbox
                            checked={selected.size === docs.length && docs.length > 0}
                            onCheckedChange={toggleAll}
                          />
                        </th>
                      )}
                      {columns.map((c) => (
                        <th
                          key={c}
                          className="px-3 py-2 text-left font-medium text-muted-foreground text-xs uppercase tracking-wider whitespace-nowrap select-none relative"
                          style={{ width: colWidths[c] ?? DEFAULT_COL_WIDTH }}
                        >
                          <span className="block overflow-hidden text-ellipsis pr-2">{c}</span>
                          {/* Resize handle */}
                          <div
                            className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/40 active:bg-primary/60 transition-colors"
                            onMouseDown={(e) => startResize(c, e)}
                          />
                        </th>
                      ))}
                      <th className="w-10 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {docs.map((doc, i) => {
                      const id = getOid(doc);
                      const isSelected = selected.has(id);
                      return (
                        <tr
                          key={id || i}
                          className={cn(
                            "border-b border-border/50 hover:bg-muted/30 transition-colors",
                            isSelected && "bg-primary/5"
                          )}
                        >
                          {isAdmin && (
                            <td className="px-3 py-2">
                              <Checkbox
                                checked={isSelected}
                                onCheckedChange={() => toggleSelect(id)}
                              />
                            </td>
                          )}
                          {columns.map((c) => (
                            <td
                              key={c}
                              className="px-3 py-2 font-mono text-xs text-foreground"
                              style={{ maxWidth: colWidths[c] ?? DEFAULT_COL_WIDTH }}
                            >
                              <span className="truncate block" title={cellValue(doc[c])}>
                                {cellValue(doc[c])}
                              </span>
                            </td>
                          ))}
                          <td className="px-2 py-2">
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 opacity-60 hover:opacity-100">
                                  <MoreHorizontal className="w-3.5 h-3.5" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-40">
                                <DropdownMenuItem onClick={() => setEditDoc(doc)}>
                                  <Pencil className="mr-2 w-3.5 h-3.5" /> Editar ($set)
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setReplaceDoc(doc)}>
                                  <FileJson className="mr-2 w-3.5 h-3.5" /> Substituir
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => handleCopyDoc(doc)}>
                                  <Copy className="mr-2 w-3.5 h-3.5" /> Copiar JSON
                                </DropdownMenuItem>
                                {isAdmin && (
                                  <>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      className="text-destructive focus:text-destructive"
                                      onClick={() => setDeleteId(id)}
                                    >
                                      <Trash2 className="mr-2 w-3.5 h-3.5" /> Excluir
                                    </DropdownMenuItem>
                                  </>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            <div className="flex items-center justify-between px-4 py-3 border-t border-border shrink-0 bg-card/50">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Select value={String(limit)} onValueChange={(v) => { setLimit(Number(v)); setSkip(0); }}>
                  <SelectTrigger className="h-7 w-20 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAGE_SIZES.map((n) => (
                      <SelectItem key={n} value={String(n)}>{n}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span>por página</span>
                <span className="ml-2">
                  {skip + 1}–{Math.min(skip + limit, total)} de {total.toLocaleString()}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={skip === 0}
                  onClick={() => setSkip(Math.max(0, skip - limit))}
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </Button>
                <span className="text-xs w-16 text-center">
                  {currentPage} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="icon"
                  className="h-7 w-7"
                  disabled={skip + limit >= total}
                  onClick={() => setSkip(skip + limit)}
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </TabsContent>

          {/* Indexes tab */}
          <TabsContent value="indexes" className="flex-1 overflow-auto p-6 mt-0">
            <IndexManager db={db} col={col} />
          </TabsContent>

          {/* Stats tab */}
          <TabsContent value="stats" className="flex-1 overflow-auto p-6 mt-0">
            <CollectionStats db={db} col={col} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Add document */}
      <DocumentEditor
        open={addOpen}
        onOpenChange={setAddOpen}
        title={`Inserir documento — ${col}`}
        onSave={(doc) => insertMutation.mutate(doc, { onSuccess: () => setAddOpen(false) })}
        isPending={insertMutation.isPending}
      />

      {/* Edit document ($set) */}
      <DocumentEditor
        open={!!editDoc}
        onOpenChange={(v) => !v && setEditDoc(null)}
        title="Editar documento ($set)"
        initialValue={editDoc ?? undefined}
        onSave={(update) => {
          if (!editDoc) return;
          updateMutation.mutate(
            { id: getOid(editDoc), update },
            { onSuccess: () => setEditDoc(null) }
          );
        }}
        isPending={updateMutation.isPending}
      />

      {/* Replace document */}
      <DocumentEditor
        open={!!replaceDoc}
        onOpenChange={(v) => !v && setReplaceDoc(null)}
        title="Substituir documento"
        initialValue={replaceDoc ?? undefined}
        onSave={(doc) => {
          if (!replaceDoc) return;
          replaceMutation.mutate(
            { id: getOid(replaceDoc), doc },
            { onSuccess: () => setReplaceDoc(null) }
          );
        }}
        isPending={replaceMutation.isPending}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteId} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir documento</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é irreversível. O documento será permanentemente excluído.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (deleteId) deleteMutation.mutate(deleteId, { onSuccess: () => setDeleteId(null) });
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Export */}
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} db={db} col={col} />

      {/* Import */}
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} db={db} col={col} />
    </Layout>
  );
}
