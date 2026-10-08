import { env } from '$env/dynamic/private'

const REDIS_URL = env.KV_REST_API_URL || ''
const REDIS_TOKEN = env.KV_REST_API_TOKEN || ''

export const STATE_KEY = 'coc:state'
export const DISPLAY_KEY = 'coc:display'
export const DISPLAY_HEARTBEAT_TTL = 60
export const DISPLAY_HEARTBEAT_WRITE_MS = 10_000

const REDIS_TIMEOUT_MS = 3000

/**
 * @param {Array<string>} args
 * @param {number} [timeoutMs]
 */
async function cmd(args, timeoutMs = REDIS_TIMEOUT_MS) {
	if (!REDIS_URL || !REDIS_TOKEN) throw new Error('redis not configured')
	const ctrl = new AbortController()
	const t = setTimeout(() => ctrl.abort(), timeoutMs)
	try {
		const res = await fetch(REDIS_URL, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${REDIS_TOKEN}`,
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(args),
			signal: ctrl.signal
		})
		if (!res.ok) throw new Error(`redis http ${res.status}`)
		const data = await res.json()
		return data.result
	} finally {
		clearTimeout(t)
	}
}

export async function getJson(key) {
	const raw = await cmd(['GET', key])
	if (raw == null) return null
	try {
		return JSON.parse(raw)
	} catch {
		return null
	}
}

export async function setJson(key, value, exSeconds) {
	const args = ['SET', key, JSON.stringify(value)]
	if (exSeconds) args.push('EX', String(exSeconds))
	return cmd(args)
}

export async function setJsonWithRetry(key, value, exSeconds) {
	try {
		return await setJson(key, value, exSeconds)
	} catch (e) {
		await new Promise((r) => setTimeout(r, 200))
		return setJson(key, value, exSeconds)
	}
}
