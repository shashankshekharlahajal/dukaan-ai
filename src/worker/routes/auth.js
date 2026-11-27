
import { Hono } from "hono";
import {
  registerUser,
  authenticateUser,
  createSession,
  getUserFromSession,
  deleteSession
} from "../services/auth.js";

import {
  getCookie,
  setCookie,
  deleteCookie
} from "hono/cookie";

const auth = new Hono();

const COOKIE_NAME = "dukaan_session";

const cookieOptions = {
  httpOnly: true,
  secure: true,
  sameSite: "Strict",
  path: "/",
  maxAge: 7 * 24 * 60 * 60
};

// Allow requests only from this website.
function isSameOrigin(c) {
  const origin = c.req.header("Origin");

  if (!origin) return false;

  try {
    return new URL(origin).origin === new URL(c.req.url).origin;
  } catch {
    return false;
  }
}

// Signup
auth.post("/signup", async (c) => {
  try {
    if (!isSameOrigin(c)) {
      return c.json({
        success: false,
        message: "Invalid request origin."
      }, 403);
    }

    const body = await c.req.json();

    if (
      !body ||
      typeof body.email !== "string" ||
      typeof body.password !== "string"
    ) {
      return c.json({
        success: false,
        message: "Email aur password enter karein."
      }, 400);
    }

    const user = await registerUser(
      c.env.DB,
      body.email,
      body.password
    );

    const session = await createSession(
      c.env.DB,
      user.id
    );

    setCookie(
      c,
      COOKIE_NAME,
      session.token,
      cookieOptions
    );

    return c.json({
      success: true,
      message: "Account successfully create ho gaya.",
      user
    }, 201);

  } catch (error) {
    console.error("SIGNUP ERROR:", error);

    return c.json({
      success: false,
      message: error.message || "Account create nahi ho paaya."
    }, 400);
  }
});

// Login
auth.post("/login", async (c) => {
  try {
    if (!isSameOrigin(c)) {
      return c.json({
        success: false,
        message: "Invalid request origin."
      }, 403);
    }

    const body = await c.req.json();

    if (
      !body ||
      typeof body.email !== "string" ||
      typeof body.password !== "string"
    ) {
      return c.json({
        success: false,
        message: "Email aur password enter karein."
      }, 400);
    }

    const user = await authenticateUser(
      c.env.DB,
      body.email,
      body.password
    );

    if (!user) {
      return c.json({
        success: false,
        message: "Email ya password galat hai."
      }, 401);
    }

    const session = await createSession(
      c.env.DB,
      user.id
    );

    setCookie(
      c,
      COOKIE_NAME,
      session.token,
      cookieOptions
    );

    return c.json({
      success: true,
      message: "Login successful.",
      user
    });

  } catch (error) {
    console.error("LOGIN ERROR:", error);

    return c.json({
      success: false,
      message: "Login nahi ho paaya. Dobara try karein."
    }, 500);
  }
});

// Check current login
auth.get("/me", async (c) => {
  try {
    const token = getCookie(c, COOKIE_NAME);

    const user = await getUserFromSession(
      c.env.DB,
      token
    );

    if (!user) {
      return c.json({
        success: false,
        user: null
      }, 401);
    }

    return c.json({
      success: true,
      user
    });

  } catch (error) {
    console.error("AUTH CHECK ERROR:", error);

    return c.json({
      success: false,
      message: "Login status check nahi ho paaya."
    }, 500);
  }
});

// Logout
auth.post("/logout", async (c) => {
  try {
    if (!isSameOrigin(c)) {
      return c.json({
        success: false,
        message: "Invalid request origin."
      }, 403);
    }

    const token = getCookie(c, COOKIE_NAME);

    await deleteSession(c.env.DB, token);

    deleteCookie(c, COOKIE_NAME, {
      path: "/",
      secure: true,
      httpOnly: true,
      sameSite: "Strict"
    });

    return c.json({
      success: true,
      message: "Logout successful."
    });

  } catch (error) {
    console.error("LOGOUT ERROR:", error);

    return c.json({
      success: false,
      message: "Logout nahi ho paaya."
    }, 500);
  }
});

export default auth;
