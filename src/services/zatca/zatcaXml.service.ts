import type { ZatcaSaleInvoiceRequest } from "../../schemas/zatca-sale-invoice.schema.js";
import { ZATCA_SELLER_REGISTRATION } from "../../types/zatca/zatcaSaleInvoice.types.js";

const SCALE = 1_000_000n;
const MONEY_TOLERANCE = 10_000n; // 0.01 at the six-decimal working scale

const xmlEscape = (value: string): string => value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&apos;");

const toScaled = (value: string): bigint => {
    const [whole, fraction = ""] = value.split(".");
    if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > 6) {
        throw new ZatcaInvoiceTotalsMismatchError(`Invalid decimal value: ${value}`);
    }

    return BigInt(whole) * SCALE + BigInt(`${fraction}000000`.slice(0, 6));
};

const roundDiv = (numerator: bigint, denominator: bigint): bigint => {
    if (denominator === 0n) {
        throw new ZatcaInvoiceTotalsMismatchError("Cannot divide monetary values by zero");
    }

    return (numerator + denominator / 2n) / denominator;
};

const roundedMoney = (value: bigint): bigint => roundDiv(value, 10_000n) * 10_000n;
const isClose = (left: bigint, right: bigint): boolean => (left >= right ? left - right : right - left) <= MONEY_TOLERANCE;
const sum = (values: bigint[]): bigint => values.reduce((total, value) => total + value, 0n);

const formatScaled = (value: bigint, decimalPlaces: number): string => {
    const sign = value < 0n ? "-" : "";
    const absolute = value < 0n ? -value : value;
    const divisor = 10n ** BigInt(6 - decimalPlaces);
    const rounded = roundDiv(absolute, divisor);
    const whole = rounded / (10n ** BigInt(decimalPlaces));
    const fraction = (rounded % (10n ** BigInt(decimalPlaces))).toString().padStart(decimalPlaces, "0");
    return decimalPlaces === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
};

const money = (value: string): string => formatScaled(toScaled(value), 2);
const percent = (value: string): string => formatScaled(toScaled(value), 2);
const quantity = (value: string): string => formatScaled(toScaled(value), 6);

const taxScheme = (withAttributes: boolean): string => withAttributes
    ? '<cac:TaxScheme><cbc:ID schemeID="UN/ECE 5153" schemeAgencyID="6">VAT</cbc:ID></cac:TaxScheme>'
    : "<cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>";

const taxCategory = (category: string, vatPercent: string, withAttributes = true): string => `
<cac:TaxCategory>
  <cbc:ID${withAttributes ? ' schemeID="UN/ECE 5305" schemeAgencyID="6"' : ""}>${xmlEscape(category)}</cbc:ID>
  <cbc:Percent>${percent(vatPercent)}</cbc:Percent>
  ${taxScheme(withAttributes)}
</cac:TaxCategory>`;

export class ZatcaInvoiceTotalsMismatchError extends Error {
    public readonly code = "ZATCA_INVOICE_TOTAL_MISMATCH";

    constructor(message: string) {
        super(message);
        this.name = "ZatcaInvoiceTotalsMismatchError";
    }
}

