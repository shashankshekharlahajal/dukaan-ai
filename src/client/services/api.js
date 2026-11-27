
const API_BASE_URL = "/api";

async function readApiResponse(response) {
  const rawText = await response.text();

  let result;

  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(
      `Server returned invalid JSON. HTTP ${response.status}. Response: ${rawText.slice(0, 300)}`
    );
  }

  if (!response.ok) {
    throw new Error(
      result.message ||
      result.error ||
      `Server error: HTTP ${response.status}`
    );
  }

  return result;
}

export async function checkApiHealth() {
  const response = await fetch(`${API_BASE_URL}/health`);

  return readApiResponse(response);
}

export async function understandShopkeeperCommand(text) {
  if (!text || !text.trim()) {
    throw new Error("Please enter a command.");
  }

  const response = await fetch(`${API_BASE_URL}/command`, {
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
