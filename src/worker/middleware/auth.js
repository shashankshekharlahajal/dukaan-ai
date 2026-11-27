
import { getCookie } from "hono/cookie";
import { getUserFromSession } from "../services/auth.js";

export async function requireAuth(c, next) {
  try {
    const token = getCookie(c, "dukaan_session");

    if (!token || !c.env?.DB) {
      return c.json({
        success: false,
        message: "Login required. Please login first."
      }, 401);
    }

    const user = await getUserFromSession(
      c.env.DB,
      token
    );

    if (!user) {
      return c.json({
        success: false,
        message: "Session expired. Please login again."
      }, 401);
    }

    // Verified identity comes from the database,
    // never from a user-supplied request field.
    c.set("user", user);

    await next();
  } catch (error) {
    console.error("AUTH MIDDLEWARE ERROR:", error);

    return c.json({
      success: false,
      message: "Authentication check failed."
    }, 500);
  }
}
