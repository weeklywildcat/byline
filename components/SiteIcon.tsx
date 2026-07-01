"use client";

import { Icon, type IconProps } from "@iconify/react";

type SiteIconProps = Omit<IconProps, "icon"> & {
  name: string;
};

export function SiteIcon({ name, ...props }: SiteIconProps) {
  return <Icon icon={name} aria-hidden="true" {...props} />;
}
