
function validId(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 100
  );
}

function validAmount(amountPaise) {
  return (
    Number.isSafeInteger(amountPaise) &&
    amountPaise > 0
  );
}

// Create a repayment request for one specific connected debt.
export async function createRepayment(
  db,
  userId,
  debtId,
  amountPaise,
  idempotencyKey,
  originalCommand = null
) {
  if (!db || !validId(userId)) {
    throw new Error("Account or database unavailable.");
  }

  if (!validId(debtId)) {
    throw new Error("Invalid udhaar record.");
  }

  if (!validAmount(amountPaise)) {
    throw new Error("Valid repayment amount enter karein.");
  }

  if (
    !validId(idempotencyKey) ||
    idempotencyKey.length > 150
  ) {
    throw new Error("Valid repayment request ID required.");
  }

  const existing = await db.prepare(`
    SELECT id, debt_id, status
    FROM repayments
    WHERE idempotency_key = ?
  `).bind(idempotencyKey).first();

  if (existing) {
    if (existing.debt_id !== debtId) {
      throw new Error("Request ID already used for another debt.");
    }

    return {
      success: true,
      repaymentId: existing.id,
      status: existing.status,
      duplicate: true
    };
  }

  const repaymentId = crypto.randomUUID();

  // Only the actual payer can create the repayment request.
  // Pending and confirmed repayments reserve the available amount.
  const result = await db.prepare(`
    INSERT INTO repayments (
      id,
      debt_id,
      created_by_user_id,
      payer_user_id,
      payer_side,
      amount_paise,
      status,
      idempotency_key,
      original_command
    )
    SELECT
      ?,
      d.id,
      ?,
      ?,
      NULL,
      ?,
      'pending',
      ?,
      ?
    FROM debts d
    WHERE
      d.id = ?
      AND d.kind = 'connected'
      AND d.status = 'confirmed'
      AND ? IN (d.lender_user_id, d.borrower_user_id)
      AND (
        SELECT
          COALESCE(SUM(r.amount_paise), 0)
        FROM repayments r
        WHERE
          r.debt_id = d.id
          AND r.status IN ('pending', 'confirmed')
      ) + ? <= d.principal_paise
  `).bind(
    repaymentId,
    userId,
    userId,
    amountPaise,
    idempotencyKey,
    originalCommand,
    debtId,
    userId,
    amountPaise
  ).run();

  if (Number(result.meta?.changes || 0) !== 1) {
    throw new Error(
      "Repayment create nahi ho payi. Debt confirm nahi hai, amount available balance se zyada hai, ya aap authorized user nahi hain."
    );
  }

  return {
    success: true,
    message: "Repayment confirmation request sent.",
    repaymentId,
    debtId,
    amountPaise,
    status: "pending"
  };
}

// The other party must confirm or reject the repayment.
export async function respondToRepayment(
  db,
  repaymentId,
  userId,
  decision
) {
  if (!db || !validId(userId)) {
    throw new Error("Account or database unavailable.");
  }

  if (!validId(repaymentId)) {
    throw new Error("Invalid repayment request.");
  }

  if (!["confirmed", "rejected"].includes(decision)) {
    throw new Error("Invalid repayment decision.");
  }

  const result = await db.prepare(`
    UPDATE repayments
    SET
      status = ?,
      confirmed_by_user_id = ?,
      confirmed_at = CASE
        WHEN ? = 'confirmed' THEN CURRENT_TIMESTAMP
        ELSE NULL
      END
    WHERE
      id = ?
      AND status = 'pending'
      AND created_by_user_id != ?
      AND EXISTS (
        SELECT 1
        FROM debts d
        WHERE
          d.id = repayments.debt_id
          AND d.kind = 'connected'
          AND d.status = 'confirmed'
          AND (
            d.lender_user_id = ?
            OR d.borrower_user_id = ?
          )
          AND (
            SELECT
              COALESCE(SUM(r.amount_paise), 0)
            FROM repayments r
            WHERE
              r.debt_id = d.id
              AND r.status = 'confirmed'
              AND r.id != repayments.id
          ) + CASE
            WHEN ? = 'confirmed'
            THEN repayments.amount_paise
            ELSE 0
          END
          + (
            SELECT
              COALESCE(SUM(other.amount_paise), 0)
            FROM repayments other
            WHERE
              other.debt_id = d.id
              AND other.status = 'pending'
              AND other.id != repayments.id
          ) <= d.principal_paise
      )
  `).bind(
    decision,
    userId,
    decision,
    repaymentId,
    userId,
    userId,
    userId,
    decision
  ).run();

  if (Number(result.meta?.changes || 0) !== 1) {
    throw new Error(
      "Repayment request nahi mili, pehle respond ho chuki hai, ya aap authorized user nahi hain."
    );
  }

  return {
    success: true,
    repaymentId,
    status: decision,
    message:
      decision === "confirmed"
        ? "Repayment successfully confirmed."
        : "Repayment rejected."
  };
}

// Get repayment history for one connected debt.
export async function getRepayments(
  db,
  userId,
  debtId
) {
  if (!db || !validId(userId) || !validId(debtId)) {
    throw new Error("Invalid account or debt.");
  }

  const result = await db.prepare(`
    SELECT
      r.id,
      r.debt_id,
      r.created_by_user_id,
      r.payer_user_id,
      r.amount_paise,
      r.status,
      r.created_at,
      r.confirmed_at,
      r.confirmed_by_user_id,
      payer.email AS payer_email

    FROM repayments r

    INNER JOIN debts d
      ON d.id = r.debt_id

    INNER JOIN users payer
      ON payer.id = r.payer_user_id

    WHERE
      r.debt_id = ?
      AND d.kind = 'connected'
      AND (
        d.lender_user_id = ?
        OR d.borrower_user_id = ?
      )

    ORDER BY r.created_at DESC
  `).bind(
    debtId,
    userId,
    userId
  ).all();

  return {
    success: true,
    repayments: (result.results || []).map((item) => ({
      id: item.id,
      debtId: item.debt_id,
      payerUserId: item.payer_user_id,
      payerEmail: item.payer_email,
      amountPaise: item.amount_paise,
      status: item.status,
      createdAt: item.created_at,
      confirmedAt: item.confirmed_at,
      confirmedByUserId: item.confirmed_by_user_id
    }))
  };
}
