// Local integration-test routing only; not a production proxy.
import http from "node:http";
import { readFileSync } from "node:fs";
const keys = JSON.parse(readFileSync(".local-stack/credentials.json", "utf8"));
const routes = [
  ["/auth/v1", 54325],
  ["/rest/v1", 54326],
  ["/storage/v1", 54327],
];
http
  .createServer((request, response) => {
    const route = routes.find(([prefix]) => request.url.startsWith(prefix));
    if (!route) {
      response.writeHead(404).end();
      return;
    }
    const headers = { ...request.headers };
    if (!headers.authorization && headers.apikey)
      headers.authorization = `Bearer ${headers.apikey}`;
    if (
      headers.apikey &&
      ![keys.TEST_ANON_KEY, keys.TEST_SERVICE_KEY].includes(headers.apikey)
    ) {
      response.writeHead(401).end();
      return;
    }
    const upstream = http.request(
      {
        hostname: "127.0.0.1",
        port: route[1],
        path: request.url.slice(route[0].length) || "/",
        method: request.method,
        headers,
      },
      (incoming) => {
        response.writeHead(incoming.statusCode, incoming.headers);
        incoming.pipe(response);
      },
    );
    upstream.on("error", () => {
      response.writeHead(502).end();
    });
    request.pipe(upstream);
  })
  .listen(54321, "127.0.0.1", () =>
    console.log("Local test gateway ready on loopback port 54321."),
  );
