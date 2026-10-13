/* eslint-disable no-undef */
import { extension_settings, getContext } from "../../../extensions.js";
import {
    saveSettingsDebounced,
    generateQuietPrompt,
    event_types,
    eventSource,
    substituteParams,
    saveChat,
    reloadCurrentChat,
    addOneMessage,
    getRequestHeaders,
    appendMediaToMessage,
    updateMessageBlock,
} from "../../../../script.js";
import { saveBase64AsFile, cancelDebounce } from "../../../utils.js";
import { humanizedDateTime } from "../../../RossAscends-mods.js";
import { Popup, POPUP_TYPE } from "../../../popup.js";
import { hardcodedLogic } from "./data/database.js";
import { KAZUMA_PLACEHOLDERS, RESOLUTIONS } from "./data/image_data.js";

import { extensionName, extensionFolderPath } from "./src/core/constants.js";
import {
    localProfile,
    _loadedProfileKey,
    currentTab,
    setCurrentTab,
    isDevEngineDirty,
    setDevEngineDirty,
} from "./src/core/state.js";
import {
    activeStoryPlanRequest,
    activeBanListChat,
    activeImageGenRequest,
    setActiveImageGenRequest,
    activeNpcScanRequest,
    setActiveNpcScanRequest,
    activeNpcPfpRequest,
    setActiveNpcPfpRequest,
    activeMemorySummarizationRequest,
    activeGenerationOrder,
    activeNpcImages,
    pushActiveNpcImage,
    clearActiveNpcImages,
    isBackgroundGenerationActive,
} from "./src/core/activeRequests.js";

import {
    initSidePanel,
    refreshSidePanel,
    getSidePanelSettings,
    applyInlineHidingChange,
    applyPositionChange,
    applyWidthChange,
    applyEnabledChange,
    applyModeChange,
    applyScaleChange,
    resetSectionLayout,
    getOrderedSections,
    getPresentBarSettings,
    applyPresentBarChange,
    refreshPresentBar,
} from "./src/sidepanel/panel.js";

import { applyBlocksToMessage, clearBlocksFromMessage, buildBlocksCard, extractBlocks } from "./src/blocks/render.js";

import { DEFAULT_PROMPTS } from "./src/prompts/index.js";
import { meguminActiveDataIdentity, getCharacterKey, getRawAvatar, cleanGhostProfiles } from "./src/core/keys.js";
import {
    TAB_SYNC_KEYS, TABS_ALREADY_GLOBAL, meguminGlobalSyncMap, meguminIsTabSynced,
    applyTabKeysToAllProfiles, syncPromptsGlobally,
} from "./src/core/sync.js";
import { cleanLegacySettings, migrateRenamedTabs, migrateUtilityPrefillFlag } from "./src/core/migrations.js";
import { meguminCompactStoredPrompts } from "./src/prompts/storage.js";
import {
    normalizeBlockBody,
    meguminActiveBlocks,
    buildBlocksEnvelope,
    meguminRenderRegistry,
    meguminBlocksTakenByPanel,
    meguminBlockById,
    BLOCK_VISIBILITY_CHOICES,
    blockTagFromName,
    validateCustomBlock,
    STAT_FIELD_PACKS,
    STAT_FIELD_TYPES,
} from "./src/features/blocks/registry.js";
import { meguminCleanChatHistoryText, getChatForStoryDirector, getChatForNpcScan, escapeRegex } from "./src/engine/chatText.js";
import { useMeguminEngine } from "./src/engine/tasks.js";
import { escapeHtmlAttr } from "./src/utils/html.js";
import { downloadJsonFile } from "./src/utils/download.js";
import { showKazumaProgress } from "./src/ui/progress.js";
import { makeComfyClientId, openComfyProgressSocket } from "./src/features/imagegen/comfyProgress.js";
import { renderPromptEditor } from "./src/ui/promptEditor.js";
import { registerRefreshHook, REFRESH } from "./src/core/refreshHooks.js";
import {
    initProfile,
    saveProfileToMemory,
    flushProfileSettingsToLoadedKey,
    saveProfileDebounced,
    _saveProfileDebouncedInner,
} from "./src/core/profile.js";
import { meguminSyncLegacyBlockIds } from "./src/features/blocks/registry.js";
import { buildConfigBlock } from "./src/features/storyconfig/config.js";
import { renderStoryConfig } from "./src/features/storyconfig/ui.js";
import { SD_GENRES, renderStoryPlanner, generateStoryPlanLogic } from "./src/features/storyplan/ui.js";
import { renderBanList } from "./src/features/banlist/ui.js";
import {
    renderMemoryCore,
    memProcessPendingChunks,
    isMessageArchived,
    memGetRelevantVaultEntries,
    updateMemoryVisuals,
} from "./src/features/memory/index.js";
import { memGetCachedKeywords } from "./src/features/memory/keywords.js";
import { memUpdateSemanticQueryDebounced, memEnsureSemanticQueryFresh } from "./src/features/memory/vectordb.js";
import { npcBuildTextFromData, npcParseBlock, meguminFindNpcDossiers, getRelevantNpcImageTags, npcCreateRecord } from "./src/features/npc/data.js";
import { npcGeneratePfp } from "./src/features/npc/pfp.js";
import { scheduleAutoPortraits } from "./src/features/portraits/auto.js";
import { npcParseUpdateBlocks, npcApplyUpdates, npcUndoHistoryEntry } from "./src/features/npc/updates.js";
import { renderNpcBank, renderNpcList } from "./src/features/npc/ui.js";
import {
    meguminDecorateMessageBody, meguminRefreshBlocksInChat, meguminScheduleBlocksRefresh,
} from "./src/features/blocks/chat.js";
import {
    renderImageGen, igFetchComfyLists, toggleQuickGenButton, igTestConnection,
    igPopulateWorkflows, igNewWorkflowClick, igDeleteWorkflowClick, igOpenWorkflowEditorClick,
    igManualGenerate, generateImagePromptText, addKazumaRetryButtons, kazumaRetrySweep,
    igGenerateWithComfy,
} from "./src/features/imagegen/index.js";
import { buildBaseDict } from "./src/engine/buildBaseDict.js";
import { handlePromptInjection } from "./src/engine/injection.js";
import { updateLiveTokenCount } from "./src/core/tokens.js";
import { initDraggableButton, updateCharacterDisplay, discoverDefaultImages } from "./src/ui/launcher.js";
import { tabsUI, switchTab, updateGlobalSyncButton, toggleTabGlobalSync } from "./src/ui/tabs.js";
import { renderDevMode } from "./src/ui/devmode.js";

