import { env } from "../../config/env.js";
import type { InvoiceSubmissionPayload } from "../../schemas/invoice.schema.js";

export interface AigentrixResult {
    success: boolean;
    data?: unknown;
    error?: unknown;
}

type AigentrixValidationResponse = {
    failedCount?: number;
    results?: Array<{
        valid?: boolean;
    }>;
};

const buildUrl = (path: string): string => {
    return new URL(path, env.AIGENTRIX_BASE_URL).toString();
};

const parseResponse = (responseText: string): unknown => {
    if (!responseText) {
        return null;
    }

    try {
        return JSON.parse(responseText) as unknown;
    } catch {
        return responseText;
    }
};

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

const postToAigentrix = async (
    url: string,
    payload: InvoiceSubmissionPayload,
    shouldCheckValidationResult = false,
    shouldWrapPayloadInArray = false,
): Promise<AigentrixResult> => {
    const requestBody = {
        ...payload,
        companyId: env.AIGENTRIX_COMPANY_ID,
        invoiceTypeCode: env.AIGENTRIX_INVOICE_TYPE_CODE,
        invoiceTransactionType: 0,
        payments: [{ paymentMeansCode: "30" }]
    };

    const requestPayload = shouldWrapPayloadInArray ? [requestBody] : requestBody;

    const response = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-API-KEY": env.AIGENTRIX_API_KEY,
        },
        body: JSON.stringify(requestPayload),
    });

    const responseText = await response.text();
    const data = parseResponse(responseText);

    if (!response.ok) {
        return {
            success: false,
            error: data,
        };
    }

    if (shouldCheckValidationResult && hasValidationFailure(data)) {
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

export const validateInvoice = async (payload: InvoiceSubmissionPayload): Promise<AigentrixResult> => {
    return postToAigentrix(buildUrl("/external/api/v1/eInvoiceEntry/validate"), payload, true, true);
};

export const createFullInvoice = async (payload: InvoiceSubmissionPayload): Promise<AigentrixResult> => {
    return postToAigentrix(buildUrl("/external/api/v1/eInvoiceEntry/createFull"), payload);
};
