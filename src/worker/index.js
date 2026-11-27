
import { Hono } from "hono";
import { understandCommand } from "./services/command-understanding.js";

const app = new Hono();

// API health check
app.get("/api/health", (c) => {
  return c.json({
    success: true,
    app: "Dukaan AI",
    status: "running",
    message: "Dukaan AI API is ready."
  });
});

// Basic API information
app.get("/api", (c) => {
  return c.json({
    name: "Dukaan AI",
    description:
      "Voice-first business assistant for Indian shopkeepers."
  });
});

// Understand a shopkeeper's command
app.post("/api/command", async (c) => {
  try {
    const body = await c.req.json();

    if (
      typeof body.text !== "string" ||
      !body.text.trim()
    ) {
      return c.json(
        {
          success: false,
          message: "Please provide a valid command."
        },
        400
      );
    }

    if (body.text.length > 1000) {
      return c.json(
        {
          success: false,
          message: "Command is too long."
        },
        400
      );
    }

    const result = understandCommand(body.text);

    return c.json(result);
  } catch (error) {
    return c.json(
      {
        success: false,
        message: "Unable to process this command."
      },
      400
    );
  }
});

export default app;
