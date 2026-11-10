"use client";

import { evaluateQuery, validateQuery, type DataValue, type DatasetSchema, type FieldDefinition, type QuerySort } from "@byline/data";
import { DisabledReason } from "@byline/newsroom-ui/components/disabled-reason";
import { InlineAlert } from "@byline/newsroom-ui/components/inline-alert";
import { Breadcrumb, BreadcrumbItem, BreadcrumbLink, BreadcrumbList, BreadcrumbPage, BreadcrumbSeparator } from "@byline/newsroom-ui/ui/breadcrumb";
import { Button } from "@byline/newsroom-ui/ui/button";
import { ButtonGroup } from "@byline/newsroom-ui/ui/button-group";
import { DropdownMenu, DropdownMenuContent, DropdownMenuGroup, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@byline/newsroom-ui/ui/dropdown-menu";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@byline/newsroom-ui/ui/empty";
import { Skeleton } from "@byline/newsroom-ui/ui/skeleton";
import { usePreferences } from "@payloadcms/ui";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Columns3, Download, Upload } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import type { DataRow, DatasetDetail, RowsPage } from "../../data/server";
import { ApiError } from "../story/api";
import { useNewsroomRoutes } from "../shell/account";
import { useLeaveGuard } from "../shell/navigation";
import { addRows, changeRows, dataKeys, exportUrl, fetchAllRows, fetchDataset, fetchRows, importCsv, publishData, removeRows, saveDataset } from "./api";
import { DataGrid, type RelationshipOptions } from "./DataGrid";
import { useDataNavigation } from "./DataWorkspace";
import { FieldsSheet } from "./FieldsSheet";
import type { PastePlan } from "./grid-model";
import { GridToolbar, isComplete, type GridView } from "./GridToolbar";
import { ImportDialog } from "./ImportDialog";
import { PublishDataDialog } from "./PublishDataDialog";
import { DatasetStatus, formatAgo, formatWhen, shortSha } from "./status";

/** Datasets up to this size are held whole in the browser; larger ones are queried a page at a time on the server. */
export const CLIENT_ROW_LIMIT = 1000;
const PAGE_SIZE = 100;
const viewKey = (key: string) => `byline:data:view:v1:${key}`;

type StoredView = GridView & { sort: QuerySort[] };
const EMPTY_VIEW: StoredView = { search: "", filters: [], match: "all", hidden: [], sort: [{ field: "$position", direction: "asc" }] };

function normalizeView(value: unknown, schema: DatasetSchema): StoredView {
  const input = (value && typeof value === "object" ? value : {}) as Partial<StoredView>;
  const keys = new Set(schema.fields.map((field) => field.key));
  const checked = validateQuery(schema, { filters: Array.isArray(input.filters) ? input.filters.filter((filter) => keys.has(filter?.field)) : [], match: input.match === "any" ? "any" : "all", sort: Array.isArray(input.sort) ? input.sort : undefined, search: "" });
  return {
    search: "",
    filters: checked.ok ? checked.query.filters : Array.isArray(input.filters) ? input.filters.filter((filter) => keys.has(filter?.field)) : [],
    match: input.match === "any" ? "any" : "all",
    hidden: Array.isArray(input.hidden) ? input.hidden.filter((key): key is string => typeof key === "string" && keys.has(key)) : [],
    sort: checked.ok ? checked.query.sort : EMPTY_VIEW.sort
  };
}

/**
 * One dataset: its working rows in an editable grid, its fields, import and
 * export, and an explicit Publish that makes an immutable public release.
 * The header always says how the working data relates to what readers see.
 */
