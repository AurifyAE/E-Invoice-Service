import mongoose from "mongoose";
import { ZodError } from "zod";
import { env } from "../../config/env.js";
import { InvoiceSubmissionModel } from "../../models/invoice-submission.model.js";
import type { InvoiceSubmissionPayload } from "../../schemas/invoice.schema.js";
import { invoiceSubmissionSchema } from "../../schemas/invoice.schema.js";
import { createFullInvoice, validateInvoice } from "../aigentrix/aigentrix.service.js";

export interface ServiceResponse {
    statusCode: number;
    body: Record<string, unknown>;
}

type AigentrixFailedRule = {
    severity?: string;
    field?: string;
    id?: string;
    message?: string;
};

type AigentrixValidationError = {
    validatedAt?: string;
    totalInvoices?: number;
    passedCount?: number;
    failedCount?: number;
    results?: Array<{
        invoiceId?: string;
        invoiceTypeCode?: string;
        summary?: string;
        schematronDetail?: {
            failedRules?: AigentrixFailedRule[];
            warnings?: unknown[];
        };
    }>;
};

const buildAigentrixValidationDetails = (error: unknown) => {
    if (typeof error !== "object" || error === null) {
        return error;
    }

    const validationError = error as AigentrixValidationError;
    const failedRules = validationError.results?.flatMap((result) => {
        return result.schematronDetail?.failedRules?.map((rule) => ({
            invoiceId: result.invoiceId,
            invoiceTypeCode: result.invoiceTypeCode,
            summary: result.summary,
            severity: rule.severity,
            field: rule.field,
            id: rule.id,
            message: rule.message,
        })) ?? [];
    }) ?? [];

    return {
        validatedAt: validationError.validatedAt,
        totalInvoices: validationError.totalInvoices,
        passedCount: validationError.passedCount,
        failedCount: validationError.failedCount,
        failedRules,
        raw: validationError,
    };
};

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

const buildInvoicePayload = (payload: unknown) => {
    return {
        ...(typeof payload === "object" && payload !== null ? payload : {}),
        companyId: String(env.AIGENTRIX_COMPANY_ID),
        invoiceTypeCode: String(env.AIGENTRIX_INVOICE_TYPE_CODE),
        invoiceTransactionType: 0,
        payments: [{ paymentMeansCode: "30" }],
    };
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
                        companyId: parsedPayload.companyId,
                        documentId: parsedPayload.documentId,
                        invoiceRef: parsedPayload.invoiceRef,
                        status: "VALIDATION_FAILED",
                        provider: "aigentrix",
                        providerError: {
                            code: "AIGENTRIX_VALIDATION_FAILED",
                            message: "Aigentrix invoice validation failed",
                            details: buildAigentrixValidationDetails(validationResult.error),
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
        submission.providerResponse = providerResult.data;
        submission.providerError = providerResult.error;

        await submission.save();

        return {
            statusCode: providerResult.success ? 201 : 422,
            body: {
                success: providerResult.success,
                data: {
                    submissionId: submission.id,
                    companyId: submission.companyId,
                    documentId: submission.documentId,
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

        if (error instanceof mongoose.Error.ValidationError) {
            return {
                statusCode: 400,
                body: {
                    success: false,
                    error: {
                        code: "DATABASE_VALIDATION_ERROR",
                        message: error.message,
                    },
                },
            };
        }

        if (typeof error === "object" && error !== null && "code" in error && error.code === 11000) {
            return {
                statusCode: 409,
                body: {
                    success: false,
                    error: {
                        code: "DUPLICATE_INVOICE_SUBMISSION",
                        message: "Invoice submission already exists for this companyId and documentId",
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
