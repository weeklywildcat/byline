"use client";

import { AdminRoot } from "@byline/newsroom-ui/components/admin-root";
import { Alert, AlertDescription, AlertTitle } from "@byline/newsroom-ui/ui/alert";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@byline/newsroom-ui/ui/card";
import { Item, ItemActions, ItemContent, ItemGroup, ItemTitle } from "@byline/newsroom-ui/ui/item";
import { ChevronRight, Database } from "lucide-react";

/** The raw collection screens, listed for administrators. Payload's own UI begins one click further on. */
export function SystemAdministrationScreen({ links }: { links: { key: string; label: string; href: string }[] }) {
  return (
    <AdminRoot toaster={false}>
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-6 lg:px-6">
        <header>
          <h1 className="font-heading text-2xl font-semibold tracking-tight">System administration</h1>
          <p className="text-sm text-muted-foreground">Raw records for maintenance, debugging and migration.</p>
        </header>
        <Alert>
          <Database aria-hidden="true" />
          <AlertTitle>These are the underlying records</AlertTitle>
          <AlertDescription>Editing here bypasses Byline&rsquo;s screens and workflow. Newsroom work belongs in Byline.</AlertDescription>
        </Alert>
        <Card size="sm" className="gap-0 py-0">
          <CardHeader className="border-b border-border/70 px-3 py-2 [.border-b]:pb-2">
            <CardTitle role="heading" aria-level={2}>Collections</CardTitle>
            <CardDescription className="text-xs">Payload&rsquo;s list and edit screens</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            <ItemGroup className="gap-0 has-data-[size=sm]:gap-0">
              {links.map((link) => (
                <Item key={link.key} size="sm" className="rounded-none border-b border-border/70 last:border-b-0" render={<a href={link.href} />}>
                  <ItemContent><ItemTitle>{link.label}</ItemTitle></ItemContent>
                  <ItemActions><ChevronRight className="size-4 text-muted-foreground" aria-hidden="true" /></ItemActions>
                </Item>
              ))}
            </ItemGroup>
          </CardContent>
        </Card>
      </main>
    </AdminRoot>
  );
}
