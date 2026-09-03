import type { Request, Response } from "express";
import {
    createInvoiceSubmission,
    getInvoiceDashboard,
    getInvoiceEntry,
    getInvoiceStatusTimeline,
} from "../services/invoice/invoice.service.js";
import type { AigentrixRequestOptions } from "../services/aigentrix/aigentrix.service.js";

const getAigentrixRequestOptions = (req: Request): AigentrixRequestOptions => ({
    apiKey: req.get("X-API-KEY")?.trim() || undefined,
});

const getOrganizationId = (req: Request): string => {
    const organizationId = req.query.organizationId ?? req.query.OrganizationId;
    return typeof organizationId === "string" ? organizationId : "";
};

export const submitInvoice = async (req: Request, res: Response) => {
    const result = await createInvoiceSubmission(req.body, getAigentrixRequestOptions(req));
    return res.status(result.statusCode).json(result.body);
};

export const getInvoice = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const result = await getInvoiceEntry(
        String(req.params.entryId),
        vatTrn,
        getOrganizationId(req),
        getAigentrixRequestOptions(req),
    );
    return res.status(result.statusCode).json(result.body);
};

export const getDashboard = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const result = await getInvoiceDashboard(vatTrn, getOrganizationId(req));
    return res.status(result.statusCode).json(result.body);
};

export const getInvoiceTimeline = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const result = await getInvoiceStatusTimeline(
        String(req.params.entryId),
        vatTrn,
        getOrganizationId(req),
        getAigentrixRequestOptions(req),
    );
    return res.status(result.statusCode).json(result.body);
};
