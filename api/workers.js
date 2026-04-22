const { createClient } = require('@supabase/supabase-js')
import crypto from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function hashPIN(pin) {
  return crypto.createHash('sha256').update(pin + 'nomi_salt_2024').digest('hex')
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    if (req.method === 'GET') {
      const { data, error } = await supabase
        .from('workers').select('id, name, email, role, permissions, active').eq('active', true)
      if (error) throw error
      return res.status(200).json(data)
    }

    if (req.method === 'POST') {
      const { action, pin, email, password } = req.body

      if (action === 'login_pin') {
        const hashed = hashPIN(pin)
        const { data, error } = await supabase
          .from('workers').select('*').eq('pin', hashed).eq('active', true).single()
        if (error || !data) return res.status(401).json({ error: 'PIN incorrecto' })
        const { pin: _, ...safeWorker } = data
        return res.status(200).json(safeWorker)
      }

      if (action === 'create') {
        const { pin: rawPin, ...workerData } = req.body
        workerData.pin = hashPIN(rawPin)
        delete workerData.action
        const { data, error } = await supabase
          .from('workers').insert([workerData]).select().single()
        if (error) throw error
        const { pin: _, ...safeWorker } = data
        return res.status(201).json(safeWorker)
      }
    }

    if (req.method === 'PATCH') {
      const { id, pin: rawPin, ...updates } = req.body
      if (rawPin) updates.pin = hashPIN(rawPin)
      const { data, error } = await supabase
        .from('workers').update(updates).eq('id', id).select().single()
      if (error) throw error
      const { pin: _, ...safeWorker } = data
      return res.status(200).json(safeWorker)
    }

    return res.status(405).json({ error: 'Method not allowed' })
  } catch (err) {
    return res.status(500).json({ error: err.message })
  }
}
