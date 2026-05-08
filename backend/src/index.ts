import "express-async-errors";
import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import campaignRoutes from "./routes/campaigns.routes.js";
import recipientRoutes from "./routes/recipients.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
// Ensure models are loaded so associations register at startup
import "./models/index.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

// One hop of trust — supertest connects directly so this is a no-op locally.
// In any deploy that fronts this with nginx/Caddy/Fly/Render, X-Forwarded-For
// will be honored so the rate limiter sees the real client IP, not the proxy.
app.set("trust proxy", 1);

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.use("/auth", authRoutes);
app.use("/campaigns", campaignRoutes);
app.use("/recipients", recipientRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use(errorHandler);

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
