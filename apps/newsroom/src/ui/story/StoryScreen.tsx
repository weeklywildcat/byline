"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@byline/newsroom-ui/ui/tabs";
import { useAuth, useConfig, useDocumentInfo } from "@payloadcms/ui";
import type { CollapsibleFieldClientComponent } from "payload";
import { useCallback, useEffect, useState } from "react";
import { getJson, query, type Paginated } from "./api";
import { HistoryTab } from "./HistoryTab";
import { PlanTab } from "./PlanTab";
import { ProductionTab } from "./ProductionTab";
import { StoryHeader } from "./StoryHeader";
import type { StoryPlanDoc } from "./types";
import { WriteTab } from "./WriteTab";

export type StoryScreenContext = {
  api: string;
  admin: string;
  timeZone: string;
  storyId: string | number | undefined;
  role: string;
  userId: string | number | undefined;
  readOnly: boolean;
};

/**
 * The Byline Story screen.
 *
 * It is the custom `Field` of one presentational collapsible that holds every
 * story field, so it renders inside Payload's own Edit view: Payload keeps the
 * form, autosave, validation, drafts, versions, locking and the Live Preview
 * window, and this component is everything the writer sees. Story fields are
 * read and written through Payload's form hooks (one document state); the plan
 * and Story Workspace records are separate, access-controlled documents.
 */
export const StoryScreen: CollapsibleFieldClientComponent = ({ field, parentPath, parentSchemaPath, indexPath, permissions, readOnly }) => {
  const { config } = useConfig();
  const { user } = useAuth();
  const { id } = useDocumentInfo();
  const custom = (config.admin?.custom ?? {}) as { newsroomTimeZone?: string };
  const context: StoryScreenContext = {
    api: config.routes.api,
    admin: config.routes.admin,
    timeZone: custom.newsroomTimeZone ?? "America/New_York",
    storyId: id,
    role: typeof user?.role === "string" ? user.role : "staff",
    userId: user?.id,
    readOnly: Boolean(readOnly)
  };

  const [plan, setPlan] = useState<StoryPlanDoc | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);
  const loadPlan = useCallback(async () => {
    if (id === undefined || id === null) return;
    try {
      const result = await getJson<Paginated<StoryPlanDoc>>(context.api, `/story-plans${query({ "where[story][equals]": String(id), depth: 1, limit: 1 })}`);
      setPlan(result.docs[0] ?? null);
      setPlanError(null);
    } catch (error) {
      setPlanError(error instanceof Error ? error.message : "The plan could not be loaded.");
    }
  }, [context.api, id]);
  useEffect(() => {
    void loadPlan();
  }, [loadPlan]);

  const childPaths = { fields: field.fields, parentPath: parentPath ?? "", parentSchemaPath: parentSchemaPath ?? "stories", parentIndexPath: indexPath ?? "", permissions };

  return (
    <AdminRoot className="byline-story">
      <div className="@container/story mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-6 md:px-8">
        <StoryHeader context={context} plan={plan} />
        <Tabs defaultValue="write" className="gap-4">
          <TabsList>
            <TabsTrigger value="write">Write</TabsTrigger>
            <TabsTrigger value="plan">Plan</TabsTrigger>
            <TabsTrigger value="production">Production</TabsTrigger>
            <TabsTrigger value="history">History</TabsTrigger>
          </TabsList>
          {/* Write stays mounted so the editor keeps its state while other tabs are open. */}
          <TabsContent value="write" keepMounted>
            <WriteTab context={context} paths={childPaths} />
          </TabsContent>
          <TabsContent value="plan">
            <PlanTab context={context} plan={plan} error={planError} onChange={setPlan} onRetry={loadPlan} />
          </TabsContent>
          <TabsContent value="production">
            <ProductionTab context={context} />
          </TabsContent>
          <TabsContent value="history">
            <HistoryTab context={context} />
          </TabsContent>
        </Tabs>
      </div>
    </AdminRoot>
  );
};
