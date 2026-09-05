import path from "node:path";
import { env } from "./env.js";

export interface ZatcaConfig {
    sdkRoot: string;
    fatooraHome: string;
    sdkConfig: string;
    executable: string;
    javaHome?: string;
    tempDir: string;
    initialPih?: string;
    registrationScheme: string;
    timeoutMs: number;
}

export class ZatcaConfigurationError extends Error {
    public readonly code = "ZATCA_CONFIGURATION_ERROR";

    constructor(message: string) {
        super(message);
        this.name = "ZatcaConfigurationError";
    }
}

/** Resolve paths at runtime so a deployment can move the SDK without code changes. */
export const getZatcaConfig = (): ZatcaConfig => {
    const sdkRoot = env.ZATCA_SDK_ROOT ? path.resolve(env.ZATCA_SDK_ROOT) : undefined;

    if (!sdkRoot && !env.ZATCA_FATOORA_HOME && !env.ZATCA_FATOORA_EXECUTABLE) {
        throw new ZatcaConfigurationError("ZATCA SDK configuration is not available");
    }

    const fatooraHome = env.ZATCA_FATOORA_HOME
        ? path.resolve(env.ZATCA_FATOORA_HOME)
        : (sdkRoot ? path.join(sdkRoot, "Apps") : undefined);
    const executable = env.ZATCA_FATOORA_EXECUTABLE
        ? path.resolve(env.ZATCA_FATOORA_EXECUTABLE)
        : (fatooraHome ? path.join(fatooraHome, "fatoora") : undefined);
    const sdkConfig = env.ZATCA_SDK_CONFIG
        ? path.resolve(env.ZATCA_SDK_CONFIG)
        : (sdkRoot ? path.join(sdkRoot, "Configuration", "config.json") : undefined);

    if (!fatooraHome || !executable || !sdkConfig) {
        throw new ZatcaConfigurationError(
            "Set ZATCA_SDK_ROOT or set ZATCA_FATOORA_HOME, ZATCA_FATOORA_EXECUTABLE, and ZATCA_SDK_CONFIG",
        );
    }
    if (!env.ZATCA_REGISTRATION_SCHEME) {
        throw new ZatcaConfigurationError("ZATCA_REGISTRATION_SCHEME is required");
    }

    return {
        sdkRoot: sdkRoot ?? path.dirname(path.dirname(fatooraHome)),
        fatooraHome,
        executable,
        sdkConfig,
        javaHome: env.ZATCA_JAVA_HOME ? path.resolve(env.ZATCA_JAVA_HOME) : undefined,
        tempDir: path.resolve(env.ZATCA_TEMP_DIR ?? path.join("/tmp", "zatca")),
        initialPih: env.ZATCA_INITIAL_PIH,
        registrationScheme: env.ZATCA_REGISTRATION_SCHEME,
        timeoutMs: env.ZATCA_SDK_TIMEOUT_MS,
    };
};
