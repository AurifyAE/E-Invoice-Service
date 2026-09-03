import mongoose, { Schema } from "mongoose";

export interface SellerConfigDocument extends mongoose.Document {
    organizationId: string;
    sellerVatTrn: number;
    companyId: number;
    participantId: string;
}

const sellerConfigSchema = new Schema<SellerConfigDocument>(
    {
        organizationId: {
            type: String,
            required: true,
            index: true,
        },
        sellerVatTrn: {
            type: Number,
            required: true,
            index: true,
        },
        companyId: {
            type: Number,
            required: true,
            index: true,
        },
        participantId: {
            type: String,
            required: true,
            index: true,
        },
    },
    { timestamps: true }
);

sellerConfigSchema.index({ organizationId: 1, sellerVatTrn: 1 }, { unique: true });

export const SellerConfigModel = mongoose.model<SellerConfigDocument>("SellerConfig", sellerConfigSchema);
