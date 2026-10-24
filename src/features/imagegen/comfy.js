// ────────────────────────────────────────────────────────────────────────────
// Image generation — the shared ComfyUI side: connection, workflows, rendering,
// in-chat image placement and the retry buttons. Used by both the Classic and
// the V2 page; neither owns it. Moved here unchanged from the pre-001 file
// (df9e9db); only the prompt side differs between Classic and V2.
// ────────────────────────────────────────────────────────────────────────────

import {
    getContext, getRequestHeaders, saveChat, reloadCurrentChat, addOneMessage, appendMediaToMessage, updateMessageBlock, saveBase64AsFile, humanizedDateTime, Popup, POPUP_TYPE,
} from "../../st.js";
import { localProfile } from "../../core/state.js";
import { saveProfileToMemory } from "../../core/profile.js";
import { registerRefreshHook, REFRESH } from "../../core/refreshHooks.js";
import { showKazumaProgress } from "../../ui/progress.js";
import { KAZUMA_PLACEHOLDERS } from "../../../data/image_data.js";
import { meguminScheduleBlocksRefresh } from "../blocks/chat.js";
import { makeComfyClientId, openComfyProgressSocket } from "./comfyProgress.js";
import { comfyBase } from "./comfyUrl.js";

// -------------------------------------------------------------
// STAGE 8 HELPER FUNCTIONS
// -------------------------------------------------------------
// Every ComfyUI request the settings tab makes gives up quickly. When ComfyUI is
// unreachable, SillyTavern's server waits about two minutes for each one, and a
// browser keeps only ~6 connections open to one server: a few of these left
// waiting and every SillyTavern request queues behind them (it looks offline).
// Aborting here frees the browser's connection at once.
const LIST_TIMEOUT_MS = 10000;
const PING_TIMEOUT_MS = 6000;
const timeout = ms => (typeof AbortSignal !== "undefined" && AbortSignal.timeout ? AbortSignal.timeout(ms) : undefined);

export async function igFetchComfyLists() {
    const s = localProfile.imageGen;
    const url = comfyBase(s.comfyUrl);
    try {
        const mRes = await fetch('/api/sd/comfy/models', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: url }), signal: timeout(LIST_TIMEOUT_MS) });
        if (mRes.ok) {
            const models = await mRes.json();
            const sel = $("#ig_model"); sel.empty().append('<option value="">-- Select Model --</option>');
            models.forEach(m => { let v = m.value || m; let t = m.text || v; sel.append(`<option value="${v}">${t}</option>`); });
            if (s.selectedModel) sel.val(s.selectedModel);
        }
        const sRes = await fetch('/api/sd/comfy/samplers', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: url }), signal: timeout(LIST_TIMEOUT_MS) });
        if (sRes.ok) {
            const samplers = await sRes.json();
            const sel = $("#ig_sampler"); sel.empty();
            samplers.forEach(sa => sel.append(`<option value="${sa}">${sa}</option>`));
            if (s.selectedSampler) sel.val(s.selectedSampler);
        }
        const lRes = await fetch(`${url}/object_info/LoraLoader`, { signal: timeout(LIST_TIMEOUT_MS) });
        if (lRes.ok) {
            const json = await lRes.json();
            const files = json['LoraLoader'].input.required.lora_name[0];
            for (let i = 1; i <= 4; i++) {
                const sel = $(`#ig_lora_${i}`); 
                const val = i === 1 ? s.selectedLora : s[`selectedLora${i}`];
                sel.empty().append('<option value="">-- No LoRA --</option>');
                files.forEach(f => sel.append(`<option value="${f}">${f}</option>`));
                if (val) sel.val(val);
            }
        }
    } catch (e) { console.warn(`[Megumin-Suite] ComfyLists failed`, e); }
}

export function toggleQuickGenButton() {
    const s = localProfile?.imageGen;
    if (s && s.enabled && s.triggerMode === 'manual') {
        $("#kazuma_quick_gen").css("display", "flex");
    } else {
        $("#kazuma_quick_gen").css("display", "none");
    }
}

// The last answer for one address, and the check still running for it. The tab
// redraws often (every page switch); they all share one check per address.
const conn = { url: null, ok: null, pending: null };

/** What the last check said for the current address: true, false, or null (not known yet). */
export function igKnownConnection() {
    const url = localProfile?.imageGen?.comfyUrl;
    return conn.url === url ? conn.ok : null;
}

/**
 * Quiet check for the Images tab: true when ComfyUI answers. No toasts. Asked
 * once per address; `force` asks again (the Test button).
 */
