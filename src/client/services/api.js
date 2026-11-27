
const API_BASE_URL = "/api";

export async function checkApiHealth() {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);

    if (!response.ok) {
      throw new Error("Unable to connect to Dukaan AI server.");
    }

    return await response.json();
  } catch (error) {
    console.error("API connection error:", error);
    throw error;
  }
}
