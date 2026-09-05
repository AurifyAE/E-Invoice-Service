import { z } from "zod";

const sellerVatTrnSchema = z.coerce.number().int().positive("sellerVatTrn must be a positive number");
const apiKeySchema = z.string().trim().min(1, "apiKey is required");
const companyIdSchema = z.coerce.number().int().positive("companyId must be a positive number");
const participantIdSchema = z
    .string()
    .trim()
    .regex(/^\d+:\d+$/, "participantId must use the digits:digits format");
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
}));

export const updateSellerConfigSchema = z.object({
    apiKey: apiKeySchema.optional(),
    companyId: companyIdSchema.optional(),
    participantId: participantIdSchema.optional(),
}).refine(
    (payload) => payload.apiKey !== undefined || payload.companyId !== undefined || payload.participantId !== undefined,
    {
        message: "At least one of apiKey, companyId or participantId is required",
    },
);

export const sellerVatTrnParamSchema = sellerVatTrnSchema;

export type CreateSellerConfigPayload = z.infer<typeof createSellerConfigSchema>;
export type UpdateSellerConfigPayload = z.infer<typeof updateSellerConfigSchema>;
