import * as oidcClient from "openid-client";
import session from "express-session";
import MemoryStore from "memorystore";
import type { Express, RequestHandler, Request } from "express";

declare module "express-session" {
  interface SessionData {
    user?: SessionUser;
    codeVerifier?: string;
    nonce?: string;
    state?: string;
  }
}

export type SessionUser = {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: "admin" | "readonly";
  profileImageUrl: string | null;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
};

export function isKeycloakConfigured() {
  return !!(
    process.env.KEYCLOAK_URL &&
    process.env.KEYCLOAK_REALM &&
    process.env.KEYCLOAK_CLIENT_ID
  );
}

let _oidcConfig: oidcClient.Configuration | null = null;
let _configLoadedAt = 0;

function isHttpKeycloak() {
  return process.env.KEYCLOAK_URL?.startsWith("http://") ?? false;
}

function httpExecute() {
  return isHttpKeycloak() ? { execute: [oidcClient.allowInsecureRequests] } : undefined;
}

async function getOidcConfig(): Promise<oidcClient.Configuration> {
  const now = Date.now();
  if (_oidcConfig && now - _configLoadedAt < 3600_000) return _oidcConfig;

  const issuerUrl = new URL(
    `${process.env.KEYCLOAK_URL}/realms/${process.env.KEYCLOAK_REALM}`
  );
  _oidcConfig = await oidcClient.discovery(
    issuerUrl,
    process.env.KEYCLOAK_CLIENT_ID!,
    process.env.KEYCLOAK_CLIENT_SECRET,
    undefined,
    httpExecute()
  );
  _configLoadedAt = now;
  return _oidcConfig;
}

const MStore = MemoryStore(session);

export function setupSession(app: Express) {
  const sessionTtl = 7 * 24 * 60 * 60 * 1000;
  app.use(
    session({
      secret: process.env.SESSION_SECRET || "mongodev-change-me",
      store: new MStore({ checkPeriod: 86400000 }),
      resave: false,
      saveUninitialized: false,
      cookie: { httpOnly: true, maxAge: sessionTtl },
    })
  );
}

function getAppBaseUrl(req: Request): string {
  return (
    process.env.APP_URL || `${req.protocol}://${req.headers.host || req.hostname}`
  );
}

function extractRoleFromClaims(claims: Record<string, unknown>): "admin" | "readonly" {
  const adminRole = process.env.ADMIN_ROLE || "mongodev-admin";
  const realmRoles =
    (claims["realm_access"] as { roles?: string[] } | undefined)?.roles ?? [];
  const resourceRoles = Object.values(
    (claims["resource_access"] as Record<string, { roles?: string[] }>) ?? {}
  ).flatMap((r) => r.roles ?? []);

  const allRoles = [...realmRoles, ...resourceRoles];
  return allRoles.includes(adminRole) ? "admin" : "readonly";
}

export function setupAuthRoutes(app: Express) {
  if (!isKeycloakConfigured()) {
    app.get("/api/auth/user", (_req, res) => {
      res.json({
        id: "dev-admin",
        email: "dev@localhost",
        firstName: "Dev",
        lastName: "Admin",
        role: "admin",
        profileImageUrl: null,
      } satisfies SessionUser);
    });
    app.get("/api/login", (_req, res) => res.redirect("/"));
    app.get("/api/logout", (_req, res) => res.redirect("/"));
    return;
  }

  app.get("/api/login", async (req, res) => {
    try {
      const config = await getOidcConfig();
      const codeVerifier = oidcClient.randomPKCECodeVerifier();
      const codeChallenge = await oidcClient.calculatePKCECodeChallenge(codeVerifier);
      const nonce = oidcClient.randomNonce();
      const state = oidcClient.randomState();

      req.session.codeVerifier = codeVerifier;
      req.session.nonce = nonce;
      req.session.state = state;

      const redirectUri = `${getAppBaseUrl(req)}/api/callback`;
      const url = oidcClient.buildAuthorizationUrl(config, {
        redirect_uri: redirectUri,
        scope: "openid email profile",
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
        nonce,
        state,
      });
      res.redirect(url.href);
    } catch (err) {
      console.error("[auth] login error:", err);
      res.status(500).json({ message: "Authentication service unavailable" });
    }
  });

  app.get("/api/callback", async (req, res) => {
    try {
      const config = await getOidcConfig();
      const { codeVerifier, nonce, state } = req.session;
      const redirectUri = `${getAppBaseUrl(req)}/api/callback`;

      const currentUrl = new URL(
        req.url,
        getAppBaseUrl(req)
      );

      const tokens = await oidcClient.authorizationCodeGrant(
        config,
        currentUrl,
        {
          pkceCodeVerifier: codeVerifier,
          expectedNonce: nonce,
          expectedState: state,
        },
        undefined,
        httpExecute()
      );

      const idClaims = tokens.claims() as Record<string, unknown>;

      // ID token não inclui resource_access por padrão no Keycloak.
      // Decodificamos o access token (já validado pelo OIDC flow) para obter as roles.
      let accessClaims: Record<string, unknown> = {};
      if (tokens.access_token) {
        try {
          const payload = tokens.access_token.split(".")[1];
          accessClaims = JSON.parse(Buffer.from(payload, "base64url").toString());
        } catch { /* ignora se não for JWT */ }
      }

      const claims = { ...idClaims, ...accessClaims };

      req.session.user = {
        id: String(claims["sub"]),
        email: String(claims["email"] ?? ""),
        firstName: String(claims["given_name"] ?? ""),
        lastName: String(claims["family_name"] ?? ""),
        role: extractRoleFromClaims(claims),
        profileImageUrl: (claims["picture"] as string) ?? null,
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt: claims["exp"] as number | undefined,
      };

      delete req.session.codeVerifier;
      delete req.session.nonce;
      delete req.session.state;

      res.redirect("/");
    } catch (err) {
      console.error("[auth] callback error:", err);
      res.redirect("/api/login");
    }
  });

  app.get("/api/logout", async (req, res) => {
    try {
      const config = await getOidcConfig();
      const postLogout = getAppBaseUrl(req);
      req.session.destroy(() => {});
      const endUrl = oidcClient.buildEndSessionUrl(config, {
        client_id: process.env.KEYCLOAK_CLIENT_ID!,
        post_logout_redirect_uri: postLogout,
      });
      res.redirect(endUrl.href);
    } catch {
      req.session.destroy(() => {});
      res.redirect("/");
    }
  });

  app.get("/api/auth/user", (req, res) => {
    if (!req.session.user) return res.status(401).json({ message: "Unauthorized" });
    res.json(req.session.user);
  });
}

export const requireAuth: RequestHandler = (req, res, next) => {
  if (!isKeycloakConfigured()) return next();
  if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });
  next();
};

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!isKeycloakConfigured()) return next();
  if (!req.session?.user) return res.status(401).json({ message: "Unauthorized" });
  if (req.session.user.role !== "admin")
    return res.status(403).json({ message: "Forbidden: admin role required" });
  next();
};

export function currentUser(req: Request): SessionUser {
  if (!isKeycloakConfigured()) {
    return {
      id: "dev-admin",
      email: "dev@localhost",
      firstName: "Dev",
      lastName: "Admin",
      role: "admin",
      profileImageUrl: null,
    };
  }
  return req.session?.user!;
}
