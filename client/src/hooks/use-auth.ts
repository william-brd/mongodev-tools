import { useQuery } from "@tanstack/react-query";
import { prefixUrl } from "../lib/queryClient";

export type AuthUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "readonly";
  profileImageUrl: string | null;
};

async function fetchUser(): Promise<AuthUser | null> {
  const res = await fetch(prefixUrl("/api/auth/user"), { credentials: "include" });
  if (res.status === 401) return null;
  if (!res.ok) throw new Error(`${res.status}: ${res.statusText}`);
  return res.json();
}

export function useAuth() {
  const { data: user, isLoading } = useQuery<AuthUser | null>({
    queryKey: ["auth-user"],
    queryFn: fetchUser,
    staleTime: 60_000,
    retry: false,
  });

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated: !!user,
    isAdmin: user?.role === "admin",
    logout: () => { window.location.href = prefixUrl("/api/logout"); },
  };
}
