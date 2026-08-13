import { ZodError } from "zod";
import { env } from "../../config/env.js";
import { EntryDataModel } from "../../models/entry-data.model.js";
import { InvoiceSubmissionModel } from "../../models/invoice-submission.model.js";
import type { InvoiceSubmissionPayload } from "../../schemas/invoice.schema.js";
import { invoiceSubmissionSchema } from "../../schemas/invoice.schema.js";
import { createFullInvoice, getInvoiceEntry as getAigentrixInvoiceEntry, validateInvoice } from "../aigentrix/aigentrix.service.js";

export interface ServiceResponse {
    statusCode: number;
    body: Record<string, unknown>;
}

const validateWithProvider = async (payload: InvoiceSubmissionPayload) => {
    try {
        return await validateInvoice(payload);
    } catch (error) {
        return {
            success: false,
            error: {
                code: "AIGENTRIX_VALIDATION_FAILED",
                message: error instanceof Error ? error.message : "Failed to validate invoice with Aigentrix",
            },
        };
    }
};

const submitToProvider = async (payload: InvoiceSubmissionPayload) => {
    try {
        return await createFullInvoice(payload);
    } catch (error) {
        return {
            success: false,
            error: {
                code: "AIGENTRIX_SUBMISSION_FAILED",
                message: error instanceof Error ? error.message : "Failed to submit invoice to Aigentrix",
            },
        };
    }
};

const extractEntryId = (providerResponse: unknown): number | undefined => {
    if (typeof providerResponse !== "object" || providerResponse === null) {
        return undefined;
    }

    const findEntryId = (value: unknown): number | undefined => {
        if (typeof value !== "object" || value === null) {
            return undefined;
        }

        const record = value as Record<string, unknown>;

        if (typeof record.entryId === "string" && record.entryId.trim()) {
            const entryId = Number(record.entryId);
            return Number.isNaN(entryId) ? undefined : entryId;
        }

        if (typeof record.entryId === "number") {
            return record.entryId;
        }

        return undefined;
    };

    return findEntryId(providerResponse);
};

const buildInvoicePayload = (payload: unknown) => {
    const rawPayload = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};

    return {
        ...rawPayload,
        companyId: String(env.AIGENTRIX_COMPANY_ID),
        supplierParticipantId: String(env.AIGENTRIX_SUPPLIER_PARTICIPANT_ID),
        customerParticipantId: String(env.AIGENTRIX_CUSTOMER_PARTICIPANT_ID),
        invoiceTypeCode: String(env.AIGENTRIX_INVOICE_TYPE_CODE),
        status: String(env.AIGENTRIX_INVOICE_STATUS),
        invoiceTransactionType: 0,
        payments: [{ paymentMeansCode: "30" }],
    };
};

const getEntryIdFromProviderResponse = (data: unknown): number | undefined => {
    if (typeof data !== "object" || data === null) {
        return undefined;
    }

    const entryId = (data as Record<string, unknown>).id;

    if (typeof entryId === "number") {
        return entryId;
    }

    return undefined;
};

const upsertEntryData = async (entryId: number, entryData: Record<string, unknown>) => {
    await EntryDataModel.findOneAndUpdate(
        { entryId },
        {
            $set: {
                entryId,
                entryData,
            },
        },
        {
            new: true,
            upsert: true,
            runValidators: true,
        }
    );
};

export const createInvoiceSubmission = async (payload: unknown): Promise<ServiceResponse> => {
    try {
        const parsedPayload = invoiceSubmissionSchema.parse(buildInvoicePayload(payload));

        const validationResult = await validateWithProvider(parsedPayload);

        if (!validationResult.success) {
            return {
                statusCode: 422,
                body: {
                    success: false,
                    data: {
                        documentId: parsedPayload.documentId,
                        status: "VALIDATION_FAILED",
                        provider: "aigentrix",
                        providerError: {
                            code: "AIGENTRIX_VALIDATION_FAILED",
                            message: "Aigentrix invoice validation failed"
                        },
                    },
                },
            };
        }

        const submission = await InvoiceSubmissionModel.create({
            companyId: parsedPayload.companyId,
            invoiceRef: parsedPayload.invoiceRef,
            documentId: parsedPayload.documentId,
            payload: parsedPayload,
            status: "PENDING",
            provider: "aigentrix",
            providerValidationResponse: validationResult.data,
        });

        const providerResult = await submitToProvider(parsedPayload);

        submission.status = providerResult.success ? "SUBMITTED" : "FAILED";
        submission.entryId = providerResult.success ? extractEntryId(providerResult.data) : undefined;
        submission.providerResponse = providerResult.data;
        submission.providerError = providerResult.error;

        await submission.save();

        return {
            statusCode: providerResult.success ? 200 : 422,
            body: {
                success: providerResult.success,
                data: {
                    submissionId: submission.id,
                    companyId: submission.companyId,
                    documentId: submission.documentId,
                    entryId: submission.entryId,
                    invoiceRef: submission.invoiceRef,
                    status: submission.status,
                    provider: submission.provider,
                    providerValidationResponse: submission.providerValidationResponse,
                    providerResponse: submission.providerResponse,
                    providerError: submission.providerError,
                },
            },
        };
    } catch (error) {
        if (error instanceof ZodError) {
            return {
                statusCode: 400,
                body: {
                    success: false,
                    error: {
                        code: "VALIDATION_ERROR",
                        message: "Invoice validation failed",
                        details: error.issues,
                    },
                },
            };
        }

        return {
            statusCode: 500,
            body: {
                success: false,
                error: {
                    code: "INTERNAL_SERVER_ERROR",
                    message: "Failed to submit invoice",
                },
            },
        };
    }
};

export const getInvoiceEntry = async (entryId: string): Promise<ServiceResponse> => {
    const parsedEntryId = Number(entryId);

    if (!entryId || Number.isNaN(parsedEntryId)) {
        return {
            statusCode: 400,
            body: {
                success: false,
                error: {
                    code: "INVALID_ENTRY_ID",
                    message: "Valid entryId is required",
                },
            },
        };
    }

    try {
        const result = await getAigentrixInvoiceEntry(parsedEntryId);

        if (!result.success) {
            return {
                statusCode: 422,
                body: {
                    success: false,
                    error: {
                        code: "AIGENTRIX_ENTRY_FETCH_FAILED",
                        message: "Failed to fetch invoice entry from Aigentrix",
                        details: result.error,
                    },
                },
            };
        }

        if (typeof result.data === "object" && result.data !== null) {
            const entryData = result.data as Record<string, unknown>;
            const providerEntryId = getEntryIdFromProviderResponse(entryData);

            if (providerEntryId) {
                await upsertEntryData(providerEntryId, entryData);
            }
        }

        return {
            statusCode: 200,
            body: typeof result.data === "object" && result.data !== null
                ? result.data as Record<string, unknown>
                : { data: result.data },
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: {
                success: false,
                error: {
                    code: "AIGENTRIX_ENTRY_FETCH_FAILED",
                    message: error instanceof Error ? error.message : "Failed to fetch invoice entry from Aigentrix",
                },
            },
        };
    }
};
