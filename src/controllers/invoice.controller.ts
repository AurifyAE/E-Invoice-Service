import type { Request, Response } from "express";
import {
    createInvoiceSubmission,
    getInvoiceEntry,
    getInvoiceStatusTimeline,
} from "../services/invoice/invoice.service.js";

export const submitInvoice = async (req: Request, res: Response) => {
    const result = await createInvoiceSubmission(req.body);
    return res.status(result.statusCode).json(result.body);
};

export const getInvoice = async (req: Request, res: Response) => {
    const result = await getInvoiceEntry(String(req.params.entryId));
    return res.status(result.statusCode).json(result.body);
};

export const getInvoiceTimeline = async (req: Request, res: Response) => {
    const result = await getInvoiceStatusTimeline(String(req.params.entryId));
    return res.status(result.statusCode).json(result.body);
};
