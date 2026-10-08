/**
 * Pull the first https photo URL out of a Notion webhook page payload.
 * Prefers the "Upload Photo" files property, falls back to any other files property.
 * @param {any} data
 * @returns {string | null}
 */
export function extractPhotoUrl(data) {
	const props = (data && data.properties) || {}
	const ordered = []
	if (props['Upload Photo']) ordered.push(props['Upload Photo'])
	for (const [k, v] of Object.entries(props)) {
		if (k === 'Upload Photo') continue
		if (v && /** @type {any} */ (v).type === 'files') ordered.push(v)
	}
	for (const prop of ordered) {
		const files = Array.isArray(/** @type {any} */ (prop)?.files)
			? /** @type {any} */ (prop).files
			: []
		for (const f of files) {
			const url = f?.file?.url ?? f?.external?.url
			if (typeof url === 'string' && url.startsWith('https://')) return url
		}
	}
	return null
}

/** @param {any[]} arr */
function joinRich(arr) {
	if (!Array.isArray(arr)) return ''
	return arr.map((x) => (x && x.plain_text) || '').join('').trim()
}

/**
 * Pull a caption out of a Notion webhook page payload.
 * Prefers "Description" title, falls back to any title, then any rich_text.
 * Returns '' when nothing is found (empty captions are allowed).
 * @param {any} data
 * @returns {string}
 */
export function extractCaption(data) {
	const props = (data && data.properties) || {}
	if (props['Description']?.title) {
		const c = joinRich(props['Description'].title)
		if (c) return c
	}
	for (const v of Object.values(props)) {
		const p = /** @type {any} */ (v)
		if (p?.type === 'title') {
			const c = joinRich(p.title)
			if (c) return c
		}
	}
	for (const v of Object.values(props)) {
		const p = /** @type {any} */ (v)
		if (p?.type === 'rich_text') {
			const c = joinRich(p.rich_text)
			if (c) return c
		}
	}
	return ''
}
