import mongoose, { Schema } from "mongoose";
import type { InvoiceSubmissionPayload } from "../schemas/invoice.schema.js";

export type InvoiceSubmissionStatus = "PENDING" | "SUBMITTED" | "FAILED";

export interface InvoiceSubmissionDocument extends mongoose.Document {
    organizationId: string;
    companyId: string;
    invoiceRef?: string;
    documentId: string;
    providerDocumentId: string;
    entryId?: number;
    payload: InvoiceSubmissionPayload;
    status: InvoiceSubmissionStatus;
    provider: "aigentrix";
    providerValidationResponse?: unknown;
    providerResponse?: unknown;
    providerError?: unknown;
}

const invoiceLineSchema = new Schema(
    {
        lineNumber: { type: Number, required: true },
        itemName: { type: String, required: true },
        quantity: { type: Number, required: true },
        quantityUom: { type: String, required: true },
        unitPrice: { type: Number, required: true },
        lineNetAmount: { type: Number, required: true },
        taxCategory: { type: String, required: true },
        taxRatePercent: { type: Number, required: true },
        lineTaxAmount: { type: Number, required: true },
        inclVatamount: { type: Number, required: true },
        vatExemptReasonCode: { type: String },
    },
    { _id: false }
);

const paymentSchema = new Schema(
    {
        paymentMeansCode: { type: String, required: true },
    },
    { _id: false }
);

const invoicePayloadSchema = new Schema(
    {
        organizationId: { type: String, required: true },
        companyId: { type: String, required: true },
        supplierParticipantId: { type: String, required: true },
        customerParticipantId: { type: String, required: true },
        invoiceRef: { type: String },
        documentId: { type: String, required: true },
        status: { type: String, required: true },
        issueDate: { type: String, required: true },
        invoiceTypeCode: { type: String, required: true },
        invoiceTransactionType: { type: Number, required: true },
        creditNoteReasonCode: { type: String },
        documentCurrencyCode: { type: String, required: true },
        sellerName: { type: String, required: true },
        sellerVatTrn: { type: String, required: true },
        sellerRegisteredName: { type: String, required: true },
        sellerAddressLine1: { type: String, required: true },
        sellerCity: { type: String, required: true },
        sellerCountrySubdivision: { type: String },
        sellerCountryCode: { type: String, required: true },
        buyerName: { type: String, required: true },
        buyerVatTrn: { type: String, required: true },
        buyerRegisteredName: { type: String },
        buyerAddressLine1: { type: String, required: true },
        buyerCity: { type: String, required: true },
        buyerCountrySubdivision: { type: String },
        buyerCountryCode: { type: String, required: true },
        lineExtensionTotal: { type: Number, required: true },
        taxAmount: { type: Number, required: true },
        totalIncludingTax: { type: Number, required: true },
        payableAmount: { type: Number, required: true },
        payments: { type: [paymentSchema] },
        lines: { type: [invoiceLineSchema], required: true },
    },
    { _id: false }
);

const invoiceSubmissionSchema = new Schema<InvoiceSubmissionDocument>(
    {
        organizationId: { type: String, required: true, index: true },
        companyId: { type: String, required: true, index: true },
        invoiceRef: { type: String },
        documentId: { type: String, required: true, index: true },
        providerDocumentId: { type: String, required: true, index: true },
        entryId: { type: Number, index: true },
        payload: { type: invoicePayloadSchema, required: true },
        status: {
            type: String,
            enum: ["PENDING", "SUBMITTED", "FAILED"],
            required: true,
            default: "PENDING",
        },
        provider: {
            type: String,
            required: true
        },
        providerValidationResponse: { type: Schema.Types.Mixed },
        providerResponse: { type: Schema.Types.Mixed },
        providerError: { type: Schema.Types.Mixed },
    },
    { timestamps: true }
);

invoiceSubmissionSchema.index(
    { organizationId: 1, documentId: 1 },
    { unique: true, partialFilterExpression: { organizationId: { $exists: true } } },
);

export const InvoiceSubmissionModel = mongoose.model<InvoiceSubmissionDocument>(
    "InvoiceSubmission",
    invoiceSubmissionSchema
);
