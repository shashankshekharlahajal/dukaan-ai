
export async function recordTransaction(db, data) {
  const {
    customer,
    amount,
    intent,
    originalCommand,
    requestId
  } = data;

  if (!db) {
    throw new Error("Database connection is unavailable.");
  }

  const name = String(customer || "").trim();
  const value = Number(amount);

  if (!name || name.length > 100) {
    throw new Error("Please provide a valid customer name.");
  }

  if (
    !Number.isSafeInteger(value) ||
    value <= 0 ||
    value > 10000000
  ) {
    throw new Error("Please provide a valid amount.");
  }

  if (!["add_credit", "record_payment"].includes(intent)) {
    throw new Error("Unsupported transaction type.");
  }

  if (
    typeof requestId !== "string" ||
    requestId.length < 10 ||
    requestId.length > 100
  ) {
    throw new Error("Invalid transaction request.");
  }

  const amountPaise = Math.round(value * 100);

  const balanceChange =
    intent === "add_credit"
      ? amountPaise
      : -amountPaise;

  const statements = [
    db.prepare(`
      INSERT OR IGNORE INTO customers (name)
      VALUES (?)
    `).bind(name),

    db.prepare(`
      UPDATE customers
      SET balance_paise = balance_paise + ?
      WHERE name = ? COLLATE NOCASE
      AND (
        ? = 'add_credit'
        OR balance_paise >= ?
      )
    `).bind(
      balanceChange,
      name,
      intent,
      amountPaise
    ),

    db.prepare(`
      INSERT INTO transactions (
        customer_id,
        type,
        amount_paise,
        original_command,
        idempotency_key
      )
      SELECT
        id,
        ?,
        ?,
        ?,
        ?
      FROM customers
      WHERE name = ? COLLATE NOCASE
      AND changes() > 0
    `).bind(
      intent,
      amountPaise,
      String(originalCommand || "").slice(0, 1000),
      requestId,
      name
    )
  ];

  let results;

  try {
    results = await db.batch(statements);
  } catch (error) {
    if (
      error.message?.toLowerCase().includes("unique")
    ) {
      throw new Error("This transaction has already been recorded.");
    }

    throw error;
  }

  const balanceUpdated =
    Number(results[1]?.meta?.changes || 0);

  const transactionSaved =
    Number(results[2]?.meta?.changes || 0);

  if (!balanceUpdated || !transactionSaved) {
    if (intent === "record_payment") {
      throw new Error(
        "Customer ka outstanding balance is payment ke liye kam hai."
      );
    }

    throw new Error("Transaction could not be recorded.");
  }

  const savedCustomer = await db.prepare(`
    SELECT
      id,
      name,
      balance_paise
    FROM customers
    WHERE name = ? COLLATE NOCASE
  `).bind(name).first();

  return {
    success: true,
    customer: savedCustomer.name,
    customerId: savedCustomer.id,
    balance: savedCustomer.balance_paise / 100,
    transactionType: intent,
    amount: value
  };
}
