import type { Request, Response } from "express";
import { createInvoiceSubmission } from "../services/invoice/invoice.service.js";

export const submitInvoice = async (req: Request, res: Response) => {
    const result = await createInvoiceSubmission(req.body);
    return res.status(result.statusCode).json(result.body);
};