export function DatasetWorkspace({ id }: { id: number }) {
  const { api } = useNewsroomRoutes();
  const go = useDataNavigation();
  const queries = useQueryClient();
  const { getPreference, setPreference } = usePreferences();
  const detail = useQuery({ queryKey: dataKeys.dataset(id), queryFn: () => fetchDataset(api, id) });
  const data = detail.data;
  const [view, setView] = useState<StoredView>(EMPTY_VIEW);
  const [viewLoaded, setViewLoaded] = useState<string | null>(null);
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [fieldFocus, setFieldFocus] = useState<string | null | undefined>(undefined);
  const [importOpen, setImportOpen] = useState(false);
  const [publishOpen, setPublishOpen] = useState(false);
  const [page, setPage] = useState(0);
  const pending = useRef(0);
  const [saving, setSaving] = useState(false);

  useLeaveGuard(useCallback(() => ({ modified: false, saving: pending.current > 0 }), []));

  // The remembered view (columns, filters, sort) is this account's Payload Preference, per dataset.
  useEffect(() => {
    if (!data || viewLoaded === data.dataset.key) return;
    let live = true;
    getPreference<unknown>(viewKey(data.dataset.key)).then((stored) => {
      if (live) {
        setView(normalizeView(stored, data.dataset.schema));
        setViewLoaded(data.dataset.key);
      }
    }).catch(() => live && setViewLoaded(data.dataset.key));
    return () => {
      live = false;
    };
  }, [data, viewLoaded, getPreference]);
  const changeView = useCallback((next: StoredView) => {
    setView(next);
    setPage(0);
    if (data) void setPreference(viewKey(data.dataset.key), { filters: next.filters, match: next.match, hidden: next.hidden, sort: next.sort }).catch(() => undefined);
  }, [data, setPreference]);

  const serverMode = (data?.records ?? 0) > CLIENT_ROW_LIMIT;
  const query = useMemo(() => ({ filters: view.filters.filter(isComplete), match: view.match, search: view.search, sort: view.sort, limit: PAGE_SIZE, offset: page * PAGE_SIZE }), [view, page]);
  const rowsKey = serverMode ? dataKeys.rows(id, query) : dataKeys.rows(id);
  const rows = useQuery({
    queryKey: rowsKey,
    queryFn: () => (serverMode ? fetchRows(api, id, query) : fetchAllRows(api, id, CLIENT_ROW_LIMIT)),
    enabled: Boolean(data),
    placeholderData: (previous) => previous
  });

  // Client mode: the same closed query, evaluated in memory, so both modes mean the same thing.
  const shown = useMemo((): { rows: DataRow[]; total: number } => {
    if (!data || !rows.data) return { rows: [], total: 0 };
    if (serverMode) return { rows: rows.data.rows, total: rows.data.total };
    const checked = validateQuery(data.dataset.schema, { ...query, limit: 1000, offset: 0 });
    if (!checked.ok) return { rows: rows.data.rows, total: rows.data.rows.length };
    return evaluateQuery(data.dataset.schema, rows.data.rows, checked.query);
  }, [data, rows.data, serverMode, query]);

  // Linked records' names, from each target dataset's working rows.
  const relationshipFields = useMemo(() => data?.dataset.schema.fields.filter((field): field is Extract<FieldDefinition, { type: "relationship" }> => field.type === "relationship") ?? [], [data]);
  const targets = useQuery({
    queryKey: [...dataKeys.dataset(id), "relationships", relationshipFields.map((field) => field.options.dataset)],
    enabled: relationshipFields.length > 0,
    queryFn: async (): Promise<RelationshipOptions> => {
      const entries = await Promise.all(relationshipFields.map(async (field) => {
        const target = data!.linkable.find((entry) => entry.key === field.options.dataset);
        if (!target) return [field.key, []] as const;
        const [targetDetail, targetRows] = await Promise.all([fetchDataset(api, target.id), fetchAllRows(api, target.id, CLIENT_ROW_LIMIT)]);
        const name = targetDetail.dataset.schema.fields.find((entry) => entry.type === "text") ?? targetDetail.dataset.schema.fields[0];
        return [field.key, targetRows.rows.map((row) => ({ value: row.id, label: name ? String(row.values[name.key] ?? row.id) : row.id }))] as const;
      }));
      return Object.fromEntries(entries);
    }
  });

  const refreshStatus = useCallback(() => queries.invalidateQueries({ queryKey: dataKeys.dataset(id), exact: true }), [queries, id]);
  const patchCache = useCallback((update: (rows: DataRow[]) => DataRow[]) => {
    queries.setQueriesData<RowsPage>({ queryKey: [...dataKeys.dataset(id), "rows"] }, (current) => {
      if (!current) return current;
      const next = update(current.rows);
      return { ...current, rows: next, total: current.total + next.length - current.rows.length };
    });
  }, [queries, id]);
  const track = useCallback(async <T,>(work: () => Promise<T>): Promise<T | undefined> => {
    pending.current++;
    setSaving(true);
    try {
      return await work();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.error(error.message);
        await queries.invalidateQueries({ queryKey: [...dataKeys.dataset(id), "rows"] });
      } else toast.error((error as Error).message);
      return undefined;
    } finally {
      pending.current--;
      if (!pending.current) setSaving(false);
      void refreshStatus();
    }
  }, [queries, id, refreshStatus]);

  const merge = (updated: DataRow[]) => {
    const byId = new Map(updated.map((row) => [row.id, row]));
    patchCache((current) => current.map((row) => byId.get(row.id) ?? row));
  };

  const commit = (row: DataRow, field: FieldDefinition, value: DataValue) => {
    const base = row.values[field.key] ?? null;
    patchCache((current) => current.map((entry) => (entry.id === row.id ? { ...entry, values: { ...entry.values, [field.key]: value } } : entry)));
    void track(async () => merge((await changeRows(api, id, [{ id: row.id, values: { [field.key]: value }, base: { [field.key]: base } }])).rows));
  };

  const paste = (plan: PastePlan) => {
    if (plan.rejected.length) {
      const first = plan.rejected[0];
      toast.error(`${plan.rejected.length} ${plan.rejected.length === 1 ? "cell wasn't" : "cells weren't"} pasted. Row ${first.row}, ${first.field}: ${first.message}`);
    }
    if (!plan.changes.length && !plan.additions.length) return;
    void track(async () => {
      if (plan.changes.length) merge((await changeRows(api, id, plan.changes)).rows);
      if (plan.additions.length) {
        const added = await addRows(api, id, plan.additions.map((values) => ({ values })));
        patchCache((current) => [...current, ...added.rows]);
      }
      toast.success(`Pasted ${plan.cells} ${plan.cells === 1 ? "cell" : "cells"}${plan.additions.length ? ` and added ${plan.additions.length} ${plan.additions.length === 1 ? "row" : "rows"}` : ""}.`);
    });
  };

  // The server places a new row between `after` and the row that follows it (positions are fractional, never renumbered).
  const addRow = (after?: DataRow) => void track(async () => {
    const added = await addRows(api, id, [{ values: {} }], after?.position);
    patchCache((current) => [...current, ...added.rows]);
  });

  const remove = (row: DataRow) => void track(async () => {
    await removeRows(api, id, [row.id]);
    patchCache((current) => current.filter((entry) => entry.id !== row.id));
    toast("Row deleted.", {
      action: {
        label: "Undo",
        onClick: () => void track(async () => {
          const restored = await addRows(api, id, [{ recordId: row.id, values: row.values, included: row.included, position: row.position } as never]);
          patchCache((current) => [...current, ...restored.rows]);
        })
      }
    });
  });

  const toggleIncluded = (row: DataRow) => void track(async () => merge((await changeRows(api, id, [{ id: row.id, included: !row.included }])).rows));

  if (detail.isError) {
    return <main className="mx-auto w-full max-w-[1400px] px-4 py-6 lg:px-6"><InlineAlert title="This dataset isn't available" onAction={() => void detail.refetch()}>{(detail.error as Error).message}</InlineAlert></main>;
  }
  if (!data) return <WorkspaceSkeleton />;

  const schema = data.dataset.schema;
  const total = rows.data ? (serverMode ? rows.data.total : rows.data.rows.length) : data.records;
  const included = serverMode ? null : rows.data?.rows.filter((row) => row.included).length ?? 0;
  const filtered = shown.total !== total;
  const editorOnly = "Only editors change fields and publish data.";
  const upToDate = data.publication === "published";

  return (
    <main className="mx-auto flex w-full min-w-0 max-w-[1600px] flex-col gap-4 px-4 py-5 lg:px-6" data-byline-dataset={data.dataset.key}>
      <Breadcrumb>
        <BreadcrumbList>
          <BreadcrumbItem><BreadcrumbLink render={<button type="button" onClick={() => go({ tab: "datasets" })} />}>Data</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbLink render={<button type="button" onClick={() => go({ tab: "datasets" })} />}>Datasets</BreadcrumbLink></BreadcrumbItem>
          <BreadcrumbSeparator />
          <BreadcrumbItem><BreadcrumbPage>{data.dataset.title}</BreadcrumbPage></BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <h1 className="text-xl font-semibold tracking-tight">{data.dataset.title}</h1>
            <DatasetStatus publication={data.publication} />
          </div>
          <p className="mt-1 text-sm text-muted-foreground" data-data-publication-line="">
            {data.release ? (
              <>Published {formatWhen(data.release.releasedAt, data.timeZone)} · {data.release.records.toLocaleString("en-US")} {data.release.records === 1 ? "row" : "rows"} · release <code className="font-mono text-xs">{shortSha(data.release.sha256)}</code>{data.publication === "changed" ? <> · <span className="text-warning">edited {formatAgo(data.dataset.changedAt)}, not yet published</span></> : null}</>
            ) : "Not published yet. Readers see nothing from this dataset until you publish it."}
            {saving ? <span className="ml-2 text-xs">Saving…</span> : null}
          </p>
          {data.dataset.description ? <p className="mt-1 max-w-3xl text-sm">{data.dataset.description}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ButtonGroup>
            <Button type="button" variant="outline" size="sm" onClick={() => setImportOpen(true)} disabled={!schema.fields.length}><Upload data-icon="inline-start" />Import</Button>
            <DropdownMenu>
              <DropdownMenuTrigger render={<Button type="button" variant="outline" size="sm" />}><Download data-icon="inline-start" />Export<ChevronDown data-icon="inline-end" /></DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>CSV of the working rows</DropdownMenuLabel>
                  <DropdownMenuItem render={<a href={exportUrl(api, id, "public")} download />}>Public fields</DropdownMenuItem>
                  <DropdownMenuItem render={<a href={exportUrl(api, id, "all")} download />}>All fields, including private</DropdownMenuItem>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
          <DisabledReason reason={!data.capabilities.editSchema ? editorOnly : undefined}>
            <Button type="button" variant="outline" size="sm" disabled={!data.capabilities.editSchema} onClick={() => { setFieldFocus(undefined); setFieldsOpen(true); }}><Columns3 data-icon="inline-start" />Fields</Button>
          </DisabledReason>
          <DisabledReason reason={!data.capabilities.publish ? editorOnly : upToDate ? "Readers already have the latest data." : !schema.fields.some((field) => field.visibility === "public") ? "Make at least one field public first." : undefined}>
            <Button type="button" size="sm" disabled={!data.capabilities.publish || upToDate } onClick={() => setPublishOpen(true)}>Publish data</Button>
          </DisabledReason>
        </div>
      </header>

      {!schema.fields.length ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Columns3 /></EmptyMedia>
            <EmptyTitle>Add the first field</EmptyTitle>
            <EmptyDescription>Fields are the columns: a name, a number, a status. Then type or paste the rows.</EmptyDescription>
          </EmptyHeader>
          {data.capabilities.editSchema ? <EmptyContent><Button type="button" onClick={() => { setFieldFocus(null); setFieldsOpen(true); }}>Add a field</Button></EmptyContent> : <EmptyContent><p className="text-sm text-muted-foreground">An editor sets up the fields.</p></EmptyContent>}
        </Empty>
      ) : (
        <>
          <GridToolbar
            fields={schema.fields}
            view={view}
            onChange={(next) => changeView({ ...view, ...next })}
            summary={rows.data ? (
              <>{filtered ? `${shown.total.toLocaleString("en-US")} of ` : ""}{total.toLocaleString("en-US")} {total === 1 ? "row" : "rows"}{included !== null && total - included ? ` · ${total - included} kept out of publication` : ""}</>
            ) : <Skeleton className="h-4 w-24" />}
          />
          {rows.isError ? (
            <InlineAlert title="Rows didn't load" onAction={() => void rows.refetch()}>{(rows.error as Error).message}</InlineAlert>
          ) : !rows.data ? <Skeleton className="h-96 w-full" /> : (
            <DataGrid
              schema={schema}
              rows={shown.rows}
              hidden={view.hidden}
              sort={view.sort}
              onSortChange={(sort) => changeView({ ...view, sort })}
              onHide={(key) => changeView({ ...view, hidden: [...view.hidden, key] })}
              timeZone={data.timeZone}
              canEditSchema={data.capabilities.editSchema}
              onEditField={(key) => { setFieldFocus(key); setFieldsOpen(true); }}
              onCommit={commit}
              onPaste={paste}
              onToggleIncluded={toggleIncluded}
              onInsertBelow={(row) => addRow(row)}
              onDelete={remove}
              onAddRow={() => addRow()}
              relationships={targets.data ?? {}}
              rowOffset={serverMode ? page * PAGE_SIZE : 0}
              emptyMessage={filtered ? "No rows match. Change the search or filters." : "No rows yet. Add one, or paste rows from a spreadsheet."}
            />
          )}
          {serverMode && rows.data ? (
            <nav className="flex items-center justify-end gap-2 text-sm" aria-label="Pages">
              <span className="text-muted-foreground">Rows {(page * PAGE_SIZE + 1).toLocaleString("en-US")}–{Math.min((page + 1) * PAGE_SIZE, shown.total).toLocaleString("en-US")} of {shown.total.toLocaleString("en-US")}</span>
              <Button type="button" variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</Button>
              <Button type="button" variant="outline" size="sm" disabled={(page + 1) * PAGE_SIZE >= shown.total} onClick={() => setPage(page + 1)}>Next</Button>
            </nav>
          ) : null}
          {data.usedBy.length ? (
            <p className="text-sm text-muted-foreground">Used by {data.usedBy.map((project, index) => (
              <span key={project.id}>{index ? ", " : ""}<button type="button" className="font-medium text-foreground underline-offset-4 hover:underline" onClick={() => go({ project: project.id })}>{project.title}</button></span>
            ))}.</p>
          ) : null}
        </>
      )}

      <FieldsSheet
        open={fieldsOpen}
        onOpenChange={setFieldsOpen}
        detail={data}
        focus={fieldFocus}
        onSave={async (input) => {
          const saved = await saveDataset(api, id, { ...input, baseSchema: data.dataset.schema });
          queries.setQueryData(dataKeys.dataset(id), saved);
          await queries.invalidateQueries({ queryKey: [...dataKeys.dataset(id), "rows"] });
          toast.success("Fields saved.");
        }}
      />
      <ImportDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        fields={schema.fields}
        onPreview={async (text, mapping) => (await importCsv(api, id, { text, mapping, commit: false })).preview}
        onCommit={async (text, mapping) => {
          const result = await importCsv(api, id, { text, mapping, commit: true });
          await Promise.all([queries.invalidateQueries({ queryKey: [...dataKeys.dataset(id), "rows"] }), refreshStatus()]);
          toast.success(`Imported ${result.preview.rows.toLocaleString("en-US")} ${result.preview.rows === 1 ? "row" : "rows"}.`);
        }}
      />
      <PublishDataDialog
        open={publishOpen}
        onOpenChange={setPublishOpen}
        detail={data}
        included={included ?? data.records}
        excluded={included === null ? 0 : total - included}
        onPublish={async () => {
          const result = await publishData(api, id, data.dataset.workingRevision);
          await Promise.all([refreshStatus(), queries.invalidateQueries({ queryKey: dataKeys.overview() })]);
          toast.success(result.reused ? "Readers already had this data." : data.usedBy.some((project) => project.publication !== "draft") ? "Data published. Public projects update with the next site build." : "Data published.");
        }}
      />
    </main>
  );
}

function WorkspaceSkeleton() {
  return (
    <main className="mx-auto grid w-full max-w-[1600px] gap-4 px-4 py-5 lg:px-6" aria-busy="true">
      <Skeleton className="h-4 w-48" />
      <Skeleton className="h-8 w-80" />
      <Skeleton className="h-8 w-full" />
      <Skeleton className="h-96 w-full" />
    </main>
  );
}

