
const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const SYSTEM_PROMPT = `
You are Dukaan AI, a voice-first business assistant
for Indian shopkeepers.

Understand Hindi, Hinglish and Indian regional languages.

Your task is ONLY to understand the shopkeeper's command.
Never save or execute a transaction.

Supported intents:
- add_credit
- record_payment
- record_sale
- update_inventory
- check_balance
- unknown

Rules:
1. Extract the customer's name accurately.
2. Extract the amount as a number.
3. Understand Hindi and Hinglish speech variations.
4. "udhaar", "उधार", and "उधर" depend on sentence context.
5. Never invent customer names, amounts or products.
6. If information is missing, use null.
7. If a command is unclear, ask a short clarification.
8. A deposit does not automatically mean customer credit.
9. Greetings are not financial transactions.
10. For add_credit, customer and amount are required.
11. For record_payment, customer and amount are required.
12. For record_sale, amount is required.
13. Return only the requested JSON structure.
`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    intent: {
      type: "string",
      enum: [
        "add_credit",
        "record_payment",
        "record_sale",
        "update_inventory",
        "check_balance",
        "unknown"
      ]
    },
    customer: {
      type: ["string", "null"]
    },
    amount: {
      type: ["number", "null"]
    },
    product: {
      type: ["string", "null"]
    },
    quantity: {
      type: ["number", "null"]
    },
    status: {
      type: "string",
      enum: [
        "ready_for_review",
        "needs_clarification",
        "unsupported"
      ]
    },
    missing_fields: {
      type: "array",
      items: {
        type: "string"
      }
    },
    clarification: {
      type: "string"
    },
    understanding: {
      type: "string"
    }
  },
  required: [
    "intent",
    "customer",
    "amount",
    "product",
    "quantity",
    "status",
    "missing_fields",
    "clarification",
    "understanding"
  ],
  additionalProperties: false
};

function extractModelResponse(result) {
  const response =
    result?.response ??
    result?.choices?.[0]?.message?.content;

  if (typeof response === "string") {
    const cleaned = response
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/i, "")
      .trim();

    return JSON.parse(cleaned);
  }

  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response)
  ) {
    return response;
  }

  throw new Error("AI returned an empty or invalid response.");
}

export async function understandWithAI(ai, input) {
  if (!ai || typeof ai.run !== "function") {
    throw new Error("Workers AI binding is unavailable.");
  }

  const text = String(input || "").trim();

  if (!text || text.length > 1000) {
    throw new Error("Please provide a valid command.");
  }

  const result = await ai.run(MODEL, {
    messages: [
      {
        role: "system",
        content: SYSTEM_PROMPT
      },
      {
        role: "user",
        content: `Understand this shopkeeper command:\n${text}`
      }
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "dukaan_command",
        strict: true,
        schema: RESPONSE_SCHEMA
      }
    },
    chat_template_kwargs: {
      enable_thinking: false
    },
    max_completion_tokens: 400,
    temperature: 0
  });

  const parsed = extractModelResponse(result);

  const allowedIntents = [
    "add_credit",
    "record_payment",
    "record_sale",
    "update_inventory",
    "check_balance",
    "unknown"
  ];

  const allowedStatuses = [
    "ready_for_review",
    "needs_clarification",
    "unsupported"
  ];

  if (
    !parsed ||
    !allowedIntents.includes(parsed.intent) ||
    !allowedStatuses.includes(parsed.status)
  ) {
    throw new Error("AI response failed validation.");
  }

  const customer =
    typeof parsed.customer === "string" &&
    parsed.customer.trim()
      ? parsed.customer.trim()
      : null;

  const amount =
    typeof parsed.amount === "number" &&
    Number.isFinite(parsed.amount) &&
    parsed.amount > 0
      ? parsed.amount
      : null;

  const requiresCustomer = [
    "add_credit",
    "record_payment",
    "check_balance"
  ].includes(parsed.intent);

  const requiresAmount = [
    "add_credit",
    "record_payment",
    "record_sale"
  ].includes(parsed.intent);

  const missingFields = Array.isArray(parsed.missing_fields)
    ? parsed.missing_fields.filter(
        (field) => typeof field === "string"
      )
    : [];

  if (requiresCustomer && !customer) {
    missingFields.push("customer");
  }

  if (requiresAmount && !amount) {
    missingFields.push("amount");
  }

  const uniqueMissingFields = [...new Set(missingFields)];

  let status = parsed.status;

  if (parsed.intent === "unknown") {
    status = "unsupported";
  } else if (uniqueMissingFields.length > 0) {
    status = "needs_clarification";
  } else if (status === "needs_clarification") {
    status = "needs_clarification";
  }

  const understanding =
    typeof parsed.understanding === "string"
      ? parsed.understanding
      : "";

  const clarification =
    typeof parsed.clarification === "string"
      ? parsed.clarification
      : "";

  let message = understanding;

  if (status === "needs_clarification") {
    message =
      clarification ||
      "Mujhe thodi aur information chahiye.";
  }

  if (status === "unsupported") {
    message =
      clarification ||
      "Main is command ko samajh nahi paaya.";
  }

  if (status === "ready_for_review" && !message) {
    message = "Maine aapka command samajh liya hai.";
  }

  return {
    success: true,
    message,
    intent: parsed.intent,
    customer,
    amount,
    product:
      typeof parsed.product === "string"
        ? parsed.product
        : null,
    quantity:
      typeof parsed.quantity === "number" &&
      Number.isFinite(parsed.quantity) &&
      parsed.quantity > 0
        ? parsed.quantity
        : null,
    status,
    missing_fields: uniqueMissingFields,
    clarification,
    understanding
  };
}
