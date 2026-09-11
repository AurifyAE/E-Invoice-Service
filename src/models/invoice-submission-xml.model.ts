import mongoose, { Schema } from "mongoose";

export interface InvoiceSubmissionXmlDocument extends mongoose.Document {
    organizationId: string;
    entryId: number;
    documentId: string;
    providerDocumentId: string;
    vatTrn: string;
    invoiceXml: string;
    provider: "aigentrix";
}

const invoiceSubmissionXmlSchema = new Schema<InvoiceSubmissionXmlDocument>(
    {
        organizationId: { type: String, required: true, index: true },
        entryId: { type: Number, required: true, index: true },
        documentId: { type: String, required: true },
        providerDocumentId: { type: String, required: true },
        vatTrn: { type: String, required: true },
        invoiceXml: { type: String, required: true },
        provider: { type: String, enum: ["aigentrix"], required: true },
    },
    { timestamps: true },
);

// A provider entry belongs to one organization and its submitted XML is immutable.
invoiceSubmissionXmlSchema.index(
    { organizationId: 1, entryId: 1 },
    { unique: true, partialFilterExpression: { organizationId: { $exists: true } } },
);

export const InvoiceSubmissionXmlModel = mongoose.model<InvoiceSubmissionXmlDocument>(
    "InvoiceSubmissionXml",
    invoiceSubmissionXmlSchema,
);
