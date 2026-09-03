import mongoose, { Schema } from "mongoose";

export interface EntryDataDocument extends mongoose.Document {
    organizationId: string;
    entryId: number;
    vatTrn: string;
    entryData: Record<string, unknown>;
}

const entryDataSchema = new Schema<EntryDataDocument>(
    {
        organizationId: {
            type: String,
            required: true,
            index: true,
        },
        entryId: {
            type: Number,
            required: true,
            index: true,
        },
        vatTrn: {
            type: String,
            required: true,
            index: true,
        },
        entryData: {
            type: Schema.Types.Mixed,
            required: true,
        },
    },
    { timestamps: true }
);

entryDataSchema.index(
    { organizationId: 1, entryId: 1 },
    { unique: true, partialFilterExpression: { organizationId: { $exists: true } } },
);

export const EntryDataModel = mongoose.model<EntryDataDocument>("EntryData", entryDataSchema);
