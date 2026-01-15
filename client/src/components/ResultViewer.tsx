import { useEffect, useMemo, useState } from "react";
import { Download, FileJson, FileText, Table } from "lucide-react";
import { saveAs } from "file-saver";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { highlight, languages } from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-json";

interface ResultViewerProps {
  data: any;
  status?: string;
  duration?: number;
}

export function ResultViewer({ data, status, duration }: ResultViewerProps) {
  const [visibleLines, setVisibleLines] = useState(100);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    setVisibleLines(100);
    setShowAll(false);
  }, [data, status]);

  if (!data && status !== "error") {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-12 border-2 border-dashed border-border/50 rounded-xl bg-muted/5">
        <div className="w-16 h-16 mb-4 rounded-full bg-muted/20 flex items-center justify-center">
          <FileJson className="w-8 h-8 opacity-50" />
        </div>
        <p className="font-medium">No results yet</p>
        <p className="text-sm opacity-60">Run a query to see results here</p>
      </div>
    );
  }

  const isError = status === "error";
  const jsonString = useMemo(() => {
    try {
      const raw = JSON.stringify(
        data,
        (_key, value) => (typeof value === "bigint" ? value.toString() : value),
        2
      );
      return raw ?? String(data);
    } catch {
      return String(data);
    }
  }, [data]);
  const lines = useMemo(() => jsonString.split("\n"), [jsonString]);
  const effectiveLines = showAll ? lines.length : visibleLines;
  const displayLines = lines.slice(0, effectiveLines).join("\n");
  const hasMore = effectiveLines < lines.length;

  const handleExport = (format: "json" | "csv" | "txt") => {
    let blob: Blob;
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");

    if (format === "json") {
      blob = new Blob([jsonString], { type: "application/json;charset=utf-8" });
      saveAs(blob, `result-${timestamp}.json`);
    } else if (format === "txt") {
      blob = new Blob([jsonString], { type: "text/plain;charset=utf-8" });
      saveAs(blob, `result-${timestamp}.txt`);
    } else if (format === "csv") {
      // Basic flat CSV conversion
      const items = Array.isArray(data) ? data : [data];
      if (items.length === 0) return;

      const keys = Object.keys(items[0] || {});
      const csvHeader = keys.join(",");
      const csvRows = items.map((item: any) => {
        return keys
          .map((key) => {
            const val = item[key];
            return typeof val === "object"
              ? JSON.stringify(val).replace(/,/g, ";")
              : val;
          })
          .join(",");
      });
      const csvString = [csvHeader, ...csvRows].join("\n");
      blob = new Blob([csvString], { type: "text/csv;charset=utf-8" });
      saveAs(blob, `result-${timestamp}.csv`);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card rounded-xl border border-border shadow-sm overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">Result</span>
          {duration !== undefined && (
            <span className="text-xs font-mono text-muted-foreground bg-background px-2 py-0.5 rounded border border-border">
              {duration}ms
            </span>
          )}
          {status && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                status === "success"
                  ? "bg-green-500/10 text-green-500"
                  : "bg-red-500/10 text-red-500"
              }`}
            >
              {status}
            </span>
          )}
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-2 bg-background"
            >
              <Download className="w-3.5 h-3.5" />
              Export
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-40">
            <DropdownMenuItem onClick={() => handleExport("json")}>
              <FileJson className="mr-2 w-4 h-4" /> JSON
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("csv")}>
              <Table className="mr-2 w-4 h-4" /> CSV
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => handleExport("txt")}>
              <FileText className="mr-2 w-4 h-4" /> Text
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <ScrollArea className="flex-1 bg-[#1e1e1e]">
        <div className="p-4 font-mono text-sm">
          {isError ? (
            <pre className="text-red-400 whitespace-pre-wrap">
              {displayLines}
            </pre>
          ) : (
            <pre
              className="text-green-300"
              dangerouslySetInnerHTML={{
                __html: highlight(displayLines, languages.json, "json"),
              }}
            />
          )}
        </div>
      </ScrollArea>

      <div className="flex items-center justify-between gap-3 border-t border-border bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
        <span>
          Showing {Math.min(effectiveLines, lines.length)} of {lines.length}{" "}
          lines
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setVisibleLines((prev) => prev + 100)}
            disabled={!hasMore}
          >
            +100 lines
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            onClick={() => setShowAll(true)}
            disabled={!hasMore}
          >
            Load all
          </Button>
        </div>
      </div>
    </div>
  );
}
