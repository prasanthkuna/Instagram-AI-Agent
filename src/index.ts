import dotenv from "dotenv";
import logger from "./config/logger";
import { shutdown } from "./services";
import app from "./app";
import { initAgent } from "./Agent/index";
import { runInstagram, runInstagramWithFollowing } from "./client/Instagram";
import { postUpdate } from "./client/postUpdate";

dotenv.config();

async function startServer() {
  try {
    await initAgent();
  } catch (err) {
    logger.error("Error during agent initialization:", err);
    process.exit(1);
  }

  const server = app.listen(process.env.PORT || 3000, () => {
    logger.info(`Server is running on port ${process.env.PORT || 3000}`);
  });

  process.on("SIGTERM", () => {
    logger.info("Received SIGTERM signal.");
    shutdown(server);
  });
  process.on("SIGINT", () => {
    logger.info("Received SIGINT signal.");
    shutdown(server);
  });
}

// Check for command line arguments to determine which function to run
if (process.argv.includes("--with-following")) {
  logger.info("Starting Instagram bot with following interaction...");
  runInstagramWithFollowing().catch(err => {
    logger.error("Error running Instagram with following:", err);
  });
} else if (process.argv.includes("--post-update")) {
  logger.info("Posting an update to Instagram...");
  postUpdate().then(() => {
    logger.info("Update posted successfully");
  }).catch(err => {
    logger.error("Error posting update:", err);
  });
} else {
  // Default: start the server
  startServer();
}
