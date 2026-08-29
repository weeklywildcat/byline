import { __ } from "@wordpress/i18n";

import {
  buildAdminNavigation,
  type AdminNavigationGroup,
  type AdminNavigationItem
} from "./navigation-model";
import type {
  HomeNavigationCapabilities,
  HomeNavigationFeatures,
  HomeNavigationUrls
} from "./home-model";

export type AdminNavigationProps = {
  urls: HomeNavigationUrls;
  capabilities: HomeNavigationCapabilities;
  features?: HomeNavigationFeatures;
  activeRoute?: string;
};

function itemIsActive(item: AdminNavigationItem, activeRoute: string): boolean {
  return Boolean(activeRoute && item.activeRoutes?.includes(activeRoute));
}

function NavigationGroup({ group, activeRoute }: { group: AdminNavigationGroup; activeRoute: string }) {
  return (
    <div className="byline-primary-nav-group">
      <span className="byline-primary-nav-group-label">{group.label}</span>
      <ul>
        {group.items.map((item) => {
          const active = itemIsActive(item, activeRoute);
          return (
            <li key={item.id}>
              <a className={active ? "is-active" : undefined} href={item.href} aria-current={active ? "page" : undefined}>
                {item.label}
              </a>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export function AdminNavigation({ urls, capabilities, features = {}, activeRoute = "" }: AdminNavigationProps) {
  const groups = buildAdminNavigation(urls, capabilities, features);
  if (!groups.length) return null;

  return (
    <nav className="byline-primary-nav" aria-label={__("Byline sections", "weekly-wildcat-headless")}>
      {groups.map((group) => <NavigationGroup key={group.id} group={group} activeRoute={activeRoute} />)}
    </nav>
  );
}