/** Validate the ERP's calculated figures before the document can be signed. */
export const validateZatcaInvoiceTotals = (invoice: ZatcaSaleInvoiceRequest): void => {
    const lineExtensions = invoice.items.map((item) => toScaled(item.lineExtensionAmount));
    const lineTaxes = invoice.items.map((item) => toScaled(item.taxAmount));

    invoice.items.forEach((item) => {
        const expectedExtension = roundedMoney(toScaled(item.quantity) * toScaled(item.unitPrice) / SCALE);
        if (!isClose(toScaled(item.lineExtensionAmount), expectedExtension)) {
            throw new ZatcaInvoiceTotalsMismatchError(`Line ${item.lineNumber}: lineExtensionAmount does not reconcile with quantity × unitPrice`);
        }

        const expectedTax = roundedMoney(toScaled(item.lineExtensionAmount) * toScaled(item.vatPercent) / (100n * SCALE));
        if (!isClose(toScaled(item.taxAmount), expectedTax)) {
            throw new ZatcaInvoiceTotalsMismatchError(`Line ${item.lineNumber}: taxAmount does not reconcile with VAT percent`);
        }

        const expectedRoundingAmount = toScaled(item.lineExtensionAmount) + toScaled(item.taxAmount);
        if (!isClose(toScaled(item.roundingAmount), expectedRoundingAmount)) {
            throw new ZatcaInvoiceTotalsMismatchError(`Line ${item.lineNumber}: roundingAmount does not reconcile with lineExtensionAmount + taxAmount`);
        }
    });

    const allowanceAmount = invoice.allowance ? toScaled(invoice.allowance.amount) : 0n;
    const allowanceTax = invoice.allowance
        ? roundedMoney(allowanceAmount * toScaled(invoice.allowance.vatPercent) / (100n * SCALE))
        : 0n;
    const allowanceSign = invoice.allowance?.chargeIndicator ? 1n : -1n;
    const expectedTaxExclusive = sum(lineExtensions) + allowanceSign * allowanceAmount;
    const expectedTaxAmount = sum(lineTaxes) + allowanceSign * allowanceTax;

    if (!isClose(toScaled(invoice.totals.lineExtensionAmount), sum(lineExtensions))) {
        throw new ZatcaInvoiceTotalsMismatchError("totals.lineExtensionAmount does not equal the sum of invoice lines");
    }
    if (!isClose(toScaled(invoice.totals.taxExclusiveAmount), expectedTaxExclusive)) {
        throw new ZatcaInvoiceTotalsMismatchError("totals.taxExclusiveAmount does not reconcile with lines and allowance/charge");
    }
    if (!isClose(toScaled(invoice.tax.taxAmount), expectedTaxAmount)) {
        throw new ZatcaInvoiceTotalsMismatchError("tax.taxAmount does not reconcile with applicable tax amounts");
    }
    if (!isClose(toScaled(invoice.totals.taxInclusiveAmount), toScaled(invoice.totals.taxExclusiveAmount) + toScaled(invoice.tax.taxAmount))) {
        throw new ZatcaInvoiceTotalsMismatchError("totals.taxInclusiveAmount does not equal taxExclusiveAmount + taxAmount");
    }
    if (!isClose(toScaled(invoice.totals.payableAmount), toScaled(invoice.totals.taxInclusiveAmount) - toScaled(invoice.totals.prepaidAmount))) {
        throw new ZatcaInvoiceTotalsMismatchError("totals.payableAmount does not reconcile with taxInclusiveAmount - prepaidAmount");
    }

    const expectedAllowanceTotal = invoice.allowance && !invoice.allowance.chargeIndicator ? allowanceAmount : 0n;
    if (!isClose(toScaled(invoice.totals.allowanceTotalAmount), expectedAllowanceTotal)) {
        throw new ZatcaInvoiceTotalsMismatchError("totals.allowanceTotalAmount does not reconcile with the allowance");
    }

    const subtotalTaxable = sum(invoice.tax.subtotals.map((subtotal) => toScaled(subtotal.taxableAmount)));
    const subtotalTax = sum(invoice.tax.subtotals.map((subtotal) => toScaled(subtotal.taxAmount)));
    if (!isClose(subtotalTaxable, toScaled(invoice.totals.taxExclusiveAmount)) || !isClose(subtotalTax, toScaled(invoice.tax.taxAmount))) {
        throw new ZatcaInvoiceTotalsMismatchError("tax subtotals do not reconcile with invoice tax totals");
    }
};

export interface ZatcaXmlState {
    uuid: string;
    icv: number;
    previousInvoiceHash: string;
}

/**
 * Produces pre-sign UBL only. The extension and QR nodes are intentional
 * placeholders: the Java SDK creates all cryptographic signature values and
 * replaces/populates the QR in the resulting signed invoice.
 */
