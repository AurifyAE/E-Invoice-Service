import mongoose, { Schema } from "mongoose";
import type { ZatcaInvoiceStatus, ZatcaInvoiceType, ZatcaPartyBusinessType } from "../types/zatca/zatcaSaleInvoice.types.js";

export interface ZatcaInvoiceDocument extends mongoose.Document {
    sourceSystem: string;
    sourceType: string;
    sourceId: string;
    sellerVatNumber: string;
    documentId: string;
    partyBusinessType: ZatcaPartyBusinessType;
    invoiceType: ZatcaInvoiceType;
    uuid: string;
    icv: number;
    previousInvoiceHash: string;
    invoiceHash?: string;
    qrPayload?: string;
    signedXml?: string;
    status: ZatcaInvoiceStatus;
    errorStage?: string;
    errorMessage?: string;
}

const zatcaInvoiceSchema = new Schema<ZatcaInvoiceDocument>(
    {
        sourceSystem: { type: String, required: true, default: "ERP" },
        sourceType: { type: String, required: true },
        sourceId: { type: String, required: true },
        sellerVatNumber: { type: String, required: true },
        documentId: { type: String, required: true },
        partyBusinessType: { type: String, enum: ["B2C", "B2B"], required: true },
        invoiceType: { type: String, enum: ["SIMPLIFIED", "STANDARD"], required: true },
        uuid: { type: String, required: true, unique: true, index: true },
        icv: { type: Number, required: true },
        previousInvoiceHash: { type: String, required: true },
        invoiceHash: { type: String },
        qrPayload: { type: String },
        signedXml: { type: String, select: false },
        status: {
            type: String,
            enum: [
                "PENDING", "XML_GENERATED", "VALIDATED", "SIGNED", "QR_GENERATED",
                "VALIDATION_FAILED", "SIGNING_FAILED", "QR_EXTRACTION_FAILED", "FAILED",
            ],
            required: true,
            default: "PENDING",
        },
        errorStage: { type: String },
        errorMessage: { type: String },
    },
    { timestamps: true },
);

// ERP idempotency boundary: one voucher per seller VAT registration.
zatcaInvoiceSchema.index({ sellerVatNumber: 1, sourceType: 1, documentId: 1 }, { unique: true });
zatcaInvoiceSchema.index({ sellerVatNumber: 1, documentId: 1 });

export const ZatcaInvoiceModel = mongoose.model<ZatcaInvoiceDocument>("ZatcaInvoice", zatcaInvoiceSchema);
