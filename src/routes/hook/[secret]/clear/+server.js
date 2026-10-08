import { checkSecret } from '$lib/server/secret'
import { setJsonWithRetry, STATE_KEY } from '$lib/server/redis'

/** @type {import('./$types').RequestHandler} */
export async function POST({ params }) {
	if (!checkSecret(params.secret)) {
		console.log('[clear 404] bad-secret')
		return new Response('not found', { status: 404 })
	}
	const state = {
		rev: Date.now(),
		photoUrl: null,
		caption: '',
		cleared: true,
		cuedAt: null,
		clearedAt: new Date().toISOString()
	}
	try {
		await setJsonWithRetry(STATE_KEY, state)
	} catch (e) {
		console.log(`[clear 500] redis-write ${/** @type {Error} */ (e).message}`)
		return new Response('redis write failed', { status: 500 })
	}
	console.log('[clear 200]')
	return new Response('ok', { status: 200 })
}
