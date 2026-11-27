
const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const SYSTEM_PROMPT = `
You are the command understanding engine for Dukaan AI,
a voice-first business assistant for Indian shopkeepers.

Understand Hindi, Hinglish and Indian regional-language
sentences.

Your job is to extract what the shopkeeper means.
Do not execute transactions or invent missing information.

Supported intents:
- add_credit
- record_payment
- record_sale
- update_inventory
- check_balance
- unknown

Rules:
1. Identify customer names carefully.
2. Understand Hindi words and speech-recognition variations.
3. "udhaar", "उधार", and "उधर" may refer to credit,
   depending on the sentence context.
4. Never invent a customer name or amount.
5. If a name or amount is unclear, return null.
6. If information is missing, ask a short clarification.
7. Never assume that a deposit means customer credit.
8. Do not treat a greeting as a financial transaction.
9. Always return valid JSON without Markdown.

Return exactly this structure:

{
  "intent": "add_credit",
  "customer": null,
  "amount": null,
  "product": null,
  "quantity": null,
  "status": "needs_clarification",
  "missing_fields": [],
  "clarification": "",
  "understanding": ""
}

Allowed status values:
- ready_for_review
- needs_clarification
- unsupported
`;

function getModelText(result) {
  if (typeof result?.response === "string") {
    return result.response;
  }

  if (typeof result?.choices?.[0]?.message?.content === "string") {
    return result.choices[0].message.content;
  }

  return null;
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
    max_tokens: 400,
    temperature: 0
  });

  const modelText = getModelText(result);

  if (!modelText) {
    throw new Error("AI returned an empty response.");
  }

  let parsed;

  try {
    const cleaned = modelText
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "")
      .trim();

    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error("AI returned an invalid response.");
  }

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

  const amount =
    typeof parsed.amount === "number" &&
    Number.isFinite(parsed.amount) &&
    parsed.amount > 0
      ? parsed.amount
      : null;

  const customer =
    typeof parsed.customer === "string" &&
    parsed.customer.trim()
      ? parsed.customer.trim()
      : null;

  const missingFields = Array.isArray(parsed.missing_fields)
    ? parsed.missing_fields.filter(
        (field) => typeof field === "string"
      )
    : [];

  const requiresCustomer = [
    "add_credit",
    "record_payment",
    "check_balance"
  ].includes(parsed.intent);

  if (requiresCustomer && !customer) {
    missingFields.push("customer");
  }

  if (
    ["add_credit", "record_payment", "record_sale"].includes(
      parsed.intent
    ) &&
    !amount
  ) {
    missingFields.push("amount");
  }

  const uniqueMissingFields = [...new Set(missingFields)];

  const status =
    parsed.intent === "unknown"
      ? "unsupported"
      : uniqueMissingFields.length > 0
        ? "needs_clarification"
        : parsed.status === "unsupported"
          ? "unsupported"
          : "ready_for_review";

  return {
    success: true,
    intent: parsed.intent,
    customer,
    amount,
    product:
      typeof parsed.product === "string"
        ? parsed.product
        : null,
    quantity:
      typeof parsed.quantity === "number" &&
      parsed.quantity > 0
        ? parsed.quantity
        : null,
    status,
    missing_fields: uniqueMissingFields,
    clarification:
      typeof parsed.clarification === "string"
        ? parsed.clarification
        : "",
    understanding:
      typeof parsed.understanding === "string"
        ? parsed.understanding
        : ""
  };
}
