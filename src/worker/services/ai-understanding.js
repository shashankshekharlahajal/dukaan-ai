
const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const SYSTEM_PROMPT = `
You are Dukaan AI, a Hindi and Hinglish voice assistant
for Indian shopkeepers.

IMPORTANT:
For now, you support ONLY two operations:

1. add_credit:
   Add new udhaar to a customer's account.
   The customer now owes money to the shopkeeper.

2. record_payment:
   Record money received from a customer against
   their existing udhaar.
   The customer's outstanding balance decreases.

UNDERSTAND NATURAL LANGUAGE:
Shopkeepers can use different words and sentence structures.
Do not require exact keywords or fixed sentences.

EXAMPLES FOR add_credit:

- "Ramesh ne 500 rupaye ka samaan udhaar liya."
- "Ramesh ne udhaar liya hai."
- "Ramesh ke khate mein 500 jod do."
- "Maine Ramesh ko 500 ka udhaar diya."
- "Ramesh ko 500 rupaye baaki mein de diye."
- "Ramesh ke naam 500 rupaye likh do."
- "Ramesh ka naya udhaar 500 rupaye hai."

These mean: add 500 to Ramesh's outstanding balance.

EXAMPLES FOR record_payment:

- "Ramesh ne apne udhaar ke 500 rupaye chuka diye."
- "Ramesh ne apna 500 rupaye ka baaki de diya."
- "Ramesh ne 500 rupaye wapas kar diye."
- "Ramesh ke 500 rupaye mil gaye."
- "Ramesh ne udhaar chuka diya."
- "Ramesh ne 500 jama kar diye."
- "Ramesh ne purane udhaar ka payment kar diya."
- "Ramesh ne apna hisaab chuka diya."

These mean: subtract the received amount from
Ramesh's outstanding balance.

IMPORTANT DIFFERENCES:

- "Udhaar liya" means new credit was given.
- "Udhaar diya" means new credit was given.
- "Udhaar chuka diya" means payment was received.
- "Paise wapas kar diye" means payment was received.
- "Paise mil gaye" means payment was received only
  when the sentence clearly refers to customer udhaar.
- Never confuse a new udhaar with repayment.
- Words such as "jama" must be understood using context.

EXTRACTION RULES:

1. Extract the customer's name.
2. Extract the amount as a number.
3. Identify the correct intent.
4. Never invent a customer name or amount.
5. If customer or amount is missing, ask for it.
6. If the sentence is ambiguous, ask a clarification.
7. Do not assume a payment is a new udhaar.
8. Do not assume a new udhaar is a payment.
9. Do not process sales, inventory or other operations.
10. Never save or execute transactions.

Return ONLY valid JSON in this exact structure:

{
  "intent": "add_credit",
  "customer": "Ramesh",
  "amount": 500,
  "status": "ready_for_review",
  "missing_fields": [],
  "clarification": "",
  "understanding": "Ramesh ke khate mein 500 rupaye udhaar jodne hain."
}

Allowed intent values:
- add_credit
- record_payment
- unknown

Allowed status values:
- ready_for_review
- needs_clarification
- unsupported
`;

function extractResponse(result) {
  const response =
    result?.response ??
    result?.choices?.[0]?.message?.content;

  // Cloudflare JSON Mode can return an object directly.
  if (
    response &&
    typeof response === "object" &&
    !Array.isArray(response)
  ) {
    return response;
  }

  if (typeof response !== "string") {
    throw new Error("AI returned an empty response.");
  }

  let cleaned = response
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  // Recover JSON if the model adds text around it.
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
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
        content: `Understand this shopkeeper's statement:\n${text}`
      }
    ],
    response_format: {
      type: "json_object"
    },
    chat_template_kwargs: {
      enable_thinking: false
    },
    max_tokens: 400,
    temperature: 0
  });

  const parsed = extractResponse(result);

  const allowedIntents = [
    "add_credit",
    "record_payment",
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

  const rawAmount = parsed.amount;

  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string"
        ? Number(rawAmount.replace(/,/g, "").replace(/[₹\s]/g, ""))
        : null;

  const validAmount =
    Number.isFinite(amount) && amount > 0
      ? amount
      : null;

  const missingFields = [];

  if (
    ["add_credit", "record_payment"].includes(parsed.intent) &&
    !customer
  ) {
    missingFields.push("customer");
  }

  if (
    ["add_credit", "record_payment"].includes(parsed.intent) &&
    !validAmount
  ) {
    missingFields.push("amount");
  }

  let status = parsed.status;

  if (parsed.intent === "unknown") {
    status = "unsupported";
  } else if (missingFields.length > 0) {
    status = "needs_clarification";
  }

  const clarification =
    typeof parsed.clarification === "string"
      ? parsed.clarification
      : "";

  const understanding =
    typeof parsed.understanding === "string"
      ? parsed.understanding
      : "";

  let message = understanding;

  if (status === "needs_clarification") {
    message =
      clarification ||
      (!customer
        ? "Kis customer ka udhaar record karna hai?"
        : "Kitne rupaye record karne hain?");
  }

  if (status === "unsupported") {
    message =
      clarification ||
      "Main abhi sirf udhaar aur udhaar ka payment record kar sakta hoon.";
  }

  if (status === "ready_for_review" && !message) {
    message = "Maine aapki baat samajh li hai.";
  }

  return {
    success: true,
    intent: parsed.intent,
    customer,
    amount: validAmount,
    status,
    missing_fields: missingFields,
    clarification,
    understanding,
    message
  };
}
