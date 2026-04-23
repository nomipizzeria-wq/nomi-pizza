const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

const MP_ACCESS_TOKEN = process.env.MP_ACCESS_TOKEN
const APP_URL = process.env.APP_URL || 'https://app.nomipizza.mx'

async function mpFetch(path, options = {}) {
  const res = await fetch(`https://api.mercadopago.com${path}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${MP_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
      'X-Idempotency-Key': options.idempotencyKey || Date.now().toString(),
      ...options.headers
    },
    body: options.body ? JSON.stringify(options.body) : undefined
  })
  const data = await res.json()
  if (!res.ok) throw new Error(data.message || JSON.stringify(data))
  return data
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    const { action } = req.query

    // ── CREATE PREFERENCE (online checkout) ──────────────
    if (action === 'create_preference' && req.method === 'POST') {
      const { order_id, items, customer, type } = req.body

      const preference = await mpFetch('/checkout/preferences', {
        method: 'POST',
        idempotencyKey: order_id,
        body: {
          items: items.map(i => ({
            id: i.item_id || i.id,
            title: i.item_name || i.name,
            quantity: Number(i.quantity),
            currency_id: 'MXN',
            unit_price: Number(i.unit_price || i.price)
          })),
          payer: {
            name: customer?.name || 'Cliente Nomi',
            email: customer?.email || 'cliente@nomipizza.mx',
            phone: customer?.phone ? { number: customer.phone } : undefined
          },
          back_urls: {
            success: `${APP_URL}/payment-success.html?order=${order_id}`,
            failure: `${APP_URL}/payment-failure.html?order=${order_id}`,
            pending: `${APP_URL}/payment-pending.html?order=${order_id}`
          },
          auto_return: 'approved',
          notification_url: `${APP_URL}/api/payments?action=webhook`,
          external_reference: order_id,
          statement_descriptor: 'NOMI PIZZA',
          expires: false,
          metadata: { order_id, type }
        }
      })

      // Save preference ID to order
      await supabase.from('orders')
        .update({ mercadopago_id: preference.id })
        .eq('id', order_id)

      return res.status(200).json({
        preference_id: preference.id,
        init_point: preference.init_point,
        sandbox_init_point: preference.sandbox_init_point
      })
    }

    // ── CREATE QR PAYMENT (POS in-person) ────────────────
    if (action === 'create_qr' && req.method === 'POST') {
      const { order_id, items, total, table_number } = req.body

      // Get store/collector info
      const userInfo = await mpFetch('/users/me')
      const storeRes = await mpFetch(`/users/${userInfo.id}/stores`)
      const stores = storeRes.results || []

      if (stores.length === 0) {
        // Fallback: return regular preference for QR display
        const pref = await mpFetch('/checkout/preferences', {
          method: 'POST',
          idempotencyKey: `qr-${order_id}`,
          body: {
            items: items.map(i => ({
              title: i.item_name || i.name,
              quantity: Number(i.quantity),
              currency_id: 'MXN',
              unit_price: Number(i.unit_price || i.price)
            })),
            external_reference: order_id,
            notification_url: `${APP_URL}/api/payments?action=webhook`,
            statement_descriptor: 'NOMI PIZZA'
          }
        })
        return res.status(200).json({
          type: 'preference',
          preference_id: pref.id,
          init_point: pref.init_point,
          qr_data: pref.id
        })
      }

      return res.status(200).json({
        type: 'qr',
        store_id: stores[0].id,
        collector_id: userInfo.id
      })
    }

    // ── PROCESS CASH PAYMENT ──────────────────────────────
    if (action === 'cash' && req.method === 'POST') {
      const { order_id, amount_paid } = req.body

      const { data: order, error } = await supabase
        .from('orders').select('total').eq('id', order_id).single()
      if (error) throw error

      const change = Math.max(0, amount_paid - order.total)

      await supabase.from('orders').update({
        payment_method: 'cash',
        payment_status: 'paid',
        status: 'delivered'
      }).eq('id', order_id)

      return res.status(200).json({
        success: true,
        change: Math.round(change * 100) / 100,
        message: `Cambio: $${Math.round(change * 100) / 100} MXN`
      })
    }

    // ── CHECK PAYMENT STATUS ──────────────────────────────
    if (action === 'status' && req.method === 'GET') {
      const { order_id } = req.query
      const { data: order } = await supabase
        .from('orders')
        .select('payment_status, payment_method, mercadopago_id, status')
        .eq('id', order_id).single()
      return res.status(200).json(order)
    }

    // ── WEBHOOK (Mercado Pago notifications) ──────────────
    if (action === 'webhook') {
      const { type, data } = req.body || {}

      if (type === 'payment' && data?.id) {
        try {
          const payment = await mpFetch(`/v1/payments/${data.id}`)
          const orderId = payment.external_reference

          if (!orderId) return res.status(200).end()

          if (payment.status === 'approved') {
            await supabase.from('orders').update({
              payment_status: 'paid',
              payment_method: 'mercadopago',
              status: 'accepted'
            }).eq('id', orderId)

            // Award loyalty points
            const { data: order } = await supabase
              .from('orders')
              .select('loyalty_points_earned, customer_email, customer_phone')
              .eq('id', orderId).single()

            if (order?.customer_email || order?.customer_phone) {
              const { data: customers } = await supabase
                .from('customers')
                .select('id, loyalty_points')
                .or(
                  order.customer_email
                    ? `email.eq.${order.customer_email}`
                    : `phone.eq.${order.customer_phone}`
                )
              if (customers?.length > 0) {
                const c = customers[0]
                const newPts = c.loyalty_points + (order.loyalty_points_earned || 0)
                await supabase.from('customers').update({
                  loyalty_points: newPts,
                  tier: newPts >= 5000 ? 'platinum' : newPts >= 2000 ? 'gold' : newPts >= 500 ? 'silver' : 'bronze',
                  total_orders: supabase.rpc ? undefined : undefined
                }).eq('id', c.id)
              }
            }
          } else if (payment.status === 'rejected') {
            await supabase.from('orders').update({
              payment_status: 'pending',
              status: 'cancelled'
            }).eq('id', orderId)
          }
        } catch (e) {
          console.error('Webhook error:', e.message)
        }
      }

      return res.status(200).end()
    }

    return res.status(400).json({ error: 'Invalid action' })
  } catch (err) {
    console.error('Payment error:', err.message)
    return res.status(500).json({ error: err.message })
  }
}
