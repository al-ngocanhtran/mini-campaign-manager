import express from "express";
import cors from "cors";
import authRoutes from "./routes/auth.js";
import campaignRoutes from "./routes/campaigns.js";

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({ origin: process.env.CORS_ORIGIN || "http://localhost:5173" }));
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/campaigns", campaignRoutes);

// Health check
app.get("/health", (_req, res) => res.json({ status: "ok" }));

// Global error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err.stack);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});

export default app;
