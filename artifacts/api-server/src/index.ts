import app from "./app";
import { logger } from "./lib/logger";
import { removeExpiredUploads } from "./routes/design-assets";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});

// Unfinished Design Studio image uploads are removed when they expire.
const sweepUploads = () =>
  removeExpiredUploads()
    .then((n) => n && logger.info({ removed: n }, "Removed expired design asset uploads"))
    .catch((err) => logger.warn({ err }, "Couldn't remove expired design asset uploads (has migration 0009 been applied?)"));
void sweepUploads();
setInterval(sweepUploads, 3600_000).unref();
