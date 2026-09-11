import { InvoiceSubmissionXmlModel } from "../../models/invoice-submission-xml.model.js";

type XmlScalar = string | number | boolean;
type InvoiceRequestBody = Record<string, unknown>;

const escapeXml = (value: XmlScalar): string => String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const xmlElement = (name: string, value: XmlScalar, indentation: string): string =>
    `${indentation}<${name}>${escapeXml(value)}</${name}>`;

const isXmlScalar = (value: unknown): value is XmlScalar =>
    typeof value === "string" || typeof value === "number" || typeof value === "boolean";

const buildScalarFields = (record: InvoiceRequestBody, indentation: string): string =>
    Object.entries(record)
        .reduce<string[]>((elements, [name, value]) => {
            if (isXmlScalar(value)) {
                elements.push(xmlElement(name, value, indentation));
            }

            return elements;
        }, [])
        .join("\n");

/** Serializes the exact normalized body posted to Aigentrix; it is not provider-generated UBL. */
export const buildAigentrixSubmissionXml = (requestBody: InvoiceRequestBody): string => {
    const lines = Array.isArray(requestBody.lines) ? requestBody.lines : [];
    const payments = Array.isArray(requestBody.payments) ? requestBody.payments : [];
    const invoiceFields = buildScalarFields(requestBody, "  ");
    const linesXml = lines
        .filter((line): line is InvoiceRequestBody => typeof line === "object" && line !== null && !Array.isArray(line))
        .map((line) => `    <Line>\n${buildScalarFields(line, "      ")}\n    </Line>`)
        .join("\n");
    const paymentsXml = payments
        .filter((payment): payment is InvoiceRequestBody => typeof payment === "object" && payment !== null && !Array.isArray(payment))
        .map((payment) => `    <Payment>\n${buildScalarFields(payment, "      ")}\n    </Payment>`)
        .join("\n");

    return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        "<Invoice>",
        invoiceFields,
        "  <Payments>",
        paymentsXml,
        "  </Payments>",
        "  <Lines>",
        linesXml,
        "  </Lines>",
        "</Invoice>",
        "",
    ].filter((line) => line !== "").join("\n");
};

type SaveInvoiceSubmissionXmlInput = {
    organizationId: string;
    entryId: number;
    documentId: string;
    providerDocumentId: string;
    vatTrn: string;
    requestBody: InvoiceRequestBody;
};

export const saveInvoiceSubmissionXmlOnce = async ({
    organizationId,
    entryId,
    documentId,
    providerDocumentId,
    vatTrn,
    requestBody,
}: SaveInvoiceSubmissionXmlInput): Promise<void> => {
    await InvoiceSubmissionXmlModel.updateOne(
        { organizationId, entryId },
        {
            $setOnInsert: {
                organizationId,
                entryId,
                documentId,
                providerDocumentId,
                vatTrn,
                invoiceXml: buildAigentrixSubmissionXml(requestBody),
                provider: "aigentrix",
            },
        },
        { upsert: true, runValidators: true },
    );
};
