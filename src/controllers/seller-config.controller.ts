import type { Request, Response } from "express";
import {
    createSellerConfig,
    getSellerConfig,
    updateSellerConfig,
} from "../services/seller-config/seller-config.service.js";

export const createSellerConfigHandler = async (req: Request, res: Response) => {
    const result = await createSellerConfig(req.body);
    return res.status(result.statusCode).json(result.body);
};

export const getSellerConfigHandler = async (req: Request, res: Response) => {
    const result = await getSellerConfig(String(req.params.sellerVatTrn));
    return res.status(result.statusCode).json(result.body);
};

export const updateSellerConfigHandler = async (req: Request, res: Response) => {
    const result = await updateSellerConfig(String(req.params.sellerVatTrn), req.body);
    return res.status(result.statusCode).json(result.body);
};
