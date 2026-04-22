const { createClient } = require('@supabase/supabase-js')

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
      const { phone, email } = req.query
      let query = supabase.from('customers').select('*').order('total_spent', { ascending: false })
      if (phone) query = query.eq('phone', phone)
      if (email) query = query.eq('email', email)
      const { data, error } = await query
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const { data: existing } = await supabase
        .from('customers').select('*').eq('phone', req.body.phone).single()
      if (existing) return res.status(200).json(existing)
      const { data, error } = await supabase
        .from('customers').insert([req.body]).select().single()
      if (error) throw error
      return res.status(201).json(data)
    }

    if (req.method === 'PATCH') {
      const { id, points_to_add, ...updates } = req.body
      if (points_to_add) {
        const { data: c } = await supabase.from('customers').select('loyalty_points').eq('id', id).single()
        const newPts = (c?.loyalty_points || 0) + points_to_add
        updates.loyalty_points = newPts
        updates.tier = newPts >= 5000 ? 'platinum' : newPts >= 2000 ? 'gold' : newPts >= 500 ? 'silver' : 'bronze'
        updates.total_orders = supabase.raw ? undefined : undefined
      }
      const { data, error } = await supabase
        .from('customers').update(updates).eq('id', id).select().single()
      if (error) throw error
      return res.status(200).json(data)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
