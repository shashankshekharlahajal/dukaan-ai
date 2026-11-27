
import { Hono } from "hono";
import { understandCommand } from "./services/command-understanding.js";
import { understandWithAI } from "./services/ai-understanding.js";
import { recordTransaction } from "./services/transactions.js";
import {
  getCustomers,
  getCustomerLedger
} from "./services/ledger.js";

const app = new Hono();

app.get("/api/health", (c) => {
  return c.json({
    success: true,
    app: "Dukaan AI",
    status: "running",
    aiBindingConfigured: Boolean(c.env?.AI),
    dbBindingConfigured: Boolean(c.env?.DB)
  });
});

app.get("/api", (c) => {
  return c.json({
    name: "Dukaan AI",
    status: "running"
  });
});

// Understand shopkeeper's command using AI.
app.post("/api/command", async (c) => {
  try {
    const body = await c.req.json();

    if (
      !body ||
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
        message: "AI service is unavailable."
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
      message: "Command samajhne mein dikkat hui. Dobara try karein."
    }, 500);
  }
});

// Get all customers.
app.get("/api/customers", async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const result = await getCustomers(c.env.DB);

    return c.json(result);
  } catch (error) {
    console.error("CUSTOMER LIST ERROR:", error);

    return c.json({
      success: false,
      message: "Customers load nahi ho paaye."
    }, 500);
  }
});

// Get one customer's ledger and transaction history.
app.get("/api/customers/:id/ledger", async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const result = await getCustomerLedger(
      c.env.DB,
      c.req.param("id")
    );

    if (!result) {
      return c.json({
        success: false,
        message: "Customer nahi mila."
      }, 404);
    }

    return c.json(result);
  } catch (error) {
    console.error("CUSTOMER LEDGER ERROR:", error);

    return c.json({
      success: false,
      message: "Customer ledger load nahi ho paaya."
    }, 500);
  }
});

// Save a transaction only after explicit confirmation.
app.post("/api/transactions/confirm", async (c) => {
  try {
    const body = await c.req.json();

    if (!body || body.confirmed !== true) {
      return c.json({
        success: false,
        message: "Transaction save karne se pehle confirmation zaroori hai."
      }, 400);
    }

    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    if (
      !["add_credit", "record_payment"].includes(body.intent) ||
      typeof body.customer !== "string" ||
      !body.customer.trim() ||
      typeof body.amount !== "number" ||
      !Number.isFinite(body.amount) ||
      typeof body.requestId !== "string"
    ) {
      return c.json({
        success: false,
        message: "Transaction details are invalid."
      }, 400);
    }

    const result = await recordTransaction(c.env.DB, {
      customer: body.customer,
      amount: body.amount,
      intent: body.intent,
      originalCommand: body.originalCommand,
      requestId: body.requestId
    });

    return c.json(result);
  } catch (error) {
    console.error("TRANSACTION SAVE ERROR:", error);

    const message = error?.message || "";

    if (
      message.includes("already been recorded") ||
      message.includes("outstanding balance")
    ) {
      return c.json({
        success: false,
        message
      }, 409);
    }

    if (
      message.includes("valid") ||
      message.includes("Unsupported")
    ) {
      return c.json({
        success: false,
        message
      }, 400);
    }

    return c.json({
      success: false,
      message: "Transaction save nahi ho paayi. Dobara try karein."
    }, 500);
  }
});

// Basic parser route (kept for testing).
app.post("/api/command/basic", async (c) => {
  try {
    const body = await c.req.json();

    if (
      !body ||
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
      message: "Unable to process command."
    }, 500);
  }
});

export default app;
