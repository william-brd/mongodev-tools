import { useState, useEffect } from "react";
import { Layout } from "@/components/Layout";
import { CodeEditor } from "@/components/CodeEditor";
import { ResultViewer } from "@/components/ResultViewer";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useExecuteScript, useCreateScript, useScript, useUpdateScript } from "@/hooks/use-mongo";
import { Play, Save, Loader2, Share2 } from "lucide-react";
import { useLocation } from "wouter";

export default function Dashboard() {
  const [location] = useLocation();
  const searchParams = new URLSearchParams(window.location.search);
  const scriptId = searchParams.get("id") ? parseInt(searchParams.get("id")!) : null;

  const { data: existingScript, isLoading: isLoadingScript } = useScript(scriptId);
  
  const [code, setCode] = useState("// Write your MongoDB query here\n// e.g. db.collection('users').find({})\n\n");
  const [type, setType] = useState<"query" | "aggregation">("query");
  const [result, setResult] = useState<any>(null);
  const [status, setStatus] = useState<string | undefined>();
  const [duration, setDuration] = useState<number | undefined>();
  
  // Save Dialog State
  const [saveOpen, setSaveOpen] = useState(false);
  const [scriptName, setScriptName] = useState("");
  const [scriptDesc, setScriptDesc] = useState("");

  const executeMutation = useExecuteScript();
  const createMutation = useCreateScript();
  const updateMutation = useUpdateScript();

  // Load existing script if editing
  useEffect(() => {
    if (existingScript) {
      setCode(existingScript.code);
      setType(existingScript.type as "query" | "aggregation");
      setScriptName(existingScript.name);
      setScriptDesc(existingScript.description || "");
    }
  }, [existingScript]);

  const handleExecute = () => {
    executeMutation.mutate(
      { code, type },
      {
        onSuccess: (data) => {
          setResult(data.result);
          setStatus(data.status);
          setDuration(data.durationMs);
        },
        onError: (error) => {
          setResult({ error: error.message });
          setStatus("error");
          setDuration(0);
        }
      }
    );
  };

  const handleSave = () => {
    if (scriptId) {
      // Update
      updateMutation.mutate({
        id: scriptId,
        name: scriptName,
        description: scriptDesc,
        code,
        type
      }, {
        onSuccess: () => setSaveOpen(false)
      });
    } else {
      // Create
      createMutation.mutate({
        name: scriptName,
        description: scriptDesc,
        code,
        type
      }, {
        onSuccess: () => setSaveOpen(false)
      });
    }
  };

  if (scriptId && isLoadingScript) {
    return (
      <div className="flex h-screen items-center justify-center bg-background text-foreground">
        <Loader2 className="w-6 h-6 animate-spin mr-2" />
        Loading script...
      </div>
    );
  }

  return (
    <Layout>
      <div className="flex flex-col h-full p-6 gap-6">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Workbench</h1>
            <p className="text-muted-foreground text-sm">
              Execute MongoDB queries and aggregations directly.
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={type} onValueChange={(v: any) => setType(v)}>
              <SelectTrigger className="w-[140px] bg-card">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="query">Query</SelectItem>
                <SelectItem value="aggregation">Aggregation</SelectItem>
              </SelectContent>
            </Select>

            <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
              <DialogTrigger asChild>
                <Button variant="secondary" className="gap-2">
                  <Save className="w-4 h-4" />
                  {scriptId ? "Update" : "Save"}
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{scriptId ? "Update Script" : "Save Script"}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input 
                      placeholder="e.g. Find Active Users" 
                      value={scriptName}
                      onChange={(e) => setScriptName(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Description</Label>
                    <Input 
                      placeholder="Optional description..." 
                      value={scriptDesc}
                      onChange={(e) => setScriptDesc(e.target.value)}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
                    {createMutation.isPending || updateMutation.isPending ? "Saving..." : "Save Script"}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button 
              onClick={handleExecute} 
              disabled={executeMutation.isPending}
              className="gap-2 min-w-[120px] shadow-lg shadow-primary/25 hover:shadow-primary/40 transition-all"
            >
              {executeMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4 fill-current" />
              )}
              Run
            </Button>
          </div>
        </header>

        <div className="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-0">
          <div className="flex flex-col gap-2 min-h-0">
            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">Editor</Label>
            <CodeEditor 
              code={code} 
              onChange={setCode} 
              className="flex-1 shadow-md"
            />
          </div>

          <div className="flex flex-col gap-2 min-h-0">
            <Label className="text-xs font-semibold uppercase text-muted-foreground tracking-wider ml-1">Results</Label>
            <ResultViewer 
              data={result} 
              status={status}
              duration={duration}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
}
