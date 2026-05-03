import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { generateToken, storeToken, hashPassword } from "../lib/auth";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/requireAuth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID ?? "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET ?? "";
const REDIRECT_URI = process.env.GOOGLE_REDIRECT_URI ?? "http://localhost:80/api/auth/google/callback";

const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
].join(" ");

// Step 1: Redirect user to Google's OAuth consent screen
router.get("/auth/google", (req, res): void => {
  if (!GOOGLE_CLIENT_ID) {
    res.status(503).json({ error: "Google OAuth not configured. Set GOOGLE_CLIENT_ID." });
    return;
  }

  // Pass existing token in state so we can link to existing account on callback
  const existingToken = (req.query.token as string) ?? "";

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: existingToken,
  });

  res.redirect(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
});

// Step 2: Handle OAuth callback, exchange code for tokens
router.get("/auth/google/callback", async (req, res): Promise<void> => {
  const { code, state, error } = req.query as Record<string, string>;

  if (error || !code) {
    res.redirect(`/?error=${encodeURIComponent(error ?? "oauth_cancelled")}`);
    return;
  }

  try {
    // Exchange authorization code for access/refresh tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: "authorization_code",
        code,
      }).toString(),
    });

    if (!tokenRes.ok) {
      throw new Error(`Token exchange failed: ${await tokenRes.text()}`);
    }

    const tokenData = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      id_token?: string;
    };

    // Fetch Google user info
    const userInfoRes = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) throw new Error("Failed to fetch Google user info");

    const googleUser = await userInfoRes.json() as {
      sub: string;
      email: string;
      name: string;
      picture?: string;
    };

    let userId: number;

    // If a logged-in token was passed in state, link to that account
    if (state) {
      const { getUserIdFromToken } = await import("../lib/auth");
      const existingUserId = getUserIdFromToken(state);
      if (existingUserId) {
        await db.update(usersTable).set({
          googleId: googleUser.sub,
          googleAccessToken: tokenData.access_token,
          googleRefreshToken: tokenData.refresh_token ?? null,
        }).where(eq(usersTable.id, existingUserId));
        userId = existingUserId;
        const appToken = generateToken();
        storeToken(appToken, userId);
        res.redirect(`/?google_linked=true&token=${appToken}`);
        return;
      }
    }

    // Try to find existing user by Google ID or email
    let [user] = await db.select().from(usersTable).where(eq(usersTable.googleId, googleUser.sub)).limit(1);

    if (!user) {
      [user] = await db.select().from(usersTable).where(eq(usersTable.email, googleUser.email)).limit(1);
    }

    if (user) {
      // Update tokens for existing user
      await db.update(usersTable).set({
        googleId: googleUser.sub,
        googleAccessToken: tokenData.access_token,
        googleRefreshToken: tokenData.refresh_token ?? null,
      }).where(eq(usersTable.id, user.id));
      userId = user.id;
    } else {
      // Create new user from Google account
      const [newUser] = await db.insert(usersTable).values({
        email: googleUser.email,
        name: googleUser.name,
        passwordHash: hashPassword(crypto.randomUUID()),
        googleId: googleUser.sub,
        googleAccessToken: tokenData.access_token,
        googleRefreshToken: tokenData.refresh_token ?? null,
      }).returning();
      userId = newUser.id;
    }

    const appToken = generateToken();
    storeToken(appToken, userId);

    // Redirect to frontend with token
    res.redirect(`/?token=${appToken}&google_login=true`);
  } catch (err) {
    logger.error(err, "Google OAuth callback error");
    res.redirect(`/?error=google_auth_failed`);
  }
});

// Disconnect Google from account
router.delete("/auth/google", requireAuth, async (req: AuthenticatedRequest, res): Promise<void> => {
  await db.update(usersTable).set({
    googleId: null,
    googleAccessToken: null,
    googleRefreshToken: null,
    gmailLastSyncAt: null,
  }).where(eq(usersTable.id, req.userId!));

  res.json({ message: "Google account disconnected" });
});

export default router;
