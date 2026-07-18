// ==UserScript==
// @name         Betking ↔ Altenar Crosslink
// @namespace    http://tampermonkey.net/
// @version      2.13
// @description  Стрелка-переход между профилем игрока в Betking и Altenar, копирование GGR с цветом + збереження кольору при вставці в поле коментаря на Betking.
// @author       Eduard Petrushenko
// @updateURL    https://github.com/Defou1t322/Betking-Altenar-Crosslink/raw/refs/heads/main/CrosslinkBK.user.js
// @downloadURL  https://github.com/Defou1t322/Betking-Altenar-Crosslink/raw/refs/heads/main/CrosslinkBK.user.js
// @match        https://sb2admin-altenar2.biahosted.com/*
// @match        https://admin.betking.com.ua/*
// @match        https://admin.777.ua/*
// @match        https://admin.vegas.ua/*
// @match        https://admin.wildwinz.com/*
// @match        https://admin.funrize.com/*
// @match        https://admin.nolimitcoins.com/*
// @match        https://admin.taofortune.com/*
// @match        https://admin.funzcity.com/*
// @match        https://admin.fortunewheelz.com/*
// @match        https://admin.jackpotrabbit.com/*
// @match        https://admin.sweepshark.com/*
// @match        https://admin.scarletsands.com/*
// @match        https://admin.stormrush.com/*
// @match        https://admin.mrgoodwin.com/*
// @match        https://admin.playtana.com/*
// @match        https://admin.vegasway.com/*
// @grant        none
// ==/UserScript==

