import mongoose, { Schema } from "mongoose";

export interface SellerConfigDocument extends mongoose.Document {
    organizationId: string;
    sellerVatTrn: number;
    apiKey: string;
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
        apiKey: {
            type: String,
            required: true,
            trim: true,
            select: false,
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
