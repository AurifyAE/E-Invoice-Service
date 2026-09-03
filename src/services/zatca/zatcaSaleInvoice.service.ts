import { randomUUID } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { ZodError } from "zod";
import { getZatcaConfig, ZatcaConfigurationError } from "../../config/zatca.config.js";
import { ZatcaInvoiceModel } from "../../models/zatca-invoice.model.js";
import { zatcaSaleInvoiceSchema, type ZatcaSaleInvoiceRequest } from "../../schemas/zatca-sale-invoice.schema.js";
import { ZATCA_INVOICE_STATUS, ZATCA_INVOICE_TYPE } from "../../types/zatca/zatcaSaleInvoice.types.js";
import { createZatcaQrDataUrl, createZatcaQrPng } from "./zatcaQr.service.js";
import { createInvoiceSdkConfig, generateQrPayload, signInvoice, ZatcaSdkError, validateInvoice } from "./zatcaSdk.service.js";
import { commitZatcaInvoiceState, releaseZatcaInvoiceState, reserveZatcaInvoiceState } from "./zatcaInvoiceState.service.js";
import {
    createSimplifiedInvoiceXml,
    extractZatcaInvoiceHash,
    extractZatcaQrPayload,
    insertZatcaQrPayload,
    validateZatcaInvoiceTotals,
    ZatcaInvoiceTotalsMismatchError,
} from "./zatcaXml.service.js";

export interface ZatcaServiceResponse {
    statusCode: number;
    body: Record<string, unknown>;
}

class ZatcaProcessingError extends Error {
    constructor(public readonly code: string, message: string, public readonly statusCode: number) {
        super(message);
        this.name = "ZatcaProcessingError";
    }
}

const makeSuccessBody = async (invoice: {
    sourceId: string;
    documentId: string;
    transactionType?: string;
    partyBusinessType: string;
    invoiceType: string;
    status: string;
    uuid: string;
    qrPayload?: string;
}): Promise<Record<string, unknown>> => ({
    success: true,
    data: {
        sourceId: invoice.sourceId,
        documentId: invoice.documentId,
        transactionType: invoice.transactionType ?? "SALE",
        partyBusinessType: invoice.partyBusinessType,
        invoiceType: invoice.invoiceType,
        status: invoice.status,
        uuid: invoice.uuid,
        qrAvailable: Boolean(invoice.qrPayload),
        qrCode: invoice.qrPayload ? await createZatcaQrDataUrl(invoice.qrPayload) : undefined,
    },
});

const toErrorResponse = (error: unknown): ZatcaServiceResponse => {
    if (error instanceof ZodError) {
        return {
            statusCode: 400,
            body: { success: false, error: { code: "VALIDATION_ERROR", message: "ZATCA sale invoice validation failed", details: error.issues } },
        };
    }
    if (error instanceof ZatcaInvoiceTotalsMismatchError) {
        return { statusCode: 422, body: { success: false, error: { code: error.code, message: error.message } } };
    }
    if (error instanceof ZatcaConfigurationError) {
        return { statusCode: 500, body: { success: false, error: { code: error.code, message: "ZATCA SDK is not configured" } } };
    }
    if (error instanceof ZatcaSdkError) {
        return {
            statusCode: error.code === "ZATCA_SDK_TIMEOUT" ? 504 : 422,
            body: { success: false, error: { code: error.code, message: error.message } },
        };
    }
    if (error instanceof ZatcaProcessingError) {
        return { statusCode: error.statusCode, body: { success: false, error: { code: error.code, message: error.message } } };
    }
    return { statusCode: 500, body: { success: false, error: { code: "ZATCA_SDK_EXECUTION_ERROR", message: "Failed to process ZATCA sale invoice" } } };
};

const findExistingInvoice = async (invoice: ZatcaSaleInvoiceRequest) =>
    ZatcaInvoiceModel.findOne({ sellerVatNumber: invoice.seller.vatNumber, sourceType: invoice.sourceType, documentId: invoice.documentId });

const createProcessingDirectory = async (sellerVatNumber: string): Promise<string> => {
    const config = getZatcaConfig();
    const safeVatNumber = sellerVatNumber.replace(/[^A-Za-z0-9_-]/g, "_");
    const vatRoot = path.join(config.tempDir, safeVatNumber);
    await mkdir(vatRoot, { recursive: true });
    return mkdtemp(path.join(vatRoot, "invoice-"));
};

const markFailed = async (invoiceId: string, status: string, code: string): Promise<void> => {
    await ZatcaInvoiceModel.updateOne(
        { _id: invoiceId },
        { $set: { status, errorStage: code, errorMessage: "ZATCA sale invoice processing failed" } },
    );
};

