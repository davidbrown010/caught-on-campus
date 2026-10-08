import { timingSafeEqual } from 'node:crypto'
import { env } from '$env/dynamic/private'

/** @param {string | undefined | null} given */
export function checkSecret(given) {
	const SECRET = env.SECRET || ''
	if (!SECRET || typeof given !== 'string' || !given) return false
	const a = Buffer.from(given)
	const b = Buffer.from(SECRET)
	if (a.length !== b.length) return false
	return timingSafeEqual(a, b)
}
