import { access, readFile, writeFile } from "node:fs/promises";
import { constants } from "node:fs";
import { execFile as execFileCallback } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { getZatcaConfig, ZatcaConfigurationError } from "../../config/zatca.config.js";
import type { ZatcaSdkResult } from "../../types/zatca/zatcaSaleInvoice.types.js";

const execFile = promisify(execFileCallback);
const MAX_BUFFER = 10 * 1024 * 1024;

export class ZatcaSdkError extends Error {
    constructor(
        public readonly code: "ZATCA_VALIDATION_FAILED" | "ZATCA_SIGNING_FAILED" | "ZATCA_QR_EXTRACTION_FAILED" | "ZATCA_SDK_TIMEOUT" | "ZATCA_SDK_EXECUTION_ERROR",
        message: string,
        public readonly stdout?: string,
        public readonly stderr?: string,
    ) {
        super(message);
        this.name = "ZatcaSdkError";
    }
}

const getSubprocessEnvironment = (sdkConfigPath?: string): NodeJS.ProcessEnv => {
    const config = getZatcaConfig();
    const javaBin = config.javaHome ? path.join(config.javaHome, "bin") : undefined;
    return {
        ...process.env,
        FATOORA_HOME: config.fatooraHome,
        SDK_CONFIG: sdkConfigPath ?? config.sdkConfig,
        ...(config.javaHome ? { JAVA_HOME: config.javaHome } : {}),
        ...(javaBin ? { PATH: `${javaBin}${path.delimiter}${process.env.PATH ?? ""}` } : {}),
    };
};

const assertSdkAvailable = async (sdkConfigPath?: string): Promise<void> => {
    const config = getZatcaConfig();
    try {
        await Promise.all([
            access(config.executable, constants.X_OK),
            access(sdkConfigPath ?? config.sdkConfig, constants.R_OK),
        ]);
    } catch {
        throw new ZatcaConfigurationError("ZATCA executable or SDK configuration file is unavailable");
    }
};

const run = async (
    args: string[],
    failureCode: "ZATCA_VALIDATION_FAILED" | "ZATCA_SIGNING_FAILED" | "ZATCA_QR_EXTRACTION_FAILED",
    sdkConfigPath?: string,
): Promise<ZatcaSdkResult> => {
    await assertSdkAvailable(sdkConfigPath);
    const config = getZatcaConfig();

    try {
        const result = await execFile(config.executable, args, {
            cwd: config.fatooraHome,
            env: getSubprocessEnvironment(sdkConfigPath),
            timeout: config.timeoutMs,
            maxBuffer: MAX_BUFFER,
            windowsHide: true,
        });
        return { stdout: result.stdout, stderr: result.stderr };
    } catch (error) {
        const executableError = error as Error & {
            code?: string;
            killed?: boolean;
            signal?: string;
            stdout?: string;
            stderr?: string;
        };
        const timedOut = executableError.killed || executableError.signal === "SIGTERM" || executableError.code === "ETIMEDOUT";
        const code = timedOut ? "ZATCA_SDK_TIMEOUT" : failureCode;
        throw new ZatcaSdkError(
            code,
            timedOut ? "ZATCA SDK timed out" : "ZATCA SDK command failed",
            executableError.stdout,
            executableError.stderr,
        );
    }
};

export const validateInvoice = async (xmlPath: string, sdkConfigPath?: string): Promise<ZatcaSdkResult> => {
    const result = await run(["-validate", "-invoice", xmlPath], "ZATCA_VALIDATION_FAILED", sdkConfigPath);
    // The SDK may report validation failure in its output while returning an
    // operating-system success exit status, so exit code alone is unsafe.
    const output = `${result.stdout}\n${result.stderr}`;
    if (!/GLOBAL VALIDATION RESULT\s*=\s*PASSED/i.test(output)) {
        throw new ZatcaSdkError("ZATCA_VALIDATION_FAILED", "ZATCA SDK invoice validation failed", result.stdout, result.stderr);
    }
    return result;
};

export const signInvoice = async (inputXmlPath: string, signedXmlPath: string, sdkConfigPath?: string): Promise<ZatcaSdkResult> => {
    const result = await run(["-sign", "-invoice", inputXmlPath, "-signedInvoice", signedXmlPath], "ZATCA_SIGNING_FAILED", sdkConfigPath);
    try {
        await access(signedXmlPath, constants.R_OK);
    } catch {
        throw new ZatcaSdkError("ZATCA_SIGNING_FAILED", "ZATCA SDK completed without creating a signed invoice");
    }
    return result;
};

/** The R3.4.8 SDK prints the QR payload; it does not modify the invoice file. */
export const generateQrPayload = async (signedXmlPath: string, sdkConfigPath?: string): Promise<string> => {
    const result = await run(["-qr", "-invoice", signedXmlPath], "ZATCA_QR_EXTRACTION_FAILED", sdkConfigPath);
    const payload = `${result.stdout}\n${result.stderr}`.match(/\bQR code\s*=\s*([A-Za-z0-9+/=]+)/i)?.[1];
    if (!payload) {
        throw new ZatcaSdkError("ZATCA_QR_EXTRACTION_FAILED", "ZATCA SDK completed without returning a QR payload", result.stdout, result.stderr);
    }
    return payload;
};

/**
 * The SDK validator reads PIH from SDK_CONFIG rather than only from XML.
 * Build an isolated config per invoice so concurrent EGS chains never rewrite
 * the shared SDK configuration or its default PIH file.
 */
export const createInvoiceSdkConfig = async (
    processingDirectory: string,
    previousInvoiceHash: string,
): Promise<string> => {
    const config = getZatcaConfig();
    const source = JSON.parse(await readFile(config.sdkConfig, "utf8")) as Record<string, unknown>;
    const pathKeys = ["xsdPath", "enSchematron", "zatcaSchematron", "certPath", "privateKeyPath", "inputPath", "usagePathFile"];
    const invoiceConfig: Record<string, unknown> = { ...source };

    for (const key of pathKeys) {
        const value = invoiceConfig[key];
        if (typeof value === "string" && !path.isAbsolute(value)) {
            invoiceConfig[key] = path.resolve(config.fatooraHome, value);
        }
    }

    const pihPath = path.join(processingDirectory, "pih.txt");
    const invoiceConfigPath = path.join(processingDirectory, "sdk-config.json");
    await writeFile(pihPath, previousInvoiceHash, "utf8");
    invoiceConfig.pihPath = pihPath;
    await writeFile(invoiceConfigPath, JSON.stringify(invoiceConfig), "utf8");
    return invoiceConfigPath;
};
