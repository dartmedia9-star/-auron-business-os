import { useMemo, useState } from "react";
import { Link, useParams } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2 } from "lucide-react";
import { getDesignProject, getGetDesignProjectQueryKey, getListDesignProjectsQueryKey, useGetDesignProject } from "@workspace/api-client-react";
import { parseProjectModel, serializeProjectModel } from "@workspace/design-model";
import { Button } from "@/components/ui/button";
import { ErrorState } from "@/components/ds/states";
import { DesignEditor } from "@/components/design-studio/editor";
import { readLocalDraft } from "@/components/design-studio/autosave";

// Loads one design and hands it to the full-screen editor. The editor owns
// the model from then on (autosave writes it back), so this query never
// refetches underneath it.

export default function DesignStudioEditorPage() {
  const params = useParams<{ id: string }>();
  const id = Number(params.id);
  const valid = Number.isInteger(id) && id > 0;
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useGetDesignProject(id, {
    query: { queryKey: getGetDesignProjectQueryKey(id), enabled: valid, staleTime: Infinity, gcTime: 0, refetchOnWindowFocus: false, refetchOnReconnect: false, retry: 1 },
  });
  const [name, setName] = useState<string | null>(null);

  const parsed = useMemo(() => (data ? parseProjectModel(data.model) : null), [data]);
  const recovered = useMemo(() => {
    if (!data || !parsed?.ok) return null;
    const d = readLocalDraft(data.id);
    if (!d) return null;
    const m = parseProjectModel(d.model);
    if (!m.ok || serializeProjectModel(m.model) === serializeProjectModel(parsed.model)) return null;
    // A draft made on an older revision would overwrite someone else's later save; the banner says so.
    return { model: m.model, savedAt: d.savedAt, newerOnServer: d.baseRevision < data.revision ? { by: data.updatedByName ?? null, at: data.updatedAt } : null };
  }, [data, parsed]);

  if (!valid) return <Shell><ErrorState title="This design link isn't valid" error={new Error("Check the address and try again.")} /></Shell>;
  if (isLoading)
    return (
      <Shell>
        <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <Loader2 className="h-5 w-5 animate-spin" /> Opening design…
        </div>
      </Shell>
    );
  if (error || !data) {
    const notFound = (error as { status?: number } | null)?.status === 404;
    return <Shell>{notFound ? <ErrorState title="Design not found" error={new Error("It may have been deleted.")} /> : <ErrorState error={error} onRetry={() => void refetch()} />}</Shell>;
  }
  if (!parsed?.ok)
    return (
      <Shell>
        <ErrorState title="This design can't be opened" error={new Error(`The saved data didn't pass checks (${parsed?.error ?? "unknown error"}). Nothing was changed. Ask for help before editing it.`)} />
      </Shell>
    );

  return (
    <DesignEditor
      key={data.id}
      projectId={data.id}
      name={name ?? data.name}
      initialModel={parsed.model}
      revision={data.revision}
      recoveredDraft={recovered}
      onRename={(n) => {
        setName(n);
        void qc.invalidateQueries({ queryKey: getListDesignProjectsQueryKey() });
      }}
      onReloadServer={async () => {
        try {
          const fresh = await getDesignProject(data.id);
          const m = parseProjectModel(fresh.model);
          if (!m.ok) return null;
          setName(fresh.name);
          return { model: m.model, revision: fresh.revision };
        } catch {
          return null;
        }
      }}
    />
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-background p-6 text-foreground">
      {children}
      <Button asChild variant="outline" className="h-11">
        <Link href="/design-studio">
          <ArrowLeft className="mr-2 h-4 w-4" /> All designs
        </Link>
      </Button>
    </div>
  );
}
