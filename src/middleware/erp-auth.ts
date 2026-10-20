import type { NextFunction, Request, Response } from "express";
import { errors, importSPKI, jwtVerify, type JWTPayload } from "jose";
import { env } from "../config/env.js";

/**
 * Authenticates browser calls from ERP_Frontend.
 *
 * ERP_Backend signs a short-lived ES256 token for the signed-in ERP user
 * (POST /api/v1/e-invoice/token). This service holds only the public key, so it
 * can check a token but never create one. The organization, seller TRNs and
 * scopes a request acts for come from the token only; an organizationId the
 * client also sent is overwritten (body) or ignored (query).
 *
 * Rollout: while EINVOICE_AUTH_REQUIRED is "false", a request with no token
 * still goes through on the ids it carries (and is logged), so screens built
 * before tokens existed keep working until the frontend is redeployed. A token
 * that is present but invalid or expired is refused either way.
 */

export const ERP_TOKEN_ISSUER = "erp-backend";
export const ERP_TOKEN_AUDIENCE = "e-invoice-service";
const ERP_TOKEN_ALGORITHM = "ES256";
// Allows for clock drift between the ERP_Backend and E-Invoice-Service hosts.
const CLOCK_TOLERANCE_SECONDS = 30;

export const EINVOICE_SCOPES = {
    READ: "einvoice:read",
    SUBMIT: "einvoice:submit",
    CONFIG: "einvoice:config",
} as const;

export type EInvoiceScope = (typeof EINVOICE_SCOPES)[keyof typeof EINVOICE_SCOPES];

export interface ErpPrincipal {
    userId: string;
    principalType: string;
    organizationId: string;
    branchId: string | null;
    sellerVatTrns: string[];
    scopes: string[];
}

declare global {
    namespace Express {
        interface Request {
            principal?: ErpPrincipal;
        }
    }
}

type VerificationKey = Awaited<ReturnType<typeof importSPKI>>;

let verificationKey: Promise<VerificationKey> | null = null;

export const isErpTokenAuthConfigured = (): boolean => env.ERP_TOKEN_PUBLIC_KEY.length > 0;

/** Parses the public key once. Called at startup so a malformed key stops the server. */
export const loadErpTokenKey = (): Promise<VerificationKey> | null => {
    if (!isErpTokenAuthConfigured()) return null;
    verificationKey ??= importSPKI(env.ERP_TOKEN_PUBLIC_KEY, ERP_TOKEN_ALGORITHM);
    return verificationKey;
};

const refuse = (res: Response, statusCode: number, code: string, message: string) =>
    res.status(statusCode).json({
        success: false,
        error: { code, message },
    });

const readBearerToken = (req: Request): string => {
    const match = /^Bearer\s+(\S+)$/i.exec(req.get("authorization")?.trim() ?? "");
    return match?.[1] ?? "";
};

/** VAT TRNs are compared as digits only, so "100 1234..." and 1001234... match. */
const normalizeVatTrn = (value: unknown): string =>
    typeof value === "string" || typeof value === "number"
        ? String(value).replace(/\D/g, "")
        : "";

const asRecord = (value: unknown): Record<string, unknown> | null =>
    typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : null;

const toPrincipal = (payload: JWTPayload): ErpPrincipal | null => {
    const organizationId = typeof payload.org === "string" ? payload.org.trim() : "";
    const userId = typeof payload.sub === "string" ? payload.sub.trim() : "";
    if (!organizationId || !userId) return null;

    return {
        userId,
        principalType: typeof payload.ptype === "string" ? payload.ptype : "",
        organizationId,
        branchId: typeof payload.branch === "string" && payload.branch ? payload.branch : null,
        sellerVatTrns: Array.isArray(payload.trns)
            ? payload.trns.map(normalizeVatTrn).filter(Boolean)
            : [],
        scopes: typeof payload.scope === "string"
            ? payload.scope.split(" ").filter(Boolean)
            : [],
    };
};

// Every spelling of the organization the services read from a request body.
const ORGANIZATION_FIELDS = ["organizationId", "OrganizationId"];

/** Points the body at the token's organization, so a service reading it cannot be moved to another tenant. */
const bindBodyToOrganization = (req: Request, organizationId: string): string[] => {
    const body = asRecord(req.body);
    if (!body) return [];

    const presentFields = ORGANIZATION_FIELDS.filter((field) => field in body);
    const sentIds = presentFields.map((field) => String(body[field] ?? ""));
    if (presentFields.length === 0) {
        body.organizationId = organizationId;
    }
    presentFields.forEach((field) => {
        body[field] = organizationId;
    });
    return sentIds;
};

const routeOf = (req: Request) => `${req.method} ${req.baseUrl}${req.path}`;

