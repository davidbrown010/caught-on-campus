<script>
	import { onMount, onDestroy } from 'svelte'

	const POLL_MS = 2000
	const TIMEOUT_MS = 4000

	let state = $state(/** @type {any} */ (null))
	let display = $state(/** @type {any} */ (null))
	let serverLevel = $state(/** @type {'green' | 'amber' | 'red' | ''} */ (''))
	let serverText = $state('Checking\u2026')

	/** @type {ReturnType<typeof setTimeout> | null} */
	let tickTimer = null

	/** @param {string} iso */
	function fmtTime(iso) {
		try {
			const d = new Date(iso)
			let h = d.getHours()
			const m = d.getMinutes()
			const ap = h >= 12 ? 'PM' : 'AM'
			h = h % 12
			if (h === 0) h = 12
			return `${h}:${m < 10 ? '0' : ''}${m} ${ap}`
		} catch {
			return ''
		}
	}

	/** @param {string} iso */
	function ago(iso) {
		try {
			const ms = Date.now() - new Date(iso).getTime()
			if (ms < 2000) return 'just now'
			if (ms < 60000) return `${Math.round(ms / 1000)}s ago`
			if (ms < 3600000) return `${Math.round(ms / 60000)}m ago`
			return `${Math.round(ms / 3600000)}h ago`
		} catch {
			return ''
		}
	}

	let displayRow = $derived.by(() => {
		if (!display || !display.seenAt) return { level: 'amber', text: 'No display connected' }
		const age = Date.now() - new Date(display.seenAt).getTime()
		const level = age > 30000 ? 'red' : age > 10000 ? 'amber' : 'green'
		return { level, text: `Display seen ${ago(display.seenAt)}` }
	})

	let cueRow = $derived.by(() => {
		if (!state || (!state.cuedAt && !state.clearedAt)) return { level: '', text: 'No cue yet' }
		if (state.cleared) return { level: 'green', text: `Cleared at ${fmtTime(state.clearedAt)}` }
		return {
			level: 'green',
			text: `${fmtTime(state.cuedAt)}${state.caption ? ` \u2014 "${state.caption}"` : ''}`
		}
	})

	let photoRow = $derived.by(() => {
		if (!state || !state.photoUrl) return { level: '', text: '\u2014' }
		if (!display) return { level: 'amber', text: 'Waiting for display' }
		if (display.ok === false) return { level: 'red', text: 'Photo failed to load on display' }
		return { level: 'green', text: 'Photo loaded on display' }
	})

	let previewKind = $derived.by(() => {
		if (!state || (!state.photoUrl && !state.cleared && !state.cuedAt && !state.clearedAt))
			return 'empty'
		if (state.cleared || !state.photoUrl) return 'clear'
		return 'photo'
	})

	async function tick() {
		try {
			const ctrl = new AbortController()
			const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
			let res
			try {
				res = await fetch('/api/state?role=control', {
					signal: ctrl.signal,
					cache: 'no-store'
				})
			} finally {
				clearTimeout(t)
			}
			if (!res.ok) throw new Error(`status ${res.status}`)
			const j = await res.json()
			serverLevel = 'green'
			serverText = 'Reachable'
			state = j.state || null
			display = j.display || null
		} catch {
			serverLevel = 'red'
			serverText = "Can't reach server"
		} finally {
			tickTimer = setTimeout(tick, POLL_MS)
		}
	}

	onMount(() => {
		tick()
	})
	onDestroy(() => {
		if (tickTimer) clearTimeout(tickTimer)
	})
</script>

