export const ZATCA_PARTY_BUSINESS_TYPE = {
    B2C: "B2C",
    B2B: "B2B",
} as const;

// Phase 1 EGS seller registration. This is integration configuration owned by
// the service, not business data supplied by ERP.
export const ZATCA_SELLER_REGISTRATION = {
    id: "1010010000",
    scheme: "CRN",
    buildingNumber: "2322",
} as const;

export type ZatcaPartyBusinessType = typeof ZATCA_PARTY_BUSINESS_TYPE[keyof typeof ZATCA_PARTY_BUSINESS_TYPE];

export const ZATCA_TRANSACTION_TYPE = {
    SALE: "SALE",
    CREDIT_NOTE: "CREDIT_NOTE",
} as const;

export type ZatcaTransactionType = typeof ZATCA_TRANSACTION_TYPE[keyof typeof ZATCA_TRANSACTION_TYPE];

export const ZATCA_INVOICE_TYPE = {
    SIMPLIFIED: "SIMPLIFIED",
    STANDARD: "STANDARD",
} as const;

export type ZatcaInvoiceType = typeof ZATCA_INVOICE_TYPE[keyof typeof ZATCA_INVOICE_TYPE];

export const ZATCA_INVOICE_STATUS = {
    PENDING: "PENDING",
    XML_GENERATED: "XML_GENERATED",
    VALIDATED: "VALIDATED",
    SIGNED: "SIGNED",
    QR_GENERATED: "QR_GENERATED",
    VALIDATION_FAILED: "VALIDATION_FAILED",
    SIGNING_FAILED: "SIGNING_FAILED",
    QR_EXTRACTION_FAILED: "QR_EXTRACTION_FAILED",
    FAILED: "FAILED",
} as const;

export type ZatcaInvoiceStatus = typeof ZATCA_INVOICE_STATUS[keyof typeof ZATCA_INVOICE_STATUS];

export interface ZatcaSdkResult {
    stdout: string;
    stderr: string;
}
