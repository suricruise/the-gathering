// @vitest-environment node
import { EventEmitter } from "node:events";
import { beforeEach, it, expect, vi } from "vitest";
const mocks = vi.hoisted(() => ({ lookup: vi.fn(), get: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));
vi.mock("node:https", () => ({ default: { get: mocks.get } }));
import { fetchLinkPreview } from "./previews";
beforeEach(() => {
  vi.clearAllMocks();
  mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
});
function response(
  status: number,
  headers: Record<string, string>,
  body: string,
) {
  return (
    _url: URL,
    _options: {
      lookup: (
        host: string,
        options: object,
        cb: (error: null, address: string, family: number) => void,
      ) => void;
    },
    callback: (response: EventEmitter) => void,
  ) => {
    const req = Object.assign(new EventEmitter(), {
      destroy: (error: Error) => {
        req.emit("error", error);
        req.emit("close");
      },
    });
    queueMicrotask(() => {
      const incoming = Object.assign(new EventEmitter(), {
        statusCode: status,
        headers,
        resume: () => {
          req.emit("close");
        },
      });
      callback(incoming);
      if (status === 200) {
        incoming.emit("data", Buffer.from(body));
        incoming.emit("end");
        req.emit("close");
      }
    });
    return req;
  };
}
it("pins the validated public DNS address on the HTTPS request", async () => {
  mocks.get.mockImplementation(
    response(
      200,
      { "content-type": "text/html" },
      "<title>Example page</title>",
    ),
  );
  const result = await fetchLinkPreview("https://example.com/path");
  expect(result.title).toBe("Example page");
  const options = mocks.get.mock.calls[0][1];
  const callback = vi.fn();
  options.lookup("example.com", {}, callback);
  expect(callback).toHaveBeenCalledWith(null, "93.184.216.34", 4);
  expect(options.family).toBe(4);
});
it("blocks a hostname if any DNS result is private, before opening a socket", async () => {
  mocks.lookup.mockResolvedValue([
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ]);
  await expect(fetchLinkPreview("https://example.com")).rejects.toThrow();
  expect(mocks.get).not.toHaveBeenCalled();
});
it("revalidates redirect DNS and blocks redirects to internal services", async () => {
  mocks.get.mockImplementationOnce(
    response(302, { location: "https://169.254.169.254/latest" }, ""),
  );
  mocks.lookup
    .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
    .mockResolvedValueOnce([{ address: "169.254.169.254", family: 4 }]);
  await expect(fetchLinkPreview("https://example.com")).rejects.toThrow();
  expect(mocks.get).toHaveBeenCalledTimes(1);
});
it("rejects oversized responses and unsupported MIME types", async () => {
  mocks.get.mockImplementationOnce(
    response(200, { "content-type": "text/html" }, "a".repeat(128 * 1024 + 1)),
  );
  await expect(fetchLinkPreview("https://example.com")).rejects.toThrow(
    /large/,
  );
  mocks.get.mockImplementationOnce(
    response(200, { "content-type": "application/octet-stream" }, "file"),
  );
  await expect(fetchLinkPreview("https://example.com")).rejects.toThrow(
    /Unsupported/,
  );
});
