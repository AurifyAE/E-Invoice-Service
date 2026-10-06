import mongoose, { Schema } from "mongoose";

export interface SellerConfigDocument extends mongoose.Document {
    organizationId: string;
    sellerVatTrn: number;
    apiKey: string;
    companyId: number;
    participantId: string;
    sellerLegalRegistrationId: string;
    sellerLegalRegistrationType: string;
    sellerLegalRegistrationAuthority: string;
    creditAccountScheme: string;
    creditAccountIban: string;
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
        sellerLegalRegistrationId: {
            type: String,
            trim: true,
            default: "",
        },
        sellerLegalRegistrationType: {
            type: String,
            trim: true,
            uppercase: true,
            default: "",
        },
        sellerLegalRegistrationAuthority: {
            type: String,
            trim: true,
            default: "",
        },
        creditAccountScheme: {
            type: String,
            trim: true,
            uppercase: true,
            default: "IBAN",
        },
        creditAccountIban: {
            type: String,
            trim: true,
            uppercase: true,
            default: "",
        },
    },
    { timestamps: true }
);

sellerConfigSchema.index({ organizationId: 1, sellerVatTrn: 1 }, { unique: true });

export const SellerConfigModel = mongoose.model<SellerConfigDocument>("SellerConfig", sellerConfigSchema);
