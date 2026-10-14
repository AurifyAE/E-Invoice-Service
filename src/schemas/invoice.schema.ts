import { z } from "zod";

export const invoiceLineSchema = z.object({
    lineNumber: z.coerce.number().int().positive(),
    itemName: z.string().min(1, "itemName is required"),
    quantity: z.coerce.number().positive(),
    quantityUom: z.string().min(1, "quantityUom is required"),
    unitPrice: z.coerce.number().nonnegative(),
    priceBaseQty: z.coerce.number().positive().optional(),
    priceBaseQtyUom: z.string().trim().min(1).optional(),
    lineNetAmount: z.coerce.number().nonnegative(),
    taxCategory: z.string().min(1, "taxCategory is required"),
    taxRatePercent: z.coerce.number().nonnegative(),
    lineTaxAmount: z.coerce.number().nonnegative(),
    inclVatamount: z.coerce.number().nonnegative(),
    vatExemptReasonCode: z.string().optional(),
    // Extended PINT AE line fields (sent only with AIGENTRIX_SEND_EXTENDED_FIELDS).
    itemDescription: z.string().trim().min(1).optional(),
    sellerItemId: z.string().trim().min(1).optional(),
    itemTypeGoodsServices: z.enum(["G", "S", "B"]).optional(),
    batchNumber: z.string().trim().min(1).optional(),
    vatExemptReason: z.string().trim().min(1).optional(),
    rcmGoodsTypeCode: z.string().trim().min(1).optional(),
    // GS1 GTIN — item standard identifier (IBT-157, scheme 0160), required on AE lines.
    itemStandardId: z.string().trim().regex(/^(\d{8}|\d{12}|\d{13}|\d{14})$/, "itemStandardId must be a GTIN").optional(),
}).superRefine((line, context) => {
    if (line.taxCategory === "E" && !line.vatExemptReasonCode) {
        context.addIssue({
            code: "custom",
            path: ["vatExemptReasonCode"],
            message: "vatExemptReasonCode is required when taxCategory is E",
        });
    }
});

/** VAT breakdown (BG-23), one per category and rate. Computed by this service on submit. */
export const taxSubtotalSchema = z.object({
    taxCategory: z.string().min(1),
    taxRatePercent: z.coerce.number().nonnegative(),
    taxableAmount: z.coerce.number(),
    taxAmount: z.coerce.number(),
});

export const paymentSchema = z.object({
    paymentMeansCode: z.string().min(1, "paymentMeansCode is required"),
    creditAccountIban: z.string().trim().min(1).optional(),
    creditAccountScheme: z.string().trim().min(1).optional(),
});

/**
 * BTAE-02 transaction type: eight 0/1 positions, in this order (Implementation Guide §6.2).
 */
export const TRANSACTION_TYPE_FLAG_ORDER = [
    "freeZone",
    "deemedSupply",
    "marginScheme",
    "summaryInvoice",
    "continuousSupply",
    "disclosedAgent",
    "eCommerce",
    "export",
] as const;

const transactionTypeFlagsSchema = z.object(
    Object.fromEntries(TRANSACTION_TYPE_FLAG_ORDER.map((flag) => [flag, z.boolean().optional()])) as
        Record<(typeof TRANSACTION_TYPE_FLAG_ORDER)[number], z.ZodOptional<z.ZodBoolean>>,
);

export const buildTransactionTypeCode = (
    flags: Partial<Record<(typeof TRANSACTION_TYPE_FLAG_ORDER)[number], boolean | undefined>> = {},
): string => TRANSACTION_TYPE_FLAG_ORDER.map((flag) => (flags[flag] ? "1" : "0")).join("");

/** ERP credit note reasons → PINT AE BTAE-03 codes (Decree-Law Art. 61(1) a–e, VD). */
export const CREDIT_NOTE_REASON_CODES = {
    SUPPLY_CANCELLED: "DL8.61.1.A",
    TAX_TREATMENT_CHANGED: "DL8.61.1.B",
    PRICE_FIXING_DOWN: "DL8.61.1.C",
    WEIGHT_ASSAY_ADJUSTMENT: "DL8.61.1.C",
    GOODS_RETURN: "DL8.61.1.D",
    TAX_ERROR: "DL8.61.1.E",
    VOLUME_DISCOUNT: "VD",
} as const;

export type CreditNoteReason = keyof typeof CREDIT_NOTE_REASON_CODES;

