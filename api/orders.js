import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { status, date } = req.query
      let query = supabase
        .from('orders')
        .select('*, order_items(*), restaurant_tables(number)')
        .order('created_at', { ascending: false })
      if (status && status !== 'all') query = query.eq('status', status)
      if (date) {
        const start = new Date(date); start.setHours(0,0,0,0)
        const end = new Date(date); end.setHours(23,59,59,999)
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
      const tax = (subtotal) * 0.16
      const total = subtotal + delivery_fee + tax
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
