import type { Credential, Env } from "./types";
import { configuration } from "./config";
import { BylineError, errorSchema } from "./errors";
export class WordPress {
  constructor(
    private env: Env,
    private credential: Credential,
    private requestId: string,
    private fetcher: typeof fetch = (input, init) => fetch(input, init),
  ) {}
  async request(
    path: string,
    method = "GET",
    data?: unknown,
    options: {
      tool?: string;
      idempotencyKey?: string;
      expectedVersion?: string;
    } = {},
  ): Promise<unknown> {
    if (
      !/^\/(?:byline\/v1\/|wp\/v2\/users\/me\/application-passwords\/)/.test(
        path,
      ) ||
      path.includes("..") ||
      path.includes("\\") ||
      /[\r\n#]/.test(path)
    )
      throw new BylineError("internal_error");
    const headers = new Headers({
      Authorization: `Basic ${btoa(
        String.fromCharCode(
          ...new TextEncoder().encode(
            `${this.credential.username}:${this.credential.password}`,
          ),
        ),
      )}`,
      Accept: "application/json",
      "X-Byline-Request-Id": this.requestId,
    });
    if (data !== undefined) headers.set("Content-Type", "application/json");
    if (options.tool) headers.set("X-Byline-MCP-Tool", options.tool);
    if (options.idempotencyKey)
      headers.set("Idempotency-Key", options.idempotencyKey);
    if (options.expectedVersion)
      headers.set("If-Match", options.expectedVersion);
    let response: Response;
    try {
      response = await this.fetcher(
        `${configuration(this.env).wordpress}/wp-json${path}`,
        {
          method,
          headers,
          body: data === undefined ? undefined : JSON.stringify(data),
          redirect: "manual",
          signal: AbortSignal.timeout(20000),
        },
      );
    } catch (error) {
      console.log(
        JSON.stringify({
          event: "upstream_transport_error",
          errorClass:
            error instanceof TypeError
              ? "type_error"
              : error instanceof DOMException
              ? error.name
              : "other",
        }),
      );
      throw new BylineError("upstream_unavailable");
    }
    // Never interpolate WordPress error messages: plugins/proxies can reflect secrets.
    if (!response.ok) {
      let current;
      if (response.status === 409) {
        try {
          const e = (await response.json()) as { data?: { current?: unknown } };
          current = errorSchema.shape.current.safeParse(e.data?.current).data;
        } catch {}
      }
      const codes = {
        400: "validation_error",
        401: "unauthenticated",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        412: "conflict",
        429: "rate_limited",
        501: "unsupported",
      } as const;
      throw new BylineError(
        codes[response.status as keyof typeof codes] ?? "upstream_unavailable",
        response.status,
        current,
      );
    }
    if (response.status === 204) return {};
    const length = Number(response.headers.get("Content-Length") ?? 0);
    if (length > 4 * 1024 * 1024) throw new BylineError("upstream_unavailable");
    const reader = response.body?.getReader();
    if (!reader) throw new BylineError("upstream_unavailable");
    let size = 0;
    const chunks: Uint8Array[] = [];
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 4 * 1024 * 1024) {
        await reader.cancel();
        throw new BylineError("upstream_unavailable");
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    try {
      return JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      throw new BylineError("upstream_unavailable");
    }
  }
}
