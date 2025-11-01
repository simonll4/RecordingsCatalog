/**
 * Manager Entry Point
 *
 * Boots the supervisor (agent child process manager) and starts the API server
 * on CONFIG.status.port. This module does not serve any UI; the external
 * Vue application talks to this API to control and monitor the agent.
 */
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { CONFIG } from "../config/index.js";
import { logger } from "../shared/logging.js";
import { AgentSupervisor } from "./agent-supervisor.js";
import { OverridesStore } from "./overrides-store.js";
import { startManagerServer } from "./http-server.js";

const resolveChildScript = () =>
  fileURLToPath(new URL("../app/main.js", import.meta.url));

const parseBoolean = (value: string | undefined, defaultValue: boolean) => {
  if (typeof value !== "string") {
    return defaultValue;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return defaultValue;
};

async function bootstrap() {
  logger.setLevel(CONFIG.logLevel);
  const log = logger.child({ module: "manager-main" });

  const managerPort = CONFIG.status.port;
  const childStatusPortEnv = process.env.EDGE_AGENT_CHILD_STATUS_PORT;
  let childStatusPort = managerPort + 1;
  if (typeof childStatusPortEnv === "string" && childStatusPortEnv.trim().length > 0) {
    const parsed = Number.parseInt(childStatusPortEnv.trim(), 10);
    if (!Number.isNaN(parsed)) {
      childStatusPort = parsed;
    }
  }

  const overridesPath = join(process.cwd(), "runtime-overrides.json");
  const overridesStore = new OverridesStore(overridesPath);

  const command = process.env.EDGE_AGENT_CHILD_COMMAND ?? process.execPath;
  const args =
    typeof process.env.EDGE_AGENT_CHILD_ARGS === "string" &&
    process.env.EDGE_AGENT_CHILD_ARGS.trim().length > 0
      ? process.env.EDGE_AGENT_CHILD_ARGS.split(/\s+/)
      : [resolveChildScript()];

  const supervisor = new AgentSupervisor({
    command,
    args,
    statusPort: childStatusPort,
    overridesStore,
  });

  const server = await startManagerServer({
    supervisor,
    port: managerPort,
  });

  const shouldAutostart = parseBoolean(process.env.EDGE_AGENT_AUTOSTART, false);

  if (shouldAutostart) {
    log.info("Autostart enabled - launching edge agent");
    void supervisor.start();
  } else {
    log.info("Autostart disabled - waiting for manual start");
  }

  const shutdown = async () => {
    log.info("Shutdown requested");

    await new Promise<void>((resolve) => server.close(() => resolve()));

    try {
      await supervisor.stop();
    } catch (err) {
      log.error("Error stopping supervisor", { error: (err as Error).message });
    }
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((err) => {
  logger.error("Manager fatal error", { error: err.message });
  process.exit(1);
});
