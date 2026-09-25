import { beforeEach, describe, expect, it, vi } from "vitest";

import { dismissRejected, enqueue, flush, pending, rejected } from "./outbox";

class MemoryStorage {
  private data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}

const respond = (status: number) => new Response(null, { status });

beforeEach(() => {
  vi.stubGlobal("window", { localStorage: new MemoryStorage() });
  vi.stubGlobal("fetch", vi.fn());
});

function queue(...ids: string[]) {
  for (const id of ids) enqueue({ client_id: id, match_id: 1, kind: "goal" });
}

const fetchMock = () => fetch as unknown as ReturnType<typeof vi.fn>;

describe("flush", () => {
  it("sends in order and empties the queue", async () => {
    queue("a", "b");
    fetchMock().mockResolvedValue(respond(201));
    expect(await flush()).toEqual({ sent: 2, remaining: 0 });
    const sent = fetchMock().mock.calls.map(
      ([, init]) => JSON.parse(init.body).client_id,
    );
    expect(sent).toEqual(["a", "b"]);
  });

  it("stops at a network failure and keeps everything after it", async () => {
    queue("a", "b");
    fetchMock().mockResolvedValueOnce(respond(201)).mockRejectedValueOnce(new Error());
    expect(await flush()).toEqual({ sent: 1, remaining: 1 });
    expect(pending().map((e) => e.client_id)).toEqual(["b"]);
  });

  it("keeps the queue when the session has lapsed", async () => {
    queue("a");
    fetchMock().mockResolvedValue(respond(401));
    const result = await flush();
    expect(result.remaining).toBe(1);
    expect(result.blocked).toBeDefined();
  });

  it("keeps an event that was only throttled", async () => {
    // A goal must not be lost to a 429.
    queue("a", "b");
    fetchMock().mockResolvedValue(respond(429));
    expect(await flush()).toEqual({ sent: 0, remaining: 2 });
  });

  it("sets aside an event the server will never accept, with its reason", async () => {
    queue("a", "b");
    fetchMock().mockResolvedValue(
      new Response(JSON.stringify({ detail: "Πέρασε η ώρα του αγώνα." }), { status: 409 }),
    );
    const result = await flush();
    expect(pending().map((e) => e.client_id)).toEqual(["b"]);
    expect(result.blocked).toContain("Πέρασε η ώρα του αγώνα.");
    expect(rejected().map((e) => [e.client_id, e.reason])).toEqual([
      ["a", "Πέρασε η ώρα του αγώνα."],
    ]);
    dismissRejected("a");
    expect(rejected()).toEqual([]);
  });

  it("retries later on a server error", async () => {
    queue("a");
    fetchMock().mockResolvedValue(respond(503));
    expect(await flush()).toEqual({ sent: 0, remaining: 1 });
  });
});
