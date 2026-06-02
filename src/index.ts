import {loadConfig} from "./config.js";
import {startHealthServer} from "./health/server.js";
import {startTestServer} from "./debug/testServer.js";
import {RelayApp} from "./relay.js";
import {Logger} from "./util/logger.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const logger = new Logger(config.serviceName);
  const app = new RelayApp(config, logger);

  startHealthServer(config.health.host, config.health.port, app.getHealth());
  logger.info("health server started", config.health);

  if (config.test?.enabled) {
    startTestServer(config.test, logger, (event) => app.injectTestEvent(event));
  }

  await app.start();
  logger.info("item relay started");
}

main().catch((error) => {
  console.error(
    JSON.stringify({
      ts: new Date().toISOString(),
      level: "error",
      scope: "bootstrap",
      message: error instanceof Error ? error.message : String(error),
    }),
  );
  process.exitCode = 1;
});
