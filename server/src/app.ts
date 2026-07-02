import cors from "cors";
import express from "express";
import helmet from "helmet";
import env from "./env";
import { errorHandler } from "./middleware/error-handler";
import routes from "./routes";

const app = express();

app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_ORIGIN,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json({ limit: "100kb" }));

app.use("/api", routes);

app.use((_req, res) => {
  res.status(404).json({ success: false, error: { message: "Not found", errors: [] } });
});

app.use(errorHandler);

export default app;
