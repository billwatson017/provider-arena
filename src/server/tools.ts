import { toolDefinition } from '@tanstack/ai'
import { z } from 'zod'

// A fixed tool kit for testing tool calling. The data is fake and
// deterministic, so every model sees the same facts and answers can be
// checked against them.

const WEATHER: Record<string, { tempC: number; conditions: string }> = {
  tokyo: { tempC: 18, conditions: 'light rain' },
  paris: { tempC: 12, conditions: 'overcast' },
  'new york': { tempC: 9, conditions: 'clear' },
  london: { tempC: 11, conditions: 'drizzle' },
  sydney: { tempC: 24, conditions: 'sunny' },
}

/** Units of each currency per 1 USD. */
const USD_RATES: Record<string, number> = { USD: 1, EUR: 0.92, GBP: 0.79, JPY: 151.4, AUD: 1.53 }

const ORDERS: Record<string, { status: string; items: Array<string>; eta: string | null }> = {
  'A-1042': { status: 'shipped', items: ['mechanical keyboard', 'USB-C cable'], eta: '2026-10-27' },
  'A-1043': { status: 'processing', items: ['27-inch monitor'], eta: '2026-11-02' },
  'A-1044': { status: 'delivered', items: ['desk lamp'], eta: null },
}

export const getWeather = toolDefinition({
  name: 'get_weather',
  description: 'Current weather for a city.',
  inputSchema: z.object({ city: z.string().meta({ description: 'City name, e.g. "Paris"' }) }),
  outputSchema: z.object({
    city: z.string(),
    found: z.boolean(),
    tempC: z.number().optional(),
    conditions: z.string().optional(),
  }),
}).server(async ({ city }) => {
  const hit = WEATHER[city.trim().toLowerCase()]
  return hit ? { city, found: true, ...hit } : { city, found: false }
})

export const convertCurrency = toolDefinition({
  name: 'convert_currency',
  description: `Convert an amount between currencies. Supported: ${Object.keys(USD_RATES).join(', ')}.`,
  inputSchema: z.object({
    amount: z.number(),
    from: z.string().meta({ description: 'ISO code, e.g. USD' }),
    to: z.string().meta({ description: 'ISO code, e.g. EUR' }),
  }),
  outputSchema: z.object({ result: z.number().nullable(), error: z.string().optional() }),
}).server(async ({ amount, from, to }) => {
  const a = USD_RATES[from.toUpperCase()]
  const b = USD_RATES[to.toUpperCase()]
  if (a === undefined || b === undefined) return { result: null, error: 'Unsupported currency.' }
  return { result: Math.round((amount / a) * b * 100) / 100 }
})

export const lookupOrder = toolDefinition({
  name: 'lookup_order',
  description: 'Look up an order by id, e.g. "A-1042".',
  inputSchema: z.object({ orderId: z.string() }),
  outputSchema: z.object({
    found: z.boolean(),
    status: z.string().optional(),
    items: z.array(z.string()).optional(),
    eta: z.string().nullable().optional(),
  }),
}).server(async ({ orderId }) => {
  const order = ORDERS[orderId.trim().toUpperCase()]
  return order ? { found: true, ...order } : { found: false }
})

export const ARENA_TOOLS = [getWeather, convertCurrency, lookupOrder]
