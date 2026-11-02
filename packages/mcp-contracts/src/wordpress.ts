/** Development-only adapter contract. Production dispatches locally in WordPress PHP. */
export interface WordPress {
  request(path: string, method?: string, data?: unknown,
    options?: {tool?: string; idempotencyKey?: string; expectedVersion?: string}): Promise<unknown>;
}
