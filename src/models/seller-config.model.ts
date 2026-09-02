import mongoose, { Schema } from "mongoose";

export interface SellerConfigDocument extends mongoose.Document {
    sellerVatTrn: number;
    companyId: number;
    participantId: string;
}

const sellerConfigSchema = new Schema<SellerConfigDocument>(
    {
        sellerVatTrn: {
            type: Number,
            required: true,
            unique: true,
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

export const SellerConfigModel = mongoose.model<SellerConfigDocument>("SellerConfig", sellerConfigSchema);
