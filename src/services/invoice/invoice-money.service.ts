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

// Spread a rounded total over its lines in whole cents: round each line down, then hand
// the remaining cents to the lines with the largest remainders.
const allocateToTotal = (exactAmounts: Decimal[], total: Decimal): Decimal[] => {
    const baseAmounts = exactAmounts.map((amount) =>
        amount.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_DOWN),
    );
    const centsToAllocate = total
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

    return lineAmounts;
};

const roundMoney = (amount: Decimal): Decimal =>
    amount.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP);

// Preserve the document-level rounded amount while emitting provider-safe cent values per line.
const allocateDocumentAmount = (exactAmounts: Decimal[]): AmountAllocation => {
    if (exactAmounts.length === 0) {
        return { documentAmount: new Decimal(0), lineAmounts: [] };
    }

    const documentAmount = roundMoney(sumDecimals(exactAmounts));
    return { documentAmount, lineAmounts: allocateToTotal(exactAmounts, documentAmount) };
};

const toMoneyNumber = (amount: Decimal): number =>
    amount.toDecimalPlaces(MONEY_SCALE, Decimal.ROUND_HALF_UP).toNumber();

type InvoiceLine = InvoiceSubmissionPayload["lines"][number];

/**
 * Price for a line whose net amount is final (already rounded at document level).
 * Exact, no further rounding: the per-unit rate when it fits in cents, otherwise the
 * net amount as the price of the whole quantity (IBT-149 base quantity), so
 * quantity × unitPrice ÷ priceBaseQty = lineNetAmount holds (ibr-147-ae).
 * Time: O(1) | Space: O(1)
 */
const priceForNetAmount = (
    line: InvoiceLine,
    lineNetAmount: Decimal,
): Pick<InvoiceLine, "unitPrice" | "priceBaseQty" | "priceBaseQtyUom"> => {
    const quantity = toDecimal(line.quantity);
    const priceBaseQty = toDecimal(line.priceBaseQty ?? 1);
    if (quantity.times(toDecimal(line.unitPrice)).dividedBy(priceBaseQty).equals(lineNetAmount)) {
        return { unitPrice: line.unitPrice, priceBaseQty: line.priceBaseQty, priceBaseQtyUom: line.priceBaseQtyUom };
    }

    const unitRate = lineNetAmount.dividedBy(quantity);
    if (unitRate.decimalPlaces() <= MONEY_SCALE) {
        return { unitPrice: unitRate.toNumber(), priceBaseQty: 1, priceBaseQtyUom: line.quantityUom };
    }
    return { unitPrice: lineNetAmount.toNumber(), priceBaseQty: line.quantity, priceBaseQtyUom: line.quantityUom };
};

type TaxSubtotal = NonNullable<InvoiceSubmissionPayload["taxSubtotals"]>[number];

type TaxGroup = { taxCategory: string; taxRatePercent: number; lineIndexes: number[] };

/** Lines grouped by VAT category and rate, in first-seen order (one BG-23 group each). */
const groupLinesByTaxCategory = (lines: InvoiceLine[]): TaxGroup[] => {
    const groups = new Map<string, TaxGroup>();
    lines.forEach((line, index) => {
        const key = `${line.taxCategory}|${toDecimal(line.taxRatePercent).toString()}`;
        const group = groups.get(key)
            ?? { taxCategory: line.taxCategory, taxRatePercent: line.taxRatePercent, lineIndexes: [] };
        group.lineIndexes.push(index);
        groups.set(key, group);
    });
    return [...groups.values()];
};

/**
 * VAT breakdown per category and rate (Guide §9.4 — never blended), from final line
 * amounts as they stand. Time: O(n) | Space: O(k) categories
 */
export const buildTaxSubtotals = (lines: InvoiceLine[]): TaxSubtotal[] =>
    groupLinesByTaxCategory(lines).map((group) => ({
        taxCategory: group.taxCategory,
        taxRatePercent: group.taxRatePercent,
        taxableAmount: toMoneyNumber(sumDecimals(group.lineIndexes.map((index) => toDecimal(lines[index].lineNetAmount)))),
        taxAmount: toMoneyNumber(sumDecimals(group.lineIndexes.map((index) => toDecimal(lines[index].lineTaxAmount)))),
    }));

/**
 * Rebuilds Sale monetary fields from source line net amounts and VAT rates, rounding
 * once at document level. Net amounts are rounded over the document; VAT is computed per
 * category as round(category taxable amount × rate) (BR-S-09) and spread over that
 * category's lines, so the header VAT is the sum of the category subtotals. Each line's
 * price is then derived from its final net amount.
 * Time: O(n log n) | Space: O(n)
 */
export const reconcileSaleInvoicePayload = (
    payload: InvoiceSubmissionPayload,
): InvoiceSubmissionPayload => {
    const netAllocation = allocateDocumentAmount(
        payload.lines.map((line) => toDecimal(line.lineNetAmount)),
    );
    const lineNetAmounts = payload.lines.map((_, index) => netAllocation.lineAmounts[index] ?? new Decimal(0));
    const lineTaxAmounts = payload.lines.map(() => new Decimal(0));

    const taxSubtotals: TaxSubtotal[] = groupLinesByTaxCategory(payload.lines).map((group) => {
        const rate = toDecimal(group.taxRatePercent).dividedBy(100);
        const groupNetAmounts = group.lineIndexes.map((index) => lineNetAmounts[index]);
        const taxableAmount = sumDecimals(groupNetAmounts);
        const taxAmount = roundMoney(taxableAmount.times(rate));
        allocateToTotal(groupNetAmounts.map((amount) => amount.times(rate)), taxAmount)
            .forEach((amount, position) => { lineTaxAmounts[group.lineIndexes[position]] = amount; });

        return {
            taxCategory: group.taxCategory,
            taxRatePercent: group.taxRatePercent,
            taxableAmount: toMoneyNumber(taxableAmount),
            taxAmount: toMoneyNumber(taxAmount),
        };
    });

    const taxAmount = sumDecimals(taxSubtotals.map((subtotal) => toDecimal(subtotal.taxAmount)));
    const totalIncludingTax = netAllocation.documentAmount.plus(taxAmount);

    return {
        ...payload,
        lines: payload.lines.map((line, index) => ({
            ...line,
            ...priceForNetAmount(line, lineNetAmounts[index]),
            lineNetAmount: toMoneyNumber(lineNetAmounts[index]),
            lineTaxAmount: toMoneyNumber(lineTaxAmounts[index]),
            inclVatamount: toMoneyNumber(lineNetAmounts[index].plus(lineTaxAmounts[index])),
        })),
        lineExtensionTotal: toMoneyNumber(netAllocation.documentAmount),
        taxAmount: toMoneyNumber(taxAmount),
        totalIncludingTax: toMoneyNumber(totalIncludingTax),
        payableAmount: toMoneyNumber(totalIncludingTax),
        taxSubtotals,
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

    const subtotalsMatch = !payload.taxSubtotals
        || JSON.stringify(payload.taxSubtotals) === JSON.stringify(buildTaxSubtotals(payload.lines));

    return lineTotalsMatch
        && subtotalsMatch
        && lineNetTotal.equals(lineExtensionTotal)
        && lineTaxTotal.equals(taxAmount)
        && totalIncludingTax.equals(lineExtensionTotal.plus(taxAmount))
        && toDecimal(payload.payableAmount).equals(totalIncludingTax);
};
