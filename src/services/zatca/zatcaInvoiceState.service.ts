import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { getZatcaConfig } from "../../config/zatca.config.js";
import { ZatcaEgsStateModel } from "../../models/zatca-egs-state.model.js";

const EGS_ID = "DEFAULT";
const LOCK_LEASE_MS = 5 * 60 * 1_000;
const LOCK_WAIT_MS = 60_000;
const RETRY_DELAY_MS = 100;

export interface ReservedZatcaState {
    token: string;
    icv: number;
    previousInvoiceHash: string;
}

const pause = async (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds));

const loadInitialPih = async (): Promise<string> => {
    const config = getZatcaConfig();
    if (config.initialPih) {
        return config.initialPih.trim();
    }

    try {
        const sdkConfig = JSON.parse(await readFile(config.sdkConfig, "utf8")) as { pihPath?: unknown };
        if (typeof sdkConfig.pihPath !== "string" || !sdkConfig.pihPath.trim()) {
            throw new Error("SDK pihPath is not configured");
        }

        // SDK config paths are conventionally relative to Apps/, because that
        // is where fatoora runs. Resolve them the same way in Node.
        const pihPath = path.isAbsolute(sdkConfig.pihPath)
            ? sdkConfig.pihPath
            : path.resolve(config.fatooraHome, sdkConfig.pihPath);
        const pih = (await readFile(pihPath, "utf8")).trim();
        if (!pih) {
            throw new Error("SDK PIH file is empty");
        }

        return pih;
    } catch (error) {
        throw new Error(`Unable to load the initial ZATCA PIH: ${error instanceof Error ? error.message : "unknown error"}`);
    }
};

/**
 * Serializes signing per seller VAT / EGS across Node processes. ICV is intentionally
 * reserved atomically before SDK work. The PIH chain is committed only after a
 * signed invoice and its SDK QR have both been persisted successfully.
 */
export const reserveZatcaInvoiceState = async (
    sellerVatNumber: string,
): Promise<ReservedZatcaState> => {
    const initialPih = await loadInitialPih();
    const token = randomUUID();
    const waitUntil = Date.now() + LOCK_WAIT_MS;

    while (Date.now() < waitUntil) {
        const leaseCutoff = new Date(Date.now() - LOCK_LEASE_MS);
        try {
            const state = await ZatcaEgsStateModel.findOneAndUpdate(
                {
                    sellerVatNumber,
                    egsId: EGS_ID,
                    $or: [
                        { processingToken: { $exists: false } },
                        { processingStartedAt: { $lt: leaseCutoff } },
                    ],
                },
                {
                    $setOnInsert: {
                        sellerVatNumber,
                        egsId: EGS_ID,
                        previousInvoiceHash: initialPih,
                    },
                    $set: {
                        processingToken: token,
                        processingStartedAt: new Date(),
                    },
                    $inc: { currentIcv: 1 },
                },
                { returnDocument: "after", upsert: true, runValidators: true },
            );

            return {
                token,
                icv: state.currentIcv,
                previousInvoiceHash: state.previousInvoiceHash,
            };
        } catch (error) {
            // A concurrent initial upsert may hit the unique index; retry the
            // normal locked-document path rather than issuing another ICV.
            if (!(error instanceof Error) || !("code" in error) || (error as Error & { code?: number }).code !== 11000) {
                throw error;
            }
        }

        await pause(RETRY_DELAY_MS);
    }

    throw new Error("Timed out waiting for the ZATCA EGS signing lock");
};

export const commitZatcaInvoiceState = async (
    sellerVatNumber: string,
    token: string,
    invoiceHash: string,
): Promise<void> => {
    const result = await ZatcaEgsStateModel.updateOne(
        { sellerVatNumber, egsId: EGS_ID, processingToken: token },
        {
            $set: { previousInvoiceHash: invoiceHash },
            $unset: { processingToken: 1, processingStartedAt: 1 },
        },
    );

    if (result.modifiedCount !== 1) {
        throw new Error("ZATCA EGS state lock was lost before the PIH chain could be committed");
    }
};

export const releaseZatcaInvoiceState = async (
    sellerVatNumber: string,
    token: string,
): Promise<void> => {
    await ZatcaEgsStateModel.updateOne(
        { sellerVatNumber, egsId: EGS_ID, processingToken: token },
        { $unset: { processingToken: 1, processingStartedAt: 1 } },
    );
};