export function igCheckConnection({ force = false } = {}) {
    const url = localProfile?.imageGen?.comfyUrl;
    if (!url) return Promise.resolve(false);
    if (!force && conn.url === url) {
        if (conn.pending) return conn.pending;
        if (conn.ok !== null) return Promise.resolve(conn.ok);
    }
    conn.url = url;
    conn.ok = null;
    const job = (async () => {
        try {
            const res = await fetch('/api/sd/comfy/ping', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url }), signal: timeout(PING_TIMEOUT_MS) });
            return res.ok;
        } catch (e) { return false; }
    })().then(ok => {
        if (conn.url === url && conn.pending === job) { conn.ok = ok; conn.pending = null; }
        return ok;
    });
    conn.pending = job;
    return job;
}

export async function igTestConnection() {
    const ok = await igCheckConnection({ force: true });
    if (ok) { toastr.success("ComfyUI is connected.", "Megumin Suite"); await igFetchComfyLists(); }
    else toastr.error("ComfyUI didn't answer at this address. Check that it is running and the address is right.", "Megumin Suite");
    return ok;
}

export async function igPopulateWorkflows() {
    const sel = $("#ig_workflow_list"); sel.empty();
    try {
        const res = await fetch('/api/sd/comfy/workflows', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ url: localProfile.imageGen.comfyUrl }), signal: timeout(LIST_TIMEOUT_MS) });
        if (res.ok) {
            const wfs = await res.json();
            wfs.forEach(w => sel.append(`<option value="${w}">${w}</option>`));
            if (localProfile.imageGen.currentWorkflowName && wfs.includes(localProfile.imageGen.currentWorkflowName)) {
                sel.val(localProfile.imageGen.currentWorkflowName);
            } else if (wfs.length > 0) {
                sel.val(wfs[0]); localProfile.imageGen.currentWorkflowName = wfs[0]; saveProfileToMemory();
            }
        }
    } catch (e) { sel.append('<option disabled>Failed to load</option>'); }
}

export async function igNewWorkflowClick() {
    let name = await prompt("New workflow file name (e.g. 'my_flux.json'):");
    if (!name) return; if (!name.toLowerCase().endsWith('.json')) name += '.json';
    try {
        const res = await fetch('/api/sd/comfy/save-workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name, workflow: '{}' }) });
        if (!res.ok) throw new Error(await res.text());
        toastr.success("Workflow created!"); await igPopulateWorkflows(); $("#ig_workflow_list").val(name).trigger('change');
        setTimeout(igOpenWorkflowEditorClick, 500);
    } catch (e) { toastr.error(e.message); }
}

export async function igDeleteWorkflowClick() {
    const name = localProfile.imageGen.currentWorkflowName;
    if (!name) return; if (!confirm(`Delete ${name}?`)) return;
    try {
        const res = await fetch('/api/sd/comfy/delete-workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name }) });
        if (!res.ok) throw new Error(await res.text());
        toastr.success("Deleted."); await igPopulateWorkflows();
    } catch (e) { toastr.error(e.message); }
}

export async function igOpenWorkflowEditorClick() {
    const name = localProfile.imageGen.currentWorkflowName;
    if (!name) return toastr.warning("No workflow selected");
    let loadedContent = "{}";
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name }) });
        if (res.ok) {
            const rawBody = await res.json(); let jsonObj = rawBody;
            if (typeof rawBody === 'string') { try { jsonObj = JSON.parse(rawBody); } catch (e) { } }
            loadedContent = JSON.stringify(jsonObj, null, 4);
        }
    } catch (e) { toastr.error("Failed to load file. Starting empty."); }

    let currentJsonText = loadedContent;
    const $container = $(`
        <div style="display: flex; flex-direction: column; width: 100%; gap: 10px; font-family: 'Inter', sans-serif; color: var(--text-main);">
            <div style="display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--border-color); padding-bottom:10px;">
                <h3 style="margin:0; color: var(--gold);">${name}</h3>
                <div style="display:flex; gap:8px;">
                    <button class="ps-modern-btn secondary wf-format" title="Beautify JSON"><i class="fa-solid fa-align-left"></i> Format</button>
                    <button class="ps-modern-btn secondary wf-import" title="Upload .json file"><i class="fa-solid fa-upload"></i> Import</button>
                    <button class="ps-modern-btn secondary wf-export" title="Download .json file"><i class="fa-solid fa-download"></i> Export</button>
                    <input type="file" class="wf-file-input" accept=".json" style="display:none;" />
                </div>
            </div>
            <div style="display: flex; gap: 15px;">
                <textarea class="ps-modern-input wf-textarea" spellcheck="false" style="flex: 1; min-height: 500px; font-family: 'Consolas', 'Monaco', monospace; white-space: pre; resize: none; font-size: 13px; line-height: 1.4; background: #000;"></textarea>
                <div style="width: 250px; flex-shrink: 0; display: flex; flex-direction: column; border-left: 1px solid var(--border-color); padding-left: 10px; max-height: 500px;">
                    <h4 style="margin: 0 0 10px 0; color: var(--text-muted);">Placeholders</h4>
                    <div class="wf-list" style="overflow-y: auto; flex: 1; padding-right: 5px;"></div>
                </div>
            </div>
        </div>
    `);

    const $textarea = $container.find('.wf-textarea'); const $list = $container.find('.wf-list'); const $fileInput = $container.find('.wf-file-input');
    $textarea.val(currentJsonText);

    KAZUMA_PLACEHOLDERS.forEach(item => {
        const $itemDiv = $('<div></div>').css({ 'padding': '8px', 'margin-bottom': '6px', 'background': 'rgba(255,255,255,0.05)', 'border-radius': '6px', 'border': '1px solid transparent', 'transition': '0.2s' });
        $itemDiv.append($('<span></span>').text(item.key).css({ 'font-weight': 'bold', 'color': 'var(--gold)', 'font-family': 'monospace' })).append($('<div></div>').text(item.desc).css({ 'font-size': '0.7rem', 'color': 'var(--text-muted)', 'margin-top': '4px' }));
        $list.append($itemDiv);
    });

    const updateState = () => {
        currentJsonText = $textarea.val();
        $list.children().each(function () {
            const cleanKey = $(this).find('span').first().text().replace(/"/g, '');
            if (currentJsonText.includes(cleanKey)) $(this).css({ 'border-color': '#10b981', 'background': 'rgba(16, 185, 129, 0.1)' });
            else $(this).css({ 'border-color': 'transparent', 'background': 'rgba(255,255,255,0.05)' });
        });
    };
    $textarea.on('input', updateState); setTimeout(updateState, 100);

    $container.find('.wf-format').on('click', () => { try { $textarea.val(JSON.stringify(JSON.parse($textarea.val()), null, 4)); updateState(); toastr.success("Formatted"); } catch (e) { toastr.warning("Invalid JSON"); } });
    $container.find('.wf-import').on('click', () => $fileInput.click());
    $fileInput.on('change', (e) => { if (!e.target.files[0]) return; const r = new FileReader(); r.onload = (ev) => { $textarea.val(ev.target.result); updateState(); toastr.success("Imported"); }; r.readAsText(e.target.files[0]); $fileInput.val(''); });
    $container.find('.wf-export').on('click', () => { try { JSON.parse(currentJsonText); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([currentJsonText], { type: "application/json" })); a.download = name; a.click(); } catch (e) { toastr.warning("Invalid content"); } });

    const popup = new Popup($container, POPUP_TYPE.CONFIRM, '', { okButton: 'Save Changes', cancelButton: 'Cancel', wide: true, large: true, onClosing: () => { try { JSON.parse(currentJsonText); return true; } catch (e) { toastr.error("Invalid JSON."); return false; } } });
    if (await popup.show()) {
        try {
            const res = await fetch('/api/sd/comfy/save-workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: name, workflow: JSON.stringify(JSON.parse(currentJsonText)) }) });
            if (!res.ok) throw new Error(await res.text()); toastr.success("Workflow Saved!");
        } catch (e) { toastr.error("Save Failed."); }
    }
}

