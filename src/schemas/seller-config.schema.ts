import { z } from "zod";

const sellerVatTrnSchema = z.coerce.number().int().positive("sellerVatTrn must be a positive number");
const apiKeySchema = z.string().trim().min(1, "apiKey is required");
const companyIdSchema = z.coerce.number().int().positive("companyId must be a positive number");
const participantIdSchema = z
    .string()
    .trim()
    .regex(/^\d+:\d+$/, "participantId must use the digits:digits format");
const sellerLegalRegistrationIdSchema = z
    .string()
    .trim()
    .min(1, "sellerLegalRegistrationId is required");
export const SELLER_LEGAL_REGISTRATION_TYPES = ["TL", "EID", "PAS", "CD"] as const;
const sellerLegalRegistrationTypeSchema = z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(SELLER_LEGAL_REGISTRATION_TYPES, {
        message: `sellerLegalRegistrationType must be one of ${SELLER_LEGAL_REGISTRATION_TYPES.join(", ")}`,
    }));
const sellerLegalRegistrationAuthoritySchema = z
    .string()
    .trim()
    .min(1, "sellerLegalRegistrationAuthority is required");
export const CREDIT_ACCOUNT_SCHEMES = ["IBAN"] as const;
const creditAccountSchemeSchema = z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.enum(CREDIT_ACCOUNT_SCHEMES, {
        message: `creditAccountScheme must be one of ${CREDIT_ACCOUNT_SCHEMES.join(", ")}`,
    }));
const creditAccountIbanSchema = z
    .string()
    .trim()
    .toUpperCase()
    .pipe(z.string().regex(/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/, "creditAccountIban must be a valid IBAN"));
export const organizationIdSchema = z.string().trim().min(1, "organizationId is required");

const normalizeOrganizationId = (payload: unknown) => {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return payload;
    }

    const sellerConfig = payload as Record<string, unknown>;

    return {
        ...sellerConfig,
        organizationId: sellerConfig.organizationId ?? sellerConfig.OrganizationId,
    };
};

export const createSellerConfigSchema = z.preprocess(normalizeOrganizationId, z.object({
    organizationId: organizationIdSchema,
    sellerVatTrn: sellerVatTrnSchema,
    apiKey: apiKeySchema,
    companyId: companyIdSchema,
    participantId: participantIdSchema,
    sellerLegalRegistrationId: sellerLegalRegistrationIdSchema,
    sellerLegalRegistrationType: sellerLegalRegistrationTypeSchema,
    sellerLegalRegistrationAuthority: sellerLegalRegistrationAuthoritySchema,
    creditAccountScheme: creditAccountSchemeSchema,
    creditAccountIban: creditAccountIbanSchema,
}));

export const updateSellerConfigSchema = z.object({
    apiKey: apiKeySchema.optional(),
    companyId: companyIdSchema.optional(),
    participantId: participantIdSchema.optional(),
    sellerLegalRegistrationId: sellerLegalRegistrationIdSchema.optional(),
    sellerLegalRegistrationType: sellerLegalRegistrationTypeSchema.optional(),
    sellerLegalRegistrationAuthority: sellerLegalRegistrationAuthoritySchema.optional(),
    creditAccountScheme: creditAccountSchemeSchema.optional(),
    creditAccountIban: creditAccountIbanSchema.optional(),
}).refine(
    (payload) => Object.values(payload).some((value) => value !== undefined),
    {
        message: "At least one seller configuration field is required",
    },
);

export const sellerVatTrnParamSchema = sellerVatTrnSchema;

export type CreateSellerConfigPayload = z.infer<typeof createSellerConfigSchema>;
export type UpdateSellerConfigPayload = z.infer<typeof updateSellerConfigSchema>;
