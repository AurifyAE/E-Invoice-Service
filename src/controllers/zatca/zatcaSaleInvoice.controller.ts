import type { Request, Response } from "express";
import { createZatcaSaleInvoice, getZatcaSaleInvoiceQr } from "../../services/zatca/zatcaSaleInvoice.service.js";

export const createZatcaSaleInvoiceHandler = async (req: Request, res: Response) => {
    const result = await createZatcaSaleInvoice(req.body);
    return res.status(result.statusCode).json(result.body);
};

export const getZatcaSaleInvoiceQrHandler = async (req: Request, res: Response) => {
    const sellerVatNumber = typeof req.query.sellerVatNumber === "string" ? req.query.sellerVatNumber : "";
    const result = await getZatcaSaleInvoiceQr(String(req.params.documentId), sellerVatNumber);
    if (result.png) {
        return res.status(200).type("png").send(result.png);
    }
    return res.status(result.statusCode).json(result.body);
};