// Refresh hooks for the features still living in this file. Each registration
// moves into its own feature module as that feature is extracted — the memory
// ones have already gone with src/features/memory/.

// -------------------------------------------------------------
// STATE MANAGEMENT
// -------------------------------------------------------------
// Cross-cutting state now lives in src/core/state.js and
// src/core/activeRequests.js (imported at the top of this file). Reads below are
// unchanged — ES module live bindings keep them current — but reassignment goes
// through the setters. What remains here is state used ONLY by this file.




// -------------------------------------------------------------
// MASTER BLOCK RENDERING (chat side)
// -------------------------------------------------------------


// -------------------------------------------------------------
// BLOCKS TAB
// -------------------------------------------------------------


// Renders the preview through the same code the chat uses, from the last real
// reply when there is one and from the templates when there is not. A preview
// drawn by different code from the chat is worse than none, because it is
// confidently wrong.

// The field list for a stat block, editable in place under its row.



// -------------------------------------------------------------
// UI TAB RENDERER (Toolbox System)
// -------------------------------------------------------------


// Flips the toggle for the tab on screen. Turning it on pushes what is already
// there — a switch that only affected the NEXT edit would leave the tab you just
// set up out of step with every other character.

// Called after every profile save. This is the one place every change funnels
// through, which is what makes "any change in this tab is global" true rather
// than "every change I remembered to hook".





// -------------------------------------------------------------
// STAGE 8: IMAGE GEN KAZUMA (ComfyUI Integration)
// -------------------------------------------------------------

// -------------------------------------------------------------
// STAGE 8 HELPER FUNCTIONS
// -------------------------------------------------------------


// -------------------------------------------------------------
// SIDE PANEL — Tab renderer
// Pulls the in-chat tracker blocks (World State, NPC Inner Chatter,
// Summary, NPC dossiers) out into a fixed side panel.
// -------------------------------------------------------------



$("body").on("input", "#ps_main_current_rule", function () {
    localProfile.aiRule = $(this).val(); saveProfileDebounced();
});


// -------------------------------------------------------------
// EVENT LISTENERS & INITS
// -------------------------------------------------------------


// -------------------------------------------------------------
// DEV MODE: VISUAL ENGINE BUILDER
// -------------------------------------------------------------
// UNIFIED DEV BUTTON CLICK LISTENER
$("body").off("click", "#ps_btn_dev_mode").on("click", "#ps_btn_dev_mode", function (e) {
    e.preventDefault();
    if ($(this).text().includes("Exit Dev")) {
        if (isDevEngineDirty) {
            if (!confirm("You have unsaved changes in your custom engine. Are you sure you want to exit? Changes will be lost.")) return;
        }
        setDevEngineDirty(false);
        switchTab(0);
    } else {
        renderDevMode("landing");
    }
});

// -------------------------------------------------------------
// DRAGGABLE FIXED BUTTON WITH SNAP-TO-VIEWPORT & PERSISTENCE
// -------------------------------------------------------------