<div class="wrap">
	<div>
		<h2>On screen</h2>
		<div class="preview">
			{#if previewKind === 'photo' && state?.photoUrl}
				<div
					class="blur"
					style="background-image: url('{state.photoUrl.replace(/'/g, '%27')}')"
				></div>
				<div class="photo-wrap" class:has-caption={!!state.caption}>
					<img class="photo" src={state.photoUrl} alt="" />
				</div>
				{#if state.caption}
					<div class="cap-band"><div class="cap">{state.caption}</div></div>
				{/if}
			{:else if previewKind === 'clear'}
				<div class="empty">Screen is clear</div>
			{:else}
				<div class="empty">No cue yet</div>
			{/if}
		</div>
		<div class="cap-label">{state?.caption || ''}</div>
	</div>
	<div>
		<h2>Status</h2>
		<div class="rows">
			<div class="row">
				<span class="dot {serverLevel}"></span><span class="label">Server</span
				><span class="value">{serverText}</span>
			</div>
			<div class="row">
				<span class="dot {displayRow.level}"></span><span class="label">Display</span
				><span class="value">{displayRow.text}</span>
			</div>
			<div class="row">
				<span class="dot {cueRow.level}"></span><span class="label">Last cue</span
				><span class="value">{cueRow.text}</span>
			</div>
			<div class="row">
				<span class="dot {photoRow.level}"></span><span class="label">Photo</span
				><span class="value">{photoRow.text}</span>
			</div>
		</div>
		<div class="note">Send a test cue and clear before doors open.</div>
	</div>
</div>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		padding: 0;
		background: transparent;
		font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
		color: #2c2c2b;
		font-size: 13px;
		color-scheme: light dark;
	}
	@media (prefers-color-scheme: dark) {
		:global(body) {
			color: #e8e6e3;
		}
	}
	.wrap {
		padding: 10px;
		display: grid;
		grid-template-columns: 1fr;
		gap: 12px;
	}
	@media (min-width: 640px) {
		.wrap {
			grid-template-columns: 1.4fr 1fr;
		}
	}
	h2 {
		font-size: 11px;
		font-weight: 600;
		margin: 0 0 6px 0;
		color: #7d7a75;
		letter-spacing: 0.04em;
		text-transform: uppercase;
	}
	.preview {
		aspect-ratio: 32 / 9;
		width: 100%;
		background: #000;
		border-radius: 8px;
		overflow: hidden;
		position: relative;
		container-type: size;
		border: 1px solid #e6e5e3;
	}
	@media (prefers-color-scheme: dark) {
		.preview {
			border-color: rgba(255, 255, 255, 0.1);
		}
	}
	.blur {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-position: center;
		transform: scale(1.15);
		filter: blur(20px) brightness(0.55);
	}
	.photo-wrap {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.photo-wrap.has-caption {
		bottom: 20cqh;
	}
	.photo {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.cap-band {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 20cqh;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 6cqw;
	}
	.cap {
		color: #fff;
		font-weight: 800;
		font-size: 8cqh;
		text-align: center;
		text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
		max-width: 80%;
	}
	.empty {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		color: rgba(255, 255, 255, 0.5);
		font-size: 12px;
	}
	.cap-label {
		font-size: 12px;
		color: #7d7a75;
		margin-top: 6px;
		min-height: 16px;
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.row {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 10px 12px;
		border-radius: 8px;
		background: #f6f5f3;
		border: 1px solid #e6e5e3;
		min-height: 44px;
		box-sizing: border-box;
	}
	@media (prefers-color-scheme: dark) {
		.row {
			background: rgba(255, 255, 255, 0.04);
			border-color: rgba(255, 255, 255, 0.08);
		}
	}
	.dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #9b9b9b;
		flex: 0 0 auto;
	}
	.dot.green {
		background: #2ecc71;
	}
	.dot.amber {
		background: #f39c12;
	}
	.dot.red {
		background: #e74c3c;
	}
	.label {
		color: #7d7a75;
		width: 72px;
		flex: 0 0 auto;
		font-size: 12px;
	}
	.value {
		font-size: 13px;
		min-width: 0;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.note {
		font-size: 11px;
		color: #9b9b9b;
		margin-top: 6px;
	}
</style>
