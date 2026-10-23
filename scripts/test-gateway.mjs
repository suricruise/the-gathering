// Local integration routing only, including the real Realtime WebSocket service.
import http from "node:http";
import net from "node:net";
import { readFileSync } from "node:fs";
const keys = JSON.parse(readFileSync(".local-stack/credentials.json", "utf8"));
const routes = [
  ["/auth/v1", 54325],
  ["/rest/v1", 54326],
  ["/storage/v1", 54327],
  ["/realtime/v1", 54328],
];
const valid = (key) =>
  [keys.TEST_ANON_KEY, keys.TEST_SERVICE_KEY].includes(key);
function pathFor(url, prefix) {
  const path = url.slice(prefix.length) || "/";
  return prefix === "/realtime/v1" && path.startsWith("/websocket")
    ? "/socket" + path
    : path;
}
const server = http.createServer((request, response) => {
  const route = routes.find(([prefix]) => request.url.startsWith(prefix));
  if (!route) {
    response.writeHead(404).end();
    return;
  }
  const headers = { ...request.headers };
  if (!headers.authorization && headers.apikey)
    headers.authorization = `Bearer ${headers.apikey}`;
  if (headers.apikey && !valid(headers.apikey)) {
    response.writeHead(401).end();
    return;
  }
  if (route[1] === 54328) headers.host = "realtime-dev.supabase-realtime";
  const upstream = http.request(
    {
      hostname: "127.0.0.1",
      port: route[1],
      path: pathFor(request.url, route[0]),
      method: request.method,
      headers,
    },
    (incoming) => {
      response.writeHead(incoming.statusCode, incoming.headers);
      incoming.pipe(response);
    },
  );
  upstream.on("error", () => response.writeHead(502).end());
  request.pipe(upstream);
});
server.on("upgrade", (request, socket, head) => {
  if (
    !request.url.startsWith("/realtime/v1/websocket") ||
    !valid(new URL(request.url, "http://localhost").searchParams.get("apikey"))
  ) {
    socket.end("HTTP/1.1 401 Unauthorized\r\n\r\n");
    return;
  }
  const upstream = net.connect(54328, "127.0.0.1", () => {
    const headers = {
      ...request.headers,
      host: "realtime-dev.supabase-realtime",
    };
    upstream.write(
      `${request.method} ${pathFor(request.url, "/realtime/v1")} HTTP/${request.httpVersion}\r\n` +
        Object.entries(headers)
          .map(([key, value]) => `${key}: ${value}`)
          .join("\r\n") +
        "\r\n\r\n",
    );
    if (head.length) upstream.write(head);
    socket.pipe(upstream).pipe(socket);
  });
  upstream.on("error", () => socket.destroy());
  socket.on("error", () => upstream.destroy());
  socket.on("close", () => upstream.destroy());
});
server.listen(54321, "127.0.0.1", () =>
  console.log("Local test gateway with Realtime ready on loopback port 54321."),
);
