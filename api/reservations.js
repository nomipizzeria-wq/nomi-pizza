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
      const { date } = req.query
      let query = supabase
        .from('reservations')
        .select('*, customers(name, phone), restaurant_tables(number, capacity)')
        .order('time')
      if (date) query = query.eq('date', date)
      const { data, error } = await query
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const { data, error } = await supabase
        .from('reservations').insert([req.body]).select().single()
      if (error) throw error
      return res.status(201).json(data)
    }

    if (req.method === 'PATCH') {
      const { id, ...updates } = req.body
      const { data, error } = await supabase
        .from('reservations').update(updates).eq('id', id).select().single()
      if (error) throw error
      return res.status(200).json(data)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
