
function isValidId(value) {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= 100
  );
}

function isValidAmount(amountPaise) {
  return (
    Number.isSafeInteger(amountPaise) &&
    amountPaise > 0
  );
}

// Create a connected debt request.
export async function createConnectedDebt(
  db,
  userId,
  connectionId,
  direction,
  amountPaise,
  originalCommand = null
) {
  if (!db || !isValidId(userId)) {
    throw new Error("Account or database unavailable.");
  }

  if (!isValidId(connectionId)) {
    throw new Error("Invalid connection.");
  }

  if (!["borrowed", "lent"].includes(direction)) {
    throw new Error("Invalid udhaar direction.");
  }

  if (!isValidAmount(amountPaise)) {
    throw new Error("Valid udhaar amount enter karein.");
  }

  // Only an accepted connection can be used.
  const connection = await db.prepare(`
    SELECT
      id,
      requester_user_id,
      recipient_user_id
    FROM connections
    WHERE
      id = ?
      AND status = 'accepted'
      AND (
        requester_user_id = ?
        OR recipient_user_id = ?
      )
    LIMIT 1
  `).bind(
    connectionId,
    userId,
    userId
  ).first();

  if (!connection) {
    throw new Error(
      "Accepted connection nahi mila."
    );
  }

  const otherUserId =
    connection.requester_user_id === userId
      ? connection.recipient_user_id
      : connection.requester_user_id;

  // Decide who is lender and who is borrower.
  const lenderUserId =
    direction === "borrowed"
      ? otherUserId
      : userId;

  const borrowerUserId =
    direction === "borrowed"
      ? userId
      : otherUserId;

  const debtId = crypto.randomUUID();

  const result = await db.prepare(`
    INSERT INTO debts (
      id,
      kind,
      created_by_user_id,
      lender_user_id,
      borrower_user_id,
      connection_id,
      principal_paise,
      original_command,
      status
    )
    SELECT
      ?, 'connected', ?, ?, ?, ?, ?, ?, 'pending'
    WHERE EXISTS (
      SELECT 1
      FROM connections
      WHERE
        id = ?
        AND status = 'accepted'
        AND (
          (requester_user_id = ? AND recipient_user_id = ?)
          OR
          (requester_user_id = ? AND recipient_user_id = ?)
        )
    )
  `).bind(
    debtId,
    userId,
    lenderUserId,
    borrowerUserId,
    connectionId,
    amountPaise,
    originalCommand,
    connectionId,
    userId,
    otherUserId,
    otherUserId,
    userId
  ).run();

  if (Number(result.meta?.changes || 0) !== 1) {
    throw new Error(
      "Udhaar request create nahi ho payi."
    );
  }

  return {
    success: true,
    message: "Udhaar confirmation request sent.",
    debtId,
    direction,
    amountPaise,
    status: "pending"
  };
}

// The other connected user must confirm or reject.
export async function respondToDebt(
  db,
  debtId,
  userId,
  decision
) {
  if (!db || !isValidId(userId)) {
    throw new Error("Account or database unavailable.");
  }

  if (!isValidId(debtId)) {
    throw new Error("Invalid udhaar request.");
  }

  if (!["confirmed", "rejected"].includes(decision)) {
    throw new Error("Invalid decision.");
  }

  const result = await db.prepare(`
    UPDATE debts
    SET
      status = ?,
      confirmed_by_user_id = ?,
      confirmed_at = CASE
        WHEN ? = 'confirmed' THEN CURRENT_TIMESTAMP
        ELSE NULL
      END
    WHERE
      id = ?
      AND kind = 'connected'
      AND status = 'pending'
      AND created_by_user_id != ?
      AND (
        lender_user_id = ?
        OR borrower_user_id = ?
      )
  `).bind(
    decision,
    userId,
    decision,
    debtId,
    userId,
    userId,
    userId
  ).run();

  if (Number(result.meta?.changes || 0) !== 1) {
    throw new Error(
      "Request nahi mili, pehle respond ho chuki hai, ya aap authorized user nahi hain."
    );
  }

  return {
    success: true,
    debtId,
    status: decision,
    message:
      decision === "confirmed"
        ? "Udhaar successfully confirmed."
        : "Udhaar request rejected."
  };
}

// Get connected debts from the logged-in user's perspective.
export async function getConnectedDebts(db, userId) {
  if (!db || !isValidId(userId)) {
    throw new Error("Account or database unavailable.");
  }

  const result = await db.prepare(`
    SELECT
      d.id,
      d.connection_id,
      d.created_by_user_id,
      d.lender_user_id,
      d.borrower_user_id,
      d.principal_paise,
      d.status,
      d.original_command,
      d.created_at,
      d.confirmed_at,

      lender.email AS lender_email,
      borrower.email AS borrower_email,

      COALESCE(
        (
          SELECT SUM(r.amount_paise)
          FROM repayments r
          WHERE
            r.debt_id = d.id
            AND r.status = 'confirmed'
        ),
        0
      ) AS repaid_paise

    FROM debts d

    INNER JOIN users lender
      ON lender.id = d.lender_user_id

    INNER JOIN users borrower
      ON borrower.id = d.borrower_user_id

    WHERE
      d.kind = 'connected'
      AND (
        d.lender_user_id = ?
        OR d.borrower_user_id = ?
      )

    ORDER BY d.created_at DESC
  `).bind(userId, userId).all();

  const debts = (result.results || []).map((item) => {
    const isBorrower =
      item.borrower_user_id === userId;

    const outstandingPaise =
      Math.max(
        0,
        item.principal_paise - item.repaid_paise
      );

    return {
      id: item.id,
      connectionId: item.connection_id,
      direction: isBorrower ? "borrowed" : "lent",
      otherUser:
        isBorrower
          ? item.lender_email
          : item.borrower_email,
      lenderUserId: item.lender_user_id,
      borrowerUserId: item.borrower_user_id,
      principalPaise: item.principal_paise,
      repaidPaise: item.repaid_paise,
      outstandingPaise,
      status: item.status,
      originalCommand: item.original_command,
      createdAt: item.created_at,
      confirmedAt: item.confirmed_at
    };
  });

  return {
    success: true,
    debts
  };
}
