
import { Hono } from "hono";
import { understandCommand } from "./services/command-understanding.js";
import { understandWithAI } from "./services/ai-understanding.js";

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({
    success: true,
    app: "Dukaan AI",
    status: "running",
    aiBindingConfigured: Boolean(c.env?.AI)
  });
});

app.get("/api", (c) => {
  return c.json({
    name: "Dukaan AI",
    status: "running"
  });
});

app.post("/api/command", async (c) => {
  try {
    const body = await c.req.json();

    if (
      typeof body.text !== "string" ||
      !body.text.trim()
    ) {
      return c.json({
        success: false,
        message: "Please provide a valid command."
      }, 400);
    }

    if (body.text.length > 1000) {
      return c.json({
        success: false,
        message: "Command is too long."
      }, 400);
    }

    if (!c.env?.AI) {
      return c.json({
        success: false,
        message: "Workers AI binding is missing. Check wrangler.jsonc."
      }, 503);
    }

    const result = await understandWithAI(
      c.env.AI,
      body.text
    );

    return c.json(result);
  } catch (error) {
    console.error("DUKAAN AI ERROR:", error);

    return c.json({
      success: false,
      message: error?.message || "Unknown server error.",
      errorType: error?.name || "Error"
    }, 500);
  }
});

app.post("/api/command/basic", async (c) => {
  try {
    const body = await c.req.json();

    if (
      typeof body.text !== "string" ||
      !body.text.trim() ||
      body.text.length > 1000
    ) {
      return c.json({
        success: false,
        message: "Please provide a valid command."
      }, 400);
    }

    return c.json(understandCommand(body.text));
  } catch (error) {
    console.error("BASIC COMMAND ERROR:", error);

    return c.json({
      success: false,
      message: error?.message || "Unable to process command."
    }, 500);
  }
});

export default app;
