// ─────────────────────────────────────────────────────────────────────────────
// Real generation progress from ComfyUI.
//
// The bar used to be a barber-pole animation: it moved, but it knew nothing. It
// looked identical at step 1 of 40 and at step 39, and identical again when the
// server had quietly died.
//
// ComfyUI publishes genuine progress over a websocket, but only to the client id
// that submitted the job — so the id has to be minted here, handed to the socket
// AND sent in the /prompt body. Miss either half and the socket connects fine and
// then stays silent forever, which is the failure mode to watch for.
//
// The same socket also carries the finished image when the workflow saves with a
// SaveImageWebsocket node: the image arrives as a binary frame, so no /history
// poll and no /view download are needed, and nothing is written to the ComfyUI
// host disk. Binary frames are Blobs, not JSON, and their 8-byte header — 4 bytes
// event type, 4 bytes image format (1 = JPEG, 2 = PNG) — cannot be read
// synchronously off a Blob. Frames are therefore forwarded raw, in arrival
// order, and decodeComfyImageFrame turns one into a data URL when the caller is
// ready to act on it. Decoding eagerly would race the completion message and a
// fast image could be mistaken for "no image".
//
// Everything here is best-effort by design. If the socket cannot open, or the
// server never reports, the caller keeps the animated bar and the existing
// history poll still finishes the job. Progress reporting must never be able to
// break image generation.
// ─────────────────────────────────────────────────────────────────────────────

export function makeComfyClientId() {
    try {
        if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
    } catch (e) { /* fall through */ }
    return "megumin-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Decodes one raw binary frame into a data URL. Returns null for anything that
// is not an image payload: the event type must be 1 — the only type that carries
// image bytes — and the format byte picks the mime. There is no dedicated
// "final image" event on the wire; SaveImageWebsocket sends its image through
// exactly this channel, one frame per image in the batch.
export async function decodeComfyImageFrame(frame) {
    try {
        const headerBuf = await frame.slice(0, 8).arrayBuffer();
        const view = new DataView(headerBuf);
        const eventType = view.getUint32(0);
        if (eventType !== 1) return null; // 1 = image frame; other binary types are not images
        const imageType = view.getUint32(4); // 1 = JPEG, 2 = PNG
        const mime = imageType === 1 ? "image/jpeg" : "image/png";

        const imgBuf = await frame.slice(8).arrayBuffer();
        const bytes = new Uint8Array(imgBuf);
        // Chunks keep the argument list short: spreading a few megabytes of bytes
        // at once trips RangeError on some engines.
        let binary = "";
        const CHUNK = 0x8000;
        for (let i = 0; i < bytes.length; i += CHUNK) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
        }
        return { dataUrl: `data:${mime};base64,${btoa(binary)}`, format: imageType === 1 ? "jpeg" : "png" };
    } catch (e) {
        return null;
    }
}

// Opens the progress socket. Returns a handle with close(); call it on every exit
// path, success or failure, or the socket outlives the job it was watching.
//
// onProgress(value, max) fires per sampler step. onNode(nodeId, promptId) fires
// when the running node changes — nodeId null means the queue finished.
// onBinary(frame) fires for every binary message, raw and in arrival order.
// onError(data) fires on execution_error / execution_interrupted payloads.
export function openComfyProgressSocket(comfyUrl, clientId, { onProgress, onNode, onBinary, onError } = {}) {
    let ws = null;
    let closed = false;
    let openedResolve = null;
    const opened = new Promise((resolve) => { openedResolve = resolve; });
    const resolveOpened = (ok) => { if (openedResolve) { openedResolve(ok); openedResolve = null; } };

    try {
        // http://host:8188 → ws://host:8188/ws , https → wss.
        // https is tested first: matching "http" would otherwise consume the prefix
        // of "https" and leave the secure case to work only by coincidence.
        const base = String(comfyUrl || "").trim().replace(/\/+$/, "");
        const wsUrl = base.replace(/^https:/i, "wss:").replace(/^http:/i, "ws:")
            + "/ws?clientId=" + encodeURIComponent(clientId);
        // The exact URL goes to the console: when a tunnel or proxy mangles the
        // scheme or the path, this line is the difference between debugging and
        // guessing.
        console.debug("[Megumin Suite] ComfyUI progress socket →", wsUrl);
        ws = new WebSocket(wsUrl);

        // WS-mode delivery hangs off a real connection, so open and pre-open
        // failures resolve `opened` instead of dying silently. The promise is
        // single-shot: later errors after a successful open are no-ops.
        ws.onopen = () => { resolveOpened(true); };
        ws.onclose = () => { resolveOpened(false); };
        ws.onmessage = (ev) => {
            if (closed) return;
            // Binary frames carry previews and (with SaveImageWebsocket) the finished
            // image. Not JSON — forwarded raw, in arrival order.
            if (typeof ev.data !== "string") {
                if (typeof onBinary === "function") {
                    try { onBinary(ev.data); } catch (e) { /* progress must never break the job */ }
                }
                return;
            }
            let msg;
            try { msg = JSON.parse(ev.data); } catch (e) { return; }
            if (!msg || !msg.type) return;

            if (msg.type === "progress" && msg.data && typeof msg.data.max === "number" && msg.data.max > 0) {
                if (typeof onProgress === "function") onProgress(msg.data.value || 0, msg.data.max);
            } else if (msg.type === "executing" && msg.data) {
                if (typeof onNode === "function") onNode(msg.data.node ?? null, msg.data.prompt_id);
            } else if ((msg.type === "execution_error" || msg.type === "execution_interrupted") && msg.data) {
                if (typeof onError === "function") onError(msg.data);
            }
        };

        // Silent on error: a missing socket costs the caller its percentage, nothing
        // more, and ComfyUI setups behind proxies that block websockets are common.
        ws.onerror = () => { resolveOpened(false); };
    } catch (e) {
        console.debug("[Megumin Suite] ComfyUI progress socket unavailable; using the indeterminate bar.", e);
        resolveOpened(false);
        ws = null;
    }

    return {
        opened,
        close() {
            closed = true;
            try { if (ws) ws.close(); } catch (e) { /* already gone */ }
            ws = null;
        }
    };
}
