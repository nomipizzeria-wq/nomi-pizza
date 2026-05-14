// api/recipes.js — Nomi Pizza Recipe Costs API
// Vercel serverless · Supabase backend

const SUPABASE_URL = process.env.SUPABASE_URL
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY

async function sb(path, opts = {}) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: opts.prefer || 'return=representation',
      ...opts.headers
    },
    ...opts
  })
  const text = await res.text()
  try { return JSON.parse(text) } catch { return text }
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  try {
    // ── GET — return all recipes with their ingredients joined ──────────────
    if (req.method === 'GET') {
      const recipes = await sb('recipes?select=id,menu_item_id,notes,created_at')
      if (!Array.isArray(recipes)) return res.status(200).json([])

      const ingredients = await sb(
        'recipe_ingredients?select=id,recipe_id,ingredient_id,ingredient_name,quantity,unit,cost_per_unit,cost_override'
      )

      const ingByRecipe = {}
      ;(Array.isArray(ingredients) ? ingredients : []).forEach(i => {
        if (!ingByRecipe[i.recipe_id]) ingByRecipe[i.recipe_id] = []
        ingByRecipe[i.recipe_id].push(i)
      })

      const full = recipes.map(r => ({
        ...r,
        ingredients: ingByRecipe[r.id] || []
      }))

      return res.status(200).json(full)
    }

    // ── POST — upsert recipe + replace all ingredients ──────────────────────
    if (req.method === 'POST') {
      const { menu_item_id, recipe_id, notes = '', ingredients = [] } = req.body

      if (!menu_item_id) return res.status(400).json({ error: 'menu_item_id required' })

      let finalRecipeId = recipe_id

      if (recipe_id) {
        // Update existing recipe
        await sb(`recipes?id=eq.${recipe_id}`, {
          method: 'PATCH',
          body: JSON.stringify({ notes, updated_at: new Date().toISOString() })
        })
      } else {
        // Create new recipe
        const created = await sb('recipes', {
          method: 'POST',
          body: JSON.stringify({ menu_item_id, notes }),
          prefer: 'return=representation'
        })
        finalRecipeId = Array.isArray(created) ? created[0]?.id : created?.id
        if (!finalRecipeId) return res.status(500).json({ error: 'Failed to create recipe' })
      }

      // Delete all existing ingredients for this recipe
      await sb(`recipe_ingredients?recipe_id=eq.${finalRecipeId}`, {
        method: 'DELETE',
        prefer: ''
      })

      // Insert new ingredients
      if (ingredients.length > 0) {
        const rows = ingredients.map(i => ({
          recipe_id:       finalRecipeId,
          ingredient_id:   i.ingredient_id || null,
          ingredient_name: i.ingredient_name,
          quantity:        Number(i.quantity),
          unit:            i.unit || '',
          cost_per_unit:   Number(i.cost_per_unit || 0),
          cost_override:   i.cost_override != null ? Number(i.cost_override) : null
        }))
        await sb('recipe_ingredients', {
          method: 'POST',
          body: JSON.stringify(rows),
          prefer: ''
        })
      }

      return res.status(200).json({ ok: true, recipe_id: finalRecipeId })
    }

    // ── DELETE — remove a recipe and all its ingredients (cascade) ──────────
    if (req.method === 'DELETE') {
      const { recipe_id } = req.body
      if (!recipe_id) return res.status(400).json({ error: 'recipe_id required' })

      // recipe_ingredients cascades on delete via FK, but delete explicitly to be safe
      await sb(`recipe_ingredients?recipe_id=eq.${recipe_id}`, { method: 'DELETE', prefer: '' })
      await sb(`recipes?id=eq.${recipe_id}`, { method: 'DELETE', prefer: '' })

      return res.status(200).json({ ok: true })
    }

    return res.status(405).json({ error: 'Method not allowed' })

  } catch (e) {
    console.error('[recipes]', e)
    return res.status(500).json({ error: e.message })
  }
}
