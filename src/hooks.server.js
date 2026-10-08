/** @type {import('@sveltejs/kit').Handle} */
export async function handle({ event, resolve }) {
	const response = await resolve(event)
	const path = event.url.pathname
	if (path === '/control') {
		response.headers.set(
			'Content-Security-Policy',
			"frame-ancestors 'self' https://www.notion.so https://*.notion.so https://*.notion.site https://notion.so https://*.notion-embeds.com"
		)
	} else {
		response.headers.set('Content-Security-Policy', "frame-ancestors 'self'")
	}
	return response
}
