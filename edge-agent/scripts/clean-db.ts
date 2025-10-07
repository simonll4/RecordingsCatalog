#!/usr/bin/env npx tsx
/**
 * Clean old sessions and detections from database
 */

import { DatabaseClient } from "@edge-agent/db";
import pino from "pino";

const logger = pino({ name: "clean-db" });

async function main() {
  const dbClient = new DatabaseClient();

  try {
    await dbClient.connect();
    logger.info("Connected to database");

    // Delete all detections first (foreign key constraint)
    const deletedDetections = await dbClient.client.detection.deleteMany({});
    logger.info({ count: deletedDetections.count }, "Deleted detections");

    // Delete all sessions
    const deletedSessions = await dbClient.client.session.deleteMany({});
    logger.info({ count: deletedSessions.count }, "Deleted sessions");

    logger.info("Database cleaned successfully");
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to clean database"
    );
    process.exit(1);
  } finally {
    await dbClient.disconnect();
  }
}

main();
