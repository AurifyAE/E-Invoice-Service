import { z } from "zod";

const decimalValue = z.union([
    z.number().finite(),
    z.string().regex(/^\d+(?:\.\d+)?$/, "Must be a non-negative decimal"),
]).transform((value) => String(value));

const positiveDecimal = decimalValue.refine((value) => Number(value) > 0, "Must be greater than zero");
const nonNegativeDecimal = decimalValue.refine((value) => Number(value) >= 0, "Must be non-negative");

const vatCategorySchema = z.string().trim().min(1).max(3);

const sellerSchema = z.object({
    registrationId: z.string().trim().min(1),
    name: z.string().trim().min(1),
    vatNumber: z.string().trim().min(1),
    streetName: z.string().trim().min(1),
    buildingNumber: z.string().trim().min(1),
    district: z.string().trim().min(1),
    city: z.string().trim().min(1),
    postalCode: z.string().trim().min(1),
    countryCode: z.literal("SA"),
}).strict();

const buyerSchema = z.object({
    name: z.string().trim().optional(),
}).strict();

const allowanceSchema = z.object({
    chargeIndicator: z.boolean(),
    reason: z.string().trim().min(1),
    amount: nonNegativeDecimal,
    vatCategory: vatCategorySchema,
    vatPercent: nonNegativeDecimal,
}).strict();

const taxSubtotalSchema = z.object({
    taxableAmount: nonNegativeDecimal,
    taxAmount: nonNegativeDecimal,
    vatCategory: vatCategorySchema,
    vatPercent: nonNegativeDecimal,
}).strict();

const taxSchema = z.object({
    taxAmount: nonNegativeDecimal,
    subtotals: z.array(taxSubtotalSchema).min(1),
}).strict();

const totalsSchema = z.object({
    lineExtensionAmount: nonNegativeDecimal,
    taxExclusiveAmount: nonNegativeDecimal,
    taxInclusiveAmount: nonNegativeDecimal,
    allowanceTotalAmount: nonNegativeDecimal,
    prepaidAmount: nonNegativeDecimal,
    payableAmount: nonNegativeDecimal,
}).strict();

const itemSchema = z.object({
    lineNumber: z.coerce.number().int().positive(),
    itemName: z.string().trim().min(1),
    quantity: positiveDecimal,
    unitCode: z.string().trim().min(1),
    lineExtensionAmount: nonNegativeDecimal,
    taxAmount: nonNegativeDecimal,
    roundingAmount: nonNegativeDecimal,
    vatCategory: vatCategorySchema,
    vatPercent: nonNegativeDecimal,
    unitPrice: nonNegativeDecimal,
}).strict();

export const zatcaSaleInvoiceSchema = z.object({
    sourceType: z.literal("SALE"),
    sourceId: z.string().trim().min(1),
    documentId: z.string().trim().min(1),
    // Kept optional for backwards compatibility with existing simplified-sale
    // callers. A missing value is a normal sale invoice.
    transactionType: z.enum(["SALE", "CREDIT_NOTE"]).default("SALE"),
    partyBusinessType: z.enum(["B2C", "B2B"]),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "issueDate must be YYYY-MM-DD"),
    issueTime: z.string().regex(/^\d{2}:\d{2}:\d{2}$/, "issueTime must be HH:mm:ss"),
    originalInvoiceDocumentId: z.string().trim().min(1).optional(),
    actualDeliveryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "actualDeliveryDate must be YYYY-MM-DD").optional(),
    creditNoteReason: z.string().trim().min(1).max(1_000).optional(),
    currency: z.literal("SAR"),
    note: z.string().trim().max(1_000).optional(),
    seller: sellerSchema,
    buyer: buyerSchema.optional(),
    paymentMeansCode: z.string().trim().min(1),
    allowance: allowanceSchema.optional(),
    tax: taxSchema,
    totals: totalsSchema,
    items: z.array(itemSchema).min(1),
}).strict().superRefine((invoice, context) => {
    if (invoice.transactionType !== "CREDIT_NOTE") return;

    for (const field of ["originalInvoiceDocumentId", "actualDeliveryDate", "creditNoteReason"] as const) {
        if (!invoice[field]) {
            context.addIssue({
                code: "custom",
                path: [field],
                message: `${field} is required when transactionType is CREDIT_NOTE`,
            });
        }
    }
});

export type ZatcaSaleInvoiceRequest = z.infer<typeof zatcaSaleInvoiceSchema>;