// ── Inline Image Retry: DOM-based button injection ──
// SillyTavern's HTML sanitizer renames custom CSS classes (e.g. "kazuma-foo" → "custom-kazuma-foo")
// when rendering message.mes. This means buttons stored in mes will never match click handlers.
// Instead, we inject buttons via direct DOM manipulation AFTER ST renders, like ComfyInject does.
export function addKazumaRetryButtons(msgIndex) {
    const context = getContext();
    const message = context.chat[msgIndex];
    if (!message) return;

    const messageNode = document.querySelector(`[mesid="${msgIndex}"]`);
    if (!messageNode) return;

    // ST's sanitizer prefixes custom classes with "custom-" in the rendered DOM
    const images = messageNode.querySelectorAll('img[alt="KazumaInline"]');
    if (images.length === 0) return;

    images.forEach((img) => {
        // Find the wrapper div (ST may rename the class, but the structure is preserved)
        const wrapper = img.closest('div');
        if (!wrapper) return;

        // Don't add a second retry button if one already exists
        if (wrapper.querySelector('.kazuma-regen-btn')) return;

        // Get the wrapperId — try data attr first, then wrapper's id
        const wrapperId = img.getAttribute('data-kazumaid') || img.dataset?.kazumaid || wrapper.id || '';

        // Get the prompt — try title attr from DOM, then parse from message.mes
        let prompt = (img.getAttribute('title') || '').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        if (!prompt && wrapperId && message.mes) {
            // Extract prompt from the raw mes using the wrapperId
            const mesMatch = message.mes.match(new RegExp(`<img[^>]*?title="([^"]*)"[^>]*?data-kazumaid="${wrapperId}"`));
            if (mesMatch) prompt = mesMatch[1].replace(/&quot;/g, '"').replace(/&#39;/g, "'");
        }

        if (!prompt || !wrapperId) return;

        // Style the wrapper for absolute positioning of the button
        wrapper.style.position = 'relative';
        wrapper.style.display = 'inline-block';

        // Create the retry button
        const btn = document.createElement('div');
        btn.className = 'kazuma-regen-btn';
        btn.title = 'Regenerate this image';
        // On a device with no pointer there is no mouseenter, so a button that
        // rests at opacity 0 can never be seen. Rest it at 0.85 instead.
        const kazumaCanHover = !window.matchMedia || window.matchMedia('(hover: hover)').matches;
        const kazumaRestOpacity = kazumaCanHover ? '0' : '0.85';
        btn.style.cssText = 'position:absolute; top:8px; right:8px; cursor:pointer; background:rgba(0,0,0,0.65); color:#ffcc00; border-radius:6px; padding:5px 8px; font-size:14px; z-index:10; border:1px solid rgba(255,204,0,0.5); opacity:' + kazumaRestOpacity + '; transition:opacity 0.2s ease; line-height:1;';
        btn.innerHTML = '<i class="fa-solid fa-arrows-rotate"></i>';

        // Show/hide on hover
        wrapper.addEventListener('mouseenter', () => { btn.style.opacity = '1'; });
        wrapper.addEventListener('mouseleave', () => { btn.style.opacity = kazumaRestOpacity; });

        // Click handler — directly attached, no delegation needed
        btn.addEventListener('click', async (e) => {
            e.stopPropagation();
            e.preventDefault();

            const s = localProfile?.imageGen;
            if (!s || !s.enabled) { toastr.warning("Images are off. Turn them on in the Images tab."); return; }

            // Re-find the message dynamically (index may have shifted)
            const ctx = getContext();
            const currentMsgIndex = ctx.chat.findIndex(m => m.mes && m.mes.includes(wrapperId));
            if (currentMsgIndex === -1) { toastr.warning("Could not find the original message for this image."); return; }
            const msg = ctx.chat[currentMsgIndex];

            // Replace the HTML block back to the loading placeholder
            const regenRegex = new RegExp(`<!-- kazuma-inline-start:${wrapperId} -->[\\s\\S]*?<!-- kazuma-inline-end:${wrapperId} -->`, "g");
            const placeholder = `<div id="${wrapperId}" class="kazuma-img-placeholder" style="color:var(--gold); font-style: italic; margin: 10px 0;">[Regenerating Image...]</div>`;

            // Kept so a cancelled regenerate can put the old image back.
            let oldBlock = "";
            if (msg.mes.includes(`kazuma-inline-start:${wrapperId}`)) {
                oldBlock = (msg.mes.match(regenRegex) || [""])[0];
                msg.mes = msg.mes.replace(regenRegex, placeholder);
            } else {
                toastr.warning("Could not find the original image block to replace.");
                return;
            }

            await saveChat();
            if (typeof updateMessageBlock === "function") {
                updateMessageBlock(currentMsgIndex, msg);
                // The rebuild dropped the block card with the rest of the body.
                meguminScheduleBlocksRefresh();
            } else {
                reloadCurrentChat();
            }

            toastr.info("Regenerating inline image...");
            igGenerateWithComfy(prompt, { message: msg, index: currentMsgIndex, mode: "inline", isInlineAuto: true, placeholderId: wrapperId, restoreHtml: oldBlock });
        });

        wrapper.appendChild(btn);
    });
}

// One attempt 150ms after the redraw is a single chance. If anything redraws the
// message after that, or if the code below the call throws before the timer is
// set, the button never comes back until the chat is loaded again. Try a few
// times instead. Each pass covers every image in the message and leaves images
// that already have a button alone, so the extra passes cost nothing.
export function kazumaRetrySweep(msgIndex) {
    [150, 600, 1500, 3000].forEach((ms) => setTimeout(() => {
        try { addKazumaRetryButtons(msgIndex); } catch (e) { }
    }, ms));
}

// Turns the prompt as written into the prompt as sent. Classic leaves it as it
// is; V2 puts each character's look and outfit in place of @Name. Set by the tab
// shell (index.js), so this file stays shared and knows neither page.
let promptResolver = p => p;
export function setImagePromptResolver(fn) {
    promptResolver = typeof fn === "function" ? fn : (p => p);
}

export async function igGenerateWithComfy(positivePrompt, target = null) {
    const s = localProfile.imageGen;
    // Awaited: V2 may first bring outfit tags up to date.
    let finalPrompt = await promptResolver(positivePrompt);

    // This one writes into a CHAT MESSAGE and calls saveChat(), not into a profile, so
    // _loadedProfileKey is the wrong thing to check: what matters is whether the message
    // being written to is still part of the chat that is open. `target.message` and
    // `target.index` are captured before a prompt popup, a ComfyUI submit and a 1s poll
    // loop; by the time an image comes back the user can be several chats away, and
    // target.index would then point at whatever message happens to sit at that position.
    const igChatId = getContext().chatId ?? null;
    const igGroupId = getContext().groupId ?? null;
    // Re-resolve instead of trusting the captured index, since deleting or swiping a
    // message above the target shifts everything below it. Object identity is checked
    // first, then the inline placeholder id, which is unique and lives in the message
    // text itself so it survives the message object being rebuilt on a chat reload.
    const igResolveTarget = () => {
        const ctx = getContext();
        if ((ctx.chatId ?? null) !== igChatId || (ctx.groupId ?? null) !== igGroupId) return false;
        if (!target || !target.message) return true; // free-standing insert: the chat check above is the whole test
        const chat = ctx.chat;
        if (!Array.isArray(chat)) return false;
        if (chat[target.index] === target.message) return true;
        const moved = chat.indexOf(target.message);
        if (moved !== -1) { target.index = moved; return true; }
        if (target.placeholderId) {
            const byId = chat.findIndex(m => typeof m?.mes === "string" && m.mes.includes(target.placeholderId));
            if (byId !== -1) { target.message = chat[byId]; target.index = byId; return true; }
        }
        // Gallery inserts carry no placeholder, so a chat reload inside the SAME chat would
        // otherwise lose them: reloadCurrentChat() rebuilds every message object. send_date
        // plus sender is stable across that rebuild and unique enough within one chat.
        if (target.message.send_date !== undefined) {
            const byStamp = chat.findIndex(m => m?.send_date === target.message.send_date
                && m?.name === target.message.name
                && !!m?.is_user === !!target.message.is_user);
            if (byStamp !== -1) { target.message = chat[byStamp]; target.index = byStamp; return true; }
        }
        return false;
    };
    const igDeclineWrite = (what) => {
        console.debug(`[Megumin-Suite] Image gen ${what} declined: it was started for chat "${igChatId}" message ${target?.index}, which is no longer reachable in the open chat. Nothing was written, so no unrelated message was edited. Any leftover "[Generating Image...]" placeholder in the original chat is cosmetic and clears on the next edit of that message.`);
    };

    // An inline image that ends before ComfyUI is reached (preview cancelled,
    // empty prompt, workflow not loaded) would leave "[Generating Image...]" in
    // the reply for good. Take it back out, or, for a regenerate, put the old
    // image back where it was.
    const igDropPlaceholder = async () => {
        if (!target || !target.isInlineAuto || target.mode !== "inline" || !target.placeholderId) return;
        if (!igResolveTarget() || !target.message.mes.includes(`id="${target.placeholderId}"`)) return;
        if (target.restoreHtml) {
            target.message.mes = target.message.mes
                .replace(new RegExp(`<div id="${target.placeholderId}" class="kazuma-img-placeholder"[^>]*>[\\s\\S]*?<\\/div>`), () => target.restoreHtml);
            kazumaRetrySweep(target.index);
        } else {
            target.message.mes = target.message.mes
                .replace(new RegExp(`\\s*<div id="${target.placeholderId}"[^>]*>[\\s\\S]*?<\\/div>\\s*`), "\n\n").trim();
        }
        await saveChat();
        if (typeof updateMessageBlock === "function") {
            updateMessageBlock(target.index, target.message);
            meguminScheduleBlocksRefresh();
        }
    };

    // --- INJECT LORA TRIGGER WORDS ---
    let loraTriggers = [];
    if (s.selectedLora && s.selectedLora.trim() !== "" && s.loraTrigger1) loraTriggers.push(s.loraTrigger1.trim());
    if (s.selectedLora2 && s.selectedLora2.trim() !== "" && s.loraTrigger2) loraTriggers.push(s.loraTrigger2.trim());
    if (s.selectedLora3 && s.selectedLora3.trim() !== "" && s.loraTrigger3) loraTriggers.push(s.loraTrigger3.trim());
    if (s.selectedLora4 && s.selectedLora4.trim() !== "" && s.loraTrigger4) loraTriggers.push(s.loraTrigger4.trim());

    // A retry sends back the stored prompt, which already carries the triggers
    // and the prefix; adding them again grew the prompt on every retry.
    if (loraTriggers.length > 0) {
        let combinedTriggers = loraTriggers.join(", ");
        if (!combinedTriggers.endsWith(",")) combinedTriggers += ",";
        if (!finalPrompt.includes(combinedTriggers)) finalPrompt = combinedTriggers + " " + finalPrompt;
    }

    // --- INJECT PREFIX ---
    if (s.promptPrefix && s.promptPrefix.trim() !== "") {
        let prefix = s.promptPrefix.trim();
        if (!prefix.endsWith(",")) prefix += ",";
        if (!finalPrompt.startsWith(prefix)) finalPrompt = prefix + " " + finalPrompt;
    }

    // --- INTERCEPT PROMPT IF PREVIEW IS ENABLED ---
    if (s.previewPrompt) {
        $("#kazuma_progress_overlay").hide(); // Hide the progress bar temporarily

        const $content = $(`
            <div style="display:flex; flex-direction:column; gap:10px; font-family: 'Inter', sans-serif;">
                <div style="font-size: 0.85rem; color: var(--text-muted);">Review or modify the prompt before it goes to ComfyUI.</div>
                <textarea class="ps-modern-input ig-preview-textarea" style="height: 150px; resize: vertical; font-family: monospace; font-size: 0.85rem; padding: 10px;">${finalPrompt}</textarea>
            </div>
        `);

        // CRITICAL FIX: SillyTavern destroys the popup HTML when it closes. 
        // We MUST capture the text while the user is typing!
        let liveText = finalPrompt;
        $content.find(".ig-preview-textarea").on("input", function () {
            liveText = $(this).val();
        });

        const popup = new Popup($content, POPUP_TYPE.CONFIRM, "Preview Image Prompt", { okButton: "Send to ComfyUI", cancelButton: "Cancel", wide: true });
        const confirmed = await popup.show();

        if (!confirmed) {
            toastr.info("Generation cancelled.");
            await igDropPlaceholder();
            return;
        }

        finalPrompt = liveText.trim();
        if (!finalPrompt) {
            toastr.warning("Prompt cannot be empty.");
            await igDropPlaceholder();
            return;
        }

        showKazumaProgress("Preparing to Render..."); // Bring progress bar back
    }

    let workflowRaw;
    try {
        const res = await fetch('/api/sd/comfy/workflow', { method: 'POST', headers: getRequestHeaders(), body: JSON.stringify({ file_name: s.currentWorkflowName }) });
        if (!res.ok) throw new Error("Load failed"); workflowRaw = await res.json();
    } catch (e) {
        $("#kazuma_progress_overlay").hide();
        toastr.error(`Could not load ${s.currentWorkflowName}`);
        await igDropPlaceholder();
        return;
    }

    let workflow = (typeof workflowRaw === 'string') ? JSON.parse(workflowRaw) : workflowRaw;
    let finalSeed = parseInt(s.customSeed); if (finalSeed === -1 || isNaN(finalSeed)) finalSeed = Math.floor(Math.random() * 1000000000);

    let seedInjected = false;
    for (const nodeId in workflow) {
        const node = workflow[nodeId];
        if (node.inputs) {
            for (const key in node.inputs) {
                const val = node.inputs[key];
                if (val === "%prompt%") node.inputs[key] = finalPrompt;
                if (val === "%negative_prompt%") node.inputs[key] = s.customNegative || "";
                if (val === "%seed%") { node.inputs[key] = finalSeed; seedInjected = true; }
                if (val === "%sampler%") node.inputs[key] = s.selectedSampler || "euler";
                if (val === "%model%") node.inputs[key] = s.selectedModel || "v1-5-pruned.ckpt";
                if (val === "%steps%") node.inputs[key] = parseInt(s.steps) || 20;
                if (val === "%scale%") node.inputs[key] = parseFloat(s.cfg) || 7.0;
                if (val === "%denoise%") node.inputs[key] = parseFloat(s.denoise) || 1.0;
                if (val === "%clip_skip%") node.inputs[key] = -Math.abs(parseInt(s.clipSkip)) || -1;
                if (val === "%lora1%") node.inputs[key] = s.selectedLora || "None";
                if (val === "%lora2%") node.inputs[key] = s.selectedLora2 || "None";
                if (val === "%lora3%") node.inputs[key] = s.selectedLora3 || "None";
                if (val === "%lora4%") node.inputs[key] = s.selectedLora4 || "None";
                if (val === "%lorawt1%") node.inputs[key] = parseFloat(s.selectedLoraWt) || 1.0;
                if (val === "%lorawt2%") node.inputs[key] = parseFloat(s.selectedLoraWt2) || 1.0;
                if (val === "%lorawt3%") node.inputs[key] = parseFloat(s.selectedLoraWt3) || 1.0;
                if (val === "%lorawt4%") node.inputs[key] = parseFloat(s.selectedLoraWt4) || 1.0;
                if (val === "%width%") node.inputs[key] = parseInt(s.imgWidth) || 512;
                if (val === "%height%") node.inputs[key] = parseInt(s.imgHeight) || 512;
            }
            if (!seedInjected && node.class_type === "KSampler" && 'seed' in node.inputs && typeof node.inputs['seed'] === 'number') { node.inputs.seed = finalSeed; }
        }
    }

    // ComfyUI reports real step progress, but only to the client id that queued
    // the job — so the same id must go to the socket and into the /prompt body.
    const comfyClientId = makeComfyClientId();
    const progress = openComfyProgressSocket(s.comfyUrl, comfyClientId, {
        onProgress: (value, max) => {
            const pct = Math.round((value / max) * 100);
            showKazumaProgress(`Rendering Image... ${value}/${max} (${pct}%)`, pct);
        },
    });

    try {
        const res = await fetch(`${comfyBase(s.comfyUrl)}/prompt`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: workflow, client_id: comfyClientId }) });
        if (!res.ok) throw new Error("Failed");
        const data = await res.json();

        showKazumaProgress("Rendering Image...");
        // One history check at a time, and only the first "done" answer goes on.
        // The callback is async: while ComfyUI is busy rendering, checks pile up
        // unanswered, and when the image lands every one of them used to see it
        // and post it (17 copies of one image). clearInterval stops NEW ticks,
        // not the ones already waiting on fetch.
        let pollBusy = false;
        let pollDone = false;
        const checkInterval = setInterval(async () => {
            if (pollBusy || pollDone) return;
            pollBusy = true;
            try {
                const h = await (await fetch(`${comfyBase(s.comfyUrl)}/history/${data.prompt_id}`)).json();
                if (h[data.prompt_id] && !pollDone) {
                    pollDone = true;
                    clearInterval(checkInterval);
                    let finalImage = null;
                    for (const nodeId in h[data.prompt_id].outputs) {
                        const nodeOut = h[data.prompt_id].outputs[nodeId];
                        if (nodeOut.images && nodeOut.images.length > 0) { finalImage = nodeOut.images[0]; break; }
                    }
                    if (finalImage) {
                        showKazumaProgress("Downloading...");
                        const imgUrl = `${comfyBase(s.comfyUrl)}/view?filename=${finalImage.filename}&subfolder=${finalImage.subfolder}&type=${finalImage.type}`;

                        // Download & Compress
                        const response = await fetch(imgUrl); const blob = await response.blob();
                        const base64Raw = await new Promise((res) => { const r = new FileReader(); r.onloadend = () => res(r.result); r.readAsDataURL(blob); });
                        let base64Clean = base64Raw; let format = "png";
                        if (s.compressImages) {
                            base64Clean = await new Promise((res) => { const img = new Image(); img.src = base64Raw; img.onload = () => { const cvs = document.createElement('canvas'); cvs.width = img.width; cvs.height = img.height; cvs.getContext('2d').drawImage(img, 0, 0); res(cvs.toDataURL("image/jpeg", 0.9)); }; img.onerror = () => res(base64Raw); });
                            format = "jpeg";
                        }

                        // Insert to Chat
                        if (!igResolveTarget()) {
                            igDeclineWrite("insert");
                            progress.close(); $("#kazuma_progress_overlay").hide();
                            return;
                        }
                        const charName = getContext().characters[getContext().characterId]?.name || "User";
                        const savedPath = await saveBase64AsFile(base64Clean.split(',')[1], charName, `${charName}_${humanizedDateTime()}`, format);
                        const mediaAttach = {
                            url: savedPath,
                            type: "image",
                            source: "generated",
                            title: finalPrompt,
                            generation_type: "free"
                        };

                        if (target && target.isInlineAuto && target.mode === "inline") {
                            const safePrompt = finalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            const wrapperId = target.placeholderId || `kazuma-img-${Date.now()}`;
                            const imgTag = `<!-- kazuma-inline-start:${wrapperId} --><div id="${wrapperId}" class="kazuma-img-wrapper">
<img src="${savedPath}" title="${safePrompt}" alt="KazumaInline" data-kazumaid="${wrapperId}" style="max-width: 100%; border-radius: 8px; display: block;" />
</div><!-- kazuma-inline-end:${wrapperId} -->`;
                            
                            if (target.placeholderId && target.message.mes.includes(`id="${target.placeholderId}"`)) {
                                const specificPlaceholderRegex = new RegExp(`<div id="${target.placeholderId}"[^>]*>.*?<\/div>`, "g");
                                target.message.mes = target.message.mes.replace(specificPlaceholderRegex, imgTag);
                            } else {
                                const placeholderRegex = /<div class="kazuma-img-placeholder"[^>]*>\[(Generating|Regenerating) Image\.\.\.\]<\/div>/g;
                                if (placeholderRegex.test(target.message.mes)) {
                                    target.message.mes = target.message.mes.replace(placeholderRegex, imgTag);
                                } else {
                                    target.message.mes += `\n\n${imgTag}`;
                                }
                            }
                            
                            // Queue the retry buttons before the redraw, not after it.
                            // The passes run on their own timers so they still land
                            // after SillyTavern has drawn, and they survive anything
                            // below here throwing into the empty catch.
                            kazumaRetrySweep(target.index);

                            await saveChat();
                            if (typeof updateMessageBlock === "function") {
                                updateMessageBlock(target.index, target.message);
                                // The rebuild dropped the block card with the rest of the body.
                                meguminScheduleBlocksRefresh();
                            } else {
                                await reloadCurrentChat();
                            }
                            toastr.success("Image injected inline!");
                        } else if (target && target.message && !target.isInlineAuto) {
                            if (!target.message.extra) target.message.extra = {}; if (!target.message.extra.media) target.message.extra.media = [];
                            target.message.extra.media_display = "gallery"; target.message.extra.media.push(mediaAttach); target.message.extra.media_index = target.message.extra.media.length - 1;
                            if (typeof appendMediaToMessage === "function") appendMediaToMessage(target.message, target.element);
                            await saveChat(); toastr.success("Gallery updated!");
                        } else {
                            const newMsg = { name: "Image Gen Kazuma", is_user: false, is_system: true, send_date: Date.now(), mes: "", extra: { media: [mediaAttach], media_display: "gallery", media_index: 0 }, force_avatar: "img/five.png" };
                            getContext().chat.push(newMsg); await saveChat();
                            if (typeof addOneMessage === "function") addOneMessage(newMsg); else await reloadCurrentChat();
                            toastr.success("Image inserted!");
                        }
                        progress.close(); $("#kazuma_progress_overlay").hide();
                    } else {
                        progress.close(); $("#kazuma_progress_overlay").hide();
                        if (target && target.isInlineAuto && target.mode === "inline" && !igResolveTarget()) {
                            igDeclineWrite("failure notice");
                        } else if (target && target.isInlineAuto && target.mode === "inline") {
                            const wrapperId = target.placeholderId || `kazuma-img-${Date.now()}`;
                            const safePrompt = finalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
                            const failTag = `<!-- kazuma-inline-start:${wrapperId} --><div id="${wrapperId}" class="kazuma-img-wrapper" style="color:#ef4444; font-style: italic; margin: 10px 0;"><span>[Image Generation Failed]</span> <img alt="KazumaInline" data-kazumaid="${wrapperId}" title="${safePrompt}" style="display:none;" /></div><!-- kazuma-inline-end:${wrapperId} -->`;
                            
                            if (target.placeholderId && target.message.mes.includes(`id="${target.placeholderId}"`)) {
                                const specificPlaceholderRegex = new RegExp(`<div id="${target.placeholderId}" class="kazuma-img-placeholder"[^>]*>.*?<\\/div>`, "g");
                                target.message.mes = target.message.mes.replace(specificPlaceholderRegex, failTag);
                            } else {
                                const placeholderRegex = /<div class="kazuma-img-placeholder"[^>]*>\[(Generating|Regenerating) Image\.\.\.\]<\/div>/g;
                                target.message.mes = target.message.mes.replace(placeholderRegex, failTag);
                            }
                            kazumaRetrySweep(target.index);
                            saveChat();
                            if (typeof updateMessageBlock === "function") {
                                updateMessageBlock(target.index, target.message);
                                // The rebuild dropped the block card with the rest of the body.
                                meguminScheduleBlocksRefresh();
                            }
                        }
                    }
                }
            } catch (e) {
            } finally {
                pollBusy = false;
            }
        }, 1000);
    } catch (e) {
        progress.close(); $("#kazuma_progress_overlay").hide();
        toastr.error("Comfy Error: " + e.message);
        if (target && target.isInlineAuto && target.mode === "inline" && !igResolveTarget()) {
            igDeclineWrite("error notice");
        } else if (target && target.isInlineAuto && target.mode === "inline") {
            const wrapperId = target.placeholderId || `kazuma-img-${Date.now()}`;
            const safePrompt = finalPrompt.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
            const failTag = `<!-- kazuma-inline-start:${wrapperId} --><div id="${wrapperId}" class="kazuma-img-wrapper" style="color:#ef4444; font-style: italic; margin: 10px 0;"><span>[Image Generation Failed: ${e.message}]</span> <img alt="KazumaInline" data-kazumaid="${wrapperId}" title="${safePrompt}" style="display:none;" /></div><!-- kazuma-inline-end:${wrapperId} -->`;
            
            if (target.placeholderId && target.message.mes.includes(`id="${target.placeholderId}"`)) {
                const specificPlaceholderRegex = new RegExp(`<div id="${target.placeholderId}" class="kazuma-img-placeholder"[^>]*>.*?<\\/div>`, "g");
                target.message.mes = target.message.mes.replace(specificPlaceholderRegex, failTag);
            } else {
                const placeholderRegex = /<div class="kazuma-img-placeholder"[^>]*>\[(Generating|Regenerating) Image\.\.\.\]<\/div>/g;
                target.message.mes = target.message.mes.replace(placeholderRegex, failTag);
            }
            kazumaRetrySweep(target.index);
            saveChat();
            if (typeof updateMessageBlock === "function") {
                updateMessageBlock(target.index, target.message);
                // The rebuild dropped the block card with the rest of the body.
                meguminScheduleBlocksRefresh();
            }
        }
    }
}

// ────────────────────────────────────────────────────────────────────────────
// Wiring. The quick-generate button's visibility follows the profile, so the
// profile loader asks for it by name rather than knowing this module exists.
// ────────────────────────────────────────────────────────────────────────────

registerRefreshHook(REFRESH.QUICK_GEN_BUTTON, () => toggleQuickGenButton());
