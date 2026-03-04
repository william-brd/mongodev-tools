import * as client from "openid-client";
import { Strategy, type VerifyFunction } from "openid-client/passport";

import passport from "passport";
import session from "express-session";
import type { Express, RequestHandler } from "express";
import memoize from "memoizee";
import connectPg from "connect-pg-simple";
import { authStorage } from "./storage";

function getOidcSettings() {
  const issuer = process.env.OIDC_ISSUER_URL;
  const clientId = process.env.OIDC_CLIENT_ID;
  const clientSecret = process.env.OIDC_CLIENT_SECRET;

  if (!issuer || !clientId) {
    throw new Error(
      "OIDC_ISSUER_URL and OIDC_CLIENT_ID must be set for Keycloak authentication"
    );
  }

  return { issuer, clientId, clientSecret };
}

const getOidcConfig = memoize(
  async () => {
    const { issuer, clientId, clientSecret } = getOidcSettings();
    return await client.discovery(new URL(issuer), clientId, clientSecret);
  },
  { maxAge: 3600 * 1000 }
);

export function getSession() {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000; // 1 week
  const pgStore = connectPg(session);
  const sessionStore = new pgStore({
    conString: process.env.DATABASE_URL,
    createTableIfMissing: false,
    ttl: sessionTtl,
    tableName: "sessions",
  });

  if (!process.env.SESSION_SECRET) {
    throw new Error("SESSION_SECRET must be set");
  }

  return session({
    secret: process.env.SESSION_SECRET,
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: sessionTtl,
    },
  });
}

function updateUserSession(
  user: any,
  tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers
) {
  user.claims = tokens.claims();
  user.access_token = tokens.access_token;
  user.refresh_token = tokens.refresh_token;
  user.expires_at = user.claims?.exp;
}

async function upsertUser(claims: Record<string, any>) {
  await authStorage.upsertUser({
    id: claims.sub,
    email: claims.email,
    firstName: claims.given_name ?? claims.first_name ?? claims.preferred_username,
    lastName: claims.family_name ?? claims.last_name ?? "",
    profileImageUrl: claims.picture ?? claims.profile_image_url ?? null,
  });
}

export async function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  app.use(getSession());
  app.use(passport.initialize());
  app.use(passport.session());

  const config = await getOidcConfig();

  const verify: VerifyFunction = async (
    tokens: client.TokenEndpointResponse & client.TokenEndpointResponseHelpers,
    verified: passport.AuthenticateCallback
  ) => {
    const user = {};
    updateUserSession(user, tokens);
    const claims = tokens.claims();
    if (!claims) {
      return verified(new Error("OIDC claims were not returned"));
    }
    await upsertUser(claims);
    verified(null, user);
  };

  const registeredStrategies = new Set<string>();

  const ensureStrategy = (domain: string, protocol: string) => {
    const strategyName = `oidc:${domain}`;
    if (!registeredStrategies.has(strategyName)) {
      const callbackUrl =
        process.env.OIDC_CALLBACK_URL ?? `${protocol}://${domain}/api/callback`;

      const strategy = new Strategy(
        {
          name: strategyName,
          config,
          scope: "openid email profile offline_access",
          callbackURL: callbackUrl,
        },
        verify
      );
      passport.use(strategy);
      registeredStrategies.add(strategyName);
    }
  };

  passport.serializeUser((user: Express.User, cb) => cb(null, user));
  passport.deserializeUser((user: Express.User, cb) => cb(null, user));

  app.get("/api/login", (req, res, next) => {
    ensureStrategy(req.hostname, req.protocol);
    passport.authenticate(`oidc:${req.hostname}`, {
      prompt: "login",
      scope: ["openid", "email", "profile", "offline_access"],
    })(req, res, next);
  });

  app.get("/api/callback", (req, res, next) => {
    ensureStrategy(req.hostname, req.protocol);
    passport.authenticate(`oidc:${req.hostname}`, {
      successReturnToOrRedirect: "/",
      failureRedirect: "/api/login",
    })(req, res, next);
  });

  app.get("/api/logout", (req, res) => {
    req.logout(() => {
      const { clientId } = getOidcSettings();
      const postLogoutRedirect =
        process.env.OIDC_POST_LOGOUT_REDIRECT_URI ?? `${req.protocol}://${req.hostname}`;

      const logoutUrl = client.buildEndSessionUrl(config, {
        client_id: clientId,
        post_logout_redirect_uri: postLogoutRedirect,
      });
      res.redirect(logoutUrl.href);
    });
  });
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  const user = req.user as any;

  if (!req.isAuthenticated() || !user?.expires_at) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  const now = Math.floor(Date.now() / 1000);
  if (now <= user.expires_at) {
    return next();
  }

  const refreshToken = user.refresh_token;
  if (!refreshToken) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  try {
    const config = await getOidcConfig();
    const tokenResponse = await client.refreshTokenGrant(config, refreshToken);
    updateUserSession(user, tokenResponse);
    return next();
  } catch (_error) {
    return res.status(401).json({ message: "Unauthorized" });
  }
};
