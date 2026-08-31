import mongoose, { Schema } from "mongoose";

export interface ZatcaEgsStateDocument extends mongoose.Document {
    sellerVatNumber: string;
    egsId: string;
    currentIcv: number;
    previousInvoiceHash: string;
    processingToken?: string;
    processingStartedAt?: Date;
}

const zatcaEgsStateSchema = new Schema<ZatcaEgsStateDocument>(
    {
        sellerVatNumber: { type: String, required: true },
        // The first phase has one EGS per seller VAT registration; this explicit
        // field keeps the model ready for multiple EGS registrations later.
        egsId: { type: String, required: true, default: "DEFAULT" },
        currentIcv: { type: Number, required: true, default: 0 },
        previousInvoiceHash: { type: String, required: true },
        processingToken: { type: String },
        processingStartedAt: { type: Date },
    },
    { timestamps: true },
);

zatcaEgsStateSchema.index({ sellerVatNumber: 1, egsId: 1 }, { unique: true });

export const ZatcaEgsStateModel = mongoose.model<ZatcaEgsStateDocument>("ZatcaEgsState", zatcaEgsStateSchema);
