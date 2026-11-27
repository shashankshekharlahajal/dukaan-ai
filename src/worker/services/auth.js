
const ITERATIONS = 310000;
const SESSION_DAYS = 7;

const encoder = new TextEncoder();

function toBase64Url(bytes) {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=/g, "");
}

function fromBase64Url(value) {
  const base64 = value
    .replace(/-/g, "+")
    .replace(/_/g, "/");

  const binary = atob(
    base64 + "=".repeat((4 - base64.length % 4) % 4)
  );

  return Uint8Array.from(binary, (char) =>
    char.charCodeAt(0)
  );
}

function randomBytes(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
}

async function hashText(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value)
  );

  return toBase64Url(new Uint8Array(digest));
}

async function hashPassword(password, salt) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const derived = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt,
      iterations: ITERATIONS,
      hash: "SHA-256"
    },
    key,
    256
  );

  return toBase64Url(new Uint8Array(derived));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;

  let difference = 0;

  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return difference === 0;
}

// Securely hash a new password.
export async function createPasswordHash(password) {
  if (
    typeof password !== "string" ||
    password.length < 8 ||
    password.length > 128
  ) {
    throw new Error("Password 8 se 128 characters ka hona chahiye.");
  }

  const salt = randomBytes(16);
  const hash = await hashPassword(password, salt);

  return [
    "pbkdf2",
    "sha256",
    ITERATIONS,
    toBase64Url(salt),
    hash
  ].join("$");
}

// Verify a password during login.
export async function verifyPassword(password, storedHash) {
  if (typeof password !== "string" || typeof storedHash !== "string") {
    return false;
  }

  const parts = storedHash.split("$");

  if (
    parts.length !== 5 ||
    parts[0] !== "pbkdf2" ||
    parts[1] !== "sha256" ||
    Number(parts[2]) !== ITERATIONS
  ) {
    return false;
  }

  try {
    const salt = fromBase64Url(parts[3]);
    const expectedHash = parts[4];

    if (salt.length !== 16) return false;

    const actualHash = await hashPassword(password, salt);

    return constantTimeEqual(actualHash, expectedHash);
  } catch {
    return false;
  }
}

// Create a new registered account.
export async function registerUser(db, email, password) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  if (
    normalizedEmail.length > 254 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)
  ) {
    throw new Error("Valid email address enter karein.");
  }

  const passwordHash = await createPasswordHash(password);
  const userId = crypto.randomUUID();

  try {
    await db.prepare(`
      INSERT INTO users (id, email, password_hash)
      VALUES (?, ?, ?)
    `).bind(
      userId,
      normalizedEmail,
      passwordHash
    ).run();
  } catch {
    throw new Error("Is email se account pehle se registered hai.");
  }

  return {
    id: userId,
    email: normalizedEmail
  };
}

// Check login credentials.
export async function authenticateUser(db, email, password) {
  const normalizedEmail = String(email || "")
    .trim()
    .toLowerCase();

  const user = await db.prepare(`
    SELECT id, email, password_hash
    FROM users
    WHERE email = ?
  `).bind(normalizedEmail).first();

  if (!user) return null;

  const valid = await verifyPassword(
    password,
    user.password_hash
  );

  if (!valid) return null;

  return {
    id: user.id,
    email: user.email
  };
}

// Create a secure login session.
export async function createSession(db, userId) {
  const token = toBase64Url(randomBytes(32));
  const tokenHash = await hashText(token);
  const sessionId = crypto.randomUUID();

  const expiresAt = new Date(
    Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000
  ).toISOString();

  await db.prepare(`
    INSERT INTO sessions (
      id, user_id, token_hash, expires_at
    )
    VALUES (?, ?, ?, ?)
  `).bind(
    sessionId,
    userId,
    tokenHash,
    expiresAt
  ).run();

  return {
    token,
    expiresAt
  };
}

// Find the account belonging to a valid session.
export async function getUserFromSession(db, token) {
  if (!token || typeof token !== "string") {
    return null;
  }

  const tokenHash = await hashText(token);

  const result = await db.prepare(`
    SELECT users.id, users.email
    FROM sessions
    INNER JOIN users ON users.id = sessions.user_id
    WHERE sessions.token_hash = ?
    AND sessions.expires_at > ?
  `).bind(
    tokenHash,
    new Date().toISOString()
  ).first();

  return result || null;
}

// Delete a login session during logout.
export async function deleteSession(db, token) {
  if (!token || typeof token !== "string") {
    return;
  }

  const tokenHash = await hashText(token);

  await db.prepare(`
    DELETE FROM sessions
    WHERE token_hash = ?
  `).bind(tokenHash).run();
}
