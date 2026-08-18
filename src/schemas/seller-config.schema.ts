import { z } from "zod";

const sellerVatTrnSchema = z.coerce.number().int().positive("sellerVatTrn must be a positive number");
const companyIdSchema = z.coerce.number().int().positive("companyId must be a positive number");
const participantIdSchema = z
    .string()
    .trim()
    .regex(/^\d+:\d+$/, "participantId must use the digits:digits format");

export const createSellerConfigSchema = z.object({
    sellerVatTrn: sellerVatTrnSchema,
    companyId: companyIdSchema,
    participantId: participantIdSchema,
});

export const updateSellerConfigSchema = z.object({
    companyId: companyIdSchema.optional(),
    participantId: participantIdSchema.optional(),
}).refine(
    (payload) => payload.companyId !== undefined || payload.participantId !== undefined,
    {
        message: "At least one of companyId or participantId is required",
    },
);

export const sellerVatTrnParamSchema = sellerVatTrnSchema;

export type CreateSellerConfigPayload = z.infer<typeof createSellerConfigSchema>;
export type UpdateSellerConfigPayload = z.infer<typeof updateSellerConfigSchema>;
