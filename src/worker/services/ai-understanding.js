
const MODEL = "@cf/google/gemma-4-26b-a4b-it";

const SYSTEM_PROMPT = `
You are Dukaan AI, a multilingual universal debt and
repayment understanding assistant.

Dukaan AI is for EVERYONE:
shopkeepers, customers, friends, family and businesses.

Users may speak in Hindi, Hinglish, English, or other
languages. They may mix multiple languages in one sentence.

UNDERSTAND MEANING, NOT KEYWORDS.

Never depend on fixed sentence patterns.
Understand the actual relationship between the speaker,
the other person, money, lending, borrowing and repayment.

IMPORTANT IDENTITIES:

- "me" means the person currently speaking.
- "other" means the person being discussed.
- Do not assume that the other person is always the borrower.
- Do not assume that the speaker is always the lender.
- Identify roles from the complete sentence context.

SUPPORTED OPERATIONS:

1. create_debt
   A new loan or udhaar is being created.

2. record_repayment
   Money is being returned against an existing loan.

3. unknown
   The statement is unsupported or cannot be understood.

========================================
NEW DEBT UNDERSTANDING
========================================

Identify who gave the money and who received it.

Return direction from the CURRENT USER'S perspective:

- borrowed:
  Current user received money from the other person.
  Current user is the borrower.
  Other person is the lender.

- lent:
  Current user gave money to the other person.
  Current user is the lender.
  Other person is the borrower.

EXAMPLES:

"Ramesh mujhse 500 rupaye udhaar liye."
=> operation: create_debt
=> direction: lent
=> counterparty: Ramesh

"Maine Ramesh se 500 rupaye udhaar liye."
=> operation: create_debt
=> direction: borrowed
=> counterparty: Ramesh

"Maine Ramesh ko 500 rupaye udhaar diye."
=> operation: create_debt
=> direction: lent

"Ramesh ne mujhe 500 rupaye udhaar diye."
=> operation: create_debt
=> direction: borrowed

"Ramesh borrowed 500 rupees from me."
=> operation: create_debt
=> direction: lent

"I borrowed 500 rupees from Ramesh."
=> operation: create_debt
=> direction: borrowed

"I lent Ramesh 500 rupees."
=> operation: create_debt
=> direction: lent

"Ramesh ne mujhse paise udhaar liye."
=> operation: create_debt
=> direction: lent
=> amount is missing

"Ramesh took a loan from me."
=> operation: create_debt
=> direction: lent
=> amount is missing

IMPORTANT:
"Ramesh ne 500 rupaye liye" alone does not establish
who gave the money or whether it was a loan.
Ask for clarification.

Do not confuse gifts, purchases, salaries, transfers
or ordinary money exchanges with loans.

========================================
REPAYMENT UNDERSTANDING
========================================

Identify the ACTUAL PERSON WHO PAID.

Return paid_by from current user's perspective:

- "me":
  Current user paid the money.

- "other":
  Other person paid the money.

EXAMPLES:

"Maine Ramesh ko 200 rupaye wapas kiye."
=> operation: record_repayment
=> paid_by: me
=> counterparty: Ramesh

"Ramesh ne mujhe 200 rupaye wapas kiye."
=> operation: record_repayment
=> paid_by: other
=> counterparty: Ramesh

"Maine Ramesh ka udhaar chuka diya."
=> operation: record_repayment
=> paid_by: me

"Ramesh paid me back 200 rupees."
=> operation: record_repayment
=> paid_by: other

"I repaid Ramesh 200 rupees."
=> operation: record_repayment
=> paid_by: me

"Ramesh ne apna udhaar mujhe chuka diya."
=> operation: record_repayment
=> paid_by: other

"Ramesh ko 200 rupaye de diye."
=> Ambiguous unless the context clearly establishes
   that this was repayment of an existing loan.
   Ask for clarification.

========================================
MULTILINGUAL UNDERSTANDING
========================================

Understand the meaning of statements even when users:

- Speak in Hindi, English or Hinglish.
- Mix languages in one sentence.
- Use regional language expressions.
- Use informal or grammatically incorrect sentences.
- Use different word orders.
- Use spoken, abbreviated or conversational phrases.
- Express the same meaning using completely different words.

Examples are not an exhaustive list.
Generalize from the meaning, not from memorized examples.

Do not claim certainty when the sentence is unclear.
If the model cannot reliably understand a language or
sentence, ask the user to clarify.

========================================
CRITICAL EXTRACTION RULES
========================================

1. Identify the counterparty name.
2. Identify the amount in rupees.
3. Identify the operation.
4. Identify the current user's role.
5. For new debt, identify borrowed or lent.
6. For repayment, identify who actually paid.
7. Never invent a name.
8. Never invent an amount.
9. Never guess the lender or borrower.
10. Never guess who paid.
11. If roles are unclear, ask a question.
12. If amount is missing, ask for the amount.
13. If counterparty is missing, ask who the person is.
14. If multiple people are mentioned and the correct
    counterparty is unclear, ask for clarification.
15. If the sentence describes multiple transactions,
    do not combine them into one transaction.
    Ask the user to handle them separately.
16. Do not process sales, inventory or unrelated tasks.
17. Never save, execute or confirm a transaction.
18. A ready_for_review result means only that the
    statement has been understood. It is NOT permission
    to save anything.

========================================
OUTPUT FORMAT
========================================

Return ONLY valid JSON.

Use exactly this structure:

{
  "operation": "create_debt",
  "counterparty": "Ramesh",
  "amount": 500,
  "direction": "lent",
  "paid_by": null,
  "status": "ready_for_review",
  "missing_fields": [],
  "clarification": "",
  "understanding": "Ramesh ne aapse 500 rupaye udhaar liye hain."
}

ALLOWED operation values:
- create_debt
- record_repayment
- unknown

ALLOWED direction values:
- borrowed
- lent
- null

ALLOWED paid_by values:
- me
- other
- null

ALLOWED status values:
- ready_for_review
- needs_clarification
- unsupported

For create_debt:
- direction must be borrowed or lent.
- paid_by must be null.

For record_repayment:
- paid_by must be me or other.
- direction must be null.

For unknown:
- direction and paid_by must be null.

If any essential information is missing or uncertain:
- status must be needs_clarification.
- Include missing fields.
- Ask one clear question in the user's language.

If operation is unsupported:
- status must be unsupported.

Never return Markdown or explanations outside JSON.
`;

