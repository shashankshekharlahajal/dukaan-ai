
export async function recordTransaction(db, data) {
  const {
    customer,
    amount,
    intent,
    originalCommand,
    requestId,
    ownerId
  } = data;

  if (!db) {
    throw new Error("Database connection is unavailable.");
  }

  if (
    typeof ownerId !== "string" ||
    !ownerId.trim()
  ) {
    throw new Error("Authenticated account is required.");
  }

  const name = String(customer || "").trim();
  const value = Number(amount);

  if (!name || name.length > 100) {
    throw new Error("Please provide a valid customer name.");
  }

  if (
    !Number.isFinite(value) ||
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

  if (!Number.isSafeInteger(amountPaise) || amountPaise <= 0) {
    throw new Error("Please provide a valid amount.");
  }

  const balanceChange =
    intent === "add_credit"
      ? amountPaise
      : -amountPaise;

  const statements = [
    // Create a customer only when adding new credit.
    db.prepare(`
      INSERT OR IGNORE INTO customers (
        name,
        owner_id
      )
      SELECT ?, ?
      WHERE ? = 'add_credit'
    `).bind(
      name,
      ownerId,
      intent
    ),

    // Insert the transaction only for this account's customer.
    // A repayment is accepted only when sufficient balance exists.
    db.prepare(`
      INSERT INTO transactions (
        customer_id,
        type,
        amount_paise,
        original_command,
        idempotency_key,
        owner_id
      )
      SELECT
        id,
        ?,
        ?,
        ?,
        ?,
        ?
      FROM customers
      WHERE owner_id = ?
      AND name = ? COLLATE NOCASE
      AND (
        ? = 'add_credit'
        OR balance_paise >= ?
      )
      LIMIT 1
    `).bind(
      intent,
      amountPaise,
      String(originalCommand || "").slice(0, 1000),
      requestId,
      ownerId,
      ownerId,
      name,
      intent,
      amountPaise
    ),

    // Update only the customer linked to this transaction.
    db.prepare(`
      UPDATE customers
      SET balance_paise = balance_paise + ?
      WHERE owner_id = ?
      AND id = (
        SELECT customer_id
        FROM transactions
        WHERE idempotency_key = ?
        AND owner_id = ?
      )
    `).bind(
      balanceChange,
      ownerId,
      requestId,
      ownerId
    )
  ];

  let results;

  try {
    results = await db.batch(statements);
  } catch (error) {
    const errorMessage =
      String(error?.message || "").toLowerCase();

    if (
      errorMessage.includes("unique") ||
      errorMessage.includes("constraint")
    ) {
      throw new Error(
        "This transaction has already been recorded."
      );
    }

    throw error;
  }

  const transactionSaved =
    Number(results[1]?.meta?.changes || 0);

  const balanceUpdated =
    Number(results[2]?.meta?.changes || 0);

  if (!transactionSaved || !balanceUpdated) {
    if (intent === "record_payment") {
      throw new Error(
        "Customer ka outstanding balance is payment ke liye kam hai."
      );
    }

    throw new Error(
      "Transaction could not be recorded."
    );
  }

  const savedCustomer = await db.prepare(`
    SELECT
      id,
      name,
      balance_paise
    FROM customers
    WHERE owner_id = ?
    AND name = ? COLLATE NOCASE
  `).bind(
    ownerId,
    name
  ).first();

  if (!savedCustomer) {
    throw new Error("Customer could not be found.");
  }

  return {
    success: true,
    customer: savedCustomer.name,
    customerId: savedCustomer.id,
    balance: savedCustomer.balance_paise / 100,
    transactionType: intent,
    amount: amountPaise / 100
  };
}
