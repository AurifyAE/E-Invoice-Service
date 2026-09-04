import mongoose, { Schema } from "mongoose";

export interface InvoiceNumberDocument extends mongoose.Document {
    key: "GLOBAL_INVOICE_NUMBER";
    invoiceNumber: number;
}

const invoiceNumberSchema = new Schema<InvoiceNumberDocument>(
    {
        key: {
            type: String,
            required: true,
            unique: true,
            immutable: true,
        },
        invoiceNumber: {
            type: Number,
            required: true,
            default: 0,
            min: 0,
        },
    },
    { timestamps: false },
);

export const InvoiceNumberModel = mongoose.model<InvoiceNumberDocument>(
    "InvoiceNumber",
    invoiceNumberSchema,
);