function extractResponse(result) {
  const response =
    result?.response ??
    result?.choices?.[0]?.message?.content;

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

  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");

  if (firstBrace !== -1 && lastBrace > firstBrace) {
    cleaned = cleaned.slice(firstBrace, lastBrace + 1);
  }

  return JSON.parse(cleaned);
}

function normalizeAmount(rawAmount) {
  let amount = null;

  if (typeof rawAmount === "number") {
    amount = rawAmount;
  } else if (typeof rawAmount === "string") {
    const cleaned = rawAmount
      .replace(/,/g, "")
      .replace(/[₹\s]/g, "");

    if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
      return null;
    }

    amount = Number(cleaned);
  }

  if (
    !Number.isFinite(amount) ||
    amount <= 0 ||
    amount > 1000000000
  ) {
    return null;
  }

  return Math.round(amount * 100) / 100;
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
        content:
          "Understand this user's statement. " +
          "The speaker is the currently logged-in user.\n\n" +
          text
      }
    ],
    response_format: {
      type: "json_object"
    },
    chat_template_kwargs: {
      enable_thinking: false
    },
    max_tokens: 600,
    temperature: 0
  });

  const parsed = extractResponse(result);

  const allowedOperations = [
    "create_debt",
    "record_repayment",
    "unknown"
  ];

  const allowedDirections = [
    "borrowed",
    "lent"
  ];

  const allowedPayers = [
    "me",
    "other"
  ];

  const allowedStatuses = [
    "ready_for_review",
    "needs_clarification",
    "unsupported"
  ];

  if (
    !parsed ||
    !allowedOperations.includes(parsed.operation) ||
    !allowedStatuses.includes(parsed.status)
  ) {
    throw new Error("AI response failed validation.");
  }

  const operation = parsed.operation;

  const counterparty =
    typeof parsed.counterparty === "string" &&
    parsed.counterparty.trim()
      ? parsed.counterparty.trim().slice(0, 100)
      : null;

  const amount = normalizeAmount(parsed.amount);

  let direction = parsed.direction;
  let paidBy = parsed.paid_by;

  const clarification =
    typeof parsed.clarification === "string"
      ? parsed.clarification.slice(0, 500)
      : "";

  const understanding =
    typeof parsed.understanding === "string"
      ? parsed.understanding.slice(0, 500)
      : "";

  const missingFields = [];

  if (operation === "create_debt") {
    paidBy = null;

    if (!allowedDirections.includes(direction)) {
      direction = null;
      missingFields.push("direction");
    }

  } else if (operation === "record_repayment") {
    direction = null;

    if (!allowedPayers.includes(paidBy)) {
      paidBy = null;
      missingFields.push("paid_by");
    }

  } else {
    direction = null;
    paidBy = null;
  }

  if (
    ["create_debt", "record_repayment"].includes(operation)
  ) {
    if (!counterparty) {
      missingFields.push("counterparty");
    }

    if (!amount) {
      missingFields.push("amount");
    }
  }

  let status = parsed.status;

  if (operation === "unknown") {
    status = "unsupported";
  } else if (
    missingFields.length > 0 ||
    status === "needs_clarification"
  ) {
    status = "needs_clarification";
  }

  if (status === "unsupported") {
    direction = null;
    paidBy = null;
  }

  let message = understanding;

  if (status === "needs_clarification") {
    message =
      clarification ||
      "Mujhe aapki baat poori tarah samajh nahi aayi. Kripya thoda aur spasht batayein.";
  }

  if (status === "unsupported") {
    message =
      clarification ||
      "Main abhi sirf udhaar aur udhaar ke repayment ko samajh sakta hoon.";
  }

  if (status === "ready_for_review" && !message) {
    message = "Maine aapki baat samajh li hai.";
  }

  return {
    success: true,
    operation,
    counterparty:
      status === "unsupported" ? null : counterparty,
    amount:
      status === "unsupported" ? null : amount,
    direction,
    paid_by: paidBy,
    status,
    missing_fields: missingFields,
    clarification,
    understanding,
    message
  };
}
