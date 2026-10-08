import { checkSecret } from '$lib/server/secret'
import { setJsonWithRetry, STATE_KEY } from '$lib/server/redis'
import { extractPhotoUrl, extractCaption } from '$lib/server/webhook'

/** @type {import('./$types').RequestHandler} */
export async function POST({ params, request }) {
	if (!checkSecret(params.secret)) {
		console.log('[cue 404] bad-secret')
		return new Response('not found', { status: 404 })
	}
	let body
	try {
		body = await request.json()
	} catch {
		return new Response('bad json', { status: 400 })
	}
	const data = body?.data
	if (!data || typeof data !== 'object') {
		console.log('[cue 400] missing data')
		return new Response('missing data', { status: 400 })
	}
	if (data.in_trash) {
		console.log('[cue 200] in-trash ignored')
		return new Response('ignored', { status: 200 })
	}
	const photoUrl = extractPhotoUrl(data)
	const caption = extractCaption(data)
	if (!photoUrl) {
		const names = Object.keys(data.properties || {}).join(',')
		console.log(`[cue 400] no-photo props=[${names}]`)
		return new Response('no photo url', { status: 400 })
	}
	const state = {
		rev: Date.now(),
		photoUrl,
		caption,
		cleared: false,
		cuedAt: new Date().toISOString(),
		clearedAt: null
	}
	try {
		await setJsonWithRetry(STATE_KEY, state)
	} catch (e) {
		console.log(`[cue 500] redis-write ${/** @type {Error} */ (e).message}`)
		return new Response('redis write failed', { status: 500 })
	}
	console.log(`[cue 200] "${caption}"`)
	return new Response('ok', { status: 200 })
}
