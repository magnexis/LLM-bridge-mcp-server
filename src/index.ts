#!/usr/bin/env node
import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig } from "./config.js";
import { cleanupRuntimeDataDir } from "./privacy/runtime.js";
import { startRemoteHttpServer } from "./runtime/http.js";
import { createServer } from "./server.js";
import { logError } from "./utils/logging.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const stdioServer = config.transportMode === "stdio" ? createServer(config) : undefined;
  const remoteRuntime = config.transportMode === "http" ? await startRemoteHttpServer(config) : undefined;

  let stopping = false;
  const shutdown = async (code: number) => {
    if (stopping) return;
    stopping = true;
    try {
      if (stdioServer) {
        await stdioServer.close();
      }
      if (remoteRuntime) {
        await remoteRuntime.close();
      }
    } catch (error) {
      logError("Shutdown error", error);
    }
    try {
      await cleanupRuntimeDataDir(config.dataDir, config.ephemeralDataDir);
    } catch (error) {
      logError("Runtime cleanup error", error);
    }
    process.exit(code);
  };

  process.on("SIGINT", () => void shutdown(0));
  process.on("SIGTERM", () => void shutdown(0));
  process.on("unhandledRejection", (error) => {
    logError("Unhandled rejection", error);
    void shutdown(1);
  });
  process.on("uncaughtException", (error) => {
    logError("Uncaught exception", error);
    void shutdown(1);
  });

  if (stdioServer) {
    await stdioServer.connect(new StdioServerTransport());
    return;
  }
}

main().catch((error) => {
  logError("Initialization failed", error);
  process.exit(1);
});
