// ────────────────────────────────────────────────────────────────────────────
// The ComfyUI address, ready to have "/path" added. Users often type it with a
// trailing slash ("http://host:8188/"); that made "//object_info", which
// ComfyUI answers with 404. Pure, so it is unit-tested.
// ────────────────────────────────────────────────────────────────────────────

export function comfyBase(url) {
    return String(url || "").trim().replace(/\/+$/, "");
}
