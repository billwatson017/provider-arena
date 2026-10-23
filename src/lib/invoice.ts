import { z } from 'zod'

// The structured-output test: every model extracts the same invoice into this
// schema. Shared by the server (outputSchema) and the browser (validation and
// grading), so it must stay free of server imports.

export const InvoiceSchema = z.object({
  vendor: z.string().meta({ description: 'Company that issued the invoice' }),
  invoiceNumber: z.string(),
  // A real calendar date: a YYYY-MM-DD pattern alone accepts "1409-20-26".
  date: z.iso.date().meta({ description: 'Issue date as YYYY-MM-DD' }),
  currency: z.enum(['USD', 'EUR', 'GBP']),
  lineItems: z.array(
    z.object({
      description: z.string(),
      quantity: z.number().int(),
      unitPrice: z.number(),
    }),
  ),
  total: z.number().meta({ description: 'Grand total including tax' }),
})

export type Invoice = z.infer<typeof InvoiceSchema>

export const SAMPLE_INVOICES: Array<{ label: string; prompt: string; expected: Invoice }> = [
  {
    label: 'Simple invoice',
    prompt:
      'Extract the invoice: "Northwind Supplies — Invoice NW-2291, issued October 3, 2026. 3 × ergonomic chair at $189.00, 1 × standing desk at $420.00. Total due incl. 8% tax: $1,065.96."',
    expected: {
      vendor: 'Northwind Supplies',
      invoiceNumber: 'NW-2291',
      date: '2026-10-03',
      currency: 'USD',
      lineItems: [
        { description: 'ergonomic chair', quantity: 3, unitPrice: 189 },
        { description: 'standing desk', quantity: 1, unitPrice: 420 },
      ],
      total: 1065.96,
    },
  },
  {
    label: 'Messy email',
    prompt:
      "Extract the invoice from this email: \"hi! attaching our bill — Brightline Design Ltd, ref BD/0457. Dated 14/09/2026 (UK format). Logo redesign £1,200, two rounds of revisions at £150 each. No VAT. So that's £1,500 all in. cheers\"",
    expected: {
      vendor: 'Brightline Design Ltd',
      invoiceNumber: 'BD/0457',
      date: '2026-09-14',
      currency: 'GBP',
      lineItems: [
        { description: 'Logo redesign', quantity: 1, unitPrice: 1200 },
        { description: 'revisions', quantity: 2, unitPrice: 150 },
      ],
      total: 1500,
    },
  },
]

export function sampleFor(prompt: string | undefined) {
  return SAMPLE_INVOICES.find((s) => s.prompt === prompt)
}

const lineSum = (inv: Invoice) => inv.lineItems.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0)

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '')

/**
 * Field-by-field score against the answer key. Text compares loosely (case
 * and punctuation ignored); numbers must match to the cent. Line items pass
 * when they add up to the expected amount, since "2 × £150" and two £150
 * lines are both fair readings.
 */
export function gradeInvoice(actual: Invoice, expected: Invoice) {
  const sameNumber = (a: number, b: number) => Math.abs(a - b) < 0.005
  const checks: Array<[string, boolean]> = [
    ['vendor', norm(actual.vendor) === norm(expected.vendor)],
    ['invoiceNumber', norm(actual.invoiceNumber) === norm(expected.invoiceNumber)],
    ['date', actual.date === expected.date],
    ['currency', actual.currency === expected.currency],
    ['lineItems', sameNumber(lineSum(actual), lineSum(expected))],
    ['total', sameNumber(actual.total, expected.total)],
  ]
  return { checks, correct: checks.filter(([, ok]) => ok).length, total: checks.length }
}
