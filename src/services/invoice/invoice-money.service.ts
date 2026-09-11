import { Decimal } from "decimal.js";
import type { InvoiceSubmissionPayload } from "../../schemas/invoice.schema.js";

const MONEY_SCALE = 2;

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

const toDecimal = (value: number): Decimal => new Decimal(value.toString());

const sumDecimals = (values: Decimal[]): Decimal =>
    values.reduce((sum, value) => sum.plus(value), new Decimal(0));

type AmountAllocation = {
    documentAmount: Decimal;
    lineAmounts: Decimal[];
};

// Preserve the document-level rounded amount while emitting provider-safe cent values per line.
const allocateDocumentAmount = (exactAmounts: Decimal[]): AmountAllocation => {
    if (exactAmounts.length === 0) {
        return { documentAmount: new Decimal(0), lineAmounts: [] };
    }

    const documentAmount = sumDecimals(exactAmounts).toDecimalPlaces(
        MONEY_SCALE,
        Decimal.ROUND_HALF_UP,
    );
    const baseAmounts = exactAmounts.map((amount) =>
        amount.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_DOWN),
    );
    const centsToAllocate = documentAmount
        .minus(sumDecimals(baseAmounts))
        .times(100)
        .toNumber();
    const allocationOrder = exactAmounts
        .map((amount, index) => ({
            index,
            remainder: amount.minus(baseAmounts[index]),
        }))
        .sort((left, right) => {
            const comparison = right.remainder.comparedTo(left.remainder);
            return comparison || left.index - right.index;
        });
    const lineAmounts = [...baseAmounts];

    for (let offset = 0; offset < centsToAllocate; offset += 1) {
        const index = allocationOrder[offset % allocationOrder.length]?.index;
        if (index === undefined) break;
        lineAmounts[index] = lineAmounts[index].plus("0.01");
    }

    return { documentAmount, lineAmounts };
};

const toMoneyNumber = (amount: Decimal): number =>
    amount.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP).toNumber();

/**
 * Rebuilds Sale monetary fields from source line net amounts and VAT rates.
 * Credit notes retain their existing accounting-driven values.
 */
export const reconcileSaleInvoicePayload = (
    payload: InvoiceSubmissionPayload,
): InvoiceSubmissionPayload => {
    const exactLineNetAmounts = payload.lines.map((line) => toDecimal(line.lineNetAmount));
    const exactLineTaxAmounts = payload.lines.map((line, index) =>
        exactLineNetAmounts[index]
            .times(toDecimal(line.taxRatePercent))
            .dividedBy(100),
    );
    const netAllocation = allocateDocumentAmount(exactLineNetAmounts);
    const taxAllocation = allocateDocumentAmount(exactLineTaxAmounts);
    const totalIncludingTax = netAllocation.documentAmount.plus(taxAllocation.documentAmount);

    return {
        ...payload,
        lines: payload.lines.map((line, index) => {
            const lineNetAmount = netAllocation.lineAmounts[index] ?? new Decimal(0);
            const lineTaxAmount = taxAllocation.lineAmounts[index] ?? new Decimal(0);

            return {
                ...line,
                lineNetAmount: toMoneyNumber(lineNetAmount),
                lineTaxAmount: toMoneyNumber(lineTaxAmount),
                inclVatamount: toMoneyNumber(lineNetAmount.plus(lineTaxAmount)),
            };
        }),
        lineExtensionTotal: toMoneyNumber(netAllocation.documentAmount),
        taxAmount: toMoneyNumber(taxAllocation.documentAmount),
        totalIncludingTax: toMoneyNumber(totalIncludingTax),
        payableAmount: toMoneyNumber(totalIncludingTax),
    };
};

export const hasReconciledSaleInvoiceAmounts = (
    payload: InvoiceSubmissionPayload,
): boolean => {
    const lineNetTotal = sumDecimals(payload.lines.map((line) => toDecimal(line.lineNetAmount)));
    const lineTaxTotal = sumDecimals(payload.lines.map((line) => toDecimal(line.lineTaxAmount)));
    const lineTotalsMatch = payload.lines.every((line) =>
        toDecimal(line.inclVatamount).equals(
            toDecimal(line.lineNetAmount).plus(toDecimal(line.lineTaxAmount)),
        ),
    );
    const lineExtensionTotal = toDecimal(payload.lineExtensionTotal);
    const taxAmount = toDecimal(payload.taxAmount);
    const totalIncludingTax = toDecimal(payload.totalIncludingTax);

    return lineTotalsMatch
        && lineNetTotal.equals(lineExtensionTotal)
        && lineTaxTotal.equals(taxAmount)
        && totalIncludingTax.equals(lineExtensionTotal.plus(taxAmount))
        && toDecimal(payload.payableAmount).equals(totalIncludingTax);
};