export const createSimplifiedInvoiceXml = (
    invoice: ZatcaSaleInvoiceRequest,
    state: ZatcaXmlState,
): string => {
    const currency = xmlEscape(invoice.currency);
    const note = invoice.note ? `<cbc:Note>${xmlEscape(invoice.note)}</cbc:Note>` : "";
    const isCreditNote = invoice.transactionType === "CREDIT_NOTE";
    const documentTypeCode = isCreditNote ? "381" : "388";
    const billingReference = isCreditNote
        ? `<cac:BillingReference><cac:InvoiceDocumentReference><cbc:ID>${xmlEscape(invoice.originalInvoiceDocumentId!)}</cbc:ID></cac:InvoiceDocumentReference></cac:BillingReference>`
        : "";
    const delivery = isCreditNote
        ? `<cac:Delivery><cbc:ActualDeliveryDate>${xmlEscape(invoice.actualDeliveryDate!)}</cbc:ActualDeliveryDate></cac:Delivery>`
        : "";
    const paymentInstruction = isCreditNote
        ? `<cbc:InstructionNote>${xmlEscape(invoice.creditNoteReason!)}</cbc:InstructionNote>`
        : "";
    const buyer = invoice.buyer?.name
        ? `<cac:AccountingCustomerParty><cac:Party><cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(invoice.buyer.name)}</cbc:RegistrationName></cac:PartyLegalEntity></cac:Party></cac:AccountingCustomerParty>`
        : "<cac:AccountingCustomerParty/>";
    const allowance = invoice.allowance ? `
<cac:AllowanceCharge>
  <cbc:ChargeIndicator>${invoice.allowance.chargeIndicator}</cbc:ChargeIndicator>
  <cbc:AllowanceChargeReason>${xmlEscape(invoice.allowance.reason)}</cbc:AllowanceChargeReason>
  <cbc:Amount currencyID="${currency}">${money(invoice.allowance.amount)}</cbc:Amount>
  ${taxCategory(invoice.allowance.vatCategory, invoice.allowance.vatPercent)}
</cac:AllowanceCharge>` : "";
    const subtotals = invoice.tax.subtotals.map((subtotal) => `
<cac:TaxSubtotal>
  <cbc:TaxableAmount currencyID="${currency}">${money(subtotal.taxableAmount)}</cbc:TaxableAmount>
  <cbc:TaxAmount currencyID="${currency}">${money(subtotal.taxAmount)}</cbc:TaxAmount>
  ${taxCategory(subtotal.vatCategory, subtotal.vatPercent)}
</cac:TaxSubtotal>`).join("");
    const lines = invoice.items.map((item) => `
<cac:InvoiceLine>
  <cbc:ID>${item.lineNumber}</cbc:ID>
  <cbc:InvoicedQuantity unitCode="${xmlEscape(item.unitCode)}">${quantity(item.quantity)}</cbc:InvoicedQuantity>
  <cbc:LineExtensionAmount currencyID="${currency}">${money(item.lineExtensionAmount)}</cbc:LineExtensionAmount>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${money(item.taxAmount)}</cbc:TaxAmount>
    <cbc:RoundingAmount currencyID="${currency}">${money(item.roundingAmount)}</cbc:RoundingAmount>
  </cac:TaxTotal>
  <cac:Item>
    <cbc:Name>${xmlEscape(item.itemName)}</cbc:Name>
    <cac:ClassifiedTaxCategory>
      <cbc:ID>${xmlEscape(item.vatCategory)}</cbc:ID>
      <cbc:Percent>${percent(item.vatPercent)}</cbc:Percent>
      ${taxScheme(false)}
    </cac:ClassifiedTaxCategory>
  </cac:Item>
  <cac:Price><cbc:PriceAmount currencyID="${currency}">${money(item.unitPrice)}</cbc:PriceAmount></cac:Price>
</cac:InvoiceLine>`).join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2"
  xmlns:ext="urn:oasis:names:specification:ubl:schema:xsd:CommonExtensionComponents-2">
  <ext:UBLExtensions><ext:UBLExtension><ext:ExtensionURI>urn:oasis:names:specification:ubl:dsig:enveloped:xades</ext:ExtensionURI><ext:ExtensionContent/></ext:UBLExtension></ext:UBLExtensions>
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${xmlEscape(invoice.documentId)}</cbc:ID>
  <cbc:UUID>${xmlEscape(state.uuid)}</cbc:UUID>
  <cbc:IssueDate>${xmlEscape(invoice.issueDate)}</cbc:IssueDate>
  <cbc:IssueTime>${xmlEscape(invoice.issueTime)}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="0200000">${documentTypeCode}</cbc:InvoiceTypeCode>
  ${note}
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>SAR</cbc:TaxCurrencyCode>
  ${billingReference}
  <cac:AdditionalDocumentReference><cbc:ID>ICV</cbc:ID><cbc:UUID>${state.icv}</cbc:UUID></cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference><cbc:ID>PIH</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${xmlEscape(state.previousInvoiceHash)}</cbc:EmbeddedDocumentBinaryObject></cac:Attachment></cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference><cbc:ID>QR</cbc:ID><cac:Attachment><cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain"/></cac:Attachment></cac:AdditionalDocumentReference>
  <cac:Signature><cbc:ID>urn:oasis:names:specification:ubl:signature:Invoice</cbc:ID><cbc:SignatureMethod>urn:oasis:names:specification:ubl:dsig:enveloped:xades</cbc:SignatureMethod></cac:Signature>
  <cac:AccountingSupplierParty><cac:Party>
    <cac:PartyIdentification><cbc:ID schemeID="${ZATCA_SELLER_REGISTRATION.scheme}">${ZATCA_SELLER_REGISTRATION.id}</cbc:ID></cac:PartyIdentification>
    <cac:PostalAddress><cbc:StreetName>${xmlEscape(invoice.seller.streetName)}</cbc:StreetName><cbc:BuildingNumber>${ZATCA_SELLER_REGISTRATION.buildingNumber}</cbc:BuildingNumber><cbc:CitySubdivisionName>${xmlEscape(invoice.seller.district)}</cbc:CitySubdivisionName><cbc:CityName>${xmlEscape(invoice.seller.city)}</cbc:CityName><cbc:PostalZone>${xmlEscape(invoice.seller.postalCode)}</cbc:PostalZone><cac:Country><cbc:IdentificationCode>${xmlEscape(invoice.seller.countryCode)}</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>${xmlEscape(invoice.seller.vatNumber)}</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${xmlEscape(invoice.seller.name)}</cbc:RegistrationName></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  ${buyer}
  ${delivery}
  <cac:PaymentMeans><cbc:PaymentMeansCode>${xmlEscape(invoice.paymentMeansCode)}</cbc:PaymentMeansCode>${paymentInstruction}</cac:PaymentMeans>
  ${allowance}
  <cac:TaxTotal><cbc:TaxAmount currencyID="${currency}">${money(invoice.tax.taxAmount)}</cbc:TaxAmount></cac:TaxTotal>
  <cac:TaxTotal><cbc:TaxAmount currencyID="${currency}">${money(invoice.tax.taxAmount)}</cbc:TaxAmount>${subtotals}</cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${money(invoice.totals.lineExtensionAmount)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${money(invoice.totals.taxExclusiveAmount)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${money(invoice.totals.taxInclusiveAmount)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${currency}">${money(invoice.totals.allowanceTotalAmount)}</cbc:AllowanceTotalAmount>
    <cbc:PrepaidAmount currencyID="${currency}">${money(invoice.totals.prepaidAmount)}</cbc:PrepaidAmount>
    <cbc:PayableAmount currencyID="${currency}">${money(invoice.totals.payableAmount)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  ${lines}
</Invoice>`;
};

const additionalDocumentReference = /<cac:AdditionalDocumentReference\b[^>]*>([\s\S]*?)<\/cac:AdditionalDocumentReference>/g;
const elementValue = (xml: string, localName: string): string | undefined => {
    const match = xml.match(new RegExp(`<cbc:${localName}\\b[^>]*>([\\s\\S]*?)<\\/cbc:${localName}>`));
    return match?.[1]?.trim();
};

export const extractZatcaQrPayload = (signedXml: string): string | undefined => {
    for (const reference of signedXml.matchAll(additionalDocumentReference)) {
        if (elementValue(reference[1], "ID") !== "QR") continue;
        return elementValue(reference[1], "EmbeddedDocumentBinaryObject");
    }
    return undefined;
};

/** QR is explicitly excluded by the XML signature transform, so inserting the SDK-generated value does not alter the invoice hash/signature. */
export const insertZatcaQrPayload = (signedXml: string, qrPayload: string): string => {
    for (const reference of signedXml.matchAll(additionalDocumentReference)) {
        if (elementValue(reference[1], "ID") !== "QR") continue;
        const updatedReference = reference[1]
            .replace(/<cbc:EmbeddedDocumentBinaryObject\b([^>]*)\/>/, `<cbc:EmbeddedDocumentBinaryObject$1>${xmlEscape(qrPayload)}</cbc:EmbeddedDocumentBinaryObject>`)
            .replace(/<cbc:EmbeddedDocumentBinaryObject\b([^>]*)>[\s\S]*?<\/cbc:EmbeddedDocumentBinaryObject>/, `<cbc:EmbeddedDocumentBinaryObject$1>${xmlEscape(qrPayload)}</cbc:EmbeddedDocumentBinaryObject>`);
        return signedXml.replace(reference[0], `<cac:AdditionalDocumentReference>${updatedReference}</cac:AdditionalDocumentReference>`);
    }
    throw new Error("Signed invoice does not contain a QR document reference");
};

export const extractZatcaInvoiceHash = (signedXml: string): string | undefined => {
    const signedDataReference = signedXml.match(/<ds:Reference\b[^>]*\bId=["']invoiceSignedData["'][^>]*>([\s\S]*?)<\/ds:Reference>/);
    const digest = signedDataReference?.[1].match(/<ds:DigestValue\b[^>]*>([\s\S]*?)<\/ds:DigestValue>/);
    return digest?.[1]?.trim();
};
