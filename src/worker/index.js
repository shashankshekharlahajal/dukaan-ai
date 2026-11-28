
import { Hono } from "hono";

import auth from "./routes/auth.js";
import { requireAuth } from "./middleware/auth.js";

import {
  createConnectionRequest,
  getConnections,
  respondToConnectionRequest
} from "./services/connections.js";

import {
  createConnectedDebt,
  respondToDebt,
  getConnectedDebts
} from "./services/debts.js";

import {
  createRepayment,
  respondToRepayment,
  getRepayments
} from "./services/repayments.js";

import { understandCommand } from "./services/command-understanding.js";
import { understandWithAI } from "./services/ai-understanding.js";
import { recordTransaction } from "./services/transactions.js";

import {
  getCustomers,
  getCustomerLedger
} from "./services/ledger.js";

const app = new Hono();

// Authentication routes
app.route("/api/auth", auth);

// Health check
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

// ==========================================
// CONNECTION SYSTEM
// ==========================================

// Send a connection request.
app.post("/api/connections/request", requireAuth, async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const body = await c.req.json();

    if (!body || typeof body.email !== "string") {
      return c.json({
        success: false,
        message: "Recipient email is required."
      }, 400);
    }

    const user = c.get("user");

    const result = await createConnectionRequest(
      c.env.DB,
      user.id,
      body.email
    );

    return c.json(result, 201);

  } catch (error) {
    console.error("CONNECTION REQUEST ERROR:", error);

    const message = error?.message || "";

    if (
      message.includes("Valid") ||
      message.includes("cannot") ||
      message.includes("nahi mila") ||
      message.includes("nahi ho sakte") ||
      message.includes("connected") ||
      message.includes("pending") ||
      message.includes("pehle")
    ) {
      return c.json({
        success: false,
        message
      }, 400);
    }

    return c.json({
      success: false,
      message: "Connection request send nahi ho paayi."
    }, 500);
  }
});

// Get incoming and outgoing connection requests.
app.get("/api/connections", requireAuth, async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const user = c.get("user");

    const result = await getConnections(
      c.env.DB,
      user.id
    );

    return c.json(result);

  } catch (error) {
    console.error("GET CONNECTIONS ERROR:", error);

    return c.json({
      success: false,
      message: "Connections load nahi ho paaye."
    }, 500);
  }
});

// Accept or reject an incoming connection request.
app.post("/api/connections/:id/respond", requireAuth, async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const body = await c.req.json();

    if (
      !body ||
      !["accepted", "rejected"].includes(body.decision)
    ) {
      return c.json({
        success: false,
        message: "Decision must be accepted or rejected."
      }, 400);
    }

    const user = c.get("user");

    const result = await respondToConnectionRequest(
      c.env.DB,
      c.req.param("id"),
      user.id,
      body.decision
    );

    return c.json(result);

  } catch (error) {
    console.error("CONNECTION RESPONSE ERROR:", error);

    const message = error?.message || "";

    if (
      message.includes("Request nahi mili") ||
      message.includes("Invalid")
    ) {
      return c.json({
        success: false,
        message
      }, 400);
    }

    return c.json({
      success: false,
      message: "Connection response save nahi ho paaya."
    }, 500);
  }
});

// ==========================================
// CONNECTED DEBT SYSTEM
// ==========================================

// Create a new connected debt request.
// direction: "borrowed" or "lent"
app.post("/api/debts", requireAuth, async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const body = await c.req.json();

    if (
      !body ||
      typeof body.connectionId !== "string" ||
      !["borrowed", "lent"].includes(body.direction) ||
      !Number.isSafeInteger(body.amountPaise) ||
      body.amountPaise <= 0
    ) {
      return c.json({
        success: false,
        message: "Connection, direction aur valid amount required hain."
      }, 400);
    }

    if (
      body.originalCommand !== undefined &&
      body.originalCommand !== null &&
      (
        typeof body.originalCommand !== "string" ||
        body.originalCommand.length > 1000
      )
    ) {
      return c.json({
        success: false,
        message: "Invalid original command."
      }, 400);
    }

    const user = c.get("user");

    const result = await createConnectedDebt(
      c.env.DB,
      user.id,
      body.connectionId,
      body.direction,
      body.amountPaise,
      body.originalCommand || null
    );

    return c.json(result, 201);

  } catch (error) {
    console.error("CREATE DEBT ERROR:", error);

    const message = error?.message || "";

    if (
      message.includes("Invalid") ||
      message.includes("Valid") ||
      message.includes("Accepted") ||
      message.includes("nahi")
    ) {
      return c.json({
        success: false,
        message
      }, 400);
    }

    return c.json({
      success: false,
      message: "Udhaar request create nahi ho paayi."
    }, 500);
  }
});

// Get all connected debts for the logged-in user.
app.get("/api/debts", requireAuth, async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const user = c.get("user");

    const result = await getConnectedDebts(
      c.env.DB,
      user.id
    );

    return c.json(result);

  } catch (error) {
    console.error("GET DEBTS ERROR:", error);

    return c.json({
      success: false,
      message: "Udhaar records load nahi ho paaye."
    }, 500);
  }
});

