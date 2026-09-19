/*
 * Signature Pianos — warranty certificate download
 * ------------------------------------------------
 * GET /api/warranty-certificate?id=<warranty id>
 * Authorization: Bearer <Supabase access token>
 *
 * Draws the certificate PDF on demand (lib/warranty-pdf.js), the same one the
 * customer is emailed on delivery day. Only the certificate holder (matched the
 * way the portal matches them: customers.user_id, or their sign-in email) or an
 * active admin can download it.
 */

const { createClient } = require('@supabase/supabase-js')
const { buildWarrantyPdf, loadSignature, warrantyFilename } = require('../lib/warranty-pdf')

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const id = String(req.query?.id || '')
  const token = String(req.headers?.authorization || '').replace(/^Bearer\s+/i, '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return res.status(400).json({ error: 'Missing warranty id' })
  if (!token) return res.status(401).json({ error: 'Please sign in' })

  try {
    const { data: { user } = {}, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'Please sign in again' })

    const { data: warranty, error } = await supabase
      .from('warranties')
      .select('*, order:order_id ( * ), customer:customer_id ( * ), piano:piano_id ( * )')
      .eq('id', id)
      .maybeSingle()
    if (error) throw error
    if (!warranty) return res.status(404).json({ error: 'Warranty not found' })

    const customer = warranty.customer || {}
    const isOwner = (customer.user_id && customer.user_id === user.id) ||
      (customer.email && user.email && customer.email.toLowerCase() === user.email.toLowerCase())
    let allowed = isOwner
    if (!allowed) {
      const { data: admin } = await supabase
        .from('admin_users')
        .select('user_id')
        .eq('user_id', user.id)
        .eq('active', true)
        .maybeSingle()
      allowed = !!admin
    }
    if (!allowed) return res.status(404).json({ error: 'Warranty not found' })

    const signature = await loadSignature(supabase)
    const pdf = await buildWarrantyPdf({
      customer,
      piano: warranty.piano || {},
      order: warranty.order || {},
      warranty,
      signature
    })

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition', `attachment; filename="${warrantyFilename(warranty)}"`)
    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).send(Buffer.from(pdf))
  } catch (err) {
    console.error('[warranty-certificate] failed', err)
    return res.status(500).json({ error: 'Could not create the certificate' })
  }
}
