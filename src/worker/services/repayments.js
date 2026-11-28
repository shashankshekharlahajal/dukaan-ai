
function validId(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 150
  );
}

function validAmount(amountPaise) {
  return (
    Number.isSafeInteger(amountPaise) &&
    amountPaise > 0
  );
}

// Create a repayment request for one specific connected debt.
// paidBy:
// "me"    = logged-in user paid
// "other" = the other connected user paid
export async function createRepayment(
  db,
  userId,
  debtId,
  amountPaise,
  idempotencyKey,
  originalCommand = null,
  paidBy = "me"
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

  if (!validId(idempotencyKey)) {
    throw new Error("Valid repayment request ID required.");
  }

  if (!["me", "other"].includes(paidBy)) {
    throw new Error("Payment kisne kiya, ye confirm karein.");
  }

  // Check that this user belongs to the debt.
  const debt = await db.prepare(`
    SELECT
      d.id,
      d.lender_user_id,
      d.borrower_user_id,
      d.principal_paise,
      d.status,
      d.connection_id
    FROM debts d
    INNER JOIN connections c
      ON c.id = d.connection_id
    WHERE
      d.id = ?
      AND d.kind = 'connected'
      AND d.status = 'confirmed'
      AND c.status = 'accepted'
      AND (
        (
          c.requester_user_id = d.lender_user_id
          AND c.recipient_user_id = d.borrower_user_id
        )
        OR
        (
          c.requester_user_id = d.borrower_user_id
          AND c.recipient_user_id = d.lender_user_id
        )
      )
      AND (
        d.lender_user_id = ?
        OR d.borrower_user_id = ?
      )
    LIMIT 1
  `).bind(debtId, userId, userId).first();

  if (!debt) {
    throw new Error(
      "Confirmed connected udhaar record nahi mila."
    );
  }

  const otherUserId =
    debt.lender_user_id === userId
      ? debt.borrower_user_id
      : debt.lender_user_id;

  const actualPayerUserId =
    paidBy === "me"
      ? userId
      : otherUserId;

  // Check whether this request ID was already used.
  const existing = await db.prepare(`
    SELECT
      id,
      debt_id,
      created_by_user_id,
      payer_user_id,
      amount_paise,
      status
    FROM repayments
    WHERE idempotency_key = ?
  `).bind(idempotencyKey).first();

  if (existing) {
    if (
      existing.debt_id !== debtId ||
      existing.created_by_user_id !== userId ||
      existing.payer_user_id !== actualPayerUserId ||
      existing.amount_paise !== amountPaise
    ) {
      throw new Error(
        "Request ID already used for a different repayment."
      );
    }

    return {
      success: true,
      repaymentId: existing.id,
      debtId,
      status: existing.status,
      duplicate: true
    };
  }

  const repaymentId = crypto.randomUUID();

  // Pending and confirmed repayments reserve the available amount.
  // The logged-in user reports the payment; the other party confirms it.
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
    INNER JOIN connections c
      ON c.id = d.connection_id
    WHERE
      d.id = ?
      AND d.kind = 'connected'
      AND d.status = 'confirmed'
      AND c.status = 'accepted'
      AND (
        (
          c.requester_user_id = d.lender_user_id
          AND c.recipient_user_id = d.borrower_user_id
        )
        OR
        (
          c.requester_user_id = d.borrower_user_id
          AND c.recipient_user_id = d.lender_user_id
        )
      )
      AND (
        d.lender_user_id = ?
        OR d.borrower_user_id = ?
      )
      AND ? IN (d.lender_user_id, d.borrower_user_id)
      AND (
        SELECT COALESCE(SUM(r.amount_paise), 0)
        FROM repayments r
        WHERE
          r.debt_id = d.id
          AND r.status IN ('pending', 'confirmed')
      ) + ? <= d.principal_paise
  `).bind(
    repaymentId,
    userId,
    actualPayerUserId,
    amountPaise,
    idempotencyKey,
    originalCommand,
    debtId,
    userId,
    userId,
    actualPayerUserId,
    amountPaise
  ).run();

  if (Number(result.meta?.changes || 0) !== 1) {
    throw new Error(
      "Repayment create nahi ho payi. Amount available balance se zyada ho sakta hai."
    );
  }

  return {
    success: true,
    message: "Repayment confirmation request sent.",
    repaymentId,
    debtId,
    amountPaise,
    paidBy,
    status: "pending"
  };
}

// Only the other party can confirm or reject the repayment.
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
        INNER JOIN connections c
          ON c.id = d.connection_id
        WHERE
          d.id = repayments.debt_id
          AND d.kind = 'connected'
          AND d.status = 'confirmed'
          AND c.status = 'accepted'
          AND (
            (
              c.requester_user_id = d.lender_user_id
              AND c.recipient_user_id = d.borrower_user_id
            )
            OR
            (
              c.requester_user_id = d.borrower_user_id
              AND c.recipient_user_id = d.lender_user_id
            )
          )
          AND (
            d.lender_user_id = userId
            OR d.borrower_user_id = userId
          )
          AND (
            d.lender_user_id = repayments.created_by_user_id
            OR d.borrower_user_id = repayments.created_by_user_id
          )
          AND (
            SELECT COALESCE(SUM(r.amount_paise), 0)
            FROM repayments r
            WHERE
              r.debt_id = d.id
              AND r.status = 'confirmed'
              AND r.id != repayments.id
          )
          + CASE
              WHEN ? = 'confirmed'
              THEN repayments.amount_paise
              ELSE 0
            END
          + (
            SELECT COALESCE(SUM(other.amount_paise), 0)
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
  `).bind(debtId, userId, userId).all();

  return {
    success: true,
    repayments: (result.results || []).map((item) => ({
      id: item.id,
      debtId: item.debt_id,
      createdByUserId: item.created_by_user_id,
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
