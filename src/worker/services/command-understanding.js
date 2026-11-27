
function extractAmount(text) {
  const match = text.match(
    /(?:₹|rs\.?|inr)?\s*(\d+(?:,\d{3})*(?:\.\d{1,2})?)/i
  );

  if (!match) return null;

  const amount = Number(match[1].replace(/,/g, ""));

  return Number.isFinite(amount) && amount > 0
    ? amount
    : null;
}

function extractCustomer(text) {
  const patterns = [
    /([\p{L}\p{M}]+)\s+(?:ने|ne)(?=\s|$)/iu,
    /([\p{L}\p{M}]+)\s+के\s+(?:account|खाते)/iu,
    /customer\s+([\p{L}\p{M}]+)/iu
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);

    if (match) {
      return match[1];
    }
  }

  return null;
}

export function understandCommand(input) {
  const text = String(input || "").trim();

  if (!text) {
    return {
      success: false,
      status: "needs_clarification",
      message: "Please tell me what you want to do."
    };
  }

  const amount = extractAmount(text);
  const customer = extractCustomer(text);

  const creditWords =
    /udhaar|उधार|credit|borrowed|baaki|बाकी/i;

  const paymentWords =
    /payment|paid|de\s+diye|jama|जमा|chuka|चुका/i;

  const depositWords =
    /deposit|डिपाजिट|डिपॉजिट/i;

  if (depositWords.test(text)) {
    return {
      success: true,
      status: "needs_clarification",
      intent: "unknown_deposit",
      amount,
      customer,
      message:
        "Where should this deposit be recorded: a customer's account or the shop's cash/bank account?"
    };
  }

  if (paymentWords.test(text)) {
    if (!amount || !customer) {
      return {
        success: true,
        status: "needs_clarification",
        intent: "record_payment",
        amount,
        customer,
        message: !customer
          ? "Kis customer ne payment ki hai?"
          : "Payment kis amount ki hui hai?"
      };
    }

    return {
      success: true,
      status: "awaiting_confirmation",
      intent: "record_payment",
      customer,
      amount,
      message: `${customer} ki ₹${amount} payment record kar doon?`
    };
  }

  if (creditWords.test(text)) {
    if (!amount || !customer) {
      return {
        success: true,
        status: "needs_clarification",
        intent: "add_credit",
        amount,
        customer,
        message: !customer
          ? "Which customer's credit should I record?"
          : "What is the customer's name?"
      };
    }

    return {
      success: true,
      status: "awaiting_confirmation",
      intent: "add_credit",
      customer,
      amount,
      message: `${customer} ke account mein ₹${amount} ka udhaar add kar doon?`
    };
  }

  return {
    success: true,
    status: "unsupported",
    intent: null,
    amount,
    customer,
    message:
      "Abhi main is command ko samajh nahi paaya. Please dobara batayein."
  };
}
