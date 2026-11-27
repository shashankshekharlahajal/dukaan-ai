
export async function understandShopkeeperCommand(text) {
  const response = await fetch("/api/command", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ text: text.trim() })
  });

  const rawText = await response.text();

  console.log("COMMAND HTTP STATUS:", response.status);
  console.log("COMMAND RAW RESPONSE:", rawText);

  let result;

  try {
    result = JSON.parse(rawText);
  } catch (error) {
    throw new Error(
      `Response JSON error: ${error.message}. Raw response: ${rawText.slice(0, 500)}`
    );
  }

  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Command API failed.");
  }

  return result;
}
