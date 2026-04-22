const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('restaurant_tables')
        .select('*, workers(name)')
        .order('number')
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body
      if (updates.status === 'occupied' && !updates.opened_at) {
        updates.opened_at = new Date().toISOString()
      }
      if (updates.status === 'available') {
        updates.opened_at = null
        updates.waiter_id = null
      }
      const { data, error } = await supabase
        .from('restaurant_tables').update(updates).eq('id', id).select().single()
      if (error) throw error
      return res.status(200).json(data)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
