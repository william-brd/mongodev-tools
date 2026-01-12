import { Layout } from "@/components/Layout";
import { useScripts, useDeleteScript } from "@/hooks/use-mongo";
import { format } from "date-fns";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Play, Pencil, Trash2, Code, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function ScriptsList() {
  const { data: scripts, isLoading } = useScripts();
  const deleteMutation = useDeleteScript();

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
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight mb-2">Saved Scripts</h1>
            <p className="text-muted-foreground">Manage your collection of MongoDB queries and aggregations.</p>
          </div>
          <Link href="/">
            <Button className="gap-2">
              <Code className="w-4 h-4" />
              New Script
            </Button>
          </Link>
        </div>

        <div className="bg-card rounded-xl border border-border shadow-sm overflow-hidden">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead className="w-[30%]">Name</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Description</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scripts?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="h-32 text-center text-muted-foreground">
                    No scripts saved yet. Create one in the workbench!
                  </TableCell>
                </TableRow>
              ) : (
                scripts?.map((script) => (
                  <TableRow key={script.id} className="group hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-foreground">
                      {script.name}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={
                        script.type === 'aggregation' 
                          ? 'border-purple-500/30 text-purple-400 bg-purple-500/5' 
                          : 'border-blue-500/30 text-blue-400 bg-blue-500/5'
                      }>
                        {script.type}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground truncate max-w-[200px]">
                      {script.description || "—"}
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {script.createdAt && format(new Date(script.createdAt), "MMM d, yyyy")}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/?id=${script.id}`}>
                          <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500 hover:text-green-400 hover:bg-green-500/10">
                            <Play className="w-4 h-4" />
                          </Button>
                        </Link>
                        <Link href={`/?id=${script.id}`}>
                          <Button size="icon" variant="ghost" className="h-8 w-8">
                            <Pencil className="w-4 h-4" />
                          </Button>
                        </Link>
                        
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-red-400 hover:bg-red-500/10">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Delete Script</AlertDialogTitle>
                              <AlertDialogDescription>
                                Are you sure you want to delete "{script.name}"? This action cannot be undone.
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Cancel</AlertDialogCancel>
                              <AlertDialogAction onClick={() => deleteMutation.mutate(script.id)} className="bg-destructive hover:bg-destructive/90">
                                Delete
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </Layout>
  );
}
