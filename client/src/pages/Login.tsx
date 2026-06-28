import { useEffect } from "react";
import { Loader2 } from "lucide-react";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

export default function Login() {
  useEffect(() => {
    window.location.href = `${BASE}/api/login`;
  }, []);

  return (
    <div className="h-screen w-screen flex items-center justify-center bg-background">
      <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
    </div>
  );
}