const creditNoteReasonSchema = z.enum(
    Object.keys(CREDIT_NOTE_REASON_CODES) as [CreditNoteReason, ...CreditNoteReason[]],
);

export const precedingInvoiceSchema = z.object({
    invoiceNumber: z.string().trim().min(1, "invoiceNumber is required"),
    issueDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "issueDate must be YYYY-MM-DD").optional(),
});

const getNestedRecord = (record: Record<string, unknown>, key: string): Record<string, unknown> | undefined => {
    const value = record[key];
    return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as Record<string, unknown>
        : undefined;
};

const getSourceFieldValue = (
    invoice: Record<string, unknown>,
    sourcePrefix: "organization" | "party",
    sourceKey: string,
): unknown => {
    const flatValue = invoice[`${sourcePrefix}${sourceKey}`];

    if (flatValue !== undefined) {
        return flatValue;
    }

    const nestedSource = getNestedRecord(invoice, sourcePrefix);
    const nestedKey = `${sourceKey.charAt(0).toLowerCase()}${sourceKey.slice(1)}`;

    return nestedSource?.[nestedKey];
};

const getMappedPartyFieldValue = (
    invoice: Record<string, unknown>,
    directKey: string,
    sourcePrefix: "organization" | "party",
    sourceKey: string,
) => {
    return getSourceFieldValue(invoice, sourcePrefix, sourceKey) ?? invoice[directKey];
};

const buildSellerBuyerPayload = (invoice: Record<string, unknown>) => {
    return {
        sellerName: getMappedPartyFieldValue(invoice, "sellerName", "organization", "Name"),
        sellerVatTrn: getMappedPartyFieldValue(invoice, "sellerVatTrn", "organization", "VatTrn"),
        sellerRegisteredName: getMappedPartyFieldValue(invoice, "sellerRegisteredName", "organization", "RegisteredName"),
        sellerAddressLine1: getMappedPartyFieldValue(invoice, "sellerAddressLine1", "organization", "AddressLine1"),
        sellerCity: getMappedPartyFieldValue(invoice, "sellerCity", "organization", "City"),
        sellerCountrySubdivision: getMappedPartyFieldValue(invoice, "sellerCountrySubdivision", "organization", "CountrySubdivision"),
        sellerCountryCode: getMappedPartyFieldValue(invoice, "sellerCountryCode", "organization", "CountryCode"),
        buyerName: getMappedPartyFieldValue(invoice, "buyerName", "party", "Name"),
        buyerVatTrn: getMappedPartyFieldValue(invoice, "buyerVatTrn", "party", "VatTrn"),
        buyerRegisteredName: getMappedPartyFieldValue(invoice, "buyerRegisteredName", "party", "RegisteredName"),
        buyerAddressLine1: getMappedPartyFieldValue(invoice, "buyerAddressLine1", "party", "AddressLine1"),
        buyerCity: getMappedPartyFieldValue(invoice, "buyerCity", "party", "City"),
        buyerCountrySubdivision: getMappedPartyFieldValue(invoice, "buyerCountrySubdivision", "party", "CountrySubdivision"),
        buyerCountryCode: getMappedPartyFieldValue(invoice, "buyerCountryCode", "party", "CountryCode"),
    };
};

const normalizeInvoicePayload = (payload: unknown) => {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return payload;
    }

    const invoice = payload as Record<string, unknown>;
    const rawLines = invoice.lines ?? invoice.Lines;
    const payments = invoice.payments ?? invoice.paymentMeans;
    const lines = Array.isArray(rawLines)
        ? rawLines.map((line) => {
            if (typeof line !== "object" || line === null || Array.isArray(line)) {
                return line;
            }

            const invoiceLine = line as Record<string, unknown>;
            return {
                ...invoiceLine,
                lineNumber: invoiceLine.lineNumber,
                inclVatamount: invoiceLine.inclVatamount
            };
        })
        : rawLines;

    return {
        ...invoice,
        organizationId: invoice.organizationId ?? invoice.OrganizationId,
        ...buildSellerBuyerPayload(invoice),
        payments,
        lines,
    };
};

const emirateSubdivisionByCity: Record<string, string> = {
    "abu dhabi": "AUH",
    dubai: "DXB",
    sharjah: "SHJ",
    "umm al quwain": "UAQ",
    fujairah: "FUJ",
    ajman: "AJM",
    "ras al khaimah": "RAK",
};

const getEmirateSubdivision = (city: string): string | undefined => {
    return emirateSubdivisionByCity[city.trim().toLowerCase()];
};

