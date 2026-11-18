"use client";

import { cn } from "@byline/newsroom-ui/lib/utils";
import { useMemo } from "react";
import { encode } from "uqr";

/**
 * A QR code for a Poll Studio link (a public poll, or a device pairing link),
 * drawn as one SVG path on a white quiet zone so phones and iPads read it in
 * any theme. Encoded in the browser: the link never goes to another service.
 */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, path } = useMemo(() => {
    const code = encode(value, { ecc: "M", border: 2 });
    let d = "";
    code.data.forEach((row, y) => row.forEach((dark, x) => { if (dark) d += `M${x} ${y}h1v1h-1z`; }));
    return { size: code.size, path: d };
  }, [value]);
  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" className={cn("aspect-square w-40 rounded-md bg-white text-black", className)} data-polls-qr="">
      <path d={path} fill="currentColor" />
    </svg>
  );
}
