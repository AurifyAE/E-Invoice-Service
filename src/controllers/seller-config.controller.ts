import type { Request, Response } from "express";
import {
    createSellerConfig,
    getSellerConfig,
    updateSellerConfig,
} from "../services/seller-config/seller-config.service.js";

const getOrganizationId = (req: Request): string => {
    const organizationId = req.query.organizationId ?? req.query.OrganizationId;
    return typeof organizationId === "string" ? organizationId : "";
};

export const createSellerConfigHandler = async (req: Request, res: Response) => {
    const result = await createSellerConfig(req.body);
    return res.status(result.statusCode).json(result.body);
};

export const getSellerConfigHandler = async (req: Request, res: Response) => {
    const result = await getSellerConfig(String(req.params.sellerVatTrn), getOrganizationId(req));
    return res.status(result.statusCode).json(result.body);
};

export const updateSellerConfigHandler = async (req: Request, res: Response) => {
    const result = await updateSellerConfig(String(req.params.sellerVatTrn), getOrganizationId(req), req.body);
    return res.status(result.statusCode).json(result.body);
};
