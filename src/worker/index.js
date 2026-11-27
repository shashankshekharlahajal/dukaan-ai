
import { Hono } from "hono";
import { understandCommand } from "./services/command-understanding.js";
import { understandWithAI } from "./services/ai-understanding.js";

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
    description:
      "Voice-first business assistant for Indian shopkeepers."
  });
});

// AI command understanding
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

    if (!c.env?.AI) {
      return c.json(
        {
          success: false,
          message: "AI service is not configured."
        },
        503
      );
    }

    const result = await understandWithAI(
      c.env.AI,
      body.text
    );

    return c.json(result);
  } catch (error) {
    console.error("Command understanding error:", error);

    return c.json(
      {
        success: false,
        message: "Dukaan AI could not understand this command. Please try again."
      },
      500
    );
  }
});

// Basic rule-based service remains available separately
app.post("/api/command/basic", async (c) => {
  try {
    const body = await c.req.json();

    if (
      typeof body.text !== "string" ||
      !body.text.trim() ||
      body.text.length > 1000
    ) {
      return c.json(
        {
          success: false,
          message: "Please provide a valid command."
        },
        400
      );
    }

    return c.json(understandCommand(body.text));
  } catch {
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
