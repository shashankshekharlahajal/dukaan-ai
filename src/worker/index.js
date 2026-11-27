
import { Hono } from "hono";

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({
    success: true,
    app: "Dukaan AI",
    status: "running",
    message: "Dukaan AI API is ready."
  });
});

app.get("/api", (c) => {
  return c.json({
    name: "Dukaan AI",
    description: "Voice-first business assistant for Indian shopkeepers."
  });
});

export default app;
