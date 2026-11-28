
async function readApiResponse(response) {
  const rawText = await response.text();

  let result;

  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(
      `Server response invalid hai. HTTP ${response.status}`
    );
  }

  if (!response.ok || result.success === false) {
    throw new Error(
      result.message || `Server error: ${response.status}`
    );
  }

  return result;
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  return readApiResponse(response);
}

// Understand a universal udhaar command using AI.
export async function understandShopkeeperCommand(text) {
  if (!text || !text.trim()) {
    throw new Error("Please enter a command.");
  }

  return apiRequest("/api/command", {
    method: "POST",
    body: JSON.stringify({
      text: text.trim()
    })
  });
}

// Get accepted connections and connection requests.
export async function getConnections() {
  return apiRequest("/api/connections");
}

// Get all connected debts from the logged-in user's perspective.
export async function getConnectedDebts() {
  return apiRequest("/api/debts");
}

// Create a connected udhaar request.
// direction: "borrowed" or "lent"
export async function createConnectedDebt(data) {
  if (!data?.connectionId) {
    throw new Error("Connection select karein.");
  }

  if (!["borrowed", "lent"].includes(data.direction)) {
    throw new Error("Udhaar ki direction valid nahi hai.");
  }

  if (
    !Number.isSafeInteger(data.amountPaise) ||
    data.amountPaise <= 0
  ) {
    throw new Error("Valid amount enter karein.");
  }

  return apiRequest("/api/debts", {
    method: "POST",
    body: JSON.stringify({
      connectionId: data.connectionId,
      direction: data.direction,
      amountPaise: data.amountPaise,
      originalCommand: data.originalCommand || null
    })
  });
}

// Record a repayment against one specific connected debt.
// paidBy: "me" or "other"
export async function createRepayment(data) {
  if (!data?.debtId) {
    throw new Error("Specific udhaar record select karein.");
  }

  if (
    !Number.isSafeInteger(data.amountPaise) ||
    data.amountPaise <= 0
  ) {
    throw new Error("Valid repayment amount enter karein.");
  }

  if (!["me", "other"].includes(data.paidBy || "me")) {
    throw new Error("Payment karne wale ki detail valid nahi hai.");
  }

  if (!data.requestId) {
    throw new Error("Request ID missing hai.");
  }

  return apiRequest(
    `/api/debts/${encodeURIComponent(data.debtId)}/repayments`,
    {
      method: "POST",
      body: JSON.stringify({
        amountPaise: data.amountPaise,
        requestId: data.requestId,
        originalCommand: data.originalCommand || null,
        paidBy: data.paidBy || "me"
      })
    }
  );
}

// Old customer transaction function kept temporarily
// so existing Customer Khata code is not removed.
export async function confirmTransaction(data) {
  if (!data) {
    throw new Error("Transaction details are missing.");
  }

  return apiRequest("/api/transactions/confirm", {
    method: "POST",
    body: JSON.stringify({
      confirmed: true,
      customer: data.customer,
      amount: data.amount,
      intent: data.intent,
      originalCommand: data.originalCommand,
      requestId: data.requestId
    })
  });
}
