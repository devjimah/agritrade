import cors from "cors";
import express from "express";
import helmet from "helmet";
import env from "./env";
import { errorHandler } from "./middleware/error-handler";
import routes from "./routes";

const app = express();

// Required when deployed behind a reverse proxy (Render/Railway/nginx) so
// express-rate-limit sees real client IPs instead of the proxy's.
if (env.TRUST_PROXY) app.set("trust proxy", 1);

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
// Notebook photos arrive as base64; parse that one route with a bigger limit
// first (express.json skips bodies that are already parsed).
app.use("/api/ai/import-notebook", express.json({ limit: "8mb" }));
app.use(express.json({ limit: "100kb" }));

app.use("/api", routes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { message: "Not found", errors: [] } });
});

app.use(errorHandler);

export default app;
