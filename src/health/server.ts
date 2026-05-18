import {createServer} from "node:http";
import type {RelayHealth} from "./state.js";

export function startHealthServer(
  host: string,
  port: number,
  health: RelayHealth,
): void {
  const server = createServer((req, res) => {
    if (req.url !== "/health") {
      res.statusCode = 404;
      res.end("not found");
      return;
    }
    const body = JSON.stringify(health.getSnapshot(), null, 2);
    res.statusCode = 200;
    res.setHeader("content-type", "application/json");
    res.end(body);
  });
  server.listen(port, host);
}
