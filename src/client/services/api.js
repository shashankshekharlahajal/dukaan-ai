
const API_BASE_URL = "/api";

export async function checkApiHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);

  if (!response.ok) {
    throw new Error("Unable to connect to Dukaan AI server.");
  }

  return response.json();
}

export async function understandShopkeeperCommand(text) {
  const response = await fetch(`${API_BASE_URL}/command`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text })
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.message || "Unable to understand your command."
    );
  }

  return result;
}
