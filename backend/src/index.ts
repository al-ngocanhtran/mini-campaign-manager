import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import campaignRoutes from "./routes/campaigns.js";
import recipientRoutes from "./routes/recipients.js";
// Ensure models are loaded so associations register at startup
import "./models/index.js";

const app = express();
const PORT = Number(process.env.PORT) || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json({ limit: "1mb" }));

app.use("/auth", authRoutes);
app.use("/campaigns", campaignRoutes);
app.use("/recipients", recipientRoutes);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

if (process.env.NODE_ENV !== "test") {
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

export default app;
