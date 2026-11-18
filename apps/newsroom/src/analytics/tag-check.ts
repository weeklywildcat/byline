/** Best-effort: does the public site's homepage carry the expected Measurement ID? Never decisive on its own. */
export async function publicTagPresent(publicSite: string, measurementId: string, fetchImpl: typeof fetch = fetch): Promise<"present" | "absent" | "unreachable"> {
  try {
    const url = new URL(publicSite);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "unreachable";
    const response = await fetchImpl(url, { headers: { Accept: "text/html", "User-Agent": "Byline-Analytics-Check" }, signal: AbortSignal.timeout(6_000), redirect: "follow", cache: "no-store" });
    if (!response.ok) return "unreachable";
    const html = (await response.text()).slice(0, 1_500_000);
    return html.includes(measurementId) ? "present" : "absent";
  } catch {
    return "unreachable";
  }
}
