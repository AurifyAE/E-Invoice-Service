import type { Request, Response } from "express";
import {
    createInvoiceSubmission,
    getInboundInvoices,
    getInvoiceDashboard,
    getInvoiceEntry,
    getInvoiceStatusTimeline,
} from "../services/invoice/invoice.service.js";

const getOrganizationId = (req: Request): string => {
    const organizationId = req.query.organizationId ?? req.query.OrganizationId;
    return typeof organizationId === "string" ? organizationId : "";
};

export const submitInvoice = async (req: Request, res: Response) => {
    const result = await createInvoiceSubmission(req.body);
    return res.status(result.statusCode).json(result.body);
};

export const getInvoice = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const result = await getInvoiceEntry(
        String(req.params.entryId),
        vatTrn,
        getOrganizationId(req),
    );
    return res.status(result.statusCode).json(result.body);
};

export const getDashboard = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : "";
    const result = await getInvoiceDashboard(vatTrn, getOrganizationId(req), startDate);
    return res.status(result.statusCode).json(result.body);
};

export const getInbound = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const startDate = typeof req.query.startDate === "string" ? req.query.startDate : "";
    const endDate = typeof req.query.endDate === "string" ? req.query.endDate : "";
    const searchString = typeof req.query.searchString === "string" ? req.query.searchString : "";
    const page = Number(req.query.page ?? 1);
    const perPage = Number(req.query.perPage ?? 10);
    const result = await getInboundInvoices(
        vatTrn,
        getOrganizationId(req),
        startDate,
        endDate,
        searchString,
        page,
        perPage,
    );
    return res.status(result.statusCode).json(result.body);
};

export const getInvoiceTimeline = async (req: Request, res: Response) => {
    const vatTrn = typeof req.query.vatTrn === "string" ? req.query.vatTrn : "";
    const result = await getInvoiceStatusTimeline(
        String(req.params.entryId),
        vatTrn,
        getOrganizationId(req),
    );
    return res.status(result.statusCode).json(result.body);
};
