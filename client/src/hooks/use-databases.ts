import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";

const base = "/api/mongo/databases";

// ── Databases ─────────────────────────────────────────────────

export type DatabaseInfo = { name: string; sizeOnDisk: number; empty: boolean };

export function useDatabases() {
  return useQuery<DatabaseInfo[]>({
    queryKey: ["databases"],
    queryFn: async () => {
      const res = await fetch(base, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 30_000,
  });
}

// ── Collections ───────────────────────────────────────────────

export type CollectionInfo = { name: string; type: string; options: Record<string, unknown> };

export function useCollections(db: string | null) {
  return useQuery<CollectionInfo[]>({
    queryKey: ["collections", db],
    enabled: !!db,
    queryFn: async () => {
      const res = await fetch(`${base}/${db}/collections`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 15_000,
  });
}

export function useCreateCollection(db: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await fetch(`${base}/${db}/collections`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections", db] });
      toast({ title: "Coleção criada" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDropCollection(db: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (col: string) => {
      const res = await fetch(`${base}/${db}/collections/${col}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["collections", db] });
      toast({ title: "Coleção removida" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

// ── Stats ─────────────────────────────────────────────────────

export function useCollectionStats(db: string, col: string) {
  return useQuery({
    queryKey: ["col-stats", db, col],
    queryFn: async () => {
      const res = await fetch(`${base}/${db}/collections/${col}/stats`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 10_000,
  });
}

export function useDatabaseStats(db: string) {
  return useQuery({
    queryKey: ["db-stats", db],
    queryFn: async () => {
      const res = await fetch(`${base}/${db}/stats`, { credentials: "include" });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 15_000,
  });
}

// ── Documents ─────────────────────────────────────────────────

export type FindResult = { docs: Record<string, unknown>[]; total: number };

export function useDocuments(
  db: string,
  col: string,
  opts: { filter?: string; sort?: string; projection?: string; limit?: number; skip?: number }
) {
  return useQuery<FindResult>({
    queryKey: ["docs", db, col, opts],
    enabled: !!db && !!col,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (opts.filter) params.set("filter", opts.filter);
      if (opts.sort) params.set("sort", opts.sort);
      if (opts.projection) params.set("projection", opts.projection);
      params.set("limit", String(opts.limit ?? 50));
      params.set("skip", String(opts.skip ?? 0));
      const res = await fetch(`${base}/${db}/collections/${col}/documents?${params}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    staleTime: 5_000,
  });
}

export function useInsertDocument(db: string, col: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (doc: unknown) => {
      const res = await fetch(`${base}/${db}/collections/${col}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["docs", db, col] });
      toast({ title: "Documento inserido" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useUpdateDocument(db: string, col: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, update }: { id: string; update: unknown }) => {
      const res = await fetch(`${base}/${db}/collections/${col}/documents/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(update),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["docs", db, col] });
      toast({ title: "Documento atualizado" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useReplaceDocument(db: string, col: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ id, doc }: { id: string; doc: unknown }) => {
      const res = await fetch(`${base}/${db}/collections/${col}/documents/${id}/replace`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(doc),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["docs", db, col] });
      toast({ title: "Documento substituído" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDeleteDocument(db: string, col: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`${base}/${db}/collections/${col}/documents/${id}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["docs", db, col] });
      toast({ title: "Documento removido" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useBulkDelete(db: string, col: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch(`${base}/${db}/collections/${col}/documents/bulk-delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["docs", db, col] });
      toast({ title: `${data.deletedCount} documento(s) removido(s)` });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

// ── Indexes ───────────────────────────────────────────────────

export type IndexInfo = Record<string, unknown>;

export function useIndexes(db: string, col: string) {
  return useQuery<IndexInfo[]>({
    queryKey: ["indexes", db, col],
    enabled: !!db && !!col,
    queryFn: async () => {
      const res = await fetch(`${base}/${db}/collections/${col}/indexes`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    staleTime: 10_000,
  });
}

export function useCreateIndex(db: string, col: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (payload: { keys: Record<string, unknown>; name?: string; unique?: boolean; sparse?: boolean }) => {
      const res = await fetch(`${base}/${db}/collections/${col}/indexes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["indexes", db, col] });
      toast({ title: `Índice criado: ${data.name}` });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

export function useDropIndex(db: string, col: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async (indexName: string) => {
      const res = await fetch(`${base}/${db}/collections/${col}/indexes/${encodeURIComponent(indexName)}`, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["indexes", db, col] });
      toast({ title: "Índice removido" });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}

// ── Import ────────────────────────────────────────────────────

export function useImportDocuments(db: string, col: string) {
  const qc = useQueryClient();
  const { toast } = useToast();
  return useMutation({
    mutationFn: async ({ documents, mode }: { documents: unknown[]; mode: "insert" | "upsert" }) => {
      const res = await fetch(`${base}/${db}/collections/${col}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documents, mode }),
        credentials: "include",
      });
      if (!res.ok) throw new Error((await res.json()).message);
      return res.json();
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["docs", db, col] });
      qc.invalidateQueries({ queryKey: ["col-stats", db, col] });
      const msg = data.insertedCount != null
        ? `${data.insertedCount} documento(s) inserido(s)`
        : `${data.upsertedCount ?? 0} upserted, ${data.modifiedCount ?? 0} modificados`;
      toast({ title: "Importação concluída", description: msg });
    },
    onError: (e: Error) => toast({ title: "Erro", description: e.message, variant: "destructive" }),
  });
}
