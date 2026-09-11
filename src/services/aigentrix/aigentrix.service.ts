import { env } from "../../config/env.js";
import type { InvoiceSubmissionPayload } from "../../schemas/invoice.schema.js";

export interface AigentrixResult {
    success: boolean;
    data?: unknown;
    error?: unknown;
}

export interface AigentrixRequestOptions {
    apiKey?: string;
}

type AigentrixValidationResponse = {
    failedCount?: number;
    results?: Array<{
        valid?: boolean;
    }>;
};

type AigentrixProviderResponse = {
    success?: boolean;
};

const buildUrl = (path: string): string => {
    return new URL(path, env.AIGENTRIX_BASE_URL).toString();
};

const parseResponse = (responseText: string): unknown => {
    try {
        return JSON.parse(responseText) as unknown;
    } catch {
        return responseText;
    }
};

const getRequiredApiKey = (value: string | undefined): string => {
    if (!value?.trim()) {
        throw new Error("Aigentrix API key is not configured");
    }

    return value.trim();
};

export const resolveAigentrixRequestOptions = (
    options: AigentrixRequestOptions = {},
): Required<AigentrixRequestOptions> => ({
    apiKey: getRequiredApiKey(options.apiKey),
});

const getAigentrixHeaders = (options: Required<AigentrixRequestOptions>): Record<string, string> => ({
    "Content-Type": "application/json",
    "X-API-KEY": options.apiKey,
});

const hasValidationFailure = (data: unknown): boolean => {
    if (typeof data !== "object" || data === null) {
        return false;
    }

    const validationResponse = data as AigentrixValidationResponse;
    return Boolean(
        validationResponse.failedCount && validationResponse.failedCount > 0
        || validationResponse.results?.some((result) => result.valid === false)
    );
};

const hasProviderFailure = (data: unknown): boolean => {
    if (typeof data !== "object" || data === null) {
        return false;
    }

    return (data as AigentrixProviderResponse).success === false;
};

/**
 * Produces the exact invoice object sent to Aigentrix. Keeping this separate
 * also lets the submission service retain the matching XML representation.
 */
export const buildAigentrixInvoiceRequestBody = (
    payload: InvoiceSubmissionPayload,
): Partial<InvoiceSubmissionPayload> => {
    const isCreditNote = payload.invoiceTypeCode === env.AIGENTRIX_INVOICE_CREDITNOTE_CODE;
    const requestBody: Partial<InvoiceSubmissionPayload> = { ...payload };

    delete requestBody.organizationId;
    delete requestBody.creditNoteReasonCode;
    delete requestBody.payments;
    requestBody.invoiceTypeCode = payload.invoiceTypeCode;
    requestBody.status = env.AIGENTRIX_INVOICE_STATUS;
    requestBody.invoiceTransactionType = 0;

    if (isCreditNote) {
        requestBody.creditNoteReasonCode = "VD";
    } else {
        requestBody.payments = [{ paymentMeansCode: "30" }];
    }

    return requestBody;
};

const postToAigentrix = async (
    url: string,
    payload: InvoiceSubmissionPayload,
    shouldCheckValidationResult = false,
    shouldWrapPayloadInArray = false,
    requestOptions: AigentrixRequestOptions = {},
): Promise<AigentrixResult> => {
    const aigentrixOptions = resolveAigentrixRequestOptions(requestOptions);
    const requestBody = buildAigentrixInvoiceRequestBody(payload);

    const requestPayload = shouldWrapPayloadInArray ? [requestBody] : requestBody;

    const response = await fetch(url, {
        method: "POST",
        headers: getAigentrixHeaders(aigentrixOptions),
        body: JSON.stringify(requestPayload),
    });

    const responseText = await response.text();
    const data = parseResponse(responseText);

    if (hasProviderFailure(data) || (shouldCheckValidationResult && hasValidationFailure(data))) {
        return {
            success: false,
            error: data,
        };
    }

    return {
        success: true,
        data,
    };
};

export const validateInvoice = async (
    payload: InvoiceSubmissionPayload,
    requestOptions?: AigentrixRequestOptions,
): Promise<AigentrixResult> => {
    return postToAigentrix(buildUrl("/external/api/v1/eInvoiceEntry/validate"), payload, true, true, requestOptions);
};