// Accept or reject a connected debt request.
app.post("/api/debts/:id/respond", requireAuth, async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const body = await c.req.json();

    if (
      !body ||
      !["confirmed", "rejected"].includes(body.decision)
    ) {
      return c.json({
        success: false,
        message: "Decision must be confirmed or rejected."
      }, 400);
    }

    const user = c.get("user");

    const result = await respondToDebt(
      c.env.DB,
      c.req.param("id"),
      user.id,
      body.decision
    );

    return c.json(result);

  } catch (error) {
    console.error("DEBT RESPONSE ERROR:", error);

    const message = error?.message || "";

    if (
      message.includes("Invalid") ||
      message.includes("nahi mili") ||
      message.includes("authorized")
    ) {
      return c.json({
        success: false,
        message
      }, 400);
    }

    return c.json({
      success: false,
      message: "Udhaar response save nahi ho paaya."
    }, 500);
  }
});

// ==========================================
// REPAYMENT SYSTEM
// ==========================================

// Create a repayment request for one specific debt.
app.post(
  "/api/debts/:id/repayments",
  requireAuth,
  async (c) => {
    try {
      if (!c.env?.DB) {
        return c.json({
          success: false,
          message: "Database connection is unavailable."
        }, 503);
      }

      const body = await c.req.json();

      if (
        !body ||
        !Number.isSafeInteger(body.amountPaise) ||
        body.amountPaise <= 0 ||
        typeof body.requestId !== "string"
      ) {
        return c.json({
          success: false,
          message: "Valid repayment amount aur request ID required hain."
        }, 400);
      }

      if (
        body.originalCommand !== undefined &&
        body.originalCommand !== null &&
        (
          typeof body.originalCommand !== "string" ||
          body.originalCommand.length > 1000
        )
      ) {
        return c.json({
          success: false,
          message: "Invalid original command."
        }, 400);
      }

      const user = c.get("user");

      const result = await createRepayment(
        c.env.DB,
        user.id,
        c.req.param("id"),
        body.amountPaise,
        body.requestId,
        body.originalCommand || null
      );

      return c.json(result, 201);

    } catch (error) {
      console.error("CREATE REPAYMENT ERROR:", error);

      const message = error?.message || "";

      if (
        message.includes("Invalid") ||
        message.includes("Valid") ||
        message.includes("available balance") ||
        message.includes("authorized") ||
        message.includes("not confirmed") ||
        message.includes("already used")
      ) {
        return c.json({
          success: false,
          message
        }, 400);
      }

      return c.json({
        success: false,
        message: "Repayment request create nahi ho paayi."
      }, 500);
    }
  }
);

// Get repayment history for one debt.
app.get(
  "/api/debts/:id/repayments",
  requireAuth,
  async (c) => {
    try {
      if (!c.env?.DB) {
        return c.json({
          success: false,
          message: "Database connection is unavailable."
        }, 503);
      }

      const user = c.get("user");

      const result = await getRepayments(
        c.env.DB,
        user.id,
        c.req.param("id")
      );

      return c.json(result);

    } catch (error) {
      console.error("GET REPAYMENTS ERROR:", error);

      return c.json({
        success: false,
        message: "Repayment history load nahi ho paayi."
      }, 500);
    }
  }
);

// Accept or reject a repayment request.
app.post(
  "/api/repayments/:id/respond",
  requireAuth,
  async (c) => {
    try {
      if (!c.env?.DB) {
        return c.json({
          success: false,
          message: "Database connection is unavailable."
        }, 503);
      }

      const body = await c.req.json();

      if (
        !body ||
        !["confirmed", "rejected"].includes(body.decision)
      ) {
        return c.json({
          success: false,
          message: "Decision must be confirmed or rejected."
        }, 400);
      }

      const user = c.get("user");

      const result = await respondToRepayment(
        c.env.DB,
        c.req.param("id"),
        user.id,
        body.decision
      );

      return c.json(result);

    } catch (error) {
      console.error("REPAYMENT RESPONSE ERROR:", error);

      const message = error?.message || "";

      if (
        message.includes("Invalid") ||
        message.includes("nahi mili") ||
        message.includes("authorized")
      ) {
        return c.json({
          success: false,
          message
        }, 400);
      }

      return c.json({
        success: false,
        message: "Repayment response save nahi ho paaya."
      }, 500);
    }
  }
);

// ==========================================
// AI COMMAND UNDERSTANDING
// ==========================================

// Guest and registered users can understand commands.
// This route does not save anything to D1.
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

// ==========================================
// CUSTOMER LEDGER
// ==========================================

// Get only the logged-in user's customers.
app.get("/api/customers", requireAuth, async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const user = c.get("user");

    const result = await getCustomers(
      c.env.DB,
      user.id
    );

    return c.json(result);

  } catch (error) {
    console.error("CUSTOMER LIST ERROR:", error);

    return c.json({
      success: false,
      message: "Customers load nahi ho paaye."
    }, 500);
  }
});

// Get a ledger only if it belongs to the logged-in user.
app.get("/api/customers/:id/ledger", requireAuth, async (c) => {
  try {
    if (!c.env?.DB) {
      return c.json({
        success: false,
        message: "Database connection is unavailable."
      }, 503);
    }

    const user = c.get("user");

    const result = await getCustomerLedger(
      c.env.DB,
      c.req.param("id"),
      user.id
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

// ==========================================
// TRANSACTION CONFIRMATION
// ==========================================

// Save only after explicit user confirmation.
app.post(
  "/api/transactions/confirm",
  requireAuth,
  async (c) => {
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

      const user = c.get("user");

      const result = await recordTransaction(c.env.DB, {
        customer: body.customer,
        amount: body.amount,
        intent: body.intent,
        originalCommand: body.originalCommand,
        requestId: body.requestId,
        ownerId: user.id
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
  }
);

// ==========================================
// BASIC COMMAND PARSER
// ==========================================

// Testing route. Does not save anything.
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
