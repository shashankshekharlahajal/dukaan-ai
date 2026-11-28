
function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

// Send a connection request using the other user's registered email.
export async function createConnectionRequest(
  db,
  requesterUserId,
  recipientEmail
) {
  if (!db || !requesterUserId) {
    throw new Error("Account or database unavailable.");
  }

  const email = normalizeEmail(recipientEmail);

  if (
    !email ||
    email.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  ) {
    throw new Error("Valid email address enter karein.");
  }

  const recipient = await db.prepare(`
    SELECT id, email
    FROM users
    WHERE email = ?
  `).bind(email).first();

  if (!recipient) {
    throw new Error("Is email se koi Dukaan AI account nahi mila.");
  }

  if (recipient.id === requesterUserId) {
    throw new Error("Aap apne aap se connect nahi ho sakte.");
  }

  // Check both directions for an existing pending or accepted request.
  const existing = await db.prepare(`
    SELECT id, status
    FROM connections
    WHERE (
      (
        requester_user_id = ?
        AND recipient_user_id = ?
      )
      OR (
        requester_user_id = ?
        AND recipient_user_id = ?
      )
    )
    AND status IN ('pending', 'accepted')
    LIMIT 1
  `).bind(
    requesterUserId,
    recipient.id,
    recipient.id,
    requesterUserId
  ).first();

  if (existing) {
    if (existing.status === "accepted") {
      throw new Error("Aap dono pehle se connected hain.");
    }

    throw new Error(
      "Aap dono ke beech connection request pehle se pending hai."
    );
  }

  const connectionId = crypto.randomUUID();

  try {
    await db.prepare(`
      INSERT INTO connections (
        id,
        requester_user_id,
        recipient_user_id,
        status
      )
      VALUES (?, ?, ?, 'pending')
    `).bind(
      connectionId,
      requesterUserId,
      recipient.id
    ).run();
  } catch (error) {
    const message = String(error?.message || "").toLowerCase();

    if (
      message.includes("unique") ||
      message.includes("constraint")
    ) {
      throw new Error(
        "Connection request pehle se pending hai."
      );
    }

    throw error;
  }

  return {
    success: true,
    message: "Connection request successfully sent.",
    connectionId,
    recipient: recipient.email,
    status: "pending"
  };
}

// Get incoming and outgoing connection requests.
export async function getConnections(db, userId) {
  if (!db || !userId) {
    throw new Error("Account or database unavailable.");
  }

  const result = await db.prepare(`
    SELECT
      connections.id,
      connections.requester_user_id,
      connections.recipient_user_id,
      connections.status,
      connections.created_at,
      connections.responded_at,
      requester.email AS requester_email,
      recipient.email AS recipient_email
    FROM connections
    INNER JOIN users AS requester
      ON requester.id = connections.requester_user_id
    INNER JOIN users AS recipient
      ON recipient.id = connections.recipient_user_id
    WHERE
      connections.requester_user_id = ?
      OR connections.recipient_user_id = ?
    ORDER BY connections.created_at DESC
  `).bind(userId, userId).all();

  return {
    success: true,
    connections: (result.results || []).map((item) => ({
      id: item.id,
      status: item.status,
      direction:
        item.requester_user_id === userId
          ? "outgoing"
          : "incoming",
      otherUser:
        item.requester_user_id === userId
          ? item.recipient_email
          : item.requester_email,
      createdAt: item.created_at,
      respondedAt: item.responded_at
    }))
  };
}

// Only the recipient can accept or reject a pending request.
export async function respondToConnectionRequest(
  db,
  connectionId,
  userId,
  decision
) {
  if (!db || !userId) {
    throw new Error("Account or database unavailable.");
  }

  if (!["accepted", "rejected"].includes(decision)) {
    throw new Error("Invalid connection decision.");
  }

  if (
    typeof connectionId !== "string" ||
    !connectionId.trim() ||
    connectionId.length > 100
  ) {
    throw new Error("Invalid connection request.");
  }

  const result = await db.prepare(`
    UPDATE connections
    SET
      status = ?,
      responded_at = CURRENT_TIMESTAMP
    WHERE
      id = ?
      AND recipient_user_id = ?
      AND status = 'pending'
  `).bind(
    decision,
    connectionId,
    userId
  ).run();

  if (Number(result.meta?.changes || 0) !== 1) {
    throw new Error(
      "Request nahi mili, pehle hi respond ho chuki hai, ya aap recipient nahi hain."
    );
  }

  return {
    success: true,
    message:
      decision === "accepted"
        ? "Connection request accepted."
        : "Connection request rejected.",
    connectionId,
    status: decision
  };
}
