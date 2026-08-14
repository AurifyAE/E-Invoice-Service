import mongoose, { Schema } from "mongoose";

export interface EntryStatusTimelineDocument extends mongoose.Document {
    entryId: number;
    type: string;
    vatTrn: string;
    statusTimeline: Record<string, unknown>;
}

const entryStatusTimelineSchema = new Schema<EntryStatusTimelineDocument>(
    {
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

entryStatusTimelineSchema.index({ entryId: 1, type: 1 }, { unique: true });

export const EntryStatusTimelineModel = mongoose.model<EntryStatusTimelineDocument>(
    "EntryStatusTimeline",
    entryStatusTimelineSchema
);
