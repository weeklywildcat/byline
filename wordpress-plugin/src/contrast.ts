function linearChannel(value: number) {
  const channel = value / 255;
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(color: string) {
  if (!/^#[0-9a-f]{6}$/i.test(color)) return null;
  const channels = [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)].map((channel) =>
    linearChannel(Number.parseInt(channel, 16))
  );
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

export function contrastRatio(left: string, right: string) {
  const leftLuminance = relativeLuminance(left);
  const rightLuminance = relativeLuminance(right);
  if (leftLuminance === null || rightLuminance === null) return null;
  const lighter = Math.max(leftLuminance, rightLuminance);
  const darker = Math.min(leftLuminance, rightLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}
