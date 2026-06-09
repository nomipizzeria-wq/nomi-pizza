const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MP_TOKEN  = process.env.MP_ACCESS_TOKEN
const MP_BASE   = 'https://api.mercadopago.com'

async function mpFetch(path, opts = {}) {
  const res = await fetch(MP_BASE + path, {
    ...opts,
    headers: { 'Authorization': `Bearer ${MP_TOKEN}`, 'Content-Type': 'application/json', ...(opts.headers||{}) }
  })
  return res.json()
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    // ── TERMINAL: list devices ──────────────────────────────────
    if (req.method === 'GET' && req.query.action === 'devices') {
      const data = await mpFetch('/point/integration-api/devices')
      return res.status(200).json(data)
    }

    // ── TERMINAL: switch to PDV (integration) mode ─────────────
    if (req.method === 'POST' && req.body?.action === 'set_pdv_mode') {
      const { device_id } = req.body
      if (!device_id) return res.status(400).json({ error: 'device_id required' })
      const data = await mpFetch(
        `/point/integration-api/devices/${device_id}`,
        { method: 'PATCH', body: JSON.stringify({ operating_mode: 'PDV' }) }
      )
      if (data.error) return res.status(400).json({ error: data.message || 'Could not set PDV mode' })
      return res.status(200).json({ ok: true, operating_mode: data.operating_mode })
    }

    // ── TERMINAL: create payment intent ────────────────────────
    if (req.method === 'POST' && req.body?.action === 'terminal_payment') {
      const { device_id, amount, order_id } = req.body
      if (!device_id || !amount) return res.status(400).json({ error: 'device_id and amount required' })

      // Amount in centavos for MP Point API (MXN: $180 = 18000)
      const data = await mpFetch(
        `/point/integration-api/devices/${device_id}/payment-intents`,
        {
          method: 'POST',
          body: JSON.stringify({
            amount: Math.round(Number(amount) * 100),
            additional_info: {
              external_reference: order_id || ''
            }
          })
        }
      )
      if (data.error || data.status === 400) return res.status(400).json({ error: data.message || 'Terminal error' })
      return res.status(200).json({ intent_id: data.id, status: data.state?.worker?.result })
    }

    // ── TERMINAL: cancel payment intent ───────────────────────
    if (req.method === 'DELETE' && req.query.action === 'terminal_cancel') {
      const { intent_id, device_id } = req.query
      if (!intent_id) return res.status(400).json({ error: 'intent_id required' })
      const target = device_id
        ? `/point/integration-api/devices/${device_id}/payment-intents/${intent_id}`
        : `/point/integration-api/payment-intents/${intent_id}`
      const data = await mpFetch(target, { method: 'DELETE' })
      return res.status(200).json({ ok: true, data })
    }

    // ── TERMINAL: check payment intent status ──────────────────
    if (req.method === 'GET' && req.query.action === 'terminal_status') {
      const { intent_id } = req.query
      if (!intent_id) return res.status(400).json({ error: 'intent_id required' })
      const data = await mpFetch(`/point/integration-api/payment-intents/${intent_id}`)
      return res.status(200).json({
        state:    data.state?.worker?.result || data.state,
        status:   data.status,
        payment:  data.payment
      })
    }

    if (req.method === 'GET') {
      const { status, date, date_from, date_to } = req.query
      let query = supabase
        .from('orders')
        .select('*, order_items(*), restaurant_tables(number)')
        .order('created_at', { ascending: false })
      if (status && status !== 'all') query = query.eq('status', status)
      if (date_from && date_to) {
        // Full ISO timestamps sent from client (timezone-aware)
        query = query.gte('created_at', date_from).lte('created_at', date_to)
      } else if (date) {
        const start = new Date(date); start.setHours(0,0,0,0)
        const end   = new Date(date); end.setHours(23,59,59,999)
        query = query.gte('created_at', start.toISOString()).lte('created_at', end.toISOString())
      } else {
        query = query.gte('created_at', new Date(new Date().setHours(0,0,0,0)).toISOString())
      }
      const { data, error } = await query
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const body = req.body
      const { items, ...orderData } = body
      const subtotal = items.reduce((s, i) => s + (i.unit_price * i.quantity), 0)
      const delivery_fee = orderData.type === 'delivery' ? 45 : 0
      const discount = Number(orderData.discount || 0)
      const tip_amount = Number(orderData.tip_amount || 0)
      // Prices are IVA-inclusive — total = subtotal - discount + tip + delivery
      const total = Math.round((subtotal - discount + tip_amount + delivery_fee) * 100) / 100
      // Break out IVA from the final total
      const net = Math.round(total / 1.16 * 100) / 100
      const tax = Math.round((total - net) * 100) / 100
      const loyalty_points_earned = Math.floor(total)

      const { data: order, error: oErr } = await supabase
        .from('orders')
        .insert([{ ...orderData, subtotal, delivery_fee, tax, total, loyalty_points_earned }])
        .select().single()
      if (oErr) throw oErr

      const orderItems = items.map(i => ({ ...i, order_id: order.id }))
      const { error: iErr } = await supabase.from('order_items').insert(orderItems)
      if (iErr) throw iErr

      return res.status(201).json(order)
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body
      const { data, error } = await supabase
        .from('orders').update(updates).eq('id', id).select().single()
      if (error) throw error
      return res.status(200).json(data)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
