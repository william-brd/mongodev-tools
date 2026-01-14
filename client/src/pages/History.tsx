import { useState } from "react";
import { Layout } from "@/components/Layout";
import { useExecutions } from "@/hooks/use-mongo";
import { format } from "date-fns";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { highlight, languages } from "prismjs";
import "prismjs/themes/prism-tomorrow.css";

export default function History() {
  const pageSize = 10;
  const [visibleCount, setVisibleCount] = useState(pageSize);
  const { data: executions, isLoading } = useExecutions({
    limit: visibleCount + 1,
    offset: 0,
  });

  const visibleExecutions = executions?.slice(0, visibleCount) ?? [];
  const hasMore = (executions?.length ?? 0) > visibleCount;

  if (isLoading) {
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
          <h1 className="text-3xl font-bold tracking-tight mb-2">
            Execution History
          </h1>
          <p className="text-muted-foreground">
            Log of all script executions and their results.
          </p>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Status</TableHead>
                <TableHead>Duration</TableHead>
                <TableHead>Date & Time</TableHead>
                <TableHead>Result Preview</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {executions?.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-32 text-center text-muted-foreground"
                  >
                    No history yet.
                  </TableCell>
                </TableRow>
              ) : (
                visibleExecutions.map((exec) => {
                  const statusBadge =
                    exec.status === "success" ? (
                      <Badge
                        variant="outline"
                        className="text-green-500 border-green-500/20 bg-green-500/10"
                      >
                        Success
                      </Badge>
                    ) : (
                      <Badge variant="destructive">Error</Badge>
                    );

                  return (
                    <TableRow
                      key={exec.id}
                      className="hover:bg-muted/30 transition-colors"
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          {exec.status === "success" ? (
                            <CheckCircle2 className="w-4 h-4 text-green-500" />
                          ) : (
                            <AlertCircle className="w-4 h-4 text-red-500" />
                          )}
                          <span
                            className={
                              exec.status === "success"
                                ? "text-green-500"
                                : "text-red-500 capitalize"
                            }
                          >
                            {exec.status}
                          </span>
                        </div>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {exec.durationMs}ms
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {exec.executedAt &&
                          format(new Date(exec.executedAt), "MMM d, HH:mm:ss")}
                      </TableCell>
                      <TableCell className="max-w-[300px] truncate font-mono text-xs text-muted-foreground">
                        {JSON.stringify(exec.result)}
                      </TableCell>
                      <TableCell className="text-right">
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              View Result
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-3xl max-h-[80vh]">
                            <DialogHeader>
                              <DialogTitle className="flex items-center gap-2">
                                Execution Result
                                {statusBadge}
                              </DialogTitle>
                            </DialogHeader>
                            <ScrollArea className="h-[60vh] rounded-md border border-border bg-[#1e1e1e] p-4">
                              <pre
                                className="font-mono text-sm text-green-300"
                                dangerouslySetInnerHTML={{
                                  __html: highlight(
                                    JSON.stringify(exec.result, null, 2),
                                    languages.json,
                                    "json"
                                  ),
                                }}
                              />
                            </ScrollArea>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
        {executions && executions.length > 0 ? (
          <div className="flex items-center justify-end">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setVisibleCount((prev) => prev + pageSize)}
              disabled={!hasMore}
            >
              Load 10 more
            </Button>
          </div>
        ) : null}
      </div>
    </Layout>
  );
}
