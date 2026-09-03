import mongoose, { Schema } from "mongoose";

export interface EntryStatusTimelineDocument extends mongoose.Document {
    organizationId: string;
    entryId: number;
    type: string;
    vatTrn: string;
    statusTimeline: Record<string, unknown>;
}

const entryStatusTimelineSchema = new Schema<EntryStatusTimelineDocument>(
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
        type: {
            type: String,
            required: true,
        },
        vatTrn: {
            type: String,
            required: true,
            index: true,
        },
        statusTimeline: {
            type: Schema.Types.Mixed,
            required: true,
        },
    },
    { timestamps: true }
);

entryStatusTimelineSchema.index(
    { organizationId: 1, entryId: 1, type: 1 },
    { unique: true, partialFilterExpression: { organizationId: { $exists: true } } },
);

export const EntryStatusTimelineModel = mongoose.model<EntryStatusTimelineDocument>(
    "EntryStatusTimeline",
    entryStatusTimelineSchema
);