export const createFullInvoice = async (
    payload: InvoiceSubmissionPayload,
    requestOptions?: AigentrixRequestOptions,
): Promise<AigentrixResult> => {
    return postToAigentrix(buildUrl("/external/api/v1/eInvoiceEntry/createFull"), payload, false, false, requestOptions);
};

export const getInboundInvoiceSummary = async (
    companyId: number,
    startDate: string,
    endDate: string,
    requestOptions: AigentrixRequestOptions,
): Promise<{ count: number; amount: number }> => {
    const url = new URL(buildUrl("/external/api/v1/eInvoiceEntry"));
    url.search = new URLSearchParams({
        companyId: String(companyId), startDate, endDate, type: env.TYPE_INBOUND,
    }).toString();
    const response = await fetch(url, {
        headers: getAigentrixHeaders(resolveAigentrixRequestOptions(requestOptions)),
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Inbound invoice request failed (${response.status})`);
    const data = await response.json() as {
        success?: boolean;
        meta?: { totalCount?: number; totalAmount?: number };
        einvoiceEntryResponseDTOS?: unknown;
        data?: unknown;
        error?: unknown;
    };
    const count = data.meta?.totalCount;
    const amount = data.meta?.totalAmount;
    const responseEntries = data.einvoiceEntryResponseDTOS ?? data.data;
    const isEmptyEntries = Array.isArray(responseEntries) && responseEntries.length === 0;
    const isEmptyNoDataResponse = (data.success === undefined || data.success === false)
        && data.error === undefined
        && data.meta === undefined
        && (responseEntries === undefined || responseEntries === null || isEmptyEntries);
    if ((isEmptyEntries || isEmptyNoDataResponse) && (count === undefined || amount === undefined)) {
        return { count: 0, amount: 0 };
    }

    if (data.success === false) {
        throw new Error("Inbound invoice response is missing valid totalCount or totalAmount");
    }

    if (typeof count !== "number" || !Number.isSafeInteger(count) || count < 0
        || typeof amount !== "number" || !Number.isFinite(amount)) {
        throw new Error("Inbound invoice response is missing valid totalCount or totalAmount");
    }

    return { count, amount };
};

export type AigentrixInboundInvoice = {
    id: number;
    userId?: number;
    companyId?: number;
    invoiceRef?: string;
    documentId?: string;
    issueDate?: string;
    invoiceTypeCode?: string;
    invoiceTransactionType?: string;
    sellerName?: string;
    buyerName?: string;
    status?: string;
    taxStatus?: string;
    sourceType?: boolean;
    quickbooksSynced?: boolean;
    odooSynced?: boolean;
    zohoSynced?: boolean;
    documentCurrencyCode?: string;
    paymentDueDate?: string;
    sellerVatTrn?: string;
    sellerVatScheme?: string;
    sellerRegisteredName?: string;
    sellerAddressLine1?: string;
    sellerCity?: string;
    sellerCountrySubdivision?: string;
    sellerCountryCode?: string;
    buyerVatTrn?: string;
    buyerVatScheme?: string;
    buyerRegisteredName?: string;
    buyerAddressLine1?: string;
    buyerCity?: string;
    buyerCountrySubdivision?: string;
    buyerCountryCode?: string;
    sellerElectronicAddressSchemeId?: string;
    buyerElectronicAddressSchemeId?: string;
    lineExtensionTotal?: number;
    taxAmount?: number;
    totalIncludingTax?: number;
    payableAmount?: number;
    type?: string;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
    apAutomation?: boolean;
    files?: unknown[];
    success?: boolean;
    lines?: AigentrixInboundInvoiceLine[];
    payments?: AigentrixInboundInvoicePayment[];
};

export type AigentrixInboundInvoiceLine = {
    id?: number;
    lineNumber?: number;
    itemName?: string;
    itemDescription?: string;
    quantity?: number;
    quantityUom?: string;
    unitPrice?: number;
    priceBaseQty?: number;
    priceBaseQtyUom?: string;
    lineNetAmount?: number;
    taxCategory?: string;
    taxRatePercent?: number;
    taxScheme?: string;
    lineTaxAmount?: number;
    inclVatAmount?: number;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
};

export type AigentrixInboundInvoicePayment = {
    id?: number;
    paymentMeansCode?: string;
    creditAccountIban?: string;
    bankBicSwift?: string;
    createdAt?: string;
    updatedAt?: string;
    createdBy?: string;
};

export type AigentrixInboundInvoicePage = {
    entries: AigentrixInboundInvoice[];
    totalCount: number;
    page: number;
    perPage: number;
};

export const getInboundInvoiceEntries = async (
    companyId: number,
    startDate: string,
    endDate: string,
    searchString: string,
    page: number,
    perPage: number,
    requestOptions: AigentrixRequestOptions,
): Promise<AigentrixInboundInvoicePage> => {
    const url = new URL(buildUrl("/external/api/v1/eInvoiceEntry"));
    url.search = new URLSearchParams({
        companyId: String(companyId),
        startDate,
        endDate,
        type: env.TYPE_INBOUND,
        searchString,
        page: String(page),
        perPage: String(perPage),
    }).toString();
    const response = await fetch(url, {
        headers: getAigentrixHeaders(resolveAigentrixRequestOptions(requestOptions)),
        signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Inbound invoice request failed (${response.status})`);

    const data = await response.json() as {
        success?: boolean;
        einvoiceEntryResponseDTOS?: AigentrixInboundInvoice[];
        data?: unknown;
        meta?: { totalCount?: number; page?: number; perPage?: number };
        error?: unknown;
    };
    const entries = data.einvoiceEntryResponseDTOS ?? (Array.isArray(data.data) ? data.data : undefined);
    const totalCount = data.meta?.totalCount;
    const isEmptyEntries = Array.isArray(entries) && entries.length === 0;
    const isEmptyNoDataResponse = (data.success === undefined || data.success === false)
        && data.error === undefined
        && data.meta === undefined
        && (entries === undefined || isEmptyEntries);
    if ((isEmptyEntries || isEmptyNoDataResponse) && (totalCount === undefined || !data.meta)) {
        return { entries: [], totalCount: 0, page, perPage };
    }

    if (data.success === false) {
        throw new Error("Inbound invoice response is missing valid entries or meta.totalCount");
    }

    if (!Array.isArray(entries) || !data.meta || typeof totalCount !== "number" || !Number.isSafeInteger(totalCount) || totalCount < 0) {
        throw new Error("Inbound invoice response is missing valid entries or meta.totalCount");
    }
    const responsePage = data.meta.page;
    const responsePerPage = data.meta.perPage;

    return {
        entries,
        totalCount,
        page: typeof responsePage === "number" && Number.isSafeInteger(responsePage) ? responsePage : page,
        perPage: typeof responsePerPage === "number" && Number.isSafeInteger(responsePerPage) && responsePerPage > 0
            ? responsePerPage
            : perPage,
    };
};

export const getInvoiceEntry = async (
    entryId: number,
    requestOptions?: AigentrixRequestOptions,
): Promise<AigentrixResult> => {
    const aigentrixOptions = resolveAigentrixRequestOptions(requestOptions);
    const response = await fetch(buildUrl(`/external/api/v1/eInvoiceEntry/${entryId}`), {
        method: "GET",
        headers: getAigentrixHeaders(aigentrixOptions),
    });

    const responseText = await response.text();
    const data = parseResponse(responseText);

    return {
        success: true,
        data,
    };
};

export const getInvoiceStatusTimeline = async (
    entryId: number,
    requestOptions?: AigentrixRequestOptions,
): Promise<AigentrixResult> => {
    const aigentrixOptions = resolveAigentrixRequestOptions(requestOptions);
    const statusTimelineUrl = buildUrl(
        `/external/api/v1/eInvoiceEntry/${entryId}/statusTimeline?type=${env.AIGENTRIX_STATUS_TIMELINE_TYPE}`
    );

    const response = await fetch(statusTimelineUrl, {
        method: "GET",
        headers: getAigentrixHeaders(aigentrixOptions),
    });

    const responseText = await response.text();
    const data = parseResponse(responseText);

    return {
        success: true,
        data,
    };
};
