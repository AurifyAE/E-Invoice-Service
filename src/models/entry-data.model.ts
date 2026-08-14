import mongoose, { Schema } from "mongoose";

export interface EntryDataDocument extends mongoose.Document {
    entryId: number;
    vatTrn: string;
    entryData: Record<string, unknown>;
}

const entryDataSchema = new Schema<EntryDataDocument>(
    {
        entryId: {
            type: Number,
            required: true,
            unique: true,
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

export const EntryDataModel = mongoose.model<EntryDataDocument>("EntryData", entryDataSchema);
