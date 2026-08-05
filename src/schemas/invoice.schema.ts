import { z } from "zod";

export const invoiceLineSchema = z.object({
    lineNumber: z.coerce.number().int().positive(),
    itemName: z.string().min(1, "itemName is required"),
    quantity: z.coerce.number().positive(),
    quantityUom: z.string().min(1, "quantityUom is required"),
    unitPrice: z.coerce.number().nonnegative(),
    lineNetAmount: z.coerce.number().nonnegative(),
    taxCategory: z.string().min(1, "taxCategory is required"),
    taxRatePercent: z.coerce.number().nonnegative(),
    lineTaxAmount: z.coerce.number().nonnegative(),
    inclVatamount: z.coerce.number().nonnegative(),
    vatExemptReasonCode: z.string().optional(),
}).superRefine((line, context) => {
    if (line.taxCategory === "E" && !line.vatExemptReasonCode) {
        context.addIssue({
            code: "custom",
            path: ["vatExemptReasonCode"],
            message: "vatExemptReasonCode is required when taxCategory is E",
        });
    }
});

export const paymentSchema = z.object({
    paymentMeansCode: z.string().min(1, "paymentMeansCode is required"),
});

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

export const invoiceSubmissionSchema = z.preprocess(normalizeInvoicePayload, z.object({
    companyId: z.string().min(1, "companyId is required"),
    invoiceRef: z.string().optional(),
    documentId: z.string().min(1, "documentId is required"),
    issueDate: z.string().min(1, "issueDate is required"),
    invoiceTypeCode: z.string().min(1, "invoiceTypeCode is required"),
    invoiceTransactionType: z.coerce.string().min(1, "invoiceTransactionType is required"),
    documentCurrencyCode: z.string().min(1, "documentCurrencyCode is required"),
    sellerName: z.string().min(1, "sellerName is required"),
    sellerVatTrn: z.string().min(1, "sellerVatTrn is required"),
    sellerRegisteredName: z.string().min(1, "sellerRegisteredName is required"),
    sellerAddressLine1: z.string().min(1, "sellerAddressLine1 is required"),
    sellerCity: z.string().min(1, "sellerCity is required"),
    sellerCountrySubdivision: z.string().optional(),
    sellerCountryCode: z.string().min(1, "sellerCountryCode is required"),
    buyerName: z.string().min(1, "buyerName is required"),
    buyerVatTrn: z.string().min(1, "buyerVatTrn is required"),
    buyerRegisteredName: z.string().optional(),
    buyerAddressLine1: z.string().min(1, "buyerAddressLine1 is required"),
    buyerCity: z.string().min(1, "buyerCity is required"),
    buyerCountrySubdivision: z.string().optional(),
    buyerCountryCode: z.string().min(1, "buyerCountryCode is required"),
    lineExtensionTotal: z.coerce.number().nonnegative(),
    taxAmount: z.coerce.number().nonnegative(),
    totalIncludingTax: z.coerce.number().nonnegative(),
    payableAmount: z.coerce.number().nonnegative(),
    payments: z.array(paymentSchema).optional(),
    lines: z.array(invoiceLineSchema).min(1, "At least one invoice line is required"),
}).transform((invoice) => ({
    ...invoice,
    payments: invoice.payments ?? [{ paymentMeansCode: "30" }],
    buyerRegisteredName: invoice.buyerRegisteredName?.trim() || invoice.buyerName,
    sellerCountrySubdivision: invoice.sellerCountrySubdivision ?? getEmirateSubdivision(invoice.sellerCity),
    buyerCountrySubdivision: invoice.buyerCountrySubdivision ?? getEmirateSubdivision(invoice.buyerCity),
})));

export type InvoiceSubmissionPayload = z.infer<typeof invoiceSubmissionSchema>;
