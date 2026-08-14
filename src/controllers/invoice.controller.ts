import type { Request, Response } from "express";
import {
    createInvoiceSubmission,
    getInvoiceDashboard,
    getInvoiceEntry,
    getInvoiceStatusTimeline,
} from "../services/invoice/invoice.service.js";

export const submitInvoice = async (req: Request, res: Response) => {
    const result = await createInvoiceSubmission(req.body);
    return res.status(result.statusCode).json(result.body);
};

export const getInvoice = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const result = await getInvoiceEntry(String(req.params.entryId), vatTrn);
    return res.status(result.statusCode).json(result.body);
};

export const getDashboard = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const result = await getInvoiceDashboard(vatTrn);
    return res.status(result.statusCode).json(result.body);
};

export const getInvoiceTimeline = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const result = await getInvoiceStatusTimeline(String(req.params.entryId), vatTrn);
    return res.status(result.statusCode).json(result.body);
};
