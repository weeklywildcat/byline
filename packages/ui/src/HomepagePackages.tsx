import type { ReactNode } from "react";
import {
  getBriefPackageRenderer,
  getInFocusPackageRenderer,
  getMorePackageRenderer,
  getNewsletterPackageRenderer,
  getOpinionPackageRenderer,
  getSpecialCoveragePackageRenderer,
  getSportsPackageRenderer,
  getLeadPackageRenderer,
  type ResolvedHomepagePackage
} from "./package-renderers";

export type HomepageRuntimeSlotContext = {
  packageId: string;
  package: ResolvedHomepagePackage["package"];
};

export type HomepageRuntimeSlot = ReactNode | ((context: HomepageRuntimeSlotContext) => ReactNode);

export type HomepageRuntimeSlots = {
  railLimiter?: HomepageRuntimeSlot;
  poll?: HomepageRuntimeSlot;
  calendar?: HomepageRuntimeSlot;
  newsletter?: HomepageRuntimeSlot;
};

function renderSlot(slot: HomepageRuntimeSlot | undefined, context: HomepageRuntimeSlotContext) {
  return typeof slot === "function" ? slot(context) : slot;
}

/**
 * The one homepage package orchestrator. It never knows how stories were
 * selected; it only walks the already-resolved document order and dispatches a
 * resolved model to the canonical package renderer.
 */
export function HomepagePackages({
  packages,
  theme,
  slots = {}
}: {
  packages: ResolvedHomepagePackage[];
  theme: string;
  slots?: HomepageRuntimeSlots;
}) {
  return (
    <>
      {packages.map((entry) => {
        const context = { packageId: entry.package.packageId, package: entry.package };

        switch (entry.type) {
          case "lead-package": {
            const Renderer = getLeadPackageRenderer(theme);
            return (
              <Renderer
                key={entry.package.packageId}
                package={entry.package}
                railLimiterSlot={renderSlot(slots.railLimiter, context)}
                pollSlot={renderSlot(slots.poll, context)}
                calendarSlot={renderSlot(slots.calendar, context)}
              />
            );
          }
          case "brief-package": {
            const Renderer = getBriefPackageRenderer(theme);
            return <Renderer key={entry.package.packageId} package={entry.package} />;
          }
          case "in-focus-package": {
            const Renderer = getInFocusPackageRenderer(theme);
            return <Renderer key={entry.package.packageId} package={entry.package} />;
          }
          case "special-coverage-package": {
            const Renderer = getSpecialCoveragePackageRenderer(theme);
            return <Renderer key={entry.package.packageId} package={entry.package} />;
          }
          case "opinion-package": {
            const Renderer = getOpinionPackageRenderer(theme);
            return <Renderer key={entry.package.packageId} package={entry.package} />;
          }
          case "sports-package": {
            const Renderer = getSportsPackageRenderer(theme);
            return <Renderer key={entry.package.packageId} package={entry.package} />;
          }
          case "more-package": {
            const Renderer = getMorePackageRenderer(theme);
            return <Renderer key={entry.package.packageId} package={entry.package} />;
          }
          case "newsletter-package": {
            const Renderer = getNewsletterPackageRenderer(theme);
            return (
              <Renderer
                key={entry.package.packageId}
                package={entry.package}
                formSlot={renderSlot(slots.newsletter, context)}
              />
            );
          }
        }
      })}
    </>
  );
}
