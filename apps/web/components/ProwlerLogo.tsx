import { THE_PROWLER } from "@/lib/the-prowler";

/** The Prowler wordmark. The heading or link around it carries the accessible name. */
export function ProwlerLogo({ className }: { className?: string }) {
  return (
    <img className={className} src={THE_PROWLER.logo.src} alt={THE_PROWLER.name}
      width={THE_PROWLER.logo.width} height={THE_PROWLER.logo.height} decoding="async" />
  );
}
