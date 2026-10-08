<script>
	import { onMount, onDestroy } from 'svelte'

	const POLL_MS = 1000
	const FETCH_TIMEOUT_MS = 4000
	const UNREACHABLE_AFTER_MS = 5000

	let aspect = $state('32/9')
	let blurPx = $state(40)
	let statusMode = $state('auto')

	let shownRev = $state(/** @type {number | null} */ (null))
	let photoOk = $state(true)
	let currentLevel = $state('green')
	let statusText = $state('Connecting\u2026')
	let showStatusTemp = $state(false)
	let cursorHidden = $state(false)
	let hintVisible = $state(false)

	let activeIdx = $state(0)
	let layerA = $state({ photoUrl: /** @type {string | null} */ (null), caption: '' })
	let layerB = $state({ photoUrl: /** @type {string | null} */ (null), caption: '' })

	let stageW = $state(0)
	let stageH = $state(0)

	let statusVisible = $derived.by(() => {
		if (statusMode === 'off') return false
		if (statusMode === 'always') return true
		return showStatusTemp || currentLevel === 'amber' || currentLevel === 'red'
	})

	/** @type {ReturnType<typeof setTimeout> | null} */
	let pollTimer = null
	/** @type {ReturnType<typeof setTimeout> | null} */
	let hintTimer = null
	/** @type {ReturnType<typeof setTimeout> | null} */
	let cursorTimer = null
	/** @type {ReturnType<typeof setTimeout> | null} */
	let statusTempTimer = null
	let lastGoodPoll = Date.now()

	function sizeStage() {
		const vw = window.innerWidth
		const vh = window.innerHeight
		if (aspect === 'none') {
			stageW = vw
			stageH = vh
			return
		}
		const [ns, ds] = aspect.split('/')
		const ar = (parseFloat(ns) || 32) / (parseFloat(ds) || 9)
		let w = Math.min(vw, vh * ar)
		let h = w / ar
		if (h > vh) {
			h = vh
			w = h * ar
		}
		stageW = w
		stageH = h
	}

	/** @param {string} url */
	function preload(url) {
		return new Promise((resolve, reject) => {
			const img = new Image()
			img.onload = () => {
				if (img.decode) img.decode().then(() => resolve(img), () => resolve(img))
				else resolve(img)
			}
			img.onerror = () => reject(new Error('image load failed'))
			img.src = url
		})
	}

	/** @param {number} ms */
	const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

	/** @param {string} [iso] */
	function fmtTime(iso) {
		try {
			const d = iso ? new Date(iso) : new Date()
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

	/** @param {string} level @param {string} text */
	function setLevel(level, text) {
		currentLevel = level
		statusText = text
	}

	/** @param {string} photoUrl @param {string} caption @param {number} rev */
	async function showPhoto(photoUrl, caption, rev) {
		const waits = [1000, 2000, 4000]
		let attempt = 0
		while (true) {
			try {
				await preload(photoUrl)
				break
			} catch {
				if (attempt >= waits.length) {
					photoOk = false
					setLevel('red', 'Photo failed to load')
					return
				}
				await sleep(waits[attempt++])
			}
		}
		const next = (activeIdx + 1) % 2
		if (next === 0) layerA = { photoUrl, caption }
		else layerB = { photoUrl, caption }
		activeIdx = next
		shownRev = rev
		photoOk = true
		setLevel('green', `Connected, last cue ${fmtTime()}`)
	}

	/** @param {number} rev */
	function clearScreen(rev) {
		const next = (activeIdx + 1) % 2
		if (next === 0) layerA = { photoUrl: null, caption: '' }
		else layerB = { photoUrl: null, caption: '' }
		activeIdx = next
		shownRev = rev
		photoOk = true
		setLevel('green', `Connected, screen cleared ${fmtTime()}`)
	}

	async function poll() {
		try {
			const ctrl = new AbortController()
			const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
			let res
			try {
				res = await fetch(
					`/api/state?role=display&rev=${encodeURIComponent(String(shownRev ?? 0))}&ok=${photoOk ? 1 : 0}`,
					{ signal: ctrl.signal, cache: 'no-store' }
				)
			} finally {
				clearTimeout(t)
			}
			if (!res.ok) throw new Error(`status ${res.status}`)
			const json = await res.json()
			lastGoodPoll = Date.now()
			const s = json && json.state
			if (s && s.rev !== shownRev) {
				if (s.photoUrl) await showPhoto(s.photoUrl, s.caption || '', s.rev)
				else if (s.cleared) clearScreen(s.rev)
			} else if (currentLevel !== 'red') {
				if (s?.cuedAt) setLevel('green', `Connected, last cue ${fmtTime(s.cuedAt)}`)
				else if (s?.clearedAt && s.cleared)
					setLevel('green', `Connected, screen cleared ${fmtTime(s.clearedAt)}`)
				else setLevel('green', 'Connected, no cue yet')
			}
		} catch {
			if (Date.now() - lastGoodPoll > UNREACHABLE_AFTER_MS && currentLevel !== 'red') {
				setLevel('amber', "Can't reach server")
			}
		} finally {
			pollTimer = setTimeout(poll, POLL_MS)
		}
	}

	function toggleFs() {
		try {
			if (!document.fullscreenElement) {
				document.documentElement.requestFullscreen().catch(() => {})
			} else {
				document.exitFullscreen().catch(() => {})
			}
		} catch {}
	}

	function updateHint() {
		if (document.fullscreenElement) {
			hintVisible = false
			return
		}
		hintVisible = true
		if (hintTimer) clearTimeout(hintTimer)
		hintTimer = setTimeout(() => {
			hintVisible = false
		}, 5000)
	}

	function peekStatus() {
		if (statusMode === 'off') return
		showStatusTemp = true
		if (statusTempTimer) clearTimeout(statusTempTimer)
		statusTempTimer = setTimeout(() => {
			showStatusTemp = false
		}, 5000)
	}

	function onMouseMove() {
		cursorHidden = false
		if (cursorTimer) clearTimeout(cursorTimer)
		cursorTimer = setTimeout(() => {
			cursorHidden = true
		}, 2000)
		peekStatus()
	}

	/** @param {KeyboardEvent} e */
	function onKey(e) {
		if (e.key === 'f' || e.key === 'F') toggleFs()
		if (e.key === 'h' || e.key === 'H') peekStatus()
	}

	onMount(() => {
		const p = new URLSearchParams(location.search)
		aspect = p.get('aspect') || '32/9'
		const b = p.get('blur')
		if (b !== null) {
			const n = parseInt(b, 10)
			if (!isNaN(n)) blurPx = n
		}
		statusMode = p.get('status') || 'auto'
		sizeStage()
		updateHint()
		cursorTimer = setTimeout(() => {
			cursorHidden = true
		}, 2000)
		document.addEventListener('fullscreenchange', updateHint)
		window.addEventListener('resize', sizeStage)
		document.addEventListener('mousemove', onMouseMove)
		document.addEventListener('keydown', onKey)
		document.addEventListener('dblclick', toggleFs)
		poll()
	})

	onDestroy(() => {
		if (pollTimer) clearTimeout(pollTimer)
		if (hintTimer) clearTimeout(hintTimer)
		if (cursorTimer) clearTimeout(cursorTimer)
		if (statusTempTimer) clearTimeout(statusTempTimer)
		if (typeof document !== 'undefined') {
			document.removeEventListener('fullscreenchange', updateHint)
			window.removeEventListener('resize', sizeStage)
			document.removeEventListener('mousemove', onMouseMove)
			document.removeEventListener('keydown', onKey)
			document.removeEventListener('dblclick', toggleFs)
		}
	})
</script>

<svelte:head>
	<title>Caught on Campus</title>
</svelte:head>

<div class="root" class:cursor-hidden={cursorHidden}>
	<div class="stage" style="width: {stageW}px; height: {stageH}px; --blur: {blurPx}px;">
		<div class="layer" class:on={activeIdx === 0} class:has-caption={!!layerA.caption}>
			{#if layerA.photoUrl}
				<div
					class="blur"
					style="background-image: url('{layerA.photoUrl.replace(/'/g, '%27')}')"
				></div>
				<div class="photo-wrap">
					<img class="photo" src={layerA.photoUrl} alt="" />
				</div>
				{#if layerA.caption}
					<div class="caption-band"><div class="caption">{layerA.caption}</div></div>
				{/if}
			{/if}
		</div>
		<div class="layer" class:on={activeIdx === 1} class:has-caption={!!layerB.caption}>
			{#if layerB.photoUrl}
				<div
					class="blur"
					style="background-image: url('{layerB.photoUrl.replace(/'/g, '%27')}')"
				></div>
				<div class="photo-wrap">
					<img class="photo" src={layerB.photoUrl} alt="" />
				</div>
				{#if layerB.caption}
					<div class="caption-band"><div class="caption">{layerB.caption}</div></div>
				{/if}
			{/if}
		</div>
	</div>
</div>

{#if hintVisible}<div class="hint">Press F for fullscreen</div>{/if}
<div
	class="status"
	class:show={statusVisible}
	class:amber={currentLevel === 'amber'}
	class:red={currentLevel === 'red'}
>
	<span class="dot"></span><span>{statusText}</span>
</div>

<style>
	:global(html),
	:global(body) {
		margin: 0;
		height: 100%;
		background: #000;
		color: #fff;
		overflow: hidden;
		font-family: ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif;
	}
	.root {
		position: fixed;
		inset: 0;
		display: grid;
		place-items: center;
		background: #000;
	}
	.root.cursor-hidden {
		cursor: none;
	}
	.stage {
		position: relative;
		background: #000;
		container-type: size;
		overflow: hidden;
	}
	.layer {
		position: absolute;
		inset: 0;
		opacity: 0;
		transition: opacity 500ms linear;
		will-change: opacity;
	}
	.layer.on {
		opacity: 1;
	}
	.blur {
		position: absolute;
		inset: 0;
		background-size: cover;
		background-position: center;
		transform: scale(1.15);
		filter: blur(var(--blur)) brightness(0.55);
	}
	.photo-wrap {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.layer.has-caption .photo-wrap {
		bottom: 20cqh;
	}
	.photo {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
		display: block;
	}
	.caption-band {
		position: absolute;
		left: 0;
		right: 0;
		bottom: 0;
		height: 20cqh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0 6cqw;
		background: linear-gradient(to top, rgba(0, 0, 0, 0.65), rgba(0, 0, 0, 0));
	}
	.caption {
		font-size: 8cqh;
		font-weight: 800;
		text-align: center;
		line-height: 1.1;
		text-wrap: balance;
		text-shadow: 0 0.4cqh 1.2cqh rgba(0, 0, 0, 0.7);
		max-width: 80%;
		color: #fff;
	}
	.hint {
		position: fixed;
		top: 12px;
		left: 12px;
		color: rgba(255, 255, 255, 0.5);
		font-size: 12px;
		pointer-events: none;
	}
	.status {
		position: fixed;
		bottom: 10px;
		left: 12px;
		color: rgba(255, 255, 255, 0.75);
		font-size: 14px;
		display: flex;
		align-items: center;
		gap: 8px;
		z-index: 10;
		opacity: 0;
		transition: opacity 400ms;
		pointer-events: none;
		text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
	}
	.status.show {
		opacity: 0.7;
	}
	.status .dot {
		width: 10px;
		height: 10px;
		border-radius: 50%;
		background: #2ecc71;
	}
	.status.amber .dot {
		background: #f39c12;
	}
	.status.red .dot {
		background: #e74c3c;
	}
</style>
