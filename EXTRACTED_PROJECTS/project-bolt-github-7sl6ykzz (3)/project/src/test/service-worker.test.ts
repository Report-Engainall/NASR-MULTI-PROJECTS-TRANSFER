import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

type WorkerEvent = { waitUntil: (promise: Promise<unknown>) => void };
type FetchWorkerEvent = {
  request: Request;
  respondWith: (promise: Promise<Response>) => void;
};
type Listener = (event: WorkerEvent | FetchWorkerEvent) => void;

async function loadServiceWorker(overrides: {
  cacheAdd?: (url: string) => Promise<void>;
  cacheNames?: string[];
  cacheMatch?: (request: Request | string) => Promise<Response | null>;
  fetcher?: (request: Request) => Promise<Response>;
} = {}) {
  const source = await readFile(resolve(process.cwd(), "public/sw.js"), "utf8");
  const listeners = new Map<string, Listener>();
  const cacheAdd = vi.fn(async (url: string) => overrides.cacheAdd?.(url));
  const cachePut = vi.fn(async (_request: Request | string, _response: Response) => undefined);
  const cache = { add: cacheAdd, put: cachePut };
  const cacheDelete = vi.fn(async () => true);
  const cacheNames = overrides.cacheNames ?? [];
  const cachesMock = {
    open: vi.fn(async () => cache),
    keys: vi.fn(async () => cacheNames),
    delete: cacheDelete,
    match: vi.fn(async (request: Request | string) => overrides.cacheMatch?.(request) ?? null),
  };
  const skipWaiting = vi.fn(async () => undefined);
  const claim = vi.fn(async () => undefined);
  const selfMock = {
    addEventListener: (name: string, listener: Listener) => listeners.set(name, listener),
    skipWaiting,
    clients: { claim },
    location: { origin: "https://aghbari.example" },
  };

  runInNewContext(source, {
    self: selfMock,
    caches: cachesMock,
    URL,
    Promise,
    Response,
    fetch: vi.fn((request: Request) => overrides.fetcher
      ? overrides.fetcher(request)
      : Promise.reject(new Error("unexpected network request"))),
    console,
  });

  return { listeners, cacheAdd, cachePut, cachesMock, cacheDelete, skipWaiting, claim };
}

describe("Aghbari PWA offline shell", () => {
  it("caches the available shell assets even when one optional asset fails", async () => {
    const worker = await loadServiceWorker({
      cacheAdd: async (url) => {
        if (url === "/manifest.webmanifest") throw new Error("manifest unavailable");
      },
    });
    const pending: Promise<unknown>[] = [];
    worker.listeners.get("install")?.({ waitUntil: (promise) => pending.push(promise) });

    await Promise.all(pending);

    expect(worker.cachesMock.open).toHaveBeenCalledWith("aghbari-shell-v2");
    expect(worker.cacheAdd.mock.calls.map(([url]) => url)).toEqual([
      "/", "/manifest.webmanifest", "/favicon.ico",
    ]);
    expect(worker.skipWaiting).toHaveBeenCalledOnce();
  });

  it("does not cache account, invoice or admin navigation responses", async () => {
    const worker = await loadServiceWorker({
      fetcher: async () => new Response("private route shell", { status: 200 }),
    });
    const pending: Promise<Response>[] = [];
    worker.listeners.get("fetch")?.({
      request: {
        method: "GET",
        url: "https://aghbari.example/invoices",
        mode: "navigate",
      } as Request,
      respondWith: (promise) => pending.push(promise),
    });
    await expect(Promise.all(pending)).resolves.toHaveLength(1);
    expect(worker.cachesMock.open).not.toHaveBeenCalled();
    expect(worker.cachePut).not.toHaveBeenCalled();
  });

  it("caches only the public home shell and uses it as the offline deep-route fallback", async () => {
    const shell = new Response("public Aghbari shell", { status: 200 });
    const worker = await loadServiceWorker({
      cacheMatch: async (key) => key === "/" ? shell : null,
      fetcher: async (request) => {
        if (request.url === "https://aghbari.example/") return shell.clone();
        throw new Error("offline");
      },
    });

    const onlinePending: Promise<Response>[] = [];
    worker.listeners.get("fetch")?.({
      request: { method: "GET", url: "https://aghbari.example/", mode: "navigate" } as Request,
      respondWith: (promise) => onlinePending.push(promise),
    });
    await Promise.all(onlinePending);
    await Promise.resolve();
    await Promise.resolve();
    expect(worker.cachePut).toHaveBeenCalledTimes(1);
    expect(worker.cachePut).toHaveBeenCalledWith("/", expect.any(Response));

    const offlinePending: Promise<Response>[] = [];
    worker.listeners.get("fetch")?.({
      request: { method: "GET", url: "https://aghbari.example/invoices", mode: "navigate" } as Request,
      respondWith: (promise) => offlinePending.push(promise),
    });
    await expect(Promise.all(offlinePending)).resolves.toEqual([shell]);
    expect(worker.cachesMock.match).toHaveBeenCalledWith("/");
    expect(worker.cachePut).toHaveBeenCalledTimes(1);
  });

  it("serves a cached asset without an unhandled rejection when the background refresh is offline", async () => {
    const cachedResponse = new Response("cached asset", { status: 200 });
    const worker = await loadServiceWorker({
      cacheMatch: async () => cachedResponse,
      fetcher: async () => { throw new Error("offline"); },
    });
    const pending: Promise<Response>[] = [];
    worker.listeners.get("fetch")?.({
      request: {
        method: "GET",
        url: "https://aghbari.example/assets/app.js",
        mode: "cors",
      } as Request,
      respondWith: (promise: Promise<Response>) => pending.push(promise as Promise<Response>),
    } as unknown as WorkerEvent & { request: Request; respondWith: (promise: Promise<Response>) => void });

    await expect(Promise.all(pending)).resolves.toEqual([cachedResponse]);
  });

  it("removes previous shell cache versions during activation", async () => {
    const worker = await loadServiceWorker({ cacheNames: ["aghbari-shell-v1", "aghbari-shell-v2", "unrelated-cache"] });
    const pending: Promise<unknown>[] = [];
    worker.listeners.get("activate")?.({ waitUntil: (promise) => pending.push(promise) });

    await Promise.all(pending);

    expect(worker.cacheDelete).toHaveBeenCalledTimes(1);
    expect(worker.cacheDelete).toHaveBeenCalledWith("aghbari-shell-v1");
    expect(worker.claim).toHaveBeenCalledOnce();
  });
});
