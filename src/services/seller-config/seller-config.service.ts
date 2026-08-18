import { ZodError } from "zod";
import { SellerConfigModel } from "../../models/seller-config.model.js";
import {
    createSellerConfigSchema,
    sellerVatTrnParamSchema,
    updateSellerConfigSchema,
} from "../../schemas/seller-config.schema.js";

export interface SellerConfigServiceResponse {
    statusCode: number;
    body: Record<string, unknown>;
}

const getValidationErrorResponse = (error: ZodError): SellerConfigServiceResponse => ({
    statusCode: 400,
    body: {
        success: false,
        error: {
            code: "VALIDATION_ERROR",
            message: "Seller configuration validation failed",
            details: error.issues,
        },
    },
});

const getDuplicateFieldNames = (config: {
    sellerVatTrn: number;
    companyId: number;
    participantId: string;
}, payload: {
    sellerVatTrn?: number;
    companyId?: number;
    participantId?: string;
}): string[] => {
    const fields: string[] = [];

    if (payload.sellerVatTrn !== undefined && config.sellerVatTrn === payload.sellerVatTrn) {
        fields.push("sellerVatTrn");
    }

    if (payload.companyId !== undefined && config.companyId === payload.companyId) {
        fields.push("companyId");
    }

    if (payload.participantId !== undefined && config.participantId === payload.participantId) {
        fields.push("participantId");
    }

    return fields;
};

const getDuplicateErrorResponse = (fields: string[]): SellerConfigServiceResponse => ({
    statusCode: 409,
    body: {
        success: false,
        error: {
            code: "SELLER_CONFIG_ALREADY_EXISTS",
            message: `Seller configuration already exists for ${fields.join(", ")}`,
            fields,
        },
    },
});

export const createSellerConfig = async (payload: unknown): Promise<SellerConfigServiceResponse> => {
    try {
        const parsedPayload = createSellerConfigSchema.parse(payload);
        const existingConfig = await SellerConfigModel.findOne({
            $or: [
                { sellerVatTrn: parsedPayload.sellerVatTrn },
                { companyId: parsedPayload.companyId },
                { participantId: parsedPayload.participantId },
            ],
        }).lean();

        if (existingConfig) {
            return getDuplicateErrorResponse(getDuplicateFieldNames(existingConfig, parsedPayload));
        }

        const sellerConfig = await SellerConfigModel.create(parsedPayload);

        return {
            statusCode: 200,
            body: {
                success: true,
                message: "Seller configuration created successfully",
                data: sellerConfig,
            },
        };
    } catch (error) {
        if (error instanceof ZodError) {
            return getValidationErrorResponse(error);
        }

        return {
            statusCode: 500,
            body: {
                success: false,
                error: {
                    code: "SELLER_CONFIG_CREATE_FAILED",
                    message: error instanceof Error ? error.message : "Failed to create seller configuration",
                },
            },
        };
    }
};

export const getSellerConfig = async (sellerVatTrn: string): Promise<SellerConfigServiceResponse> => {
    try {
        const parsedSellerVatTrn = sellerVatTrnParamSchema.parse(sellerVatTrn);
        const sellerConfig = await SellerConfigModel.findOne({ sellerVatTrn: parsedSellerVatTrn }).lean();

        if (!sellerConfig) {
            return {
                statusCode: 404,
                body: {
                    success: false,
                    error: {
                        code: "SELLER_CONFIG_NOT_FOUND",
                        message: "Seller configuration was not found",
                    },
                },
            };
        }

        return {
            statusCode: 200,
            body: {
                success: true,
                data: sellerConfig,
            },
        };
    } catch (error) {
        if (error instanceof ZodError) {
            return getValidationErrorResponse(error);
        }

        return {
            statusCode: 500,
            body: {
                success: false,
                error: {
                    code: "SELLER_CONFIG_FETCH_FAILED",
                    message: error instanceof Error ? error.message : "Failed to fetch seller configuration",
                },
            },
        };
    }
};

export const updateSellerConfig = async (
    sellerVatTrn: string,
    payload: unknown,
): Promise<SellerConfigServiceResponse> => {
    try {
        const parsedSellerVatTrn = sellerVatTrnParamSchema.parse(sellerVatTrn);
        const parsedPayload = updateSellerConfigSchema.parse(payload);
        const sellerConfig = await SellerConfigModel.findOne({ sellerVatTrn: parsedSellerVatTrn });

        if (!sellerConfig) {
            return {
                statusCode: 404,
                body: {
                    success: false,
                    error: {
                        code: "SELLER_CONFIG_NOT_FOUND",
                        message: "Seller configuration was not found",
                    },
                },
            };
        }

        const duplicateFilters: Array<{ companyId?: number; participantId?: string }> = [];

        if (parsedPayload.companyId !== undefined) {
            duplicateFilters.push({ companyId: parsedPayload.companyId });
        }

        if (parsedPayload.participantId !== undefined) {
            duplicateFilters.push({ participantId: parsedPayload.participantId });
        }

        if (duplicateFilters.length > 0) {
            const duplicateConfig = await SellerConfigModel.findOne({
                _id: { $ne: sellerConfig._id },
                $or: duplicateFilters,
            }).lean();

            if (duplicateConfig) {
                return getDuplicateErrorResponse(getDuplicateFieldNames(duplicateConfig, parsedPayload));
            }
        }

        if (parsedPayload.companyId !== undefined) {
            sellerConfig.companyId = parsedPayload.companyId;
        }

        if (parsedPayload.participantId !== undefined) {
            sellerConfig.participantId = parsedPayload.participantId;
        }

        await sellerConfig.save();

        return {
            statusCode: 200,
            body: {
                success: true,
                message: "Seller configuration updated successfully",
                data: sellerConfig,
            },
        };
    } catch (error) {
        if (error instanceof ZodError) {
            return getValidationErrorResponse(error);
        }

        return {
            statusCode: 500,
            body: {
                success: false,
                error: {
                    code: "SELLER_CONFIG_UPDATE_FAILED",
                    message: error instanceof Error ? error.message : "Failed to update seller configuration",
                },
            },
        };
    }
};
