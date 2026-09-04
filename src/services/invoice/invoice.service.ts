import { ZodError } from "zod";
import { env } from "../../config/env.js";
import { EntryDataModel } from "../../models/entry-data.model.js";
import { EntryStatusTimelineModel } from "../../models/entry-status-timeline.model.js";
import { InvoiceSubmissionModel } from "../../models/invoice-submission.model.js";
import { SellerConfigModel } from "../../models/seller-config.model.js";
import type { InvoiceSubmissionPayload } from "../../schemas/invoice.schema.js";
import { invoiceSubmissionSchema } from "../../schemas/invoice.schema.js";
import {
    createFullInvoice,
    getInvoiceEntry as getAigentrixInvoiceEntry,
    getInvoiceStatusTimeline as getAigentrixInvoiceStatusTimeline,
    validateInvoice,
} from "../aigentrix/aigentrix.service.js";
import type { AigentrixRequestOptions } from "../aigentrix/aigentrix.service.js";
import { reserveProviderDocumentId } from "./invoice-number.service.js";

export interface ServiceResponse {
    statusCode: number;
    body: Record<string, unknown>;
}

type LeanInvoiceSubmission = {
    organizationId?: string;
    documentId?: string;
    providerDocumentId?: string;
    invoiceRef?: string;
    entryId?: number;
    status?: string;
    payload?: {
        invoiceRef?: string;
        documentId?: string;
        invoiceTypeCode?: string;
        documentCurrencyCode?: string;
        buyerName?: string;
        sellerVatTrn?: string;
        lineExtensionTotal?: number;
        taxAmount?: number;
        payableAmount?: number;
        issueDate?: string;
    };
    providerError?: unknown;
    providerValidationResponse?: unknown;
    createdAt?: Date;
    updatedAt?: Date;
};

type LeanEntryData = {
    organizationId: string;
    entryId: number;
    vatTrn: string;
    entryData?: {
        id?: number;
        documentId?: string;
        invoiceRef?: string;
        status?: string;
        taxStatus?: string;
        type?: string;
        invoiceTypeCode?: string;
        documentCurrencyCode?: string;
        buyerName?: string;
        sellerVatTrn?: string;
        lineExtensionTotal?: number;
        taxAmount?: number;
        payableAmount?: number;
        issueDate?: string;
        updatedAt?: string;
    };
    createdAt?: Date;
    updatedAt?: Date;
};

