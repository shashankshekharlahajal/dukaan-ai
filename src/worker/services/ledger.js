
export async function getCustomers(db, ownerId) {
  if (!db || !ownerId) {
    throw new Error("Database or account is unavailable.");
  }

  const result = await db.prepare(`
    SELECT
      id,
      name,
      balance_paise,
      created_at
    FROM customers
    WHERE owner_id = ?
    ORDER BY name COLLATE NOCASE ASC
  `).bind(ownerId).all();

  return {
    success: true,
    customers: (result.results || []).map((customer) => ({
      id: customer.id,
      name: customer.name,
      balance: customer.balance_paise / 100,
      createdAt: customer.created_at
    }))
  };
}

export async function getCustomerLedger(db, customerId, ownerId) {
  if (!db || !ownerId) {
    throw new Error("Database or account is unavailable.");
  }

  const id = Number(customerId);

  if (!Number.isSafeInteger(id) || id <= 0) {
    throw new Error("Invalid customer ID.");
  }

  // Customer must belong to the logged-in account.
  const customer = await db.prepare(`
    SELECT
      id,
      name,
      balance_paise,
      created_at
    FROM customers
    WHERE id = ?
    AND owner_id = ?
  `).bind(id, ownerId).first();

  if (!customer) {
    return null;
  }

  const result = await db.prepare(`
    SELECT
      id,
      type,
      amount_paise,
      original_command,
      created_at
    FROM transactions
    WHERE customer_id = ?
    AND owner_id = ?
    ORDER BY id DESC
    LIMIT 100
  `).bind(id, ownerId).all();

  return {
    success: true,
    customer: {
      id: customer.id,
      name: customer.name,
      balance: customer.balance_paise / 100,
      createdAt: customer.created_at
    },
    transactions: (result.results || []).map((transaction) => ({
      id: transaction.id,
      type: transaction.type,
      amount: transaction.amount_paise / 100,
      originalCommand: transaction.original_command,
      createdAt: transaction.created_at
    }))
  };
}