export const createZatcaSaleInvoice = async (payload: unknown): Promise<ZatcaServiceResponse> => {
    let invoiceRecord: InstanceType<typeof ZatcaInvoiceModel> | null = null;
    let stateToken: string | undefined;
    let stateCommitted = false;
    let tempDirectory: string | undefined;
    let failureRecorded = false;

    try {
        const invoice = zatcaSaleInvoiceSchema.parse(payload);
        if (invoice.partyBusinessType === "B2B") {
            return { statusCode: 400, body: { success: false, message: "B2B ZATCA Clearance flow is not implemented yet" } };
        }

        validateZatcaInvoiceTotals(invoice);
        getZatcaConfig();

        const existing = await findExistingInvoice(invoice);
        if (existing?.status === ZATCA_INVOICE_STATUS.QR_GENERATED && existing.qrPayload) {
            return { statusCode: 200, body: await makeSuccessBody(existing) };
        }
        if (existing) {
            return {
                statusCode: 409,
                body: { success: false, error: { code: "ZATCA_INVOICE_ALREADY_PROCESSING", message: "A ZATCA invoice already exists for this ERP document" } },
            };
        }

        try {
            invoiceRecord = await ZatcaInvoiceModel.create({
                sourceSystem: "ERP",
                sourceType: invoice.sourceType,
                sourceId: invoice.sourceId,
                transactionType: invoice.transactionType,
                sellerVatNumber: invoice.seller.vatNumber,
                documentId: invoice.documentId,
                partyBusinessType: invoice.partyBusinessType,
                invoiceType: ZATCA_INVOICE_TYPE.SIMPLIFIED,
                uuid: randomUUID(),
                icv: 0,
                previousInvoiceHash: "PENDING",
                status: ZATCA_INVOICE_STATUS.PENDING,
            });
        } catch (error) {
            if (!(error instanceof Error) || !("code" in error) || (error as Error & { code?: number }).code !== 11000) throw error;
            const racedInvoice = await findExistingInvoice(invoice);
            if (racedInvoice?.status === ZATCA_INVOICE_STATUS.QR_GENERATED && racedInvoice.qrPayload) {
                return { statusCode: 200, body: await makeSuccessBody(racedInvoice) };
            }
            return {
                statusCode: 409,
                body: { success: false, error: { code: "ZATCA_INVOICE_ALREADY_PROCESSING", message: "A ZATCA invoice already exists for this ERP document" } },
            };
        }

        console.log(`[ZATCA] Processing B2C ${invoice.transactionType === "CREDIT_NOTE" ? "credit note" : "sale"} ${invoice.documentId}`);
        const state = await reserveZatcaInvoiceState(invoice.seller.vatNumber);
        stateToken = state.token;
        console.log("[ZATCA] ICV reserved");
        console.log("[ZATCA] PIH loaded");

        invoiceRecord.icv = state.icv;
        invoiceRecord.previousInvoiceHash = state.previousInvoiceHash;
        await invoiceRecord.save();
        console.log("[ZATCA] UUID generated");

        const unsignedXml = createSimplifiedInvoiceXml(invoice, {
            uuid: invoiceRecord.uuid,
            icv: state.icv,
            previousInvoiceHash: state.previousInvoiceHash,
        });
        tempDirectory = await createProcessingDirectory(invoice.seller.vatNumber);
        const inputXmlPath = path.join(tempDirectory, "invoice.xml");
        const signedXmlPath = path.join(tempDirectory, "signed-invoice.xml");
        const invoiceSdkConfigPath = await createInvoiceSdkConfig(tempDirectory, state.previousInvoiceHash);
        await writeFile(inputXmlPath, unsignedXml, "utf8");
        invoiceRecord.status = ZATCA_INVOICE_STATUS.XML_GENERATED;
        await invoiceRecord.save();
        console.log(`[ZATCA] Simplified ${invoice.transactionType === "CREDIT_NOTE" ? "credit-note" : "sale"} UBL XML generated`);

        try {
            await signInvoice(inputXmlPath, signedXmlPath, invoiceSdkConfigPath);
        } catch (error) {
            await markFailed(invoiceRecord._id.toString(), ZATCA_INVOICE_STATUS.SIGNING_FAILED, error instanceof ZatcaSdkError ? error.code : "ZATCA_SIGNING_FAILED");
            failureRecorded = true;
            throw error;
        }
        console.log("[ZATCA] Invoice signing completed");
        const signedXmlWithoutQr = await readFile(signedXmlPath, "utf8");
        try {
            // This SDK validates the XML signature as part of -validate, so the
            // document must be signed before its full XSD/EN/KSA validation.
            await validateInvoice(signedXmlPath, invoiceSdkConfigPath);
        } catch (error) {
            await markFailed(invoiceRecord._id.toString(), ZATCA_INVOICE_STATUS.VALIDATION_FAILED, error instanceof ZatcaSdkError ? error.code : "ZATCA_VALIDATION_FAILED");
            failureRecorded = true;
            throw error;
        }
        invoiceRecord.status = ZATCA_INVOICE_STATUS.VALIDATED;
        await invoiceRecord.save();
        console.log("[ZATCA] SDK validation PASSED");
        let signedXml: string;
        try {
            const sdkQrPayload = await generateQrPayload(signedXmlPath, invoiceSdkConfigPath);
            signedXml = insertZatcaQrPayload(signedXmlWithoutQr, sdkQrPayload);
            await writeFile(signedXmlPath, signedXml, "utf8");
        } catch (error) {
            await markFailed(invoiceRecord._id.toString(), ZATCA_INVOICE_STATUS.QR_EXTRACTION_FAILED, error instanceof ZatcaSdkError ? error.code : "ZATCA_QR_EXTRACTION_FAILED");
            failureRecorded = true;
            throw error;
        }
        invoiceRecord.status = ZATCA_INVOICE_STATUS.SIGNED;
        invoiceRecord.signedXml = signedXml;
        await invoiceRecord.save();

        const qrPayload = extractZatcaQrPayload(signedXml);
        if (!qrPayload) {
            await markFailed(invoiceRecord._id.toString(), ZATCA_INVOICE_STATUS.QR_EXTRACTION_FAILED, "ZATCA_QR_EXTRACTION_FAILED");
            failureRecorded = true;
            throw new ZatcaProcessingError("ZATCA_QR_EXTRACTION_FAILED", "ZATCA SDK signed invoice did not contain a QR payload", 422);
        }
        const invoiceHash = extractZatcaInvoiceHash(signedXml);
        if (!invoiceHash) {
            await markFailed(invoiceRecord._id.toString(), ZATCA_INVOICE_STATUS.FAILED, "ZATCA_SIGNING_FAILED");
            failureRecorded = true;
            throw new ZatcaProcessingError("ZATCA_SIGNING_FAILED", "ZATCA SDK signed invoice did not contain an invoice hash", 422);
        }

        invoiceRecord.qrPayload = qrPayload;
        invoiceRecord.invoiceHash = invoiceHash;
        // Persist the SDK output before moving the EGS chain. If the chain
        // commit fails this record remains non-final and cannot be returned as
        // a valid QR result.
        invoiceRecord.status = ZATCA_INVOICE_STATUS.SIGNED;
        await invoiceRecord.save();
        await commitZatcaInvoiceState(invoice.seller.vatNumber, state.token, invoiceHash);
        stateCommitted = true;
        invoiceRecord.status = ZATCA_INVOICE_STATUS.QR_GENERATED;
        invoiceRecord.errorStage = undefined;
        invoiceRecord.errorMessage = undefined;
        await invoiceRecord.save();
        console.log("[ZATCA] QR generated");
        console.log("[ZATCA] QR payload extracted");
        console.log(`[ZATCA] ${invoice.transactionType === "CREDIT_NOTE" ? "Credit note" : "Sale invoice"} QR processing completed`);

        return { statusCode: 200, body: await makeSuccessBody(invoiceRecord) };
    } catch (error) {
        console.error("[ZATCA] Sale invoice processing failed", {
            code: error instanceof ZatcaSdkError
                ? error.code
                : error instanceof ZatcaConfigurationError
                    ? error.code
                    : error instanceof ZatcaProcessingError
                        ? error.code
                        : "ZATCA_SDK_EXECUTION_ERROR",
            message: error instanceof Error ? error.message : "Unknown processing error",
        });
        if (invoiceRecord && !failureRecorded && invoiceRecord.status !== ZATCA_INVOICE_STATUS.QR_GENERATED) {
            const sdkCode = error instanceof ZatcaSdkError ? error.code : error instanceof ZatcaProcessingError ? error.code : "ZATCA_SDK_EXECUTION_ERROR";
            await markFailed(invoiceRecord._id.toString(), ZATCA_INVOICE_STATUS.FAILED, sdkCode);
        }
        return toErrorResponse(error);
    } finally {
        if (stateToken && invoiceRecord && !stateCommitted) {
            await releaseZatcaInvoiceState(invoiceRecord.sellerVatNumber, stateToken);
        }
        if (tempDirectory) {
            await rm(tempDirectory, { recursive: true, force: true });
        }
    }
};

export const getZatcaSaleInvoiceQr = async (documentId: string, sellerVatNumber: string): Promise<{ statusCode: number; body?: Record<string, unknown>; png?: Buffer }> => {
    if (!sellerVatNumber.trim()) {
        return { statusCode: 400, body: { success: false, error: { code: "SELLER_VAT_NUMBER_REQUIRED", message: "sellerVatNumber is required" } } };
    }
    const invoice = await ZatcaInvoiceModel.findOne({ sellerVatNumber, sourceType: "SALE", documentId }).lean();
    if (!invoice?.qrPayload) {
        return { statusCode: 404, body: { success: false, error: { code: "ZATCA_QR_NOT_FOUND", message: "ZATCA QR was not found for this Sale" } } };
    }
    return { statusCode: 200, png: await createZatcaQrPng(invoice.qrPayload) };
};
