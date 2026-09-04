import { InvoiceNumberModel } from "../../models/invoice-number.model.js";

const GLOBAL_INVOICE_NUMBER_KEY = "GLOBAL_INVOICE_NUMBER";
const INVOICE_NUMBER_PADDING = 4;
const MAX_RESERVATION_ATTEMPTS = 3;

export type ProviderDocumentIdReservation = {
    invoiceNumber: number;
    providerDocumentId: string;
};

export const reserveProviderDocumentId = async (
    documentId: string,
): Promise<ProviderDocumentIdReservation> => {
    for (let attempt = 0; attempt < MAX_RESERVATION_ATTEMPTS; attempt += 1) {
        try {
            const counter = await InvoiceNumberModel.findOneAndUpdate(
                { key: GLOBAL_INVOICE_NUMBER_KEY },
                {
                    $setOnInsert: { key: GLOBAL_INVOICE_NUMBER_KEY },
                    $inc: { invoiceNumber: 1 },
                },
                {
                    new: true,
                    upsert: true,
                    runValidators: true,
                },
            ).lean();

            if (!counter || !Number.isSafeInteger(counter.invoiceNumber) || counter.invoiceNumber < 1) {
                throw new Error("Unable to reserve an invoice number");
            }

            return {
                invoiceNumber: counter.invoiceNumber,
                providerDocumentId: `${documentId}-${String(counter.invoiceNumber).padStart(INVOICE_NUMBER_PADDING, "0")}`,
            };
        } catch (error) {
            const errorCode = typeof error === "object" && error !== null
                ? (error as { code?: number }).code
                : undefined;

            if (errorCode !== 11000 || attempt === MAX_RESERVATION_ATTEMPTS - 1) {
                throw error;
            }
        }
    }

    throw new Error("Unable to reserve an invoice number");
};