jQuery(async () => {
    try {
        cleanLegacySettings();
        migrateRenamedTabs();
        migrateUtilityPrefillFlag();
        initSidePanel({ profileGetter: () => localProfile });
        const h = await $.get(`${extensionFolderPath}/example.html`);
        $("body").append(h);
        initDraggableButton();
        $("body").append('<div id="ps-global-tooltip"></div>');
        // Profile level badge styles
        $("head").append(`<style>
            .ps-level-badge {
                display: inline-block;
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                font-weight: 600;
                color: #fff;
                margin-left: 8px;
                vertical-align: middle;
                letter-spacing: 0.3px;
                white-space: nowrap;
            }
            .ps-profile-badge {
                font-size: 11px;
                color: #9ca3af;
                margin-left: 6px;
            }
        </style>`);
        // Modify DOM to transition from Wizard -> Tabs
        $(".ps-breadcrumbs").hide();
        $("#ps_btn_prev, #ps_btn_next").hide();

        $("body").off("click", "#btn_apply_tab_all").on("click", "#btn_apply_tab_all", toggleTabGlobalSync);

        $("body").on("mouseenter", ".ps-modern-tag", function () { const hint = $(this).attr("data-hint"); if (!hint) return; const title = $(this).text().trim(); $("#ps-global-tooltip").html(`<span class="ps-tooltip-title">${title}:</span> ${hint}`).addClass("visible"); });
        $("body").on("mouseenter", "#ps_live_token_count", function (e) {
            const hint = $(this).attr("data-breakdown");
            if (!hint) return;
            $("#ps-global-tooltip").html(hint).addClass("visible");
        });
        $("body").on("mousemove", "#ps_live_token_count", function (e) {
            const tooltip = $("#ps-global-tooltip");
            // Position to the left of the mouse so it doesn't go off the screen!
            let x = e.clientX - tooltip.outerWidth() - 15;
            let y = e.clientY + 15;
            tooltip.css({ left: x + 'px', top: y + 'px' });
        });
        $("body").on("mouseleave", "#ps_live_token_count", function () {
            $("#ps-global-tooltip").removeClass("visible");
        });
        $("body").on("mousemove", ".ps-modern-tag", function (e) { if (!$(this).attr("data-hint")) return; const tooltip = $("#ps-global-tooltip"); let x = e.clientX + 15; let y = e.clientY + 15; if (x + tooltip.outerWidth() > window.innerWidth) x = e.clientX - tooltip.outerWidth() - 15; if (y + tooltip.outerHeight() > window.innerHeight) y = e.clientY - tooltip.outerHeight() - 15; tooltip.css({ left: x + 'px', top: y + 'px' }); });
        $("body").on("mouseleave", ".ps-modern-tag", function () { $("#ps-global-tooltip").removeClass("visible"); });

                // ── Mobile Sidebar Drawer System ──
        function closeMobileDrawer() {
            $(".dock").removeClass("mobile-open");
            $(".mobile-drawer-overlay").removeClass("open");
            // Small delay then hide overlay to allow transition
            setTimeout(() => {
                if (!$(".dock").hasClass("mobile-open")) {
                    $(".mobile-drawer-overlay").css("display", "none");
                }
            }, 350);
        }

        function openMobileDrawer() {
            $(".mobile-drawer-overlay").css("display", "block");
            // Force reflow before adding class so transition fires
            $(".mobile-drawer-overlay")[0]?.offsetHeight;
            $(".dock").addClass("mobile-open");
            $(".mobile-drawer-overlay").addClass("open");
        }

        function toggleMobileDrawer() {
            if ($(".dock").hasClass("mobile-open")) {
                closeMobileDrawer();
            } else {
                openMobileDrawer();
            }
        }

        function initMobileDrawer() {
            const container = $(".ps-modern-modal.app-container");
            if (!container.length) return;

            // Only inject once
            if (container.find(".mobile-drawer-overlay").length) return;

            // 1. Inject the dark backdrop overlay into the modal container
            container.append('<div class="mobile-drawer-overlay"></div>');

            // 2. Inject the hamburger button into the top-app-bar (before .app-actions)
            const topBar = container.find(".top-app-bar");
            if (topBar.length && !topBar.find(".mobile-hamburger").length) {
                topBar.prepend('<button class="mobile-hamburger" title="Menu"><i class="fa-solid fa-bars"></i></button>');
            }

            // 3. Inject a drawer header at top of dock (navigation label)
            const dock = container.find(".dock");
            if (dock.length && !dock.find(".mobile-drawer-header").length) {
                dock.prepend('<div class="mobile-drawer-header"><h3><i class="fa-solid fa-wand-magic-sparkles" style="margin-right:8px;color:var(--gold)"></i>Navigation</h3></div>');
            }

            // 4. Inject drawer footer with Sync Global + Reset at bottom of dock
            if (dock.length && !dock.find(".mobile-drawer-footer").length) {
                dock.append(`
                    <div class="mobile-drawer-footer">
                        <button class="mobile-drawer-footer-btn sync-global" id="mobile_sync_global">
                            <i class="fa-solid fa-earth-americas"></i> Global: ${meguminIsTabSynced((tabsUI[currentTab] || {}).title) ? "On" : "Off"}
                        </button>
                        <button class="mobile-drawer-footer-btn danger" id="mobile_reset">
                            <i class="fa-solid fa-rotate-left"></i> Reset Profile
                        </button>
                    </div>
                `);
            }

            // 5. Bind events
            // Hamburger toggle
            container.off("click.mobileHamburger").on("click.mobileHamburger", ".mobile-hamburger", function (e) {
                e.stopPropagation();
                toggleMobileDrawer();
            });

            // Backdrop click to close
            container.off("click.mobileOverlay").on("click.mobileOverlay", ".mobile-drawer-overlay", function () {
                closeMobileDrawer();
            });

            // Drawer footer buttons → trigger original buttons then close drawer
            container.off("click.mobileSync").on("click.mobileSync", "#mobile_sync_global", function () {
                closeMobileDrawer();
                $("#btn_apply_tab_all").trigger("click");
            });
            container.off("click.mobileReset").on("click.mobileReset", "#mobile_reset", function () {
                closeMobileDrawer();
                $("#ps_btn_reset").trigger("click");
            });
        }

        // Tab click → switch tab AND close drawer on mobile
        $("body").on("click", ".sidebar-step", function () {
            const index = parseInt($(this).attr("id").replace("dot_", ""));
            if (!isNaN(index)) switchTab(index);
            // Close drawer on mobile after switching tab
            closeMobileDrawer();
        });

        // Initialize drawer elements when modal opens
        $("body").on("click", "#prompt-slot-fixed-btn", function () {
            // Slight delay to let the modal render
            setTimeout(initMobileDrawer, 100);
        });

        // Also init if already open (for reload scenarios)
        setTimeout(initMobileDrawer, 500);

        $("body").on("click", "#ps_btn_reset", function () {
            if (confirm("Are you sure you want to completely reset this character's profile to the default template?")) {
                // A save debounced by an edit made just before the click would fire ~500ms
                // from now, after the delete, and write the old profile straight back under
                // the same live key. Drop it first, the same way the chat switch does.
                cancelDebounce(_saveProfileDebouncedInner);
                const key = getCharacterKey() || "default"; delete extension_settings[extensionName].profiles[key]; saveSettingsDebounced();
                initProfile(); switchTab(0); toastr.info("Profile has been reset to defaults.");
            }
        });

        $("body").on("click", "#ps_btn_save_close", function () { saveProfileToMemory(); $("#prompt-slot-modal-overlay").fadeOut(200); toastr.success("Workflow Configured & Applied Successfully!"); });

        if (typeof eventSource !== 'undefined' && typeof event_types !== 'undefined') {
            eventSource.on(event_types.APP_READY, () => {
                cleanGhostProfiles();
                meguminCompactStoredPrompts();
                discoverDefaultImages();
            });
            eventSource.on(event_types.CHAT_COMPLETION_PROMPT_READY, handlePromptInjection);
            eventSource.on(event_types.CHAT_CHANGED, () => {
                // A save debounced at 500ms would die when initProfile swaps localProfile
                // below. Flush it under the OLD key first — settings only, because
                // chat_metadata already belongs to the chat we are switching TO.
                cancelDebounce(_saveProfileDebouncedInner);
                flushProfileSettingsToLoadedKey();
                // Defer profile loading — wait for ST context to fully initialize
                setTimeout(() => {
                    const ctx = getContext();
                    if (ctx.chatId || getRawAvatar()) {
                        initProfile(); updateCharacterDisplay();
                        if ($("#prompt-slot-modal-overlay").is(":visible")) switchTab(currentTab);
                    }
                }, 200);
                updateMemoryVisuals();
            });
            // Background Vectorization triggers for Semantic Mode
            eventSource.on(event_types.USER_MESSAGE_RENDERED, memUpdateSemanticQueryDebounced);
            eventSource.on(event_types.MESSAGE_EDITED, memUpdateSemanticQueryDebounced);
            eventSource.on(event_types.CHAT_CHANGED, memUpdateSemanticQueryDebounced);
            // Trigger visual update when user clicks "Show more messages"
            eventSource.on(event_types.MORE_MESSAGES_LOADED, updateMemoryVisuals);
            // IMAGE GEN AUTO-GEN & SWIPE TRIGGERS
            eventSource.on(event_types.MESSAGE_RECEIVED, async () => {
                updateMemoryVisuals();

                // --- STORY DIRECTOR FEEDBACK & AUTO-EVOLVE ---
                const sp = localProfile?.storyPlan;
                // Stamped next to the capture of `sp` itself: the auto-evolve below waits
                // 2 seconds and then awaits a full generation, so `sp` can easily belong to
                // a chat the user has left by the time the directive comes back.
                const spIdentity = meguminActiveDataIdentity();
                if (sp && sp.enabled) {
                    const chat = getContext().chat;
                    if (chat && chat.length > 0) {
                        const lastIndex = chat.length - 1;
                        const lastMsg = chat[lastIndex];
                        if (!lastMsg.is_user && !lastMsg.is_system) {
                            
                            // 1. Extract the Tracker
                            const trackerRegex = /<Story_Tracker[^>]*>([\s\S]*?)<\/Story_Tracker\s*>/i;
                            const match = lastMsg.mes.match(trackerRegex);
                            let needsEvolve = false;

                            if (match) {
                                sp.lastTrackerState = match[1].trim();
                                saveProfileToMemory();
                                
                                console.log(`[${extensionName}] 🎬 Story Tracker captured (kept visible).`);

                                // Check if we need to auto-evolve based on status (ONLY if not set to manual)
                                if (sp.triggerMode !== 'manual') {
                                    // Looks for either arc_status or directive_status
                                    const statusMatch = sp.lastTrackerState.match(/(?:directive_status|arc_status):\s*\[?(completed|pivoted|progressing|nearing_completion|nearing_climax)\]?/i);
                                    if (statusMatch) {
                                        const status = statusMatch[1].toLowerCase();
                                        if (status === 'completed' || status === 'pivoted') {
                                            needsEvolve = true;
                                            console.log(`[${extensionName}] 🎬 Directive ${status}. Triggering smart auto-evolve.`);
                                        }
                                    }
                                }
                            } else if (/<Story_Tracker/i.test(lastMsg.mes || "")) {
                                // Slice from the opening tag, not from character 0 — the tracker
                                // sits after the prose, so the first 200 characters of the message
                                // would show narration and none of the block that failed to parse.
                                const trackerMes = lastMsg.mes || "";
                                const trackerAt = Math.max(0, trackerMes.search(/<Story_Tracker/i));
                                console.debug(`[Megumin-Suite] <Story_Tracker> block present but unparseable in message ${lastIndex}`, trackerMes.slice(trackerAt, trackerAt + 200));
                            }

                            // 2. Frequency-based Trigger Fallback (ONLY if set to frequency)
                            if (!needsEvolve && sp.triggerMode === 'frequency') {
                                const aiMsgCount = chat.filter(m => !m.is_user && !m.is_system).length;
                                if (aiMsgCount > 0 && aiMsgCount % sp.autoFreq === 0) {
                                    needsEvolve = true;
                                    console.log(`[${extensionName}] 🎬 Frequency safety net reached. Triggering auto-evolve.`);
                                }
                            }

                            // 3. Execute Auto-Evolve
                            if (needsEvolve) {
                                toastr.info("Auto-Evolving Narrative Directive...", "Story Director");
                                setTimeout(async () => {
                                    // getChatForStoryDirector() reads whatever chat is open
                                    // NOW, so once the chat has moved this would evolve the
                                    // new chat's story into the old chat's plan. Checked here
                                    // as well so a switch during the 2s wait costs no call.
                                    if (meguminActiveDataIdentity() !== spIdentity) {
                                        console.debug(`[Megumin-Suite] Story Director auto-evolve skipped: it was queued for "${spIdentity}" but "${meguminActiveDataIdentity()}" is active now.`);
                                        return;
                                    }
                                    const chatText = getChatForStoryDirector();
                                    if (chatText.length < 100) return;
                                    try {
                                        let output = sp.backend === "direct" ? await generateStoryPlanLogic(chatText) : await new Promise(r => useMeguminEngine(async () => r(await generateStoryPlanLogic(chatText))));
                                        if (meguminActiveDataIdentity() !== spIdentity) {
                                            console.debug(`[Megumin-Suite] Story Director auto-evolve declined: the chat changed while the directive was generating ("${spIdentity}" to "${meguminActiveDataIdentity()}"). The new directive was discarded, not applied.`);
                                            return;
                                        }
                                        const directiveMatch = output?.match(/<directive>([\s\S]*?)<\/directive>/i) || output?.match(/<plot>([\s\S]*?)<\/plot>/i);
                                        if (directiveMatch) {
                                            sp.currentPlan = directiveMatch[1].trim();
                                            sp.planMessageIndex = (getContext().chat?.length || 1) - 1;
                                            saveProfileToMemory();
                                            if ($("#sd_current_plan").length) {
                                                $("#sd_current_plan").val(sp.currentPlan);
                                                $("#sd_btn_evolve").prop("disabled", false);
                                            }
                                            toastr.success("Narrative Directive Evolved silently!", "Story Director");
                                        }
                                    } catch (e) { console.error("[Megumin Suite] Story Director auto-evolve failed", e); }
                                }, 2000); // Delay to let UI settle
                            }
                        }
                    }
                }

                // AUTO-TRIGGER MEMORY CORE
                const mem = localProfile?.memoryCore;
                if (mem && mem.enabled && (mem.triggerMode === 'frequency' || mem.triggerMode === 'every')) {
                    const chat = getContext().chat;
                    const aiMsgCount = chat.filter(m => !m.is_user && !m.is_system).length;

                    const freq = mem.triggerMode === 'every' ? 1 : (mem.autoFreq || 10);
                    if (aiMsgCount > 0 && aiMsgCount % freq === 0) {
                        // Check if we actually have enough messages to archive (avoid background notification spam)
                        let hasWork = false;
                        const workingLimit = mem.workingLimit || 30;
                        const chunkSize = mem.chunkSize || 10;
                        const realMessages = [];
                        for (let i = 0; i < chat.length; i++) {
                            if (!chat[i].is_system) realMessages.push({ originalIndex: i, msg: chat[i] });
                        }
                        if (realMessages.length > workingLimit) {
                            const archivableMessages = realMessages.slice(0, realMessages.length - workingLimit);
                            const unarchivedArchivable = archivableMessages.filter(item => !isMessageArchived(item.originalIndex, mem));
                            if (unarchivedArchivable.length >= chunkSize) {
                                hasWork = true;
                            }
                        }

                        if (hasWork) {
                            toastr.info("Background Memory Scan Triggered...", "Megumin Suite");
                            // We run it after a small delay so ST finishes saving the chat first
                            setTimeout(async () => {
                                await memProcessPendingChunks(true);
                            }, 3000);
                        }
                    }
                }

                const s = localProfile?.imageGen;

                // AUTO-EXTRACT NPCs
                const npcBank = localProfile?.npcBank;
                // Stamped next to the capture of `npcBank`, the same way `sp` is stamped
                // above. This block never awaits, so the risk is not a chat switch mid-run:
                // it is that localProfile is ALREADY behind. CHAT_CHANGED reloads it 200ms
                // late, so a message arriving inside that window would parse the new chat's
                // dossiers and push them into the previous chat's bank. saveProfileToMemory()
                // would refuse to write that to disk, but the objects would stay in memory
                // and ride along on the next legitimate save.
                const npcLiveKey = getCharacterKey() || "default";
                if (npcBank && npcBank.enabled && _loadedProfileKey && npcLiveKey !== _loadedProfileKey) {
                    console.debug(`[Megumin-Suite] NPC auto-extract declined: the NPC bank in memory belongs to "${_loadedProfileKey}" but this message arrived in "${npcLiveKey}". No NPCs were added, so none land in the wrong chat's bank.`);
                } else if (npcBank && npcBank.enabled) {
                    const chat = getContext().chat;
                    if (chat && chat.length) {
                        const lastMsg = chat[chat.length - 1];
                        if (!lastMsg.is_user && !lastMsg.is_system) {
                            const dossiers = meguminFindNpcDossiers(lastMsg.mes);
                            let added = false;
                            let matched = dossiers.length > 0;
                            for (const dossier of dossiers) {
                                const npcName = dossier.name;
                                const npcContent = dossier.raw;
                                if (!npcBank.npcs) npcBank.npcs = [];
                                if (!npcBank.npcs.find(n => (n.name || "").trim().toLowerCase() === npcName.toLowerCase())) {
                                    // Parse structured fields from the raw block
                                    const parsed = npcParseBlock(npcContent);
                                    npcBank.npcs.push(npcCreateRecord({
                                        parsed,
                                        name: npcName,
                                        messageIndex: chat.length - 1
                                    }));
                                    added = true;
                                    toastr.success(`NPC added to Bank: ${npcName}`, "Megumin Suite");
                                    if ($("#npc_bank_list").length) renderNpcList();
                                }
                            }
                            // --- APPLY DOSSIER UPDATES ---
                            // After the new-NPC pass, so a dossier and an update
                            // arriving in the same reply land in that order and
                            // the update has someone to apply to.
                            const parsedUpdates = npcParseUpdateBlocks(lastMsg.mes);
                            if (parsedUpdates.length) {
                                const { applied, refused } = npcApplyUpdates(parsedUpdates, { messageIndex: chat.length - 1 });
                                if (applied.length) {
                                    added = true;
                                    const who = [...new Set(applied.map(e => e.npc))].join(", ");
                                    toastr.info(
                                        applied.map(e => `${e.label}: ${e.op === "+" ? "added" : e.op === "-" ? "removed" : "replaced"}`).join(" · "),
                                        `Megumin Suite — ${who} updated`
                                    );
                                }
                                // Refusals are the model going outside the field
                                // list it was given. Not worth a toast, but a
                                // silent drop is how a broken update block stays
                                // broken for weeks.
                                refused.forEach(r => console.debug(`[Megumin-Suite] NPC update declined for "${r.name}": ${r.reason}.`));
                            }

                            if (added) saveProfileToMemory();
                            if (!matched && /New[ _]NPC/i.test(lastMsg.mes || "")) {
                                // Slice from the block opener, not from character 0, so the debug
                                // line shows the dossier that failed to parse rather than prose.
                                const npcMes = lastMsg.mes || "";
                                const npcAt = Math.max(0, npcMes.search(/New[ _]NPC/i));
                                console.debug(`[Megumin-Suite] New NPC block present but unparseable in message ${chat.length - 1}`, npcMes.slice(npcAt, npcAt + 200));
                            }
                        }
                    }
                }

                if (!s || !s.enabled) return;

                const chat = getContext().chat;
                if (!chat || !chat.length) return;

                const lastMsg = chat[chat.length - 1];
                if (lastMsg.is_user || lastMsg.is_system) return;
                // Auto portraits for everyone the reply put in the scene, banked or not.
                // Runs in the background and never blocks the image tags handled below.
                setTimeout(() => scheduleAutoPortraits(), 400);

                // Look for the <img prompt="..."> tags in the AI's response (supports multiple)
                const imgRegexGlobal = /<img[^>]*?prompt=(["']?)([\s\S]*?)(?:\1\s*\/?>|\1\s*>|\1\s+[a-zA-Z]+=| \/>|>|$)/ig;
                const allMatches = [...lastMsg.mes.matchAll(imgRegexGlobal)];

                // FILTER: Ignore any image tags that appear inside the <think>...</think> block
                const lastThinkEnd = lastMsg.mes.lastIndexOf("</think>");
                const matches = allMatches.filter(m => m.index > lastThinkEnd);

                if (matches.length > 0) {
                    const msgIndex = chat.length - 1;
                    const injectMode = s.injectMode || "new_msg";
                    const batchId = Date.now();
                    
                    let modifiedMes = lastMsg.mes;

                    // Iterate backwards so we can replace by exact index without shifting string positions
                    for (let i = matches.length - 1; i >= 0; i--) {
                        const match = matches[i];
                        const uniquePlaceholderId = `kazuma-img-${batchId}-${i}`;
                        const placeholder = `<div id="${uniquePlaceholderId}" class="kazuma-img-placeholder" style="color:var(--gold); font-style: italic; margin: 10px 0;">[Generating Image...]</div>`;

                        if (injectMode === "inline") {
                            modifiedMes = modifiedMes.substring(0, match.index) + placeholder + modifiedMes.substring(match.index + match[0].length);
                        } else {
                            modifiedMes = modifiedMes.substring(0, match.index) + modifiedMes.substring(match.index + match[0].length);
                        }
                    }

                    lastMsg.mes = modifiedMes.trim();
                    await saveChat();
                    
                    // Delay UI update slightly so SillyTavern's internal handlers (like Reasoning) 
                    // finish rendering the DOM before we attempt to update the block.
                    setTimeout(() => {
                        if (typeof SillyTavern !== 'undefined' && SillyTavern.getContext && typeof SillyTavern.getContext().updateMessageBlock === "function") {
                            SillyTavern.getContext().updateMessageBlock(msgIndex, lastMsg);
                        } else if (typeof updateMessageBlock === "function") {
                            updateMessageBlock(msgIndex, lastMsg);
                            // The rebuild dropped the block card with the rest of the body.
                            meguminScheduleBlocksRefresh();
                        } else {
                            reloadCurrentChat(); // Refreshes the chat window instantly
                        }
                    }, 100);

                    // 2. Send the extracted prompts to ComfyUI!
                    matches.forEach((match, idx) => {
                        const extractedPrompt = match[2];
                        const uniquePlaceholderId = `kazuma-img-${batchId}-${idx}`;
                        
                        setTimeout(() => {
                            toastr.info(`Image tag ${idx + 1} detected. Sending to ComfyUI...`);
                            igGenerateWithComfy(extractedPrompt, { 
                                message: lastMsg, 
                                index: msgIndex, 
                                mode: injectMode, 
                                isInlineAuto: true,
                                placeholderId: uniquePlaceholderId 
                            });
                        }, 500 + (idx * 1500)); // Stagger calls slightly to prevent overloading ComfyUI
                    });
                }
            });
            const meguminSwipeHandler = async (data) => {
                const s = localProfile?.imageGen;
                if (!s || !s.enabled) return;

                const { message, direction, element } = data;

                // Only trigger on right swipes
                if (direction !== "right") return;

                const media = message.extra?.media || [];
                const idx = message.extra?.media_index || 0;

                // Only trigger on the LAST image in the gallery (overswipe)
                if (idx < media.length - 1) return;

                const mediaObj = media[idx];

                // If there is no title (prompt), we can't regenerate it.
                if (!mediaObj || !mediaObj.title) return;

                // PRIORITY HACK: Temporarily stun both old and new ST Image Gen settings
                // so the native ST listener aborts itself!
                let ogPower = null;
                if (window.power_user && window.power_user.image_overswipe) {
                    ogPower = window.power_user.image_overswipe;
                    window.power_user.image_overswipe = "off";
                }

                let ogExt = null;
                if (extension_settings.image_generation && extension_settings.image_generation.overswipe) {
                    ogExt = extension_settings.image_generation.overswipe;
                    extension_settings.image_generation.overswipe = false;
                }

                // Restore ST's native settings 200ms later after the default listener aborts
                setTimeout(() => {
                    if (ogPower && window.power_user) window.power_user.image_overswipe = ogPower;
                    if (ogExt && extension_settings.image_generation) extension_settings.image_generation.overswipe = ogExt;
                }, 200);

                toastr.info("Regenerating Image...", "Megumin Suite");
                await igGenerateWithComfy(mediaObj.title, { message: message, element: $(element) });
            };

            // Bind the listener
            eventSource.on(event_types.IMAGE_SWIPED, meguminSwipeHandler);

            // FORCE IT TO THE FRONT OF THE REAL ARRAY
            // This ensures our extension evaluates the swipe BEFORE SillyTavern does.
            if (eventSource._events && Array.isArray(eventSource._events[event_types.IMAGE_SWIPED])) {
                const arr = eventSource._events[event_types.IMAGE_SWIPED];
                if (arr.length > 1 && arr[arr.length - 1] === meguminSwipeHandler) {
                    arr.unshift(arr.pop());
                }
            }
        }

        $("body").on("click", "#prompt-slot-fixed-btn", function () { initProfile(); updateCharacterDisplay(); switchTab(0); $("#prompt-slot-modal-overlay").fadeIn(250).css("display", "flex"); });
        $("body").off("click", "#close-prompt-slot-modal, #prompt-slot-modal-overlay").on("click", "#close-prompt-slot-modal, #prompt-slot-modal-overlay", function (e) {
            if (e.target === this) {
                if (isDevEngineDirty) {
                    if (!confirm("You have unsaved changes in your custom engine. Are you sure you want to close? Changes will be lost.")) return;
                    setDevEngineDirty(false);
                }
                saveProfileToMemory();
                $("#prompt-slot-modal-overlay").fadeOut(200);
            }
        });
        let att = 0;
        const int = setInterval(() => {
            if ($("#kazuma_quick_gen").length > 0) {
                clearInterval(int);
                return;
            }
            const b = `<div id="kazuma_quick_gen" class="interactable" title="Visualize Last Scene (Manual)" style="cursor: pointer; width: 35px; height: 35px; display: none; align-items: center; justify-content: center; margin-right: 5px; color: var(--gold);"><i class="fa-solid fa-image fa-lg"></i></div>`;
            let t = $("#send_but_sheld");
            if (!t.length) t = $("#send_textarea");
            if (t.length) {
                t.attr("id") === "send_textarea" ? t.before(b) : t.prepend(b);
                toggleQuickGenButton(); // Ensure correct visibility immediately upon injection
                clearInterval(int);
            }
            att++;
            if (att > 10) clearInterval(int);
        }, 1000);

        $(document).on("click", "#kazuma_quick_gen", function (e) {
            e.preventDefault();
            e.stopPropagation();
            igManualGenerate();
        });

        // ── INLINE IMAGE RETRY: Add buttons to existing images on chat load ──
        eventSource.on(event_types.CHAT_CHANGED, () => {
            setTimeout(() => {
                const context = getContext();
                if (!context.chat) return;
                for (let i = 0; i < context.chat.length; i++) {
                    addKazumaRetryButtons(i);
                }
            }, 300);
        });

        // Re-add retry buttons after swipes and edits (ST re-renders the DOM)
        const kazumaReAddRetry = (index) => setTimeout(() => addKazumaRetryButtons(index), 150);
        eventSource.on(event_types.MESSAGE_SWIPED, kazumaReAddRetry);
        eventSource.on(event_types.MESSAGE_UPDATED, kazumaReAddRetry);
        eventSource.on(event_types.MESSAGE_EDITED, kazumaReAddRetry);

        // Scrolling up loads older messages into the page with no button on them.
        // Re-scan the whole chat; messages that are not on screen are skipped
        // cheaply, and messages that already have a button are left alone.
        const kazumaSweepRetry = () => setTimeout(() => {
            const ctx = getContext();
            if (!ctx.chat) return;
            for (let i = 0; i < ctx.chat.length; i++) {
                addKazumaRetryButtons(i);
            }
        }, 150);
        eventSource.on(event_types.MORE_MESSAGES_LOADED, kazumaSweepRetry);
        eventSource.on(event_types.CHARACTER_MESSAGE_RENDERED, kazumaReAddRetry);

        // ── MASTER BLOCK CARD ──
        // Nothing is drawn mid-stream: a half-written envelope re-parsed on every
        // token is wasted work and visible flicker, and the pass on
        // CHARACTER_MESSAGE_RENDERED covers the finished reply anyway.
        [
            event_types.CHARACTER_MESSAGE_RENDERED,
            event_types.MESSAGE_SWIPED,
            event_types.MESSAGE_UPDATED,
            event_types.MESSAGE_EDITED,
            event_types.MORE_MESSAGES_LOADED,
            event_types.CHAT_CHANGED,
            event_types.GENERATION_ENDED
        ].forEach(evt => {
            if (evt) eventSource.on(evt, () => meguminScheduleBlocksRefresh(120));
        });

        // ── FLUSH PENDING SAVES ON TAB HIDE / PAGE CLOSE ──
        // visibilitychange fires reliably on tab switch AND on close (before pagehide).
        // pagehide is the last event before the page is truly gone.
        // A one-shot guard prevents the double-fire sequence from saving twice.
        let _meguminHideFlushed = false;
        function meguminFlushOnHide() {
            if (_meguminHideFlushed) return;
            _meguminHideFlushed = true;
            cancelDebounce(_saveProfileDebouncedInner);
            // With no chat open getCharacterKey() is null, and saveProfileToMemory()
            // falls back to the "default" key — so backgrounding the tab after closing
            // a chat used to overwrite the global default profile with whatever chat
            // was last loaded in memory. Only the full save may run while a chat is
            // genuinely open; otherwise hand off to the guarded settings-only flush,
            // which writes under the key the profile was loaded from and does nothing
            // at all unless the user actually has an edit pending.
            if (getCharacterKey()) {
                saveProfileToMemory();
            } else {
                flushProfileSettingsToLoadedKey();
            }
        }
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "hidden") {
                meguminFlushOnHide();
            } else {
                _meguminHideFlushed = false; // rearm on return to visible
            }
        });
        window.addEventListener("pagehide", meguminFlushOnHide);

        // ── DEFERRED PROFILE LOADER ──
        // Polls for context.chatId to become available after page load.
        // This ensures profiles load even when initProfile() runs before ST context is ready.
        (function deferredProfileLoader() {
            let attempts = 0;
            const maxAttempts = 30; // 30 * 500ms = 15 seconds max
            const loader = setInterval(() => {
                attempts++;
                const ctx = getContext();
                const chatId = ctx?.chatId;
                const avatar = getRawAvatar();
                if (chatId) {
                    clearInterval(loader);
                    initProfile();
                } else if (avatar && attempts >= 10) {
                    // Wait up to 5 seconds (10 attempts) for chatId to load before falling back to character level
                    clearInterval(loader);
                    initProfile();
                } else if (attempts >= maxAttempts) {
                    clearInterval(loader);
                    initProfile();
                }
            }, 500);
        })();
    } catch (e) { console.error(`[${extensionName}] Failed to load:`, e); }
});