const validateWithProvider = async (payload: InvoiceSubmissionPayload, requestOptions: AigentrixRequestOptions) => {
    try {
        return await validateInvoice(payload, requestOptions);
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

const submitToProvider = async (payload: InvoiceSubmissionPayload, requestOptions: AigentrixRequestOptions) => {
    try {
        return await createFullInvoice(payload, requestOptions);
    } catch (error) {
        console.log("Error submitting invoice to provider:", error);
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

const buildInvoicePayload = (
    payload: unknown,
    sellerConfig: { companyId: number; participantId: string },
) => {
    const rawPayload = typeof payload === "object" && payload !== null ? payload as Record<string, unknown> : {};
    const isCreditNote = rawPayload.invoiceTransactionType === "creditNote";
    const invoicePayload = { ...rawPayload };

    delete invoicePayload.creditNoteReasonCode;
    delete invoicePayload.invoiceTransactionType;
    delete invoicePayload.paymentMeans;
    delete invoicePayload.payments;

    return {
        ...invoicePayload,
        companyId: String(sellerConfig.companyId),
        supplierParticipantId: sellerConfig.participantId,
        invoiceTypeCode: String(
            isCreditNote ? env.AIGENTRIX_INVOICE_CREDITNOTE_CODE : env.AIGENTRIX_INVOICE_TYPE_CODE,
        ),
        status: String(env.AIGENTRIX_INVOICE_STATUS),
        invoiceTransactionType: 0,
        ...(isCreditNote
            ? { creditNoteReasonCode: "VD" }
            : { payments: [{ paymentMeansCode: "30" }] }),
    };
};

const getSellerVatTrnFromPayload = (payload: unknown): number | null => {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return null;
    }

    const invoicePayload = payload as Record<string, unknown>;
    const organization = typeof invoicePayload.organization === "object"
        && invoicePayload.organization !== null
        && !Array.isArray(invoicePayload.organization)
        ? invoicePayload.organization as Record<string, unknown>
        : undefined;
    const sellerVatTrn = invoicePayload.sellerVatTrn
        ?? invoicePayload.organizationVatTrn
        ?? organization?.vatTrn;
    const parsedSellerVatTrn = Number(String(sellerVatTrn ?? "").trim());

    return Number.isSafeInteger(parsedSellerVatTrn) && parsedSellerVatTrn > 0
        ? parsedSellerVatTrn
        : null;
};

const getOrganizationIdFromPayload = (payload: unknown): string | null => {
    if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
        return null;
    }

    const invoicePayload = payload as Record<string, unknown>;
    const organizationId = invoicePayload.organizationId ?? invoicePayload.OrganizationId;

    return typeof organizationId === "string" && organizationId.trim()
        ? organizationId.trim()
        : null;
};

const getAigentrixOptionsForSeller = async (
    sellerVatTrn: string,
    organizationId: string,
): Promise<AigentrixRequestOptions | null> => {
    const parsedSellerVatTrn = Number(sellerVatTrn);

    if (!Number.isSafeInteger(parsedSellerVatTrn) || parsedSellerVatTrn <= 0) {
        return null;
    }

    const sellerConfig = await SellerConfigModel.findOne({
        organizationId,
        sellerVatTrn: parsedSellerVatTrn,
    }).select("+apiKey").lean();
    const apiKey = sellerConfig?.apiKey?.trim();

    return apiKey ? { apiKey } : null;
};

const getApiKeyNotConfiguredResponse = (): ServiceResponse => ({
    statusCode: 422,
    body: {
        success: false,
        error: {
            code: "AIGENTRIX_API_KEY_NOT_CONFIGURED",
            message: "Before using E-Invoice, save the Aigentrix API key in seller configuration.",
        },
    },
});

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

const upsertEntryData = async (
    entryId: number,
    vatTrn: string,
    organizationId: string,
    entryData: Record<string, unknown>,
) => {
    await EntryDataModel.findOneAndUpdate(
        { entryId, organizationId },
        {
            $set: {
                entryId,
                vatTrn,
                organizationId,
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

const upsertEntryStatusTimelineData = async (
    entryId: number,
    vatTrn: string,
    organizationId: string,
    statusTimeline: Record<string, unknown>,
) => {
    await EntryStatusTimelineModel.findOneAndUpdate(
        {
            entryId,
            organizationId,
            type: env.AIGENTRIX_STATUS_TIMELINE_TYPE,
        },
        {
            $set: {
                entryId,
                type: env.AIGENTRIX_STATUS_TIMELINE_TYPE,
                vatTrn,
                organizationId,
                statusTimeline,
            },
        },
        {
            new: true,
            upsert: true,
            runValidators: true,
        }
    );
};

const roundAmount = (amount: number): number => {
    return Math.round(amount * 100) / 100;
};

const isFailedSubmissionStatus = (status?: string): boolean => {
    return status === "FAILED";
};

const isAcknowledgedEntryStatus = (status?: string): boolean => {
    return status === "ACKNOWLEDGED";
};

const getInvoiceDisplayType = (invoiceTypeCode?: string): string => {
    if (invoiceTypeCode === "381") {
        return "Credit Note";
    }

    return "Sale";
};

const getRecentActivityDate = (entry: LeanEntryData): Date => {
    const providerUpdatedAt = entry.entryData?.updatedAt ? new Date(entry.entryData.updatedAt) : null;

    if (providerUpdatedAt && !Number.isNaN(providerUpdatedAt.getTime())) {
        return providerUpdatedAt;
    }

    return entry.updatedAt ?? entry.createdAt ?? new Date(0);
};

export const createInvoiceSubmission = async (
    payload: unknown,
): Promise<ServiceResponse> => {
    try {
        const sellerVatTrn = getSellerVatTrnFromPayload(payload);
        const organizationId = getOrganizationIdFromPayload(payload);
        const sellerConfig = sellerVatTrn !== null && organizationId !== null
            ? await SellerConfigModel.findOne({ sellerVatTrn, organizationId }).select("+apiKey").lean()
            : null;

        if (!sellerConfig) {
            return {
                statusCode: 422,
                body: {
                    success: false,
                    error: {
                        code: "SELLER_CONFIG_NOT_FOUND",
                        message: "Before E-Invoice submission, please update your seller configuration.",
                    },
                },
            };
        }

        const apiKey = sellerConfig.apiKey?.trim();
        if (!apiKey) {
            return getApiKeyNotConfiguredResponse();
        }

        const aigentrixOptions = { apiKey };
        const parsedPayload = invoiceSubmissionSchema.parse(buildInvoicePayload(payload, sellerConfig));
        const existingSubmission = await InvoiceSubmissionModel.findOne({
            organizationId: parsedPayload.organizationId,
            documentId: parsedPayload.documentId,
        });

        if (existingSubmission && existingSubmission.status !== "FAILED") {
            return {
                statusCode: 409,
                body: {
                    success: false,
                    error: {
                        code: "INVOICE_ALREADY_SUBMITTED",
                        message: "An invoice submission already exists for this documentId.",
                    },
                },
            };
        }

        const providerDocumentId = existingSubmission?.providerDocumentId
            ?? (await reserveProviderDocumentId(parsedPayload.documentId)).providerDocumentId;
        const providerPayload: InvoiceSubmissionPayload = {
            ...parsedPayload,
            documentId: providerDocumentId,
        };

        const validationResult = await validateWithProvider(providerPayload, aigentrixOptions);

        if (!validationResult.success) {
            if (existingSubmission) {
                existingSubmission.payload = providerPayload;
                existingSubmission.status = "FAILED";
                existingSubmission.providerValidationResponse = validationResult.error;
                existingSubmission.providerResponse = undefined;
                existingSubmission.providerError = {
                    code: "AIGENTRIX_VALIDATION_FAILED",
                    message: "Aigentrix invoice validation failed",
                    details: validationResult.error,
                };
                await existingSubmission.save();
            }

            return {
                statusCode: 422,
                body: {
                    success: false,
                    data: {
                        documentId: parsedPayload.documentId,
                        providerDocumentId,
                        status: "VALIDATION_FAILED",
                        provider: "aigentrix",
                        providerError: {
                            code: "AIGENTRIX_VALIDATION_FAILED",
                            message: "Aigentrix invoice validation failed",
                            details: validationResult.error,
                        },
                    },
                },
            };
        }

        const submission = existingSubmission ?? await InvoiceSubmissionModel.create({
            organizationId: parsedPayload.organizationId,
            companyId: parsedPayload.companyId,
            invoiceRef: parsedPayload.invoiceRef,
            documentId: parsedPayload.documentId,
            providerDocumentId,
            payload: providerPayload,
            status: "PENDING",
            provider: "aigentrix",
            providerValidationResponse: validationResult.data,
        });

        if (existingSubmission) {
            submission.companyId = parsedPayload.companyId;
            submission.invoiceRef = parsedPayload.invoiceRef;
            submission.providerDocumentId = providerDocumentId;
            submission.payload = providerPayload;
            submission.status = "PENDING";
            submission.entryId = undefined;
            submission.providerValidationResponse = validationResult.data;
            submission.providerResponse = undefined;
            submission.providerError = undefined;
            await submission.save();
        }

        const providerResult = await submitToProvider(providerPayload, aigentrixOptions);

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
                    organizationId: submission.organizationId,
                    companyId: submission.companyId,
                    documentId: submission.documentId,
                    providerDocumentId: submission.providerDocumentId,
                    entryId: submission.entryId,
                    invoiceRef: submission.invoiceRef,
                    status: submission.status,
                    provider: submission.provider,
                    providerValidationResponse: submission.providerValidationResponse,
                    providerResponse: submission.providerResponse,
                    providerError: submission.providerError
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

export const getInvoiceDashboard = async (
    vatTrn: string,
    organizationId: string,
): Promise<ServiceResponse> => {
    const parsedVatTrn = vatTrn.trim();
    const parsedOrganizationId = organizationId.trim();

    if (!parsedVatTrn) {
        return {
            statusCode: 400,
            body: {
                success: false,
                error: {
                    code: "VAT_TRN_REQUIRED",
                    message: "vatTrn is required",
                },
            },
        };
    }

    if (!parsedOrganizationId) {
        return {
            statusCode: 400,
            body: {
                success: false,
                error: {
                    code: "ORGANIZATION_ID_REQUIRED",
                    message: "organizationId is required",
                },
            },
        };
    }

    try {
        const submissionFilter = {
            organizationId: parsedOrganizationId,
            "payload.sellerVatTrn": parsedVatTrn,
        };
        const entryDataFilter = { organizationId: parsedOrganizationId, vatTrn: parsedVatTrn };

        const [submissions, entryDatas] = await Promise.all([
            InvoiceSubmissionModel.find(submissionFilter).sort({ updatedAt: -1 }).lean<LeanInvoiceSubmission[]>(),
            EntryDataModel.find(entryDataFilter).sort({ updatedAt: -1 }).lean<LeanEntryData[]>(),
        ]);

        const successfulDocumentIds = new Set(
            entryDatas
                .map((entry) => entry.entryData?.documentId)
                .filter((documentId): documentId is string => Boolean(documentId))
        );
        const submissionsWithoutEntryData = submissions.filter((submission) => {
            const documentId = submission.providerDocumentId ?? submission.payload?.documentId ?? "";
            return !successfulDocumentIds.has(documentId);
        });
        const totalInvoices = entryDatas.length + submissionsWithoutEntryData.length;
        const failed = submissionsWithoutEntryData.filter((submission) => isFailedSubmissionStatus(submission.status)).length;
        const validationFailed = submissionsWithoutEntryData.filter((submission) => Boolean(submission.providerValidationResponse) && submission.status === "FAILED").length;
        const submittedAttempts = submissions.filter((submission) => submission.status === "SUBMITTED").length;

        const outboundEntries = entryDatas.filter((entry) => entry.entryData?.type === "OUTBOUND");
        const inboundEntries = entryDatas.filter((entry) => entry.entryData?.type === "INBOUND");
        const acknowledged = entryDatas.filter((entry) => isAcknowledgedEntryStatus(entry.entryData?.status)).length;
        const failedOutbound = outboundEntries.filter((entry) => isFailedSubmissionStatus(entry.entryData?.status)).length;
        const failedInbound = inboundEntries.filter((entry) => isFailedSubmissionStatus(entry.entryData?.status)).length;
        const totalOutbound = outboundEntries.length;
        const totalInbound = inboundEntries.length;
        const successRate = totalOutbound > 0 ? roundAmount((acknowledged / totalOutbound) * 100) : 0;
        const totalAmount = roundAmount(entryDatas.reduce((sum, entry) => sum + (Number(entry.entryData?.payableAmount) || 0), 0));
        const totalVat = roundAmount(entryDatas.reduce((sum, entry) => sum + (Number(entry.entryData?.taxAmount) || 0), 0));

        const customerMap = new Map<string, { name: string; invoiceCount: number; amount: number }>();
        const currencyMap = new Map<string, { currency: string; invoiceCount: number; amount: number }>();

        for (const entry of entryDatas) {
            const customerName = entry.entryData?.buyerName?.trim() || "Unknown";
            const currency = entry.entryData?.documentCurrencyCode?.trim() || "Unknown";
            const payableAmount = Number(entry.entryData?.payableAmount) || 0;

            const customer = customerMap.get(customerName) ?? {
                name: customerName,
                invoiceCount: 0,
                amount: 0,
            };
            customer.invoiceCount += 1;
            customer.amount = roundAmount(customer.amount + payableAmount);
            customerMap.set(customerName, customer);

            const currencySummary = currencyMap.get(currency) ?? {
                currency,
                invoiceCount: 0,
                amount: 0,
            };
            currencySummary.invoiceCount += 1;
            currencySummary.amount = roundAmount(currencySummary.amount + payableAmount);
            currencyMap.set(currency, currencySummary);
        }

        const topCustomer = Array.from(customerMap.values()).sort((first, second) => second.amount - first.amount)[0] ?? null;
        const topCurrency = Array.from(currencyMap.values()).sort((first, second) => second.amount - first.amount)[0] ?? null;

        const recentEntryActivity = entryDatas.map((entry) => ({
            entryId: entry.entryId,
            voucher: entry.entryData?.documentId ?? entry.entryData?.invoiceRef ?? null,
            type: getInvoiceDisplayType(entry.entryData?.invoiceTypeCode),
            party: entry.entryData?.buyerName ?? null,
            eInvoiceStatus: entry.entryData?.status ?? null,
            taxStatus: entry.entryData?.taxStatus ?? null,
            netAmount: roundAmount(Number(entry.entryData?.lineExtensionTotal) || 0),
            payableAmount: roundAmount(Number(entry.entryData?.payableAmount) || 0),
            source: "ENTRY_DATA",
            updatedAt: getRecentActivityDate(entry).toISOString(),
        }));

        const failedSubmissionActivity = submissionsWithoutEntryData
            .filter((submission) => submission.status === "FAILED")
            .map((submission) => ({
                entryId: submission.entryId ?? null,
                voucher: submission.documentId ?? submission.payload?.documentId ?? submission.invoiceRef ?? null,
                type: getInvoiceDisplayType(submission.payload?.invoiceTypeCode),
                party: submission.payload?.buyerName ?? null,
                eInvoiceStatus: submission.status ?? null,
                taxStatus: null,
                netAmount: roundAmount(Number(submission.payload?.lineExtensionTotal) || 0),
                payableAmount: roundAmount(Number(submission.payload?.payableAmount) || 0),
                source: "INVOICE_SUBMISSION",
                updatedAt: (submission.updatedAt ?? submission.createdAt ?? new Date(0)).toISOString(),
            }));

        const recentActivity = [...recentEntryActivity, ...failedSubmissionActivity]
            .sort((first, second) => new Date(second.updatedAt).getTime() - new Date(first.updatedAt).getTime())
            .slice(0, 10);

        return {
            statusCode: 200,
            body: {
                success: true,
                data: {
                    vatTrn: parsedVatTrn,
                    organizationId: parsedOrganizationId,
                    summary: {
                        totalInvoices,
                        submittedAttempts,
                        successfulInvoices: entryDatas.length,
                        outbound: {
                            count: totalOutbound,
                            amount: totalAmount,
                        },
                        inbound: {
                            count: totalInbound,
                            amount: roundAmount(inboundEntries.reduce((sum, entry) => sum + (Number(entry.entryData?.payableAmount) || 0), 0)),
                        },
                        totalAmount,
                        totalVat,
                        successRate,
                    },
                    statusBreakdown: {
                        acknowledged,
                        failed,
                        validationFailed,
                        totalInbound,
                        failedInbound,
                        totalOutbound,
                        failedOutbound,
                    },
                    topCustomer,
                    topCurrency,
                    recentActivity,
                },
            },
        };
    } catch (error) {
        return {
            statusCode: 500,
            body: {
                success: false,
                error: {
                    code: "DASHBOARD_FETCH_FAILED",
                    message: error instanceof Error ? error.message : "Failed to fetch invoice dashboard data",
                },
            },
        };
    }
};

export const getInvoiceEntry = async (
    entryId: string,
    vatTrn: string,
    organizationId: string,
): Promise<ServiceResponse> => {
    const parsedEntryId = Number(entryId);
    const parsedVatTrn = vatTrn.trim();
    const parsedOrganizationId = organizationId.trim();

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

    if (!parsedVatTrn) {
        return {
            statusCode: 400,
            body: {
                success: false,
                error: {
                    code: "VAT_TRN_REQUIRED",
                    message: "vatTrn is required",
                },
            },
        };
    }

    if (!parsedOrganizationId) {
        return {
            statusCode: 400,
            body: {
                success: false,
                error: {
                    code: "ORGANIZATION_ID_REQUIRED",
                    message: "organizationId is required",
                },
            },
        };
    }

    try {
        const aigentrixOptions = await getAigentrixOptionsForSeller(parsedVatTrn, parsedOrganizationId);
        if (!aigentrixOptions) {
            return getApiKeyNotConfiguredResponse();
        }

        const result = await getAigentrixInvoiceEntry(parsedEntryId, aigentrixOptions);

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
                await upsertEntryData(providerEntryId, parsedVatTrn, parsedOrganizationId, entryData);
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

export const getInvoiceStatusTimeline = async (
    entryId: string,
    vatTrn: string,
    organizationId: string,
): Promise<ServiceResponse> => {
    const parsedEntryId = Number(entryId);
    const parsedVatTrn = vatTrn.trim();
    const parsedOrganizationId = organizationId.trim();

    if (!entryId) {
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

    if (!parsedVatTrn) {
        return {
            statusCode: 400,
            body: {
                success: false,
                error: {
                    code: "VAT_TRN_REQUIRED",
                    message: "vatTrn is required",
                },
            },
        };
    }

    if (!parsedOrganizationId) {
        return {
            statusCode: 400,
            body: {
                success: false,
                error: {
                    code: "ORGANIZATION_ID_REQUIRED",
                    message: "organizationId is required",
                },
            },
        };
    }

    try {
        const aigentrixOptions = await getAigentrixOptionsForSeller(parsedVatTrn, parsedOrganizationId);
        if (!aigentrixOptions) {
            return getApiKeyNotConfiguredResponse();
        }

        const result = await getAigentrixInvoiceStatusTimeline(parsedEntryId, aigentrixOptions);

        if (!result.success) {
            return {
                statusCode: 422,
                body: {
                    success: false,
                    error: {
                        code: "AIGENTRIX_STATUS_TIMELINE_FETCH_FAILED",
                        message: "Failed to fetch invoice status timeline from Aigentrix",
                        details: result.error,
                    },
                },
            };
        }

        if (typeof result.data === "object" && result.data !== null && !Array.isArray(result.data)) {
            const statusTimeline = (result.data as Record<string, unknown>).statusTimeline;

            if (typeof statusTimeline === "object" && statusTimeline !== null && !Array.isArray(statusTimeline)) {
                await upsertEntryStatusTimelineData(
                    parsedEntryId,
                    parsedVatTrn,
                    parsedOrganizationId,
                    statusTimeline as Record<string, unknown>,
                );
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
                    code: "AIGENTRIX_STATUS_TIMELINE_FETCH_FAILED",
                    message: error instanceof Error ? error.message : "Failed to fetch invoice status timeline from Aigentrix",
                },
            },
        };
    }
};
