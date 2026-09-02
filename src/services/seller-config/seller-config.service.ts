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

const getDuplicateSellerVatTrnErrorResponse = (): SellerConfigServiceResponse => ({
    statusCode: 409,
    body: {
        success: false,
        error: {
            code: "SELLER_CONFIG_ALREADY_EXISTS",
            message: "Seller configuration already exists for sellerVatTrn",
            fields: ["sellerVatTrn"],
        },
    },
});

export const createSellerConfig = async (payload: unknown): Promise<SellerConfigServiceResponse> => {
    try {
        const parsedPayload = createSellerConfigSchema.parse(payload);
        const existingConfig = await SellerConfigModel.findOne({
            sellerVatTrn: parsedPayload.sellerVatTrn,
        }).lean();

        if (existingConfig) {
            return getDuplicateSellerVatTrnErrorResponse();
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
