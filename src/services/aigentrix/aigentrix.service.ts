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

const getRequiredHeaderValue = (value: string | undefined, headerName: string): string => {
    if (!value?.trim()) {
        throw new Error(`${headerName} is required in the request headers`);
    }

    return value.trim();
};

export const resolveAigentrixRequestOptions = (
    options: AigentrixRequestOptions = {},
): Required<AigentrixRequestOptions> => ({
    apiKey: getRequiredHeaderValue(options.apiKey, "X-API-KEY"),
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

const postToAigentrix = async (
    url: string,
    payload: InvoiceSubmissionPayload,
    shouldCheckValidationResult = false,
    shouldWrapPayloadInArray = false,
    requestOptions: AigentrixRequestOptions = {},
): Promise<AigentrixResult> => {
    const aigentrixOptions = resolveAigentrixRequestOptions(requestOptions);
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
