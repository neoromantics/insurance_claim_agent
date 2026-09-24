// GET /api/health
export default defineEventHandler(() => ({ status: 'ok', ts: new Date().toISOString() }))
