// ==UserScript==
// @name         Betking ↔ Altenar Crosslink
// @namespace    http://tampermonkey.net/
// @version      2.11
// @description  Стрелка-переход между профилем игрока в Betking и Altenar, копирование GGR.
// @author       Eduard Petrushenko
// @updateURL    https://raw.githubusercontent.com/Defou1t322/Betking-Altenar-Crosslink/main/Betking%20%E2%86%94%20Altenar%20Crosslink.user.js
// @downloadURL  https://raw.githubusercontent.com/Defou1t322/Betking-Altenar-Crosslink/main/Betking%20%E2%86%94%20Altenar%20Crosslink.user.js
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
        // true  — закрыть вкладку поиска после перехода в профиль
        // false — оставить вкладку и повторно нажать Find через repeatFindDelay мс
        closeTabAfterProfile: true,

        // Задержка повторного Find (мс) — работает только если closeTabAfterProfile: false
        repeatFindDelay: 3500,
    };
    // ─────────────────────────────────────────────

    const host = window.location.hostname;
    const url  = window.location.href;
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

    // Делегирование кликов — работает и для клонированных строк
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
        // Метод 1: новый интерфейс — <p aria-label="Int 70981766 | Ext 1001675">
        document.querySelectorAll('p[aria-label*="Int "][aria-label*="| Ext "]').forEach(p => {
            const cell = p.closest('td');
            if (!cell || cell.dataset.xlinkDone) return;
            const match = p.getAttribute('aria-label').match(/Ext (\d+)/);
            if (match) injectAltenarArrow(cell, match[1]);
        });

        // Метод 2: старый интерфейс — [data-field="PlayerName"] <b>ID</b>
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
    // ALTENAR PROFILE → BETKING
    // Стрелка на странице профиля рядом с именем игрока
    // ─────────────────────────────────────────────
    function attachArrowAltenarProfile() {
        if (!window.location.pathname.includes('/ManagePlayersProfile')) return;
        if (document.getElementById('xlink-altenar-profile-arrow')) return;

        // Ext ID из <p class="...PlayerIds..."> — содержит "Int ID 49432770 | Ext ID7253185"
        const playerIdsEl = document.querySelector('[class*="Headerstyles__PlayerIds"]');
        if (!playerIdsEl) return;

        const text = playerIdsEl.textContent;
        const match = text.match(/Ext\s*ID\s*(\d+)/i);
        if (!match) return;
        const extId = match[1];

        // Вставляем стрелку рядом с заголовком имени игрока
        const nameContainer = document.querySelector('[class*="Headerstyles__PlayerNameContainer"]');
        if (!nameContainer) return;

        const betkingUrl = `https://admin.betking.com.ua/players/playersItems/search/?number=${extId}`;
        const arrow = createArrow(`Открыть ${extId} в Betking`, betkingUrl);
        arrow.id = 'xlink-altenar-profile-arrow';
        nameContainer.appendChild(arrow);
    }

    // ─────────────────────────────────────────────
    // BETKING → ALTENAR
    // ─────────────────────────────────────────────
    function getBetkingPlayerNumber() {
        for (const row of document.querySelectorAll('tr')) {
            const text = row.textContent.toLowerCase();
            if (text.includes('номер игрока') || text.includes('player number') || text.includes('номер гравця')) {
                const span = row.querySelector('td span');
                if (span) return span.textContent.trim();
            }
        }
        return null;
    }

    function attachArrowBetking() {
        if (!url.includes('playersItems/update')) return;
        if (document.getElementById('xlink-betking-arrow')) return;

        const playerNumber = getBetkingPlayerNumber();
        if (!playerNumber) return;

        for (const row of document.querySelectorAll('tr')) {
            const text = row.textContent.toLowerCase();
            if (text.includes('номер игрока') || text.includes('player number') || text.includes('номер гравця')) {
                const span = row.querySelector('td span');
                if (!span) continue;
                const altenarUrl = `https://sb2admin-altenar2.biahosted.com/v2/players?site=1#extId=${playerNumber}`;
                const arrow = createArrow(`Открыть ${playerNumber} в Altenar`, altenarUrl);
                arrow.id = 'xlink-betking-arrow';
                span.insertAdjacentElement('afterend', arrow);
                break;
            }
        }
    }

    // ─────────────────────────────────────────────
    // AUTOFILL — Betking /search?number=...
    // ─────────────────────────────────────────────
    function autoFillBetkingSearch() {
        if (!url.includes('playersItems/search')) return;
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

    // ─────────────────────────────────────────────
    // AUTO CLICK PROFILE — клик по ссылке профиля после поиска
    // ─────────────────────────────────────────────
    function getProfileLinks() {
        // Ссылки на профиль в таблице результатов поиска (только в ячейках)
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
        // Повторяем проверку каждые 300мс пока таблица не загрузится
        const check = (attempts = 0) => {
            const links = getProfileLinks();

            if (links.length === 1) {
                // Ровно 1 игрок — наш, кликаем немедленно
                clickProfileAndClose(links[0]);
                return;
            }

            if (links.length > 1) {
                // Общий список подтянулся раньше чем наш Find отработал.
                // Повторяем Find — он вернёт точный результат по Ext ID.
                const findBtn = getFindBtn();
                if (!findBtn) { setTimeout(() => check(attempts + 1), 300); return; }
                findBtn.click();

                // После Find ждём первый появившийся результат и кликаем его
                const clickAfterFind = (waited = 0) => {
                    const afterLinks = getProfileLinks();
                    if (afterLinks.length >= 1) {
                        // Первый результат после точного поиска — наш игрок
                        clickProfileAndClose(afterLinks[0]);
                    } else if (waited < 5000) {
                        setTimeout(() => clickAfterFind(waited + 200), 200);
                    } else {
                        console.warn('[Crosslink] Altenar: профиль не найден после повторного Find');
                    }
                };
                setTimeout(() => clickAfterFind(), 150);
                return;
            }

            // 0 игроков — Find ещё обрабатывается, продолжаем ждать
            if (attempts < 25) {
                setTimeout(() => check(attempts + 1), 300);
            } else {
                console.warn('[Crosslink] Altenar: профиль не найден после ожидания');
            }
        };

        check();
    }

    // ─────────────────────────────────────────────
    // AUTOFILL — Altenar /v2/players#extId=...
    // ─────────────────────────────────────────────
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

            const findBtn =
                  document.querySelector('[class*="FindButtonstyles__StyledButton"]') ||
                  document.querySelector('button svg[data-testid="SearchIcon"]')?.closest('button');

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
            } else {
                console.warn('[Crosslink] Altenar: не найдено поле Ext ID или кнопка Find');
            }
        };
        tryFill();
    }

    // ─────────────────────────────────────────────
    // GGR COPY — Altenar player profile
    // Клик по GGR копирует текст в буфер обмена
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
                // Активний період — кнопка з непрозорим фоном серед PeriodsButton
                let activePeriod = 'весь час';
                const periodBtns = [...document.querySelectorAll('[class*="PeriodsButtonsstyles__PeriodsButton"]')];
                if (periodBtns.length) {
                    const active = periodBtns.find(btn => {
                        const bg = window.getComputedStyle(btn).backgroundColor;
                        return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
                    }) || periodBtns[0];
                    activePeriod = PERIOD_MAP[active.textContent.trim()] || active.textContent.trim();
                }

                // Значення GGR
                const ggrRaw = valueEl.textContent.trim(); // напр. "+50590.46 UAH"
                const ggrMatch = ggrRaw.match(/([+-]?\d[\d.,]*)\s*UAH/);
                if (!ggrMatch) return;
                const ggrNum = ggrMatch[1].trim();
                const isPositive = !ggrNum.startsWith('-');
                // + GGR = казино виграло = гравець програє
                const verb = isPositive ? 'програє' : 'виграє';
                const rounded = Math.round(parseFloat(ggrNum));
                const absFormatted = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '\u00A0');
                const ggrFormatted = (rounded >= 0 ? '+' : '-') + absFormatted;

                // Маржа
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

                const ggrColor = rounded >= 0 ? '#008000' : '#ff0000';
                const ggrColored = `<font color="${ggrColor}">${ggrFormatted} грн</font>`;

                let marginColored = marginText ? (() => {
                    const mColor = marginText.startsWith('-') ? '#ff0000' : '#008000';
                    return `<font color="${mColor}">${marginText}%</font>`;
                })() : '';

                const result = `За ${activePeriod} ${verb} ${ggrColored} (${marginColored})`;

                const resultPlain = `За ${activePeriod} ${verb} ${ggrFormatted} грн (${marginText}%)`;

                navigator.clipboard.writeText(result).then(() => {
                    showToast('✓ ' + resultPlain);
                }).catch(() => {
                    showToast('Помилка копіювання');
                });
            });
        });
    }

    // ─────────────────────────────────────────────
    // SPORT TABLE GGR COPY
    // ─────────────────────────────────────────────
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

            sportCell.title = 'Копіювати спорт';
            ggrCell.title   = 'Копіювати GGR';

            // ───── helper ─────
            function getFullText() {
                const sport = sportCell.textContent.trim();
                const ggrFormatted = formatGGR(ggrCell.textContent);
                if (!ggrFormatted) return null;

                return ggrFormatted.replace(
                    /^(виграє|програє)/,
                    (m) => m.charAt(0).toUpperCase() + m.slice(1) + ` на ${sport}`
                );
            }

            // ───── КЛИК ПО СТРОКЕ ─────
            row.addEventListener('click', () => {
                const full = getFullText();
                if (!full) return;

                navigator.clipboard.writeText(full).then(() => {
                    showToast('✓ ' + full);
                }).catch(() => showToast('Помилка копіювання'));
            });

            // ───── КЛИК ПО SPORT ─────
            sportCell.addEventListener('click', (e) => {
                e.stopPropagation();

                const sport = sportCell.textContent.trim();

                navigator.clipboard.writeText(sport).then(() => {
                    showToast(`✓ ${sport}`);
                }).catch(() => showToast('Помилка копіювання'));
            });

            // ───── КЛИК ПО GGR ─────
            ggrCell.addEventListener('click', (e) => {
                e.stopPropagation();

                const result = formatGGR(ggrCell.textContent);
                if (!result) return;

                navigator.clipboard.writeText(result).then(() => {
                    showToast('✓ ' + result);
                }).catch(() => showToast('Помилка копіювання'));
            });
        });
    }

    // ─────────────────────────────────────────────
    // helper форматирования GGR
    // ─────────────────────────────────────────────
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
    // ИНИЦИАЛИЗАЦИЯ
    // ─────────────────────────────────────────────
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
            autoFillBetkingSearch();
            attachArrowBetking();
            new MutationObserver(() => attachArrowBetking()).observe(document.body, { childList: true, subtree: true });

            // Включаем логику подсветки бонусов на странице sportBetting/report
            if (url.includes('sportBetting/report')) {
                highlightBonusBoundaries();
                // Следим за изменениями, так как таблица может подгружаться динамически
                new MutationObserver(() => {
                    highlightBonusBoundaries();
                }).observe(document.body, { childList: true, subtree: true });
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

            // Сбрасываем предыдущий стиль границы
            row.style.borderTop = '';

            if (prevBonus !== null && bonusName !== prevBonus) {
                // Граница между разными бонусами
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
