"use client";

import { Icon as IconifyIcon, type IconProps } from "@iconify/react";

// Shared so Studio's preview renders the same glyphs as production rather than
// substituting its own icon set.
export type BylineIconProps = Omit<IconProps, "icon"> & {
  name: string;
};

export function Icon({ name, ...props }: BylineIconProps) {
  return <IconifyIcon icon={name} aria-hidden="true" {...props} />;
}
