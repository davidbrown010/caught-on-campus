import { json } from '@sveltejs/kit'
import {
	getJson,
	setJson,
	STATE_KEY,
	DISPLAY_KEY,
	DISPLAY_HEARTBEAT_TTL,
	DISPLAY_HEARTBEAT_WRITE_MS
} from '$lib/server/redis'

/** @type {import('./$types').RequestHandler} */
export async function GET({ url, setHeaders }) {
	setHeaders({ 'cache-control': 'no-store' })
	try {
		const state = await getJson(STATE_KEY)
		const role = url.searchParams.get('role')
		if (role === 'display') {
			const ok = url.searchParams.get('ok') === '1'
			try {
				const existing = await getJson(DISPLAY_KEY)
				const now = Date.now()
				const age = existing?.seenAt ? now - new Date(existing.seenAt).getTime() : Infinity
				if (!existing || existing.ok !== ok || age > DISPLAY_HEARTBEAT_WRITE_MS) {
					await setJson(
						DISPLAY_KEY,
						{ seenAt: new Date().toISOString(), ok },
						DISPLAY_HEARTBEAT_TTL
					)
				}
			} catch {
				/* heartbeat failures are not fatal */
			}
			return json({ state: state || null })
		}
		if (role === 'control') {
			let display = null
			try {
				display = await getJson(DISPLAY_KEY)
			} catch {
				/* control tolerates missing heartbeat */
			}
			return json({ state: state || null, display })
		}
		return json({ state: state || null })
	} catch (e) {
		console.log(`[state 503] ${/** @type {Error} */ (e).message}`)
		return new Response('redis unavailable', { status: 503 })
	}
}
