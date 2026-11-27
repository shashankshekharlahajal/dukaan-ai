
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

// Understand shopkeeper's command using AI.
export async function understandShopkeeperCommand(text) {
  if (!text || !text.trim()) {
    throw new Error("Please enter a command.");
  }

  const response = await fetch("/api/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      text: text.trim()
    })
  });

  return readApiResponse(response);
}

// Save transaction after shopkeeper confirmation.
export async function confirmTransaction(data) {
  if (!data) {
    throw new Error("Transaction details are missing.");
  }

  const response = await fetch(
    "/api/transactions/confirm",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        confirmed: true,
        customer: data.customer,
        amount: data.amount,
        intent: data.intent,
        originalCommand: data.originalCommand,
        requestId: data.requestId
      })
    }
  );

  return readApiResponse(response);
}