const uaeRegisteredBuyerFields = [
    "buyerName",
    "buyerVatTrn",
    "buyerAddressLine1",
    "buyerCity",
    "buyerCountryCode",
    "customerParticipantId",
] as const;

const invoiceSubmissionPayloadSchema = z.object({
    organizationId: z.string().trim().min(1, "organizationId is required"),
    companyId: z.string().min(1, "companyId is required"),
    supplierParticipantId: z.string().min(1, "supplierParticipantId is required"),
    customerParticipantId: z.string().trim().optional(),
    buyerVatRegistered: z.boolean().optional(),
    invoiceRef: z.string().optional(),
    documentId: z.string().min(1, "documentId is required"),
    status: z.string().min(1, "status is required"),
    issueDate: z.string().min(1, "issueDate is required"),
    invoiceTypeCode: z.string().min(1, "invoiceTypeCode is required"),
    invoiceTransactionType: z.literal(0),
    creditNoteReasonCode: z.string().optional(),
    documentCurrencyCode: z.string().min(1, "documentCurrencyCode is required"),
    sellerName: z.string().min(1, "sellerName is required"),
    sellerVatTrn: z.string().min(1, "sellerVatTrn is required"),
    sellerRegisteredName: z.string().min(1, "sellerRegisteredName is required"),
    sellerAddressLine1: z.string().min(1, "sellerAddressLine1 is required"),
    sellerCity: z.string().min(1, "sellerCity is required"),
    sellerCountrySubdivision: z.string().optional(),
    sellerCountryCode: z.string().min(1, "sellerCountryCode is required"),
    sellerLegalRegistrationId: z.string().trim().min(1).optional(),
    sellerLegalRegistrationType: z.string().trim().min(1).optional(),
    sellerLegalRegistrationAuthority: z.string().trim().min(1).optional(),
    buyerName: z.string().trim().optional(),
    buyerVatTrn: z.string().trim().optional(),
    buyerRegisteredName: z.string().optional(),
    buyerAddressLine1: z.string().trim().optional(),
    buyerCity: z.string().trim().optional(),
    buyerCountrySubdivision: z.string().optional(),
    buyerCountryCode: z.string().trim().optional(),
    lineExtensionTotal: z.coerce.number().nonnegative(),
    taxAmount: z.coerce.number().nonnegative(),
    totalIncludingTax: z.coerce.number().nonnegative(),
    payableAmount: z.coerce.number().nonnegative(),
    payments: z.array(paymentSchema).optional(),
    // Extended PINT AE header fields (sent only with AIGENTRIX_SEND_EXTENDED_FIELDS).
    transactionTypeFlags: transactionTypeFlagsSchema.optional(),
    creditNoteReason: creditNoteReasonSchema.optional(),
    precedingInvoices: z.array(precedingInvoiceSchema).optional(),
    taxPointDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "taxPointDate must be YYYY-MM-DD").optional(),
    taxSubtotals: z.array(taxSubtotalSchema).optional(),
    lines: z.array(invoiceLineSchema).min(1, "At least one invoice line is required"),
}).superRefine((invoice, context) => {
    if (invoice.buyerVatRegistered !== true) {
        return;
    }

    uaeRegisteredBuyerFields.forEach((field) => {
        if (!invoice[field]) {
            context.addIssue({
                code: "custom",
                path: [field],
                message: `${field} is required for UAE VAT-registered buyers`,
            });
        }
    });
}).transform(({ buyerVatRegistered: _buyerVatRegistered, ...invoice }) => ({
    ...invoice,
    transactionTypeCode: buildTransactionTypeCode(invoice.transactionTypeFlags),
    ...(invoice.creditNoteReasonCode ? {} : { payments: invoice.payments ?? [{ paymentMeansCode: "30" }] }),
    buyerRegisteredName: invoice.buyerRegisteredName?.trim() || invoice.buyerName,
    sellerCountrySubdivision: invoice.sellerCountrySubdivision ?? getEmirateSubdivision(invoice.sellerCity),
    buyerCountrySubdivision: invoice.buyerCountrySubdivision
        ?? (invoice.buyerCity ? getEmirateSubdivision(invoice.buyerCity) : undefined),
}));

export const invoiceSubmissionSchema = z.preprocess(
    normalizeInvoicePayload,
    invoiceSubmissionPayloadSchema,
);

export type InvoiceSubmissionPayload = z.infer<typeof invoiceSubmissionSchema>;
