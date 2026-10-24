// ────────────────────────────────────────────────────────────────────────────
// Image Gen V2 — the two parts of a look. Pure.
//
//   always — sex, hair, eyes, face, skin, and features you would see in any
//            shot (horns, animal ears, tails, wings, scars)
//   body   — build and proportions (hips, thighs, chest, legs, height…)
//
// Every tag in a prompt pulls the image toward showing it: "wide hips, thick
// thighs" in a face close-up makes the image model fit the body in. So body
// tags go in only when the shot frames the body.
// ────────────────────────────────────────────────────────────────────────────

import { splitTags } from "./resolve.js";

// A tag about the head or a feature that shows anywhere is never "body".
const ALWAYS_WORDS = /\b(hair|hairs|bangs|ponytail|braids?|twintails|eyes?|eyebrows?|eyelashes|face|facial|lips?|mouth|teeth|fangs?|nose|ears?|skin|freckles|mole|makeup|horns?|tails?|wings?|halo|scars?|tattoos?|pointy)\b/i;

const BODY_WORDS = /\b(breasts?|chest|cleavage|butt|ass|buttocks|hips?|thighs?|legs?|waist|stomach|belly|abs|abdomen|navel|muscular|muscles?|curvy|plump|chubby|voluptuous|toned|athletic|build|figure|physique|skinny|slender|slim|thin|petite|tall|shortstack|height|body|narrow shoulders|broad shoulders|shoulders)\b/i;

// "short male", "short female", "short stature": height, not hair.
const SHORT_BODY = /^short\s+(male|female|girl|boy|stature|person|build)$/i;

/** Splits a tag list into its always part and its body part. */
export function splitLookTags(tags) {
    const always = [];
    const body = [];
    for (const t of splitTags(tags)) {
        const bare = t.replace(/^\(|:[\d.]+\)$|\)$/g, "").trim();
        if (!ALWAYS_WORDS.test(bare) && (BODY_WORDS.test(bare) || SHORT_BODY.test(bare))) body.push(t);
        else always.push(t);
    }
    return { always: always.join(", "), body: body.join(", ") };
}

// Framing that shows the body. Close-ups, portraits, upper body and medium
// shots do not: body tags there only drag the image toward a full figure.
const FULL_BODY_FRAMING = /\b(full[ -]body|full[ -]length|head to toe|wide shot|very wide shot|long shot|wide angle|cowboy shot|from behind|from below|whole body)\b/i;

/** Does the prompt frame the body (so body tags belong in it)? */
export function framingShowsBody(prompt) {
    return FULL_BODY_FRAMING.test(String(prompt || ""));
}

/** "male" / "female" from a look, or "" when the look does not say. */
export function sexOf(tags) {
    const t = String(tags || "").toLowerCase();
    if (/\b(1girl|\d+girls|female|woman|girl|lady)\b/.test(t)) return "female";
    if (/\b(1boy|\d+boys|male|man|boy)\b/.test(t)) return "male";
    return "";
}
