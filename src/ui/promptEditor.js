// The reusable prompt-editing card.
//
// Five tabs render one of these — Story Director, Ban List, Image Gen, NPC Bank
// and Memory Core — so it is a shared UI component rather than any one feature's.

import { saveProfileToMemory } from "../core/profile.js";

export function renderPromptEditor(config) {
    const { id, title, defaultData, currentData, fields, onSave, onReset, enabled, onToggle } = config;
    let prompts = currentData || defaultData;
    if (typeof prompts !== 'object' || prompts === null) prompts = defaultData;
    
    let fieldsHtml = '';
    const disabledAttr = enabled ? '' : 'disabled';
    const opacityStyle = enabled ? '' : 'opacity: 0.5; pointer-events: none;';

    fields.forEach(f => {
        let val = prompts[f.key];
        if (val === undefined || val === null || String(val).trim() === '') {
            val = defaultData[f.key] || '';
        }
        
        let escapedVal = String(val)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');

        fieldsHtml += `
            <div class="ps-prompt-field" style="${opacityStyle}">
                <div class="ps-prompt-field-label">
                    <span class="pf-name"><i class="fa-solid fa-code"></i> ${f.label}</span>
                    <button class="pf-reset" data-key="${f.key}" title="Reset to default" ${disabledAttr}><i class="fa-solid fa-rotate-left"></i> Reset</button>
                </div>
                <textarea class="ps-prompt-textarea" data-key="${f.key}" ${disabledAttr}>${escapedVal}</textarea>
                <div class="pf-hint">${f.hint}</div>
            </div>
        `;
    });

    const html = `
        <div class="ps-prompt-editor" id="${id}">
            <div class="ps-prompt-editor-toggle" style="display:flex; justify-content:space-between; align-items:center;">
                <div style="display:flex; align-items:center; gap:12px;">
                    <span class="pe-title"><i class="fa-solid fa-pen-to-square"></i> ${title}</span>
                    <div class="ps-toggle-card ${enabled ? 'active' : ''} pe-enable-toggle" style="padding: 2px; min-width: 36px; background: transparent; border-color: ${enabled ? '#10b981' : 'var(--border-color)'}; cursor: pointer; border-radius: 8px;" title="Enable custom prompts override">
                        <div class="ps-switch" style="transform: scale(0.65); ${enabled ? 'background: var(--c-live, #10b981);' : ''}"></div>
                    </div>
                </div>
                <i class="fa-solid fa-chevron-down pe-chevron" style="cursor:pointer; padding:5px;"></i>
            </div>
            <div class="ps-prompt-editor-body">
                ${fieldsHtml}
                <div class="ps-prompt-editor-actions" style="${opacityStyle}">
                    <button class="ps-modern-btn secondary btn-reset-all" style="padding: 6px 12px; font-size: 0.75rem;" ${disabledAttr}><i class="fa-solid fa-rotate-left"></i> Reset All Defaults</button>
                </div>
            </div>
        </div>
    `;

    const $el = $(html);

    // Open/Close Accordion
    $el.find('.ps-prompt-editor-toggle').on('click', function(e) {
        if ($(e.target).closest('.pe-enable-toggle').length) return; // Don't trigger if clicking the switch
        $el.toggleClass('open');
    });

    // Toggle Enable Switch
    $el.find('.pe-enable-toggle').on('click', function(e) {
        e.stopPropagation();
        const $toggle = $(this);
        const isNowEnabled = !$toggle.hasClass('active');
        
        if (isNowEnabled) {
            $toggle.addClass('active').css('border-color', '#10b981');
            $toggle.find('.ps-switch').css('background', '#10b981');
            $el.find('.ps-prompt-field, .ps-prompt-editor-actions').css({'opacity': '', 'pointer-events': ''});
            $el.find('textarea, button').prop('disabled', false);
        } else {
            $toggle.removeClass('active').css('border-color', 'var(--border-color)');
            $toggle.find('.ps-switch').css('background', '');
            $el.find('.ps-prompt-field, .ps-prompt-editor-actions').css({'opacity': '0.5', 'pointer-events': 'none'});
            $el.find('textarea, button').prop('disabled', true);
        }
        
        if (onToggle) onToggle(isNowEnabled);
    });

    $el.find('.ps-prompt-textarea').on('input', function() {
        const key = $(this).data('key');
        let cData = onSave($(this).val(), key);
        if (cData) prompts = cData;
    });

    $el.find('.pf-reset').on('click', function() {
        const key = $(this).data('key');
        $el.find(`textarea[data-key="${key}"]`).val(defaultData[key]);
        let cData = onSave(defaultData[key], key);
        if (cData) prompts = cData;
        // onSave mutates the profile synchronously and only defers the write, so this
        // commits the default that was just put in the box. One click, one save.
        saveProfileToMemory();
    });

    $el.find('.btn-reset-all').on('click', function() {
        onReset();
        $el.find('.ps-prompt-textarea').each(function() {
            const key = $(this).data('key');
            $(this).val(defaultData[key]);
        });
        prompts = defaultData;
    });

    return $el;
}
