import mongoose, { Schema } from "mongoose";
import type { InvoiceSubmissionPayload } from "../schemas/invoice.schema.js";

export type InvoiceSubmissionStatus = "PENDING" | "SUBMITTED" | "FAILED";
export type InvoiceSubmissionTransactionType = "sale" | "creditNote" | "debitNote";

export interface InvoiceSubmissionDocument extends mongoose.Document {
    organizationId: string;
    companyId: string;
    invoiceRef?: string;
    transactionType?: InvoiceSubmissionTransactionType;
    documentId: string;
    providerDocumentId: string;
    entryId?: number;
    /** BTAE-07 document UUID returned by the ASP, when its response carries one. */
    providerUuid?: string;
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
        priceBaseQty: { type: Number },
        priceBaseQtyUom: { type: String },
        lineNetAmount: { type: Number, required: true },
        taxCategory: { type: String, required: true },
        taxRatePercent: { type: Number, required: true },
        lineTaxAmount: { type: Number, required: true },
        inclVatamount: { type: Number, required: true },
        vatExemptReasonCode: { type: String },
        itemDescription: { type: String },
        sellerItemId: { type: String },
        itemTypeGoodsServices: { type: String, enum: ["G", "S", "B"] },
        batchNumber: { type: String },
        vatExemptReason: { type: String },
        rcmGoodsTypeCode: { type: String },
        itemStandardId: { type: String },
    },
    { _id: false }
);

const taxSubtotalSchema = new Schema(
    {
        taxCategory: { type: String, required: true },
        taxRatePercent: { type: Number, required: true },
        taxableAmount: { type: Number, required: true },
        taxAmount: { type: Number, required: true },
    },
    { _id: false }
);

const precedingInvoiceSchema = new Schema(
    {
        invoiceNumber: { type: String, required: true },
        issueDate: { type: String },
    },
    { _id: false }
);

const transactionTypeFlagsSchema = new Schema(
    {
        freeZone: { type: Boolean },
        deemedSupply: { type: Boolean },
        marginScheme: { type: Boolean },
        summaryInvoice: { type: Boolean },
        continuousSupply: { type: Boolean },
        disclosedAgent: { type: Boolean },
        eCommerce: { type: Boolean },
        export: { type: Boolean },
    },
    { _id: false }
);

const paymentSchema = new Schema(
    {
        paymentMeansCode: { type: String, required: true },
        creditAccountIban: { type: String },
        creditAccountScheme: { type: String },
    },
    { _id: false }
);

const invoicePayloadSchema = new Schema(
    {
        organizationId: { type: String, required: true },
        companyId: { type: String, required: true },
        supplierParticipantId: { type: String, required: true },
        customerParticipantId: { type: String },
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
        sellerLegalRegistrationId: { type: String },
        sellerLegalRegistrationType: { type: String },
        sellerLegalRegistrationAuthority: { type: String },
        buyerName: { type: String },
        buyerVatTrn: { type: String },
        buyerRegisteredName: { type: String },
        buyerAddressLine1: { type: String },
        buyerCity: { type: String },
        buyerCountrySubdivision: { type: String },
        buyerCountryCode: { type: String },
        lineExtensionTotal: { type: Number, required: true },
        taxAmount: { type: Number, required: true },
        totalIncludingTax: { type: Number, required: true },
        payableAmount: { type: Number, required: true },
        payments: { type: [paymentSchema] },
        transactionTypeFlags: { type: transactionTypeFlagsSchema },
        transactionTypeCode: { type: String },
        creditNoteReason: { type: String },
        precedingInvoices: { type: [precedingInvoiceSchema], default: undefined },
        taxPointDate: { type: String },
        taxSubtotals: { type: [taxSubtotalSchema], default: undefined },
        lines: { type: [invoiceLineSchema], required: true },
    },
    { _id: false }
);

const invoiceSubmissionSchema = new Schema<InvoiceSubmissionDocument>(
    {
        organizationId: { type: String, required: true, index: true },
        companyId: { type: String, required: true, index: true },
        invoiceRef: { type: String },
        // ERP document kind; a debit note is submitted as type 380 like a sale.
        transactionType: { type: String, enum: ["sale", "creditNote", "debitNote"] },
        documentId: { type: String, required: true, index: true },
        providerDocumentId: { type: String, required: true, index: true },
        entryId: { type: Number, index: true },
        providerUuid: { type: String },
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
    { unique: true },
);

export const InvoiceSubmissionModel = mongoose.model<InvoiceSubmissionDocument>(
    "InvoiceSubmission",
    invoiceSubmissionSchema
);