(function () {
    'use strict';

    // ─────────────────────────────────────────────
    // НАСТРОЙКИ — меняй здесь
    // ─────────────────────────────────────────────
    const CONFIG = {
        closeTabAfterProfile: true,
        repeatFindDelay: 3500,
    };
    // ─────────────────────────────────────────────

    const host = window.location.hostname;
    const isAltenar = host.includes('altenar');
    const isBetking = !isAltenar;
    const BONUS_BOUNDARY_COLOR = '#dc3545';

    // Стили стрелки
    const style = document.createElement('style');
    style.textContent = `
        .xlink-arrow {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            margin-left: 4px;
            cursor: pointer;
            opacity: 0.55;
            transition: opacity 0.15s, transform 0.15s;
            vertical-align: middle;
            line-height: 1;
            text-decoration: none;
            border: none;
            background: none;
            padding: 0;
            color: inherit;
            font-size: inherit;
        }
        .xlink-arrow:hover {
            opacity: 1;
            transform: translateX(2px);
        }
        .xlink-arrow svg {
            width: 1em;
            height: 1em;
            fill: currentColor;
        }
        .xlink-ggr-copy {
            cursor: pointer;
            border-bottom: 1px dashed currentColor;
            transition: opacity 0.15s;
        }
        .xlink-ggr-copy:hover {
            opacity: 0.7;
        }
        .xlink-ggr-toast {
            position: fixed;
            bottom: 24px;
            right: 24px;
            background: #323232;
            color: #fff;
            padding: 8px 16px;
            border-radius: 4px;
            font-size: 13px;
            z-index: 99999;
            pointer-events: none;
            transition: opacity 0.3s;
        }
    `;
    document.head.appendChild(style);

    function makeArrowSVG() {
        return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M13.293 4.293a1 1 0 0 1 1.414 0l7 7a1 1 0 0 1 0 1.414l-7 7a1 1 0 0 1-1.414-1.414L18.586 13H3a1 1 0 1 1 0-2h15.586l-5.293-5.293a1 1 0 0 1 0-1.414z"/></svg>`;
    }

    function createArrow(title, targetUrl) {
        const btn = document.createElement('span');
        btn.className = 'xlink-arrow';
        btn.title = title;
        btn.dataset.xlinkHref = targetUrl;
        btn.innerHTML = makeArrowSVG();
        return btn;
    }

    document.addEventListener('click', (e) => {
        const arrow = e.target.closest('.xlink-arrow');
        if (!arrow || !arrow.dataset.xlinkHref) return;
        e.stopPropagation();
        e.preventDefault();
        window.open(arrow.dataset.xlinkHref, '_blank');
    });

    // ─────────────────────────────────────────────
    // ALTENAR → BETKING
    // ─────────────────────────────────────────────
    function attachArrowsAltenar() {
        document.querySelectorAll('p[aria-label*="Int "][aria-label*="| Ext "]').forEach(p => {
            const cell = p.closest('td');
            if (!cell || cell.dataset.xlinkDone) return;
            const match = p.getAttribute('aria-label').match(/Ext (\d+)/);
            if (match) injectAltenarArrow(cell, match[1]);
        });

        document.querySelectorAll('[data-field="PlayerName"]').forEach(cell => {
            if (cell.dataset.xlinkDone) return;
            const bold = cell.querySelector('b');
            const id = bold ? bold.textContent.trim() : cell.textContent.trim();
            if (id && !isNaN(id)) injectAltenarArrow(cell, id);
        });
    }

    function injectAltenarArrow(cell, id) {
        cell.dataset.xlinkDone = '1';
        const betkingBase = 'https://admin.betking.com.ua';
        const targetUrl = `${betkingBase}/players/playersItems/search/?number=${id}`;
        const arrow = createArrow(`Открыть ${id} в Betking`, targetUrl);
        const link = cell.querySelector('a');
        if (link) link.insertAdjacentElement('afterend', arrow);
        else cell.appendChild(arrow);
    }

    // ─────────────────────────────────────────────
    // BETKING → ALTENAR (ОБНОВЛЕННЫЙ ТЕХНОЛОГИЧНЫЙ МЕТОД)
    // ─────────────────────────────────────────────
    function attachArrowBetking() {
        const currentUrl = window.location.href;
        if (!currentUrl.includes('playersItems/update') && !currentUrl.includes('playersItems/view')) return;

        // Поиск по тегам <th> гарантирует стабильность при любых динамических изменениях в строке
        const headers = document.querySelectorAll('th');
        for (const th of headers) {
            const text = th.textContent.toLowerCase().trim();
            if (
                text === 'номер игрока' ||
                text === 'player number' ||
                text === 'номер гравця' ||
                text === 'player id'
            ) {
                const td = th.nextElementSibling;
                if (!td) continue;

                // Если стрелочка на месте именно в этой ячейке — пропускаем
                if (td.querySelector('.xlink-arrow')) continue;

                // Находим ID (первое число в ячейке)
                const match = td.textContent.match(/\d+/);
                if (!match) continue;
                const playerNumber = match[0];

                const altenarUrl = `https://sb2admin-altenar2.biahosted.com/v2/players?site=1#extId=${playerNumber}`;
                const arrow = createArrow(`Открыть ${playerNumber} в Altenar`, altenarUrl);
                arrow.id = 'xlink-betking-arrow';

                // Вставляем сразу за числовым ID (первым span)
                const span = td.querySelector('span');
                if (span) {
                    span.insertAdjacentElement('afterend', arrow);
                } else {
                    td.appendChild(arrow);
                }
            }
        }
    }

    function attachArrowAltenarProfile() {
        if (!window.location.pathname.includes('/ManagePlayersProfile')) return;
        if (document.getElementById('xlink-altenar-profile-arrow')) return;

        const playerIdsEl = document.querySelector('[class*="Headerstyles__PlayerIds"]');
        if (!playerIdsEl) return;

        const text = playerIdsEl.textContent;
        const match = text.match(/Ext\s*ID\s*(\d+)/i);
        if (!match) return;
        const extId = match[1];

        const nameContainer = document.querySelector('[class*="Headerstyles__PlayerNameContainer"]');
        if (!nameContainer) return;

        const betkingUrl = `https://admin.betking.com.ua/players/playersItems/search/?number=${extId}`;
        const arrow = createArrow(`Открыть ${extId} в Betking`, betkingUrl);
        arrow.id = 'xlink-altenar-profile-arrow';
        nameContainer.appendChild(arrow);
    }

    // ─────────────────────────────────────────────
    // AUTOFILL
    // ─────────────────────────────────────────────
    function autoFillBetkingSearch() {
        if (!window.location.href.includes('playersItems/search')) return;
        const number = new URLSearchParams(window.location.search).get('number');
        if (!number) return;

        const trySubmit = (attempts = 0) => {
            const input     = document.getElementById('PlayersSearchForm_number');
            const submitBtn = document.getElementById('yw1');
            if (input && submitBtn) {
                input.value = number;
                setTimeout(() => submitBtn.click(), 150);
            } else if (attempts < 15) {
                setTimeout(() => trySubmit(attempts + 1), 300);
            }
        };
        trySubmit();
    }

    function getProfileLinks() {
        return [...document.querySelectorAll('a[href*="ManagePlayersProfile"]')]
            .filter(a => a.closest('td'));
    }

    function getFindBtn() {
        return document.querySelector('[class*="FindButtonstyles__StyledButton"]') ||
               document.querySelector('button svg[data-testid="SearchIcon"]')?.closest('button');
    }

    function clickProfileAndClose(link) {
        link.click();
        if (CONFIG.closeTabAfterProfile) {
            setTimeout(() => window.close(), 300);
        }
    }

    function autoClickProfile() {
        const check = (attempts = 0) => {
            const links = getProfileLinks();

            if (links.length === 1) {
                clickProfileAndClose(links[0]);
                return;
            }

            if (links.length > 1) {
                const findBtn = getFindBtn();
                if (!findBtn) { setTimeout(() => check(attempts + 1), 300); return; }
                findBtn.click();

                const clickAfterFind = (waited = 0) => {
                    const afterLinks = getProfileLinks();
                    if (afterLinks.length >= 1) {
                        clickProfileAndClose(afterLinks[0]);
                    } else if (waited < 5000) {
                        setTimeout(() => clickAfterFind(waited + 200), 200);
                    }
                };
                setTimeout(() => clickAfterFind(), 150);
                return;
            }

            if (attempts < 25) {
                setTimeout(() => check(attempts + 1), 300);
            }
        };

        check();
    }

    function autoFillAltenarSearch() {
        if (!window.location.pathname.includes('/v2/players')) return;
        const match = window.location.hash.match(/#extId=(\d+)/);
        if (!match) return;

        const targetId = match[1];
        history.replaceState(null, '', window.location.pathname + window.location.search);

        const tryFill = (attempts = 0) => {
            let extIdInput = null;
            document.querySelectorAll('label').forEach(label => {
                if (label.textContent.trim() === 'Ext ID') {
                    const forAttr = label.getAttribute('for');
                    extIdInput = forAttr
                        ? document.getElementById(forAttr)
                    : label.closest('div')?.querySelector('input[type="text"]');
                }
            });

            const findBtn = getFindBtn();

            if (extIdInput && findBtn) {
                const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
                nativeSetter.call(extIdInput, targetId);
                extIdInput.dispatchEvent(new Event('input',  { bubbles: true }));
                extIdInput.dispatchEvent(new Event('change', { bubbles: true }));
                extIdInput.focus();
                setTimeout(() => {
                    findBtn.click();
                    setTimeout(() => autoClickProfile(), 200);
                }, 100);
            } else if (attempts < 20) {
                setTimeout(() => tryFill(attempts + 1), 500);
            }
        };
        tryFill();
    }

    // ─────────────────────────────────────────────
    // GGR COPY (СТАБИЛЬНЫЙ МЕТОД С ЦВЕТОМ)
    // ─────────────────────────────────────────────
    const PERIOD_MAP = {
        'All-Time': 'весь час',
        '1yr':  '1 рік',
        '6mo':  '6 місяців',
        '3mo':  '3 місяці',
        '1mo':  '1 місяць',
        '1w':   '1 тиждень',
    };

    function showToast(msg) {
        const old = document.getElementById('xlink-ggr-toast');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'xlink-ggr-toast';
        el.className = 'xlink-ggr-toast';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, 2000);
    }

    function attachGgrCopy() {
        if (!window.location.pathname.includes('/ManagePlayersProfile')) return;

        document.querySelectorAll('[class*="AggregatedDatastyles__WrapperAggregate"]').forEach(wrapper => {
            if (wrapper.dataset.ggrDone) return;
            const titleEl = wrapper.querySelector('[class*="AggregatedDatastyles__Title"]');
            const valueEl = wrapper.querySelector('[class*="AggregatedDatastyles__Value"]');
            if (!titleEl || !valueEl) return;
            if (titleEl.textContent.trim() !== 'GGR') return;

            wrapper.dataset.ggrDone = '1';
            valueEl.classList.add('xlink-ggr-copy');
            valueEl.title = 'Копіювати GGR';

            valueEl.addEventListener('click', () => {
                let activePeriod = 'весь час';
                const periodBtns = [...document.querySelectorAll('[class*="PeriodsButtonsstyles__PeriodsButton"]')];
                if (periodBtns.length) {
                    const active = periodBtns.find(btn => {
                        const bg = window.getComputedStyle(btn).backgroundColor;
                        return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
                    }) || periodBtns[0];
                    activePeriod = PERIOD_MAP[active.textContent.trim()] || active.textContent.trim();
                }

                const ggrRaw = valueEl.textContent.trim();
                const ggrMatch = ggrRaw.match(/([+-]?\d[\d.,]*)\s*UAH/);
                if (!ggrMatch) return;
                const ggrNum = ggrMatch[1].trim();
                const isPositive = !ggrNum.startsWith('-');
                const verb = isPositive ? 'програє' : 'виграє';
                const rounded = Math.round(parseFloat(ggrNum));
                const absFormatted = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
                const ggrFormatted = (rounded >= 0 ? '+' : '-') + absFormatted;

                let marginText = '';
                document.querySelectorAll('[class*="AggregatedDatastyles__WrapperAggregate"]').forEach(w => {
                    const t = w.querySelector('[class*="AggregatedDatastyles__Title"]');
                    const v = w.querySelector('[class*="AggregatedDatastyles__Value"]');
                    if (t && v && t.textContent.trim() === 'Margin') {
                        let m = v.textContent.trim().replace('%', '').replace('.', ',');
                        if (!m.startsWith('-') && !m.startsWith('+')) m = '+' + m;
                        marginText = m;
                    }
                });

                // Форматируем HTML с тегами <font> для текстового редактора
                const ggrColor = rounded >= 0 ? '#008000' : '#ff0000';
                const ggrColored = `<font color="${ggrColor}">${ggrFormatted}</font> грн`;

                let marginColored = marginText ? (() => {
                    const mColor = marginText.startsWith('-') ? '#ff0000' : '#008000';
                    return `<font color="${mColor}">${marginText}%</font>`;
                })() : '';

                // HTML и PlainText версии
                const resultHtml = `За ${activePeriod} ${verb} ${ggrColored} (${marginColored})`;
                const resultPlain = `За ${activePeriod} ${verb} ${ggrFormatted} грн (${marginText}%)`;

                // Функция для записи сырого HTML в обход нормализации браузера
                function copyRawData(html, plain) {
                    const tempEl = document.createElement('span');
                    tempEl.textContent = 'dummy';
                    tempEl.style.position = 'fixed';
                    tempEl.style.opacity = '0';
                    document.body.appendChild(tempEl);

                    const range = document.createRange();
                    range.selectNodeContents(tempEl);
                    const selection = window.getSelection();
                    selection.removeAllRanges();
                    selection.addRange(range);

                    const copyHandler = function(e) {
                        e.preventDefault();
                        e.clipboardData.setData('text/html', html);
                        e.clipboardData.setData('text/plain', plain);
                    };

                    document.addEventListener('copy', copyHandler);

                    let success = false;
                    try {
                        success = document.execCommand('copy');
                    } catch (err) {
                        console.error('execCommand error:', err);
                    }

                    document.removeEventListener('copy', copyHandler);
                    selection.removeAllRanges();
                    document.body.removeChild(tempEl);

                    if (success) {
                        showToast('✓ ' + plain);
                    } else {
                        navigator.clipboard.writeText(plain)
                            .then(() => showToast('✓ (без кольору) ' + plain))
                            .catch(() => showToast('Помилка копіювання'));
                    }
                }

                copyRawData(resultHtml, resultPlain);
            });
        });
    }

    function attachSportTableCopy() {
        document.querySelectorAll('tr[data-testid="mtablebodyrow"]').forEach(row => {
            if (row.dataset.sportCopyDone) return;
            const cells = row.querySelectorAll('td');
            if (cells.length < 7) return;

            const sportCell = cells[0];
            const ggrCell   = cells[6];

            if (!sportCell || !ggrCell) return;
            row.dataset.sportCopyDone = '1';

            sportCell.classList.add('xlink-ggr-copy');
            ggrCell.classList.add('xlink-ggr-copy');

            function getFullText() {
                const sport = sportCell.textContent.trim();
                const ggrFormatted = formatGGR(ggrCell.textContent);
                if (!ggrFormatted) return null;
                return ggrFormatted.replace(
                    /^(виграє|програє)/,
                    (m) => m.charAt(0).toUpperCase() + m.slice(1) + ` на ${sport}`
                );
            }

            row.addEventListener('click', () => {
                const full = getFullText();
                if (!full) return;
                navigator.clipboard.writeText(full).then(() => showToast('✓ ' + full));
            });

            sportCell.addEventListener('click', (e) => {
                e.stopPropagation();
                const sport = sportCell.textContent.trim();
                navigator.clipboard.writeText(sport).then(() => showToast(`✓ ${sport}`));
            });

            ggrCell.addEventListener('click', (e) => {
                e.stopPropagation();
                const result = formatGGR(ggrCell.textContent);
                if (!result) return;
                navigator.clipboard.writeText(result).then(() => showToast('✓ ' + result));
            });
        });
    }

    function formatGGR(rawText) {
        const match = rawText.trim().match(/([+-]?\d[\d.,]*)/);
        if (!match) return null;

        const num = parseFloat(match[1].replace(',', '.'));
        const rounded = Math.round(num);
        const isPositive = rounded >= 0;
        const verb = isPositive ? 'програє' : 'виграє';

        const absFormatted = Math.abs(rounded)
        .toString()
        .replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');

        const formatted = (rounded >= 0 ? '+' : '-') + absFormatted;
        return `${verb} ${formatted} грн`;
    }

    // ─────────────────────────────────────────────
    // ВСТАВКА З ЗБЕРЕЖЕННЯМ КОЛЬОРУ В ПОЛЕ КОМЕНТАРЯ (Betking)
    // Перехоплюємо paste ДО нативного обробника Betking, який ріже колір.
    // ─────────────────────────────────────────────
    function sanitizeCommentHtml(html) {
        const ALLOWED = { FONT: true, SPAN: true, B: true, STRONG: true, I: true, EM: true, U: true, BR: true };
        const tpl = document.createElement('template');
        tpl.innerHTML = html;
        (function walk(node) {
            [...node.childNodes].forEach(child => {
                if (child.nodeType === 8) { child.remove(); return; }   // коментарі-маркери (StartFragment тощо)
                if (child.nodeType !== 1) return;                        // текстові вузли не чіпаємо
                walk(child);
                const tag = child.tagName;
                if (!ALLOWED[tag]) { child.replaceWith(...child.childNodes); return; }
                const fontColor  = (tag === 'FONT') ? child.getAttribute('color') : null;
                const styleColor = child.style ? child.style.color : '';
                [...child.attributes].forEach(a => child.removeAttribute(a.name));
                if (fontColor)  child.setAttribute('color', fontColor);
                if (styleColor) child.style.color = styleColor;
            });
        })(tpl.content);

        // Прибираємо службові переноси з буфера (через white-space: pre-wrap вони давали зайві абзаци).
        // nbsp (\u00A0) у розрядах GGR НЕ чіпаємо.
        let out = tpl.innerHTML;
        out = out.replace(/<!--[\s\S]*?-->/g, '');            // будь-які залишки коментарів
        out = out.replace(/[\t\r\n]+/g, ' ');                 // переноси/таби -> пробіл
        out = out.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');    // трим по краях
        return out;
    }

    function installCommentColorPaste() {
        if (window.__xlinkColorPasteInstalled) return;
        window.__xlinkColorPasteInstalled = true;

        document.addEventListener('paste', function (e) {
            const t = e.target;
            const field = t && t.closest && t.closest(
                '.antifraud-comment-editor, div[contenteditable="true"][id^="antifraud-input-"], [data-comment-edit]'
            );
            if (!field) return;

            const cd = e.clipboardData || window.clipboardData;
            if (!cd) return;

            const html  = cd.getData('text/html');
            const plain = cd.getData('text/plain') || cd.getData('text');

            e.preventDefault();
            e.stopImmediatePropagation();

            field.focus();
            if (html) {
                document.execCommand('insertHTML', false, sanitizeCommentHtml(html));
            } else {
                document.execCommand('insertText', false, plain);
            }
        }, true); // capture — спрацьовує раніше нативного $(document).on('paste', ...)
    }

    function init() {
        if (isAltenar) {
            autoFillAltenarSearch();
            attachArrowsAltenar();
            attachArrowAltenarProfile();
            attachGgrCopy();
            attachSportTableCopy();

            new MutationObserver(() => {
                attachSportTableCopy();
            }).observe(document.body, { childList: true, subtree: true });
            new MutationObserver(() => {
                attachArrowsAltenar();
                attachArrowAltenarProfile();
                attachGgrCopy();
            }).observe(document.body, { childList: true, subtree: true });
        }
        if (isBetking) {
            installCommentColorPaste();
            autoFillBetkingSearch();
            attachArrowBetking();

            // Наблюдатель на Betking теперь динамически проверяет новые URL
            new MutationObserver(() => {
                attachArrowBetking();
                if (window.location.href.includes('sportBetting/report')) {
                    highlightBonusBoundaries();
                }
            }).observe(document.body, { childList: true, subtree: true });

            if (window.location.href.includes('sportBetting/report')) {
                highlightBonusBoundaries();
            }
        }
    }

    function highlightBonusBoundaries() {
        const rows = document.querySelectorAll('tbody tr');
        if (rows.length < 2) return;

        let prevBonus = null;

        rows.forEach(row => {
            const cells = row.querySelectorAll('td');
            if (cells.length < 8) return;
            const bonusName = cells[7].textContent.trim();
            if (!bonusName || !bonusName.includes('#')) return;

            row.style.borderTop = '';
            if (prevBonus !== null && bonusName !== prevBonus) {
                row.style.borderTop = `3px solid ${BONUS_BOUNDARY_COLOR}`;
            }
            prevBonus = bonusName;
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