const LOG_INTERVAL_MS = 60_000;
const loggedAt = new Map<string, number>();

/** One line per route and reason per minute, so a busy screen does not flood the log. */
const warnThrottled = (key: string, payload: Record<string, unknown>) => {
    const now = Date.now();
    if (now - (loggedAt.get(key) ?? 0) < LOG_INTERVAL_MS) return;
    if (loggedAt.size > 5_000) loggedAt.clear();
    loggedAt.set(key, now);
    console.warn(JSON.stringify({ level: "warn", source: "erp-auth", ...payload }));
};

export const authenticateErpToken = async (req: Request, res: Response, next: NextFunction) => {
    const token = readBearerToken(req);

    if (!token || !isErpTokenAuthConfigured()) {
        if (env.EINVOICE_AUTH_REQUIRED) {
            return refuse(res, 401, "EINVOICE_TOKEN_MISSING", "Please sign in to the ERP again to use E-Invoice.");
        }
        warnThrottled(`legacy|${routeOf(req)}`, {
            message: token
                ? "ERP_TOKEN_PUBLIC_KEY is not set; the token was not checked."
                : "No ERP token; accepted on client-supplied ids because EINVOICE_AUTH_REQUIRED is off.",
            route: routeOf(req),
        });
        return next();
    }

    let payload: JWTPayload;
    try {
        const key = await loadErpTokenKey();
        if (!key) throw new Error("ERP token key is not configured");
        ({ payload } = await jwtVerify(token, key, {
            issuer: ERP_TOKEN_ISSUER,
            audience: ERP_TOKEN_AUDIENCE,
            algorithms: [ERP_TOKEN_ALGORITHM],
            clockTolerance: CLOCK_TOLERANCE_SECONDS,
        }));
    } catch (error) {
        if (error instanceof errors.JWTExpired) {
            return refuse(res, 401, "EINVOICE_TOKEN_EXPIRED", "The E-Invoice session has expired.");
        }
        return refuse(res, 401, "EINVOICE_TOKEN_INVALID", "The E-Invoice token is invalid.");
    }

    const principal = toPrincipal(payload);
    if (!principal) {
        return refuse(res, 401, "EINVOICE_TOKEN_INVALID", "The E-Invoice token is invalid.");
    }

    req.principal = principal;
    const sentOrganizationIds = [
        ...bindBodyToOrganization(req, principal.organizationId),
        ...[req.query.organizationId, req.query.OrganizationId].filter((value) => typeof value === "string"),
    ];
    if (sentOrganizationIds.some((sentId) => sentId && sentId !== principal.organizationId)) {
        warnThrottled(`org-mismatch|${principal.userId}|${routeOf(req)}`, {
            message: "Request named another organization; the token's organization was used.",
            route: routeOf(req),
            userId: principal.userId,
            organizationId: principal.organizationId,
        });
    }
    return next();
};

/** Every seller VAT TRN a request names, wherever the route carries it. */
const requestedVatTrns = (req: Request): string[] => {
    const body = asRecord(req.body);
    const params = asRecord(req.params);
    const candidates = [
        params?.sellerVatTrn,
        req.query.vatTrn,
        body?.sellerVatTrn,
        body?.organizationVatTrn,
        asRecord(body?.organization)?.vatTrn,
    ];
    return [...new Set(candidates.map(normalizeVatTrn).filter(Boolean))];
};

/**
 * For a request authenticated by authenticateErpToken: the token must carry the
 * scope, and every seller TRN the request names must belong to the token's
 * organization. A request that came without a token (rollout mode) was already
 * let through and logged by authenticateErpToken.
 */
export const requireEInvoiceAccess = (scope: EInvoiceScope) =>
    (req: Request, res: Response, next: NextFunction) => {
        const principal = req.principal;
        if (!principal) return next();

        if (!principal.scopes.includes(scope)) {
            return refuse(res, 403, "EINVOICE_SCOPE_DENIED", "You are not allowed to perform this E-Invoice action.");
        }

        const foreignTrns = requestedVatTrns(req).filter((trn) => !principal.sellerVatTrns.includes(trn));
        if (foreignTrns.length > 0) {
            if (env.EINVOICE_AUTH_REQUIRED) {
                return refuse(res, 403, "SELLER_TRN_NOT_ALLOWED", "This seller VAT TRN does not belong to your organization.");
            }
            warnThrottled(`trn-mismatch|${principal.organizationId}|${routeOf(req)}`, {
                message: "Seller VAT TRN is not in the token; allowed because EINVOICE_AUTH_REQUIRED is off.",
                route: routeOf(req),
                organizationId: principal.organizationId,
                requestedVatTrns: foreignTrns,
            });
        }
        return next();
    };
