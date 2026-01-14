import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { useToast } from "@/hooks/use-toast";
import { type InsertScript } from "@shared/schema";

export function useScripts() {
  return useQuery({
    queryKey: [api.scripts.list.path],
    queryFn: async () => {
      const res = await fetch(api.scripts.list.path, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to fetch scripts");
      return api.scripts.list.responses[200].parse(await res.json());
    },
  });
}

export function useScript(id: number | null) {
  return useQuery({
    queryKey: [api.scripts.get.path, id],
    enabled: !!id,
    queryFn: async () => {
      if (!id) return null;
      const url = buildUrl(api.scripts.get.path, { id });
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch script");
      return api.scripts.get.responses[200].parse(await res.json());
    },
  });
}

export function useCreateScript() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: InsertScript) => {
      const res = await fetch(api.scripts.create.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to save script");
      return api.scripts.create.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.scripts.list.path] });
      toast({ title: "Success", description: "Script saved successfully" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useUpdateScript() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({
      id,
      ...data
    }: { id: number } & Partial<InsertScript>) => {
      const url = buildUrl(api.scripts.update.path, { id });
      const res = await fetch(url, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to update script");
      return api.scripts.update.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.scripts.list.path] });
      toast({ title: "Success", description: "Script updated successfully" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useDeleteScript() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (id: number) => {
      const url = buildUrl(api.scripts.delete.path, { id });
      const res = await fetch(url, {
        method: "DELETE",
        credentials: "include",
      });
      if (!res.ok) throw new Error("Failed to delete script");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.scripts.list.path] });
      toast({ title: "Success", description: "Script deleted" });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useExecuteScript() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: {
      code: string;
      type: "query" | "aggregation";
    }) => {
      const res = await fetch(api.scripts.execute.path, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
        credentials: "include",
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.message || "Execution failed");
      }

      return api.scripts.execute.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.executions.list.path] });
    },
    onError: (error) => {
      toast({
        title: "Execution Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });
}

export function useExecutions(params?: { limit?: number; offset?: number }) {
  const limit = params?.limit ?? 10;
  const offset = params?.offset ?? 0;

  return useQuery({
    queryKey: [api.executions.list.path, limit, offset],
    queryFn: async () => {
      const url = `${api.executions.list.path}?limit=${limit}&offset=${offset}`;
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch executions");
      return api.executions.list.responses[200].parse(await res.json());
    },
  });
}
