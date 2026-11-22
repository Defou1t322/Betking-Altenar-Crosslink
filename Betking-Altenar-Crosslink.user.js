// ==UserScript==
// @name         Betking ↔ Altenar Crosslink
// @namespace    http://tampermonkey.net/
// @version      3.1.3
// @description  Єдиний скрипт антифроду ставок: перехід Betking ↔ Altenar, копіювання GGR, калькулятор бонусів, мінхантер і вимкнення бонусів (Betking), антифрод-підсвітка ставок (Altenar).
// @author       Eduard Petrushenko (модулі антифроду — на основі скриптів Stanislav Drychyk)
// @updateURL    https://gist.githubusercontent.com/Defou1t322/114b445e7027eba4a538c18d8889d347/raw/CrosslinkBK.user.js
// @downloadURL  https://gist.githubusercontent.com/Defou1t322/114b445e7027eba4a538c18d8889d347/raw/CrosslinkBK.user.js
// @match        https://sb2admin-altenar2.biahosted.com/*
// @match        http://sb2admin-altenar2.biahosted.com/Account/Login*
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
// @grant        GM_xmlhttpRequest
// @grant        GM_addStyle
// @grant        GM_info
// @grant        GM_getValue
// @grant        GM_setValue
// @grant        unsafeWindow
// @connect      gist.githubusercontent.com
// @connect      docs.google.com
// @connect      googleusercontent.com
// @connect      google.com
// @run-at       document-idle
// ==/UserScript==

/*
 * Структура файлу
 *   0. Спільні хелпери (копіювання в буфер, очікування, тости)
 *   1. Автооновлення (банер, джерело — секретний gist)
 *   2. Детектор старих скриптів Станіслава (щоб модулі не працювали двічі)
 *   3. CROSSLINK — усі хости: стрілки Betking ↔ Altenar, автопошук, GGR, вставка кольору
 *   4. BETKING FRAUD (тільки admin.betking.com.ua): мінхантер, вимкнення бонусів,
 *      калькулятор бонусів, копіювання назви бонусу кліком по рядку
 *   5. ALTENAR FRAUD (тільки Altenar): підсвітка ставок, чорні списки, налаштування
 *   6. Запуск
 *
 * Префікси, щоб частини не накладалися одна на одну:
 *   xlink-*  — Crosslink;   bkf-* — Betking Fraud;   afh-* — Altenar Fraud.
 *   Старі скрипти використовували af-* / fbh-* — їх тут навмисно немає (крім ключів
 *   localStorage Altenar-налаштувань, які збережено, щоб налаштування не злетіли).
 */

(function () {
    'use strict';

    const HOST = window.location.hostname;
    const IS_ALTENAR = HOST.includes('altenar');
    const IS_BETKING_ADMIN = HOST === 'admin.betking.com.ua';
    const PAGE_WIN = (typeof unsafeWindow !== 'undefined') ? unsafeWindow : window;

    // Сторінка входу Altenar (ASP.NET, /Account/Login?ReturnUrl=…).
    function isAltenarLoginPage() {
        return IS_ALTENAR && (
            window.location.pathname.toLowerCase().startsWith('/account/login') ||
            !!document.querySelector('form[action*="/Account/Login" i] #password_input')
        );
    }

    const RAW_SCRIPT_URL = 'https://gist.githubusercontent.com/Defou1t322/114b445e7027eba4a538c18d8889d347/raw/CrosslinkBK.user.js';

    // ═════════════════════════════════════════════════════════════
    // 0. СПІЛЬНІ ХЕЛПЕРИ
    // ═════════════════════════════════════════════════════════════

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function isVisible(el) {
        return !!el && (el.offsetWidth > 0 || el.offsetHeight > 0);
    }

    // innerText у документах, зібраних через DOMParser, не рендериться —
    // тому всюди, де код працює і з живим DOM, і з догруженою сторінкою,
    // читаємо текст через цей хелпер.
    function cellText(el) {
        if (!el) return '';
        return (el.innerText || el.textContent || '').trim();
    }

    function escapeHtml(s) {
        return String(s).replace(/[&<>"']/g, c => (
            { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
        ));
    }

    // Чекаємо, поки fn() поверне щось істинне. Повертає це значення або null після таймауту.
    function waitFor(fn, timeout = 8000, interval = 100) {
        return new Promise(resolve => {
            const started = Date.now();
            (function poll() {
                let result = null;
                try { result = fn(); } catch (e) { result = null; }
                if (result) return resolve(result);
                if (Date.now() - started >= timeout) return resolve(null);
                setTimeout(poll, interval);
            })();
        });
    }

    function debounce(fn, ms) {
        let t = null;
        return function () {
            clearTimeout(t);
            t = setTimeout(fn, ms);
        };
    }

    function lsGet(key, fallback) {
        try {
            const raw = localStorage.getItem(key);
            return raw === null ? fallback : JSON.parse(raw);
        } catch (e) { return fallback; }
    }
    function lsSet(key, value) {
        try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* приватний режим / квота */ }
    }

    // Посегментне порівняння версій (parseFloat тут не можна: "16.10" < "16.6").
    function isNewerVersion(remote, current) {
        const a = String(remote).split('.');
        const b = String(current).split('.');
        const len = Math.max(a.length, b.length);
        for (let i = 0; i < len; i++) {
            const x = parseInt(a[i], 10) || 0;
            const y = parseInt(b[i], 10) || 0;
            if (x > y) return true;
            if (x < y) return false;
        }
        return false;
    }

    // Маленький тост справа знизу — підтвердження копіювання.
    function showCopyToast(msg, durationMs = 2000) {
        const old = document.getElementById('xlink-ggr-toast');
        if (old) old.remove();
        const el = document.createElement('div');
        el.id = 'xlink-ggr-toast';
        el.className = 'xlink-ggr-toast';
        el.textContent = msg;
        document.body.appendChild(el);
        setTimeout(() => { el.style.opacity = '0'; setTimeout(() => el.remove(), 300); }, durationMs);
    }

    // Єдина точка копирования. В буфер ВСЕГДА кладём два формата:
    //   text/html  — с <font color>, его забирает поле коментаря Betking;
    //   text/plain — чистый текст для Telegram, Excel, Блокнота, обычных полей.
    // 1) Синхронный copy-event + execCommand (работает без разрешений clipboard).
    //    Слушатель в capture-фазе + stopImmediatePropagation — чтобы copy-хендлеры
    //    самой страницы (React/MUI) не перезаписали наши данные.
    // 2) Fallback: async Clipboard API с ClipboardItem (тоже оба формата).
    // 3) Последний fallback: writeText (только текст, без цвета).
    function copyRich(html, plain) {
        let written = false;

        const copyHandler = function (e) {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (html) e.clipboardData.setData('text/html', html);
            e.clipboardData.setData('text/plain', plain);
            written = true;
        };

        // Пустое выделение у части браузеров отменяет copy — ставим временное.
        const tempEl = document.createElement('span');
        tempEl.textContent = '​';
        tempEl.style.cssText = 'position:fixed;top:0;left:0;opacity:0;pointer-events:none;';
        document.body.appendChild(tempEl);

        const selection = window.getSelection();
        const savedRanges = [];
        for (let i = 0; i < selection.rangeCount; i++) savedRanges.push(selection.getRangeAt(i));

        const range = document.createRange();
        range.selectNodeContents(tempEl);
        selection.removeAllRanges();
        selection.addRange(range);

        PAGE_WIN.addEventListener('copy', copyHandler, true);
        try {
            document.execCommand('copy');
        } catch (err) {
            console.error('[xlink] execCommand error:', err);
        } finally {
            PAGE_WIN.removeEventListener('copy', copyHandler, true);
            selection.removeAllRanges();
            savedRanges.forEach(r => selection.addRange(r));
            tempEl.remove();
        }

        if (written) {
            showCopyToast('✓ ' + plain);
            return;
        }

        const fail = (err) => {
            console.error('[xlink] clipboard error:', err);
            showCopyToast('Помилка копіювання (див. консоль)');
        };

        if (navigator.clipboard && navigator.clipboard.write && window.ClipboardItem) {
            const data = { 'text/plain': new Blob([plain], { type: 'text/plain' }) };
            if (html) data['text/html'] = new Blob([html], { type: 'text/html' });
            navigator.clipboard.write([new ClipboardItem(data)])
                .then(() => showCopyToast('✓ ' + plain))
                .catch(fail);
        } else if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(plain)
                .then(() => showCopyToast((html ? '✓ (без кольору) ' : '✓ ') + plain))
                .catch(fail);
        } else {
            showCopyToast('Помилка копіювання: буфер недоступний');
        }
    }

    // Верхній банер (оновлення / старі скрипти). Кілька банерів складаються стопкою.
    function showTopBanner(id, html, bg, onCloseKey) {
        if (document.getElementById(id)) return;
        if (onCloseKey) {
            try { if (sessionStorage.getItem(onCloseKey)) return; } catch (e) { /* ignore */ }
        }

        let stack = document.getElementById('xlink-banner-stack');
        if (!stack) {
            stack = document.createElement('div');
            stack.id = 'xlink-banner-stack';
            document.body.prepend(stack);
        }

        const banner = document.createElement('div');
        banner.id = id;
        banner.className = 'xlink-banner';
        banner.style.backgroundColor = bg;
        banner.innerHTML = `<div class="xlink-banner-body">${html}</div><span class="xlink-banner-close" title="Сховати до кінця сесії">✖</span>`;
        stack.appendChild(banner);

        const syncPadding = () => { document.body.style.paddingTop = stack.offsetHeight ? stack.offsetHeight + 'px' : ''; };
        syncPadding();

        banner.querySelector('.xlink-banner-close').onclick = () => {
            banner.remove();
            if (onCloseKey) { try { sessionStorage.setItem(onCloseKey, '1'); } catch (e) { /* ignore */ } }
            syncPadding();
        };
    }

    GM_addStyle(`
        /* ── Crosslink ── */
        .xlink-arrow { display: inline-flex; align-items: center; justify-content: center; margin-left: 4px; cursor: pointer; opacity: 0.55; transition: opacity 0.15s, transform 0.15s; vertical-align: middle; line-height: 1; text-decoration: none; border: none; background: none; padding: 0; color: inherit; font-size: inherit; }
        .xlink-arrow:hover { opacity: 1; transform: translateX(2px); }
        .xlink-arrow svg { width: 1em; height: 1em; fill: currentColor; }
        .xlink-ggr-copy { cursor: pointer; border-bottom: 1px dashed currentColor; transition: opacity 0.15s; }
        .xlink-ggr-copy:hover { opacity: 0.7; }
        .xlink-ggr-toast { position: fixed; bottom: 24px; right: 24px; background: #323232; color: #fff; padding: 8px 16px; border-radius: 4px; font-size: 13px; z-index: 99999999; pointer-events: none; transition: opacity 0.3s; max-width: 520px; }
        #xlink-banner-stack { position: fixed; top: 0; left: 0; width: 100%; z-index: 9999999; font-family: Arial, sans-serif; }
        .xlink-banner { display: flex; justify-content: space-between; align-items: center; gap: 15px; color: #fff; padding: 12px 20px; box-shadow: 0 4px 10px rgba(0,0,0,0.3); box-sizing: border-box; font-size: 14px; line-height: 1.45; }
        .xlink-banner a.xlink-banner-btn { background: #fff; color: #333; padding: 5px 14px; border-radius: 5px; text-decoration: none; font-weight: bold; white-space: nowrap; margin-left: 10px; }
        #login-button.xlink-login-pulse { animation: xlink-pulse 1.1s ease-in-out infinite; }
        @keyframes xlink-pulse { 0%, 100% { box-shadow: 0 0 0 0 rgba(255, 193, 7, 0.9); } 50% { box-shadow: 0 0 0 10px rgba(255, 193, 7, 0); } }
        .xlink-banner-close { cursor: pointer; font-size: 20px; font-weight: bold; line-height: 1; opacity: 0.85; flex-shrink: 0; }
    `);

    // ═════════════════════════════════════════════════════════════
    // 1. АВТООНОВЛЕННЯ
    // ═════════════════════════════════════════════════════════════
    // Tampermonkey і сам оновлює скрипт за @updateURL за своїм розкладом.
    // Банер потрібен, щоб колеги дізнавались про нову версію одразу, а не через добу.
    // Перевірка не частіше разу на годину — спільно для всіх вкладок і обох доменів (GM_*Value).
    const UPDATE_CHECK_KEY = 'xlink_update_checked_at';
    const UPDATE_LATEST_KEY = 'xlink_update_latest_version';
    const UPDATE_COOLDOWN = 60 * 60 * 1000;

    function currentVersion() {
        try { return GM_info.script.version; } catch (e) { return '0'; }
    }

    function showUpdateBanner(newVer) {
        showTopBanner(
            'xlink-update-banner',
            `🚀 <b>Вийшла нова версія скрипта «Betking ↔ Altenar Crosslink»</b> — v${escapeHtml(newVer)} (у вас v${escapeHtml(currentVersion())}).
             <a class="xlink-banner-btn" href="${RAW_SCRIPT_URL}" target="_blank" rel="noopener">Оновити зараз</a>`,
            '#d32f2f',
            'xlink_update_banner_hidden_' + newVer
        );
    }

    function checkForUpdates() {
        const now = Date.now();
        const cur = currentVersion();
        const last = Number(GM_getValue(UPDATE_CHECK_KEY, 0)) || 0;

        if (now - last < UPDATE_COOLDOWN) {
            const known = GM_getValue(UPDATE_LATEST_KEY, '');
            if (known && isNewerVersion(known, cur)) showUpdateBanner(known);
            return;
        }
        GM_setValue(UPDATE_CHECK_KEY, now);

        GM_xmlhttpRequest({
            method: 'GET',
            url: RAW_SCRIPT_URL + '?t=' + now,
            timeout: 15000,
            onload(res) {
                if (res.status !== 200) { console.warn('[xlink] update check: HTTP', res.status); return; }
                const m = String(res.responseText).match(/@version\s+([\d.]+)/);
                if (!m) return;
                GM_setValue(UPDATE_LATEST_KEY, m[1]);
                if (isNewerVersion(m[1], cur)) showUpdateBanner(m[1]);
            },
            onerror(e) { console.warn('[xlink] update check: мережа', e); },
            ontimeout() { console.warn('[xlink] update check: таймаут'); }
        });
    }

    // ═════════════════════════════════════════════════════════════
    // 2. ДЕТЕКТОР СТАРИХ СКРИПТІВ
    // ═════════════════════════════════════════════════════════════
    // Скрипт не може сам видалити інші скрипти з Tampermonkey. Тому, якщо старий
    // скрипт ще стоїть, ми (а) НЕ запускаємо свій дублюючий модуль — щоб кнопки й
    // підсвітка не задвоювались, і (б) показуємо банер, що старий треба видалити.
    // Старі скрипти створюють свої елементи одразу при старті, тож чекаємо трохи.
    const LEGACY_MARKERS = {
        betking: { name: 'Betting Fraud Detector (Betking)', selector: '#af-calc-widget, #af-search-widget, #af-bonus-killer, #af-update-banner' },
        altenar: { name: 'Fraud Betting Helper (Altenar)', selector: '#fbh-settings-btn, #ip-check-popup, #fbh-update-banner' },
    };

    function detectLegacy(kind) {
        return !!document.querySelector(LEGACY_MARKERS[kind].selector);
    }

    function warnLegacy(kind) {
        const name = LEGACY_MARKERS[kind].name;
        showTopBanner(
            'xlink-legacy-banner-' + kind,
            `⚠️ <b>Знайдено старий скрипт «${escapeHtml(name)}».</b> Його функції тепер входять у «Betking ↔ Altenar Crosslink».
             Видаліть старий: Tampermonkey → Панель керування → «${escapeHtml(name)}» → 🗑. Поки він стоїть, нові функції цього розділу вимкнені, щоб не було дублів.`,
            '#e65100',
            'xlink_legacy_hidden_' + kind
        );
    }

    // ═════════════════════════════════════════════════════════════
    // 3. CROSSLINK (усі хости)
    // ═════════════════════════════════════════════════════════════
    const Crosslink = (function () {
        const CONFIG = {
            closeTabAfterProfile: true,
        };
        const BONUS_BOUNDARY_COLOR = '#dc3545';

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

        function installArrowClick() {
            document.addEventListener('click', (e) => {
                const arrow = e.target.closest && e.target.closest('.xlink-arrow');
                if (!arrow || !arrow.dataset.xlinkHref) return;
                e.stopPropagation();
                e.preventDefault();
                window.open(arrow.dataset.xlinkHref, '_blank');
            });
        }

        // ── ALTENAR → BETKING ──
        function attachArrowsAltenar() {
            document.querySelectorAll('p[aria-label*="Int "][aria-label*="| Ext "]').forEach(p => {
                const cell = p.closest('td');
                if (!cell || cell.querySelector('.xlink-arrow')) return;
                const match = p.getAttribute('aria-label').match(/Ext (\d+)/);
                if (match) injectAltenarArrow(cell, match[1]);
            });

            document.querySelectorAll('[data-field="PlayerName"]').forEach(cell => {
                // Перевіряємо наявність самої стрілки, а не прапорець: React може
                // перемалювати вміст комірки, лишивши сам <td>.
                if (cell.querySelector('.xlink-arrow')) return;
                const bold = cell.querySelector('b');
                // Беремо саме число: антифрод-модуль дописує в цю комірку значки (WW, ⚠️, 👁️).
                const m = (bold ? bold.textContent : cell.textContent).match(/\d+/);
                if (m) injectAltenarArrow(cell, m[0]);
            });
        }

        function injectAltenarArrow(cell, id) {
            const targetUrl = `https://admin.betking.com.ua/players/playersItems/search/?number=${id}`;
            const arrow = createArrow(`Открыть ${id} в Betking`, targetUrl);
            const link = cell.querySelector('a');
            if (link) link.insertAdjacentElement('afterend', arrow);
            else cell.appendChild(arrow);
        }

        function attachArrowAltenarProfile() {
            if (!window.location.pathname.includes('/ManagePlayersProfile')) return;
            if (document.getElementById('xlink-altenar-profile-arrow')) return;

            const playerIdsEl = document.querySelector('[class*="PlayerIds"]');
            if (!playerIdsEl) return;

            const match = playerIdsEl.textContent.match(/Ext\s*ID\s*(\d+)/i);
            if (!match) return;
            const extId = match[1];

            const nameContainer = document.querySelector('[class*="PlayerNameContainer"]');
            if (!nameContainer) return;

            const betkingUrl = `https://admin.betking.com.ua/players/playersItems/search/?number=${extId}`;
            const arrow = createArrow(`Открыть ${extId} в Betking`, betkingUrl);
            arrow.id = 'xlink-altenar-profile-arrow';
            nameContainer.appendChild(arrow);
        }

        // ── BETKING → ALTENAR ──
        function attachArrowBetking() {
            const currentUrl = window.location.href;
            if (!currentUrl.includes('playersItems/update') && !currentUrl.includes('playersItems/view')) return;

            const headers = document.querySelectorAll('th');
            for (const th of headers) {
                const text = th.textContent.toLowerCase().trim();
                if (text !== 'номер игрока' && text !== 'player number' && text !== 'номер гравця' && text !== 'player id') continue;

                const td = th.nextElementSibling;
                if (!td || td.querySelector('.xlink-arrow')) continue;

                const match = td.textContent.match(/\d+/);
                if (!match) continue;
                const playerNumber = match[0];

                const altenarUrl = `https://sb2admin-altenar2.biahosted.com/v2/players?site=1#extId=${playerNumber}`;
                const arrow = createArrow(`Открыть ${playerNumber} в Altenar`, altenarUrl);
                arrow.id = 'xlink-betking-arrow';

                const span = td.querySelector('span');
                if (span) span.insertAdjacentElement('afterend', arrow);
                else td.appendChild(arrow);
            }
        }

        // ── AUTOFILL ──
        function autoFillBetkingSearch() {
            if (!window.location.href.includes('playersItems/search')) return;
            const number = new URLSearchParams(window.location.search).get('number');
            if (!number) return;

            const trySubmit = (attempts = 0) => {
                const input = document.getElementById('PlayersSearchForm_number');
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
            return [...document.querySelectorAll('a[href*="ManagePlayersProfile"]')].filter(a => a.closest('td'));
        }

        function getFindBtn() {
            const svg = document.querySelector('button svg[data-testid="SearchIcon"]');
            return document.querySelector('[class*="FindButton"]') || (svg ? svg.closest('button') : null);
        }

        // ── ID, що чекає на пошук (переживає викидання на логін) ──
        // Altenar іноді розлогінює саме під час переходу: сервер робить 302 на
        // /Account/Login, а після POST форми входу хеш #extId=… губиться — і пошук
        // відкривається порожнім. Тому ID кладемо в sessionStorage ЦІЄЇ вкладки і
        // прибираємо лише після кліку по профілю.
        const PENDING_KEY = 'xlink_pending_extid';
        const PENDING_TTL = 5 * 60 * 1000;
        const LOGIN_TRIES_KEY = 'xlink_autologin_tries';
        const LOGIN_MAX_TRIES = 2;            // запобіжник від циклу «вхід → вилетів → вхід»
        const LOGIN_TRIES_WINDOW = 3 * 60 * 1000;
        const AUTOFILL_WAIT = 6000;           // скільки чекаємо, поки браузер підставить логін/пароль
        const LOGIN_SEEN_KEY = 'xlink_login_seen';

        function ssGet(key) {
            try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch (e) { return null; }
        }
        function ssSet(key, value) {
            try { sessionStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* ignore */ }
        }
        function ssDel(key) {
            try { sessionStorage.removeItem(key); } catch (e) { /* ignore */ }
        }

        function savePendingId(id) { ssSet(PENDING_KEY, { id: String(id), ts: Date.now() }); }
        function clearPendingId() { ssDel(PENDING_KEY); }
        function readPendingId() {
            const p = ssGet(PENDING_KEY);
            if (!p || !p.id || Date.now() - p.ts > PENDING_TTL) { clearPendingId(); return null; }
            return p.id;
        }

        function hashExtId() {
            const m = window.location.hash.match(/#extId=(\d+)/);
            return m ? m[1] : null;
        }

        // ── АВТОВХІД ──
        // Пароль скрипт не зберігає і не читає: кнопку «Log in» він натискає лише тоді,
        // коли поля вже заповнив менеджер паролів браузера.
        //
        // Chrome показує збережений пароль у полях одразу, але віддає його сторінці
        // лише після першого кліку/клавіші користувача. До того поля для форми порожні,
        // і клік скрипта по «Log in» дає «Заполните это поле». Тому:
        //   — якщо значення справді доступні (форма валідна) — входимо самі;
        //   — якщо Chrome їх тримає — підсвічуємо «Log in» і просимо один клік.
        // ID після входу підставиться в будь-якому разі.
        function isAutofilled(el) {
            for (const sel of [':-webkit-autofill', ':autofill']) {
                try { if (el.matches(sel)) return true; } catch (e) { /* селектор не підтримується */ }
            }
            return false;
        }

        function loginFormReady() {
            const user = document.getElementById('username_input');
            const pass = document.getElementById('password_input');
            const btn = document.getElementById('login-button');
            if (!user || !pass || !btn || !user.value || !pass.value) return null;
            const form = btn.closest('form');
            return (!form || form.checkValidity()) ? btn : null;
        }

        function askOneClickLogin(pendingId, autofilled) {
            const btn = document.getElementById('login-button');
            if (btn) btn.classList.add('xlink-login-pulse');
            showCopyToast(autofilled
                ? `Altenar розлогінив. Натисніть «Log in» — ID ${pendingId} підставлю в пошук автоматично.`
                : `Altenar розлогінив. Увійдіть — ID ${pendingId} підставлю в пошук автоматично.`, 15000);
        }

        async function handleAltenarLogin() {
            const pendingId = readPendingId();
            // Автовхід — тільки як проміжний крок переходу з Betking. Якщо менеджер
            // вийшов сам, не заходимо за нього назад.
            if (!pendingId) return;

            const tries = ssGet(LOGIN_TRIES_KEY);
            const recent = tries && Date.now() - tries.ts < LOGIN_TRIES_WINDOW ? tries.n : 0;
            if (recent >= LOGIN_MAX_TRIES) {
                showCopyToast(`Автовхід не вдався — увійдіть вручну. ID ${pendingId} підставлю в пошук після входу.`, 8000);
                return;
            }

            // Пароль видно в полі, але сторінці він ще не відданий — чекати далі марно.
            const passLocked = () => {
                const pass = document.getElementById('password_input');
                return !!pass && !pass.value && isAutofilled(pass);
            };
            const started = Date.now();
            const ready = await waitFor(
                () => loginFormReady() || (Date.now() - started > 1000 && passLocked() ? 'locked' : null),
                AUTOFILL_WAIT, 200
            );

            if (!ready || ready === 'locked') {
                askOneClickLogin(pendingId, ready === 'locked');
                return;
            }

            ssSet(LOGIN_TRIES_KEY, { n: recent + 1, ts: Date.now() });
            showCopyToast(`Altenar розлогінив — входжу знову, далі пошук ID ${pendingId}…`, 4000);
            // Саме click(), а не form.submit(): так спрацює onsubmit сторінки (fillDeviceSecret).
            setTimeout(() => ready.click(), 400);
        }

        function clickProfileAndClose(link) {
            clearPendingId();
            ssDel(LOGIN_TRIES_KEY);
            link.click();
            if (CONFIG.closeTabAfterProfile) setTimeout(() => window.close(), 300);
        }

        function autoClickProfile() {
            const check = (attempts = 0) => {
                const links = getProfileLinks();

                if (links.length === 1) { clickProfileAndClose(links[0]); return; }

                if (links.length > 1) {
                    const findBtn = getFindBtn();
                    if (!findBtn) { setTimeout(() => check(attempts + 1), 300); return; }
                    findBtn.click();

                    const clickAfterFind = (waited = 0) => {
                        const afterLinks = getProfileLinks();
                        if (afterLinks.length >= 1) clickProfileAndClose(afterLinks[0]);
                        else if (waited < 5000) setTimeout(() => clickAfterFind(waited + 200), 200);
                        else clearPendingId();
                    };
                    setTimeout(() => clickAfterFind(), 150);
                    return;
                }

                // Гравця не знайдено — більше не тягнемо цей ID за вкладкою.
                if (attempts < 25) setTimeout(() => check(attempts + 1), 300);
                else clearPendingId();
            };
            check();
        }

        function autoFillAltenarSearch() {
            const fromHash = hashExtId();
            if (fromHash) savePendingId(fromHash);
            const targetId = fromHash || readPendingId();
            if (!targetId) return;

            if (isAltenarLoginPage()) {
                ssSet(LOGIN_SEEN_KEY, Date.now());
                handleAltenarLogin();
                return;
            }

            if (!window.location.pathname.includes('/v2/players')) {
                // Після входу Altenar може повернути не на пошук гравців (ReturnUrl=/ тощо).
                // Перекидаємо лише одразу після сторінки входу — щоб вкладка не «тягнула»
                // менеджера на пошук, коли він сам пішов деінде.
                const seen = ssGet(LOGIN_SEEN_KEY);
                ssDel(LOGIN_SEEN_KEY);
                if (seen && Date.now() - seen < LOGIN_TRIES_WINDOW) {
                    window.location.assign(`/v2/players?site=1#extId=${targetId}`);
                }
                return;
            }
            ssDel(LOGIN_SEEN_KEY);

            if (fromHash) history.replaceState(null, '', window.location.pathname + window.location.search);

            const tryFill = (attempts = 0) => {
                let extIdInput = null;
                document.querySelectorAll('label').forEach(label => {
                    if (label.textContent.trim() === 'Ext ID') {
                        const forAttr = label.getAttribute('for');
                        const box = label.closest('div');
                        extIdInput = forAttr
                            ? document.getElementById(forAttr)
                            : (box ? box.querySelector('input[type="text"]') : null);
                    }
                });

                const findBtn = getFindBtn();

                if (extIdInput && findBtn) {
                    // Нативний сеттер — інакше React не побачить зміну значення.
                    const nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
                    nativeSetter.call(extIdInput, targetId);
                    extIdInput.dispatchEvent(new Event('input', { bubbles: true }));
                    extIdInput.dispatchEvent(new Event('change', { bubbles: true }));
                    extIdInput.focus();
                    setTimeout(() => {
                        findBtn.click();
                        setTimeout(() => autoClickProfile(), 200);
                    }, 100);
                } else if (attempts < 40) {
                    // Після свіжого входу Altenar вантажиться довше — чекаємо до ~20 с.
                    setTimeout(() => tryFill(attempts + 1), 500);
                } else {
                    clearPendingId();
                }
            };
            tryFill();
        }

        // ── GGR COPY ──
        const PERIOD_MAP = {
            'All-Time': 'весь час',
            '1yr': '1 рік',
            '6mo': '6 місяців',
            '3mo': '3 місяці',
            '1mo': '1 місяць',
            '1w': '1 тиждень',
        };

        const AGGREGATE_TITLES = ['GGR', 'Margin', 'Turnover', 'Bets', 'Bets count'];

        // styled-components v6: було AggregatedDatastyles__WrapperAggregate,
        // стало WrapperAggregate-sc-<hash>. Збіг по спільній частині покриває обидва.
        function findAggregateBlocks() {
            const byClass = [...document.querySelectorAll('[class*="WrapperAggregate"]')]
                .map(w => ({ title: w.querySelector('[class*="Title"]'), value: w.querySelector('[class*="Value"]') }))
                .filter(b => b.title && b.value);
            if (byClass.length) return byClass;

            const out = [];
            document.querySelectorAll('div, span, p, h1, h2, h3, h4, h5, h6').forEach(el => {
                if (el.children.length) return;
                if (!AGGREGATE_TITLES.includes(el.textContent.trim())) return;
                const parent = el.parentElement;
                if (!parent) return;
                const value = [...parent.children].find(c => c !== el && c.textContent.trim());
                if (value) out.push({ title: el, value });
            });
            return out;
        }

        // Дві незалежні групи періодів (Player Overview і Player Statistics) —
        // шукаємо найближчу до потрібного блоку.
        function findPeriodButtonsNear(el) {
            for (let node = el; node && node !== document.documentElement; node = node.parentElement) {
                const btns = [...node.querySelectorAll('[class*="PeriodsButton"]')];
                if (btns.length) return btns;
            }
            return [...document.querySelectorAll('[class*="PeriodsButton"]')];
        }

        // Активна кнопка має свій унікальний styled-components клас. Mui* відкидаємо.
        function findByUniqueClass(btns) {
            if (btns.length < 3) return null;
            const counts = new Map();
            btns.forEach(b => {
                new Set([...b.classList].filter(c => !c.startsWith('Mui')))
                    .forEach(c => counts.set(c, (counts.get(c) || 0) + 1));
            });
            const unique = btns.filter(b => [...b.classList].some(c => !c.startsWith('Mui') && counts.get(c) === 1));
            return unique.length === 1 ? unique[0] : null;
        }

        function getActivePeriodFor(el) {
            const btns = findPeriodButtonsNear(el);
            if (!btns.length) return 'весь час';

            const active =
                btns.find(b => b.getAttribute('aria-pressed') === 'true' || b.getAttribute('aria-selected') === 'true') ||
                findByUniqueClass(btns) ||
                btns.find(b => {
                    const bg = window.getComputedStyle(b).backgroundColor;
                    return bg && bg !== 'rgba(0, 0, 0, 0)' && bg !== 'transparent';
                }) ||
                btns[0];

            const label = active.textContent.trim();
            return PERIOD_MAP[label] || label;
        }

        function formatGGR(rawText) {
            const match = rawText.trim().match(/([+-]?\d[\d.,]*)/);
            if (!match) return null;
            const rounded = Math.round(parseFloat(match[1].replace(',', '.')));
            if (isNaN(rounded)) return null;
            const verb = rounded >= 0 ? 'програє' : 'виграє';
            const absFormatted = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
            return `${verb} ${(rounded >= 0 ? '+' : '-') + absFormatted} грн`;
        }

        function attachGgrCopy() {
            if (!window.location.pathname.includes('/ManagePlayersProfile')) return;

            findAggregateBlocks().forEach(({ title: titleEl, value: valueEl }) => {
                if (titleEl.textContent.trim() !== 'GGR') return;
                // Мітку ставимо на valueEl: React перестворює вузол при зміні періоду.
                if (valueEl.dataset.ggrDone) return;

                valueEl.dataset.ggrDone = '1';
                valueEl.classList.add('xlink-ggr-copy');
                valueEl.title = 'Копіювати GGR';

                valueEl.addEventListener('click', () => {
                    const activePeriod = getActivePeriodFor(valueEl);

                    const ggrRaw = valueEl.textContent.trim();
                    const ggrMatch = ggrRaw.match(/([+-]?\d[\d.,]*)\s*UAH/) || ggrRaw.match(/([+-]?\d[\d.,]*)/);
                    if (!ggrMatch) { showCopyToast('Не вдалося прочитати GGR: ' + ggrRaw); return; }
                    const ggrNum = ggrMatch[1].trim();
                    const verb = !ggrNum.startsWith('-') ? 'програє' : 'виграє';
                    const rounded = Math.round(parseFloat(ggrNum));
                    const absFormatted = Math.abs(rounded).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
                    const ggrFormatted = (rounded >= 0 ? '+' : '-') + absFormatted;

                    let marginText = '';
                    findAggregateBlocks().forEach(b => {
                        if (b.title.textContent.trim() !== 'Margin') return;
                        let m = b.value.textContent.trim().replace('%', '').replace('.', ',');
                        if (!m.startsWith('-') && !m.startsWith('+')) m = '+' + m;
                        marginText = m;
                    });

                    const ggrColor = rounded >= 0 ? '#008000' : '#ff0000';
                    const ggrColored = `<font color="${ggrColor}">${ggrFormatted}</font> грн`;
                    const marginColored = marginText
                        ? `<font color="${marginText.startsWith('-') ? '#ff0000' : '#008000'}">${marginText}%</font>`
                        : '';

                    copyRich(
                        `За ${activePeriod} ${verb} ${ggrColored} (${marginColored})`,
                        `За ${activePeriod} ${verb} ${ggrFormatted} грн (${marginText}%)`
                    );
                });
            });
        }

        // Індекс колонки GGR у таблиці видів спорту профілю.
        // -1 — це НЕ таблиця спорту (наприклад, список ставок PlayerBetList):
        // раніше клік по будь-якому рядку такої таблиці мовчки затирав буфер.
        function sportTableGgrIndex(row) {
            const table = row.closest('table');
            const ths = table ? [...table.querySelectorAll('thead th')] : [];
            if (ths.length) return ths.findIndex(th => th.textContent.trim().toUpperCase().includes('GGR'));
            return window.location.pathname.includes('/PlayerBetList') ? -1 : 6;
        }

        function attachSportTableCopy() {
            if (!window.location.pathname.includes('/ManagePlayersProfile')) return;

            document.querySelectorAll('tr[data-testid="mtablebodyrow"]').forEach(row => {
                if (row.dataset.sportCopyDone) return;
                const cells = row.querySelectorAll('td');
                if (cells.length < 2) return;

                const ggrIdx = sportTableGgrIndex(row);
                if (ggrIdx < 1 || ggrIdx >= cells.length) { row.dataset.sportCopyDone = 'skip'; return; }

                const sportCell = cells[0];
                const ggrCell = cells[ggrIdx];
                if (!formatGGR(ggrCell.textContent)) return;
                row.dataset.sportCopyDone = '1';

                sportCell.classList.add('xlink-ggr-copy');
                ggrCell.classList.add('xlink-ggr-copy');

                row.addEventListener('click', () => {
                    const ggrFormatted = formatGGR(ggrCell.textContent);
                    if (!ggrFormatted) return;
                    const sport = sportCell.textContent.trim();
                    copyRich(null, ggrFormatted.replace(
                        /^(виграє|програє)/,
                        (m) => m.charAt(0).toUpperCase() + m.slice(1) + ` на ${sport}`
                    ));
                });

                sportCell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    copyRich(null, sportCell.textContent.trim());
                });

                ggrCell.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const result = formatGGR(ggrCell.textContent);
                    if (result) copyRich(null, result);
                });
            });
        }

        // ── ВСТАВКА ЗІ ЗБЕРЕЖЕННЯМ КОЛЬОРУ В ПОЛЕ КОМЕНТАРЯ (Betking) ──
        function sanitizeCommentHtml(html) {
            const ALLOWED = { FONT: true, SPAN: true, B: true, STRONG: true, I: true, EM: true, U: true, BR: true };
            const tpl = document.createElement('template');
            tpl.innerHTML = html;
            (function walk(node) {
                [...node.childNodes].forEach(child => {
                    if (child.nodeType === 8) { child.remove(); return; }
                    if (child.nodeType !== 1) return;
                    walk(child);
                    const tag = child.tagName;
                    if (!ALLOWED[tag]) { child.replaceWith(...child.childNodes); return; }
                    const fontColor = (tag === 'FONT') ? child.getAttribute('color') : null;
                    const styleColor = child.style ? child.style.color : '';
                    [...child.attributes].forEach(a => child.removeAttribute(a.name));
                    if (fontColor) child.setAttribute('color', fontColor);
                    if (styleColor) child.style.color = styleColor;
                });
            })(tpl.content);

            let out = tpl.innerHTML;
            out = out.replace(/<!--[\s\S]*?-->/g, '');
            out = out.replace(/[\t\r\n]+/g, ' ');
            out = out.replace(/^[ \t\r\n]+|[ \t\r\n]+$/g, '');
            return out;
        }

        function installCommentColorPaste() {
            // Прапорець на сторінковому window — його бачить і стара версія Crosslink (@grant none).
            if (PAGE_WIN.__xlinkColorPasteInstalled) return;
            PAGE_WIN.__xlinkColorPasteInstalled = true;

            document.addEventListener('paste', function (e) {
                const t = e.target;
                const field = t && t.closest && t.closest(
                    '.antifraud-comment-editor, div[contenteditable="true"][id^="antifraud-input-"], [data-comment-edit]'
                );
                if (!field) return;

                const cd = e.clipboardData || window.clipboardData;
                if (!cd) return;

                const html = cd.getData('text/html');
                const plain = cd.getData('text/plain') || cd.getData('text');

                e.preventDefault();
                e.stopImmediatePropagation();

                field.focus();
                if (html) document.execCommand('insertHTML', false, sanitizeCommentHtml(html));
                else document.execCommand('insertText', false, plain);
            }, true); // capture — раніше нативного $(document).on('paste', ...)
        }

        // ── МЕЖІ БОНУСІВ У ЖУРНАЛІ ТРАНЗАКЦІЙ (Betking, sportBetting/report) ──
        // Колонки шукаємо за заголовками: після оновлення адмінки жорсткі індекси
        // (2 і 7) почали вказувати на «Тип» і «Bonus Balance».
        function highlightBonusBoundaries() {
            const table = BetkingGrid.findGridTable();
            if (!table) return;
            const cols = BetkingGrid.resolveColumns(table);
            if (!cols || cols.bonusColIdx === -1) return;

            const rows = BetkingGrid.dataRows(table);
            if (rows.length < 2) return;

            const bonusByRef = BetkingGrid.bonusByReference(rows, cols);
            let prevBonus = null;

            rows.forEach(row => {
                row.style.borderTop = '';
                const bonus = BetkingGrid.rowBonusName(row, cols, bonusByRef);
                if (!bonus) return; // рядок без бонусу не розриває блок
                if (prevBonus !== null && bonus !== prevBonus) {
                    row.style.borderTop = `3px solid ${BONUS_BOUNDARY_COLOR}`;
                }
                prevBonus = bonus;
            });
        }

        // Діагностика: у консолі сторінки → __xlinkDebug()
        function exposeDebug() {
            PAGE_WIN.__xlinkDebug = function () {
                const blocks = findAggregateBlocks();
                const info = {
                    version: currentVersion(),
                    url: window.location.href,
                    pathnameOk: window.location.pathname.includes('/ManagePlayersProfile'),
                    wrappersByClass: document.querySelectorAll('[class*="WrapperAggregate"]').length,
                    aggregateBlocksFound: blocks.length,
                    blocks: blocks.map(b => ({
                        title: b.title.textContent.trim(),
                        value: b.value.textContent.trim(),
                        armed: !!b.value.dataset.ggrDone,
                        period: getActivePeriodFor(b.value),
                    })),
                    periodButtons: document.querySelectorAll('[class*="PeriodsButton"]').length,
                    sportRows: document.querySelectorAll('tr[data-testid="mtablebodyrow"]').length,
                    playerIdsEl: !!document.querySelector('[class*="PlayerIds"]'),
                    betkingGridColumns: BetkingGrid.findGridTable() ? BetkingGrid.resolveColumns(BetkingGrid.findGridTable()) : null,
                    legacyBetking: detectLegacy('betking'),
                    legacyAltenar: detectLegacy('altenar'),
                };
                console.table(info.blocks);
                console.log(info);
                return info;
            };
        }

        function init() {
            installArrowClick();
            exposeDebug();

            if (IS_ALTENAR) {
                autoFillAltenarSearch();
                if (isAltenarLoginPage()) return; // на сторінці входу більше нічого не робимо
                const run = () => {
                    attachArrowsAltenar();
                    attachArrowAltenarProfile();
                    attachGgrCopy();
                    attachSportTableCopy();
                };
                run();
                // Один спостерігач замість двох, з тротлінгом через rAF:
                // React на Altenar генерує сотні мутацій за секунду.
                let scheduled = false;
                new MutationObserver(() => {
                    if (scheduled) return;
                    scheduled = true;
                    requestAnimationFrame(() => { scheduled = false; run(); });
                }).observe(document.body, { childList: true, subtree: true });
                return;
            }

            installCommentColorPaste();
            autoFillBetkingSearch();
            attachArrowBetking();

            const isReport = () => window.location.href.includes('sportBetting/report');
            if (isReport()) highlightBonusBoundaries();

            const onMutate = debounce(() => {
                attachArrowBetking();
                if (isReport()) highlightBonusBoundaries();
            }, 150);
            // Слухаємо лише childList: власні зміни стилів рядків не зациклюють спостерігач.
            new MutationObserver(onMutate).observe(document.body, { childList: true, subtree: true });
        }

        return { init };
    })();

    // ═════════════════════════════════════════════════════════════
    // 4. BETKING FRAUD (тільки admin.betking.com.ua)
    // ═════════════════════════════════════════════════════════════

    // Робота з Yii-грідом адмінки Betking: спільна для калькулятора, меж бонусів
    // (Crosslink) і копіювання назви бонусу — щоб усі три читали колонки однаково.
    const BetkingGrid = (function () {
        // Єдиний грід сторінки. root параметризований, щоб та сама логіка працювала
        // і на сторінках, догружених через fetch + DOMParser.
        function findGridTable(root = document) {
            const wrapper = root.querySelector('.grid-view, .list-view');
            if (wrapper) {
                const t = wrapper.querySelector('table');
                if (t) return t;
            }
            let best = null, bestRows = 0;
            root.querySelectorAll('table').forEach(t => {
                const n = t.querySelectorAll('tbody > tr').length;
                if (n > bestRows) { bestRows = n; best = t; }
            });
            return best;
        }

        function norm(el) {
            return cellText(el).replace(/\s+/g, ' ').trim().toLowerCase();
        }

        // Колонки за заголовками першого рядка thead (другий рядок — фільтри, там td).
        // У новій адмінці дві колонки «Тип»: перша — тип транзакції (bet/win/bonus),
        // друга — тип ставки. Беремо першу.
        function resolveColumns(table) {
            const thead = table && table.querySelector('thead');
            const headRow = thead && thead.querySelector('tr');
            if (!headRow) return null;

            const hs = Array.from(headRow.children).map(norm);
            const find = pred => hs.findIndex(pred);

            let dateColIdx = find(t => t.includes('created at'));
            if (dateColIdx === -1) dateColIdx = find(t => t.includes('date') || t.includes('дата'));

            return {
                typeColIdx: find(t => t === 'тип' || t === 'type'),
                amountColIdx: find(t => t.includes('real amount')),
                bonusColIdx: find(t => t === 'bonus' || t === 'бонус'),
                refColIdx: find(t => t === 'референс' || t === 'reference'),
                dateColIdx,
            };
        }

        function dataRows(table) {
            return Array.from(table.querySelectorAll('tbody > tr'))
                .filter(r => !r.classList.contains('filters') && !r.classList.contains('empty'));
        }

        function cellAt(row, idx) {
            if (idx < 0) return null;
            return row.querySelectorAll('td')[idx] || null;
        }

        // Назва бонусу є в рядку bet (і зазвичай win), а в lose колонка порожня,
        // хоча рядок належить тому ж бонусу — успадковуємо по референсу купона.
        function bonusByReference(rows, cols) {
            const map = new Map();
            if (cols.refColIdx === -1) return map;
            rows.forEach(row => {
                const ref = cellText(cellAt(row, cols.refColIdx));
                const bonus = cellText(cellAt(row, cols.bonusColIdx));
                if (ref && bonus) map.set(ref, bonus);
            });
            return map;
        }

        function rowBonusName(row, cols, byRef) {
            const own = cellText(cellAt(row, cols.bonusColIdx));
            if (own) return own;
            if (cols.refColIdx === -1 || !byRef) return '';
            const ref = cellText(cellAt(row, cols.refColIdx));
            return (ref && byRef.get(ref)) || '';
        }

        // Підпис стану гріда: змінюється після кожного AJAX-оновлення Yii
        // (у .keys лежать id рядків і URL запиту разом із фільтрами).
        function gridSignature() {
            const table = findGridTable();
            const grid = table && table.closest('.grid-view, .list-view');
            if (!grid) return '';
            const keys = grid.querySelector('.keys');
            if (keys) return (keys.getAttribute('title') || '') + '|' + keys.textContent;
            return dataRows(table).map(r => cellText(r.querySelector('td'))).join(',');
        }

        return { findGridTable, resolveColumns, dataRows, cellAt, bonusByReference, rowBonusName, gridSignature };
    })();

    const BetkingFraud = (function () {
        const SUSPICIOUS_REGEX = /\bmine/i;
        const BATCH_SIZE = 300;
        const CURRENCY = 'UAH';
        const MAX_PAGES = 150;          // запобіжник від нескінченного циклу
        const PAGE_FETCH_DELAY = 120;   // пауза між запитами, щоб не довбати адмінку
        const GRID_DEBOUNCE = 450;
        const FILTER_TIMEOUT = 20000;   // скільки чекаємо перемальовки гріда після фільтра

        const { findGridTable, resolveColumns, dataRows, cellAt, bonusByReference, rowBonusName, gridSignature } = BetkingGrid;

        GM_addStyle(`
            .bkf-suspicious-row { background-color: #fff59d !important; transition: background 0.2s; }
            .bkf-suspicious-cell { color: red !important; font-weight: bold; border: 2px solid red !important; }
            .bkf-widget { position: fixed; bottom: 20px; left: 20px; height: 50px; min-width: 50px; border-radius: 25px; background-color: #2196F3; color: white; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 999999; user-select: none; transition: all 0.3s ease; padding: 0 5px; font-family: sans-serif; }
            .bkf-widget.active { background-color: #d32f2f; padding: 0 15px; }
            .bkf-widget.found { background-color: #FF9800; padding: 0 15px; }
            .bkf-widget.processing { opacity: 0.8; cursor: wait; }
            .bkf-btn-main { cursor: pointer; font-size: 20px; display: flex; align-items: center; }
            .bkf-btn-nav { cursor: pointer; font-size: 18px; font-weight: bold; padding: 0 5px; display: none; }
            .bkf-btn-nav:hover { color: #FFD54F; transform: scale(1.2); }
            .bkf-counter { font-size: 16px; font-weight: bold; margin-left: 5px; cursor: default; }
            .bkf-highlight-profile { background-color: #ffcccc !important; border: 2px solid red !important; }
            .bkf-highlight-btn { background-color: #b71c1c !important; color: white !important; }
            .bkf-highlight-link { background-color: red !important; color: white !important; }
            .bkf-calc-widget { position: fixed; bottom: 20px; left: 20px; height: 50px; min-width: 50px; border-radius: 25px; background-color: #4CAF50; color: white; display: flex; align-items: center; justify-content: center; gap: 10px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 999999; user-select: none; transition: all 0.3s ease; padding: 0 15px; font-family: sans-serif; cursor: pointer; }
            .bkf-calc-widget:hover { transform: scale(1.05); }
            .bkf-calc-widget.bkf-busy { background-color: #FF9800; }
            tr.bkf-bonus-row > td { background-color: #c8e6c9 !important; color: #000 !important; }
            tr.bkf-bonus-copyable { cursor: copy; }
            .bkf-calc-panel { position: fixed; bottom: 80px; left: 20px; background: #ffffff; border: 2px solid #4CAF50; border-radius: 12px; padding: 15px 20px; box-shadow: 0 8px 24px rgba(0,0,0,0.2); z-index: 999999; font-family: Arial, sans-serif; color: #333; min-width: 300px; display: none; animation: bkf-fade-in 0.3s ease; }
            .bkf-calc-panel h3 { margin: 0 0 12px 0; font-size: 16px; border-bottom: 2px solid #eee; padding-bottom: 8px; color: #2e7d32; }
            .bkf-calc-row { display: flex; justify-content: space-between; gap: 20px; margin-bottom: 8px; font-size: 14px; }
            .bkf-calc-total { font-weight: bold; font-size: 16px; border-top: 2px solid #eee; padding-top: 10px; margin-top: 5px; color: #d32f2f; cursor: copy; }
            .bkf-calc-note { font-size: 12px; color: #777; margin: -6px 0 10px 0; line-height: 1.4; }
            .bkf-calc-warn { font-size: 12px; color: #e65100; background: #fff3e0; border-radius: 6px; padding: 6px 8px; margin: 8px 0 0 0; line-height: 1.4; }
            .bkf-calc-close { position: absolute; top: 10px; right: 15px; cursor: pointer; color: #999; font-size: 18px; font-weight: bold; }
            .bkf-calc-close:hover { color: #d32f2f; }
            @keyframes bkf-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes bkf-slide-up { from { transform: translateY(100%); } to { transform: translateY(0); } }
            .bkf-toast { position: fixed; bottom: 80px; left: 20px; color: white; padding: 10px 15px; border-radius: 10px; z-index: 999998; cursor: pointer; animation: bkf-slide-up 0.4s ease-out forwards; font-family: sans-serif; max-width: 420px; box-shadow: 0 4px 12px rgba(0,0,0,0.3); }
            #bkf-bonus-killer { position: fixed; bottom: 20px; left: 20px; background: #d32f2f; color: white; padding: 10px 20px; border-radius: 8px; font-family: Arial, sans-serif; font-size: 14px; font-weight: bold; cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.3); z-index: 999999; transition: 0.2s; display: flex; align-items: center; gap: 8px; border: 2px solid #b71c1c; }
            #bkf-bonus-killer:hover { transform: scale(1.05); background: #b71c1c; }
            #bkf-bonus-killer.bkf-running { background: #FF9800 !important; border-color: #F57C00 !important; cursor: wait; pointer-events: none; }
            #bkf-bonus-killer.bkf-disabled { background: #607d8b !important; border-color: #455a64 !important; opacity: 0.9; }
            #bkf-bonus-killer.bkf-disabled:hover { transform: scale(1.03); background: #546e7a !important; opacity: 1; }
        `);

        const state = {
            searchActive: false, foundRows: [], currentNavIndex: -1, widget: null,
            isProcessing: false, scanId: 0,
            calcRunning: false, calcAbort: false, panelSignature: null
        };

        // id/bottom параметризовані, щоб повідомлення макросу не витісняли тост «FOUND MINES».
        function showToast(html, bgColor = '#d32f2f', opts = {}) {
            const id = opts.id || 'bkf-toast';
            const old = document.getElementById(id);
            if (old) old.remove();

            const toast = document.createElement('div');
            toast.id = id;
            toast.className = 'bkf-toast';
            if (opts.bottom) toast.style.bottom = opts.bottom;
            toast.style.backgroundColor = bgColor;
            toast.title = 'Натисніть, щоб закрити';
            toast.innerHTML = html;
            document.body.appendChild(toast);
            toast.onclick = () => toast.remove();
        }

        // Yii1 CGridView при оновленні ЗАМІНЮЄ весь div гріда (replaceWith), тож
        // спостерігач, прив'язаний до самого гріда, сліпне. Слухаємо стабільний
        // контейнер сторінки. Лише childList — власна підсвітка (класи/стилі) не зациклює.
        function observeGrid(onChange) {
            const target = document.getElementById('main-content') || document.body;
            new MutationObserver(debounce(onChange, GRID_DEBOUNCE)).observe(target, { childList: true, subtree: true });
        }

        // ─────────────────────────────────────────
        // 4.1 АВТО-ВИМКНЕННЯ БОНУСІВ (МАКРОС)
        // ─────────────────────────────────────────
        const BONUS_CHECKBOX = 'input#Players_no_bonus';

        // Блок «Блокировки». Спершу нові класи (адмінка оновлена 2026-11), далі старі id — про запас.
        const RF = {
            show: 'input.js-restricted-features-show, .js-restricted-features-show, input.show-player-restricted-features-button',
            block: '.js-restricted-features',
            checkbox: 'input.js-restricted-features-checkbox:not(:disabled)',
            selectAll: '.js-restricted-features-toggle-all, button#select-all-restricted-features-button',
            save: '.js-restricted-features-save, button#change-restricted-features-button',
        };

        function rfCheckboxes() {
            return Array.from(document.querySelectorAll(RF.checkbox));
        }

        function rfAllChecked() {
            const list = rfCheckboxes();
            return list.length > 0 && list.every(cb => cb.checked);
        }
        const CHECKBOX_ATTEMPTS = 3;
        const MACRO_WARN_KEY = 'bkf_macro_warnings';
        const MACRO_TOAST = { id: 'bkf-toast-macro', bottom: '140px' };

        function getSwalPopup() {
            for (const p of document.querySelectorAll('.swal2-popup')) {
                if (isVisible(p)) return p;
            }
            return null;
        }

        function swalText(popup) {
            return popup ? popup.textContent.trim().replace(/\s+/g, ' ') : '';
        }

        // Після «Да» SweetAlert2 не закриває вікно, а ПЕРЕМАЛЬОВУЄ той самий контейнер
        // під «Успешно». Ознака зміни вікна — зміна його вмісту.
        async function waitForSwalChange(prevText, timeout = 6000) {
            const res = await waitFor(() => {
                const p = getSwalPopup();
                if (!p) return 'gone';
                if (swalText(p) === prevText) return null;
                return isVisible(p.querySelector('.swal2-confirm')) ? p : null;
            }, timeout);
            return (res && res !== 'gone') ? res : null;
        }

        function waitForSwalGone(timeout = 4000) {
            return waitFor(() => !getSwalPopup(), timeout);
        }

        async function dismissLeftoverSwal() {
            const popup = getSwalPopup();
            if (!popup) return;
            const btn = popup.querySelector('.swal2-confirm');
            if (btn) btn.click();
            await waitForSwalGone(2000);
        }

        // Критерій успіху — фактичний стан галки, а не закриття попапа.
        // Вузол читаємо заново перед кожною дією: адмінка перемальовує рядок форми.
        async function handleCheckboxFlow(selector, shouldBeChecked, label) {
            const read = () => document.querySelector(selector);
            if (!read()) throw new Error(`${label}: чекбокс не знайдено на сторінці`);

            for (let attempt = 1; attempt <= CHECKBOX_ATTEMPTS; attempt++) {
                const checkbox = read();
                if (!checkbox) throw new Error(`${label}: чекбокс зник зі сторінки`);
                if (checkbox.checked === shouldBeChecked) return;

                await dismissLeftoverSwal();
                checkbox.click();

                const popup1 = await waitFor(getSwalPopup, 3000);
                if (popup1) {
                    const text1 = swalText(popup1);
                    const btn1 = popup1.querySelector('.swal2-confirm');
                    if (!btn1) throw new Error(`${label}: у вікні немає кнопки підтвердження`);
                    btn1.click();

                    const popup2 = await waitForSwalChange(text1);
                    if (popup2) {
                        const btn2 = popup2.querySelector('.swal2-confirm');
                        if (btn2) btn2.click();
                    }
                    await waitForSwalGone();
                }

                const settled = await waitFor(() => {
                    const fresh = read();
                    return fresh && fresh.checked === shouldBeChecked;
                }, 2500);
                if (settled) return;

                const now = read();
                console.warn(`[bkf] Macro: ${label} — спроба ${attempt}/${CHECKBOX_ATTEMPTS} не дала результату ` +
                    `(треба checked=${shouldBeChecked}, зараз=${now ? now.checked : 'вузла немає'})`);
                await sleep(700);
            }
            throw new Error(`${label}: стан не змінився за ${CHECKBOX_ATTEMPTS} спроби`);
        }

        async function runCheckboxStep(selector, shouldBeChecked, label, warnings) {
            try {
                await handleCheckboxFlow(selector, shouldBeChecked, label);
                return true;
            } catch (err) {
                console.error('[bkf] Macro step failed:', err);
                warnings.push(err.message);
                return false;
            }
        }

        // Останній крок перезавантажує сторінку — попередження переносимо через sessionStorage.
        function showPendingMacroWarnings() {
            let raw = null;
            try {
                raw = sessionStorage.getItem(MACRO_WARN_KEY);
                if (raw) sessionStorage.removeItem(MACRO_WARN_KEY);
            } catch (e) { return; }
            if (!raw) return;

            let list;
            try { list = JSON.parse(raw); } catch (e) { return; }
            if (!Array.isArray(list) || !list.length) return;

            showToast(
                `<div style="display:flex; gap:10px; align-items:flex-start;">
                    <div style="font-size:20px">⚠️</div>
                    <div><b>Макрос завершився з попередженнями</b><br>
                    <span style="font-size:13px">${list.map(escapeHtml).join('<br>')}</span><br>
                    <span style="font-size:12px; opacity:0.85">Ці пункти треба перевірити вручну.</span></div>
                </div>`,
                '#F57C00',
                MACRO_TOAST
            );
        }

        function showConfirmationPopup(alreadyDisabled = false) {
            if (document.getElementById('bkf-confirm-modal')) return;

            const accent = alreadyDisabled ? '#455a64' : '#d32f2f';
            const accentHover = alreadyDisabled ? '#37474f' : '#b71c1c';
            const title = alreadyDisabled ? '✅ Бонуси вже вимкнені' : '⚠️ Підтвердження дії';
            const bodyText = alreadyDisabled
                ? 'У цього гравця вже стоїть галка <b>«Отключить бонусы»</b>,<br>але СМС/E-mail сповіщення та блокування<br>могли лишитись увімкненими.<br><br>Виконати решту кроків?'
                : 'Ви дійсно хочете <b>вимкнути всі бонуси</b><br>та сповіщення для цього гравця?';
            const yesLabel = alreadyDisabled ? 'Все одно виконати' : 'Так, вимкнути';

            const overlay = document.createElement('div');
            overlay.id = 'bkf-confirm-modal';
            Object.assign(overlay.style, {
                position: 'fixed', top: '0', left: '0', width: '100%', height: '100%',
                backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '9999999',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'Arial, sans-serif'
            });

            const box = document.createElement('div');
            Object.assign(box.style, {
                backgroundColor: '#fff', padding: '25px', borderRadius: '10px',
                textAlign: 'center', minWidth: '320px', boxShadow: '0 4px 15px rgba(0,0,0,0.3)'
            });
            box.innerHTML = `
                <h3 style="margin: 0 0 15px 0; color: ${accent}; font-size: 18px;">${title}</h3>
                <p style="margin: 0 0 20px 0; font-size: 14px; color: #333; line-height: 1.5;">${bodyText}</p>
                <div style="display: flex; justify-content: center; gap: 15px;">
                    <button id="bkf-confirm-yes" style="background: ${accent}; color: white; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.2s;">${yesLabel}</button>
                    <button id="bkf-confirm-no" style="background: #e0e0e0; color: #333; border: none; padding: 10px 20px; border-radius: 5px; cursor: pointer; font-weight: bold; font-size: 14px; transition: 0.2s;">Скасувати</button>
                </div>
            `;
            overlay.appendChild(box);
            document.body.appendChild(overlay);

            const btnYes = document.getElementById('bkf-confirm-yes');
            const btnNo = document.getElementById('bkf-confirm-no');
            btnYes.onmouseover = () => { btnYes.style.background = accentHover; };
            btnYes.onmouseout = () => { btnYes.style.background = accent; };
            btnNo.onmouseover = () => { btnNo.style.background = '#bdbdbd'; };
            btnNo.onmouseout = () => { btnNo.style.background = '#e0e0e0'; };

            function onKey(e) { if (e.key === 'Escape') close(); }
            const close = () => {
                overlay.remove();
                document.removeEventListener('keydown', onKey);
            };
            document.addEventListener('keydown', onKey);
            overlay.onclick = (e) => { if (e.target === overlay) close(); };
            btnYes.onclick = () => { close(); runBonusKiller(); };
            btnNo.onclick = close;
        }

        // Порядок кроків фіксований: «Сохранить» у блоці Блокувань перезавантажує сторінку.
        async function runBonusKiller() {
            const btn = document.getElementById('bkf-bonus-killer');
            if (!btn) return;

            let pageWillReload = false;
            const warnings = [];

            btn.classList.remove('bkf-disabled');
            btn.classList.add('bkf-running');
            btn.innerHTML = '<span>⏳</span> Виконую...';

            try {
                await sleep(150);

                await runCheckboxStep(BONUS_CHECKBOX, true, 'Крок 1 «Отключить бонусы»', warnings);
                await runCheckboxStep('input#Players_sms_notify', false, 'Крок 2 «СМС уведомления»', warnings);
                await runCheckboxStep('input#Players_email_notify', false, 'Крок 3 «E-mail уведомления»', warnings);

                await dismissLeftoverSwal();

                // Крок 4. «Показать». У новій адмінці це slideToggle — повторний клік
                // ХОВАЄ блок, тож тиснемо лише коли блок справді схований.
                const block = document.querySelector(RF.block);
                if (!block || !isVisible(block)) {
                    const showBtn = document.querySelector(RF.show);
                    if (!showBtn) throw new Error('Крок 4 (Блокировки): кнопку "Показать" не знайдено');
                    showBtn.click();
                }

                const boxes = await waitFor(() => {
                    const list = rfCheckboxes();
                    return list.length && list.some(isVisible) ? list : null;
                });
                if (!boxes) throw new Error('Крок 4 (Блокировки): галочки блокувань не з\'явилися');

                // Крок 5. «Выбрать все». Тепер це перемикач «Выбрать все / Снять все»:
                // якщо все вже відмічено, клік ЗНІМЕ всі галочки. Тому тиснемо лише коли
                // є невідмічені, а результат перевіряємо і за потреби добиваємо вручну.
                if (!rfAllChecked()) {
                    const toggleBtn = document.querySelector(RF.selectAll);
                    if (toggleBtn) toggleBtn.click();
                    await waitFor(rfAllChecked, 1500, 100);
                }
                if (!rfAllChecked()) {
                    rfCheckboxes().forEach(cb => {
                        if (cb.checked) return;
                        cb.checked = true;
                        cb.dispatchEvent(new Event('change', { bubbles: true }));
                    });
                }
                if (!rfAllChecked()) throw new Error('Крок 5 (Блокировки): не вдалося відмітити всі галочки');

                // Крок 6. «Сохранить» — AJAX; при успіху адмінка перезавантажує сторінку.
                const saveBtn = document.querySelector(RF.save);
                if (!saveBtn) throw new Error('Крок 6 (Блокировки): кнопку "Сохранить" не знайдено');

                if (warnings.length) {
                    try { sessionStorage.setItem(MACRO_WARN_KEY, JSON.stringify(warnings)); } catch (e) { /* ignore */ }
                }

                pageWillReload = true;
                btn.innerHTML = '<span>💾</span> Зберігаю...';
                saveBtn.click();

                // Якщо сервер відмовив, сторінка НЕ перезавантажиться, а адмінка
                // покаже Swal з помилкою — інакше кнопка вічно висіла б у «Зберігаю...».
                const failText = await waitFor(() => {
                    const p = getSwalPopup();
                    return p && p.querySelector('.swal2-icon-error, .swal2-error') ? (swalText(p) || 'помилка') : null;
                }, 10000, 200);
                if (failText) {
                    pageWillReload = false;
                    try { sessionStorage.removeItem(MACRO_WARN_KEY); } catch (e) { /* ignore */ }
                    throw new Error(`Крок 6 (Блокировки): адмінка відповіла помилкою — ${failText}`);
                }

            } catch (err) {
                console.error('[bkf] Macro Error: ', err);
                const extra = warnings.length
                    ? `<br><span style="font-size:13px">${warnings.map(escapeHtml).join('<br>')}</span>`
                    : '';
                showToast(
                    `<div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="font-size:20px">❌</div>
                        <div><b>Макрос зупинився</b><br>
                        <span style="font-size:13px">${escapeHtml(err.message)}</span>${extra}<br>
                        <span style="font-size:12px; opacity:0.85">Решту кроків потрібно зробити вручну.</span></div>
                    </div>`,
                    '#d32f2f',
                    MACRO_TOAST
                );
                btn.innerHTML = '<span>❌</span> Помилка';
                setTimeout(refreshBonusKillerState, 4000);
            } finally {
                if (!pageWillReload) btn.classList.remove('bkf-running');
            }
        }

        function refreshBonusKillerState() {
            const btn = document.getElementById('bkf-bonus-killer');
            if (!btn || btn.classList.contains('bkf-running')) return;

            const checkbox = document.querySelector(BONUS_CHECKBOX);
            if (checkbox && checkbox.checked) {
                btn.classList.add('bkf-disabled');
                btn.title = 'Бонуси вже вимкнені. Натисніть, щоб виконати решту кроків (СМС, E-mail, блокування)';
                btn.innerHTML = '<span>✅</span> Бонуси вже вимкнені';
            } else {
                btn.classList.remove('bkf-disabled');
                btn.title = 'Автоматично відключити всі бонуси та сповіщення';
                btn.innerHTML = '<span>🚫</span> Вимкнути всі бонуси';
            }

            if (checkbox && !checkbox.dataset.bkfWatched) {
                checkbox.dataset.bkfWatched = '1';
                checkbox.addEventListener('change', () => setTimeout(refreshBonusKillerState, 50));
            }
        }

        function createBonusKillerWidget() {
            if (!window.location.href.includes('/playersItems/update')) return;

            if (!document.getElementById('bkf-bonus-killer')) {
                const btn = document.createElement('div');
                btn.id = 'bkf-bonus-killer';
                btn.title = 'Автоматично відключити всі бонуси та сповіщення';
                btn.innerHTML = '<span>🚫</span> Вимкнути всі бонуси';
                btn.onclick = () => {
                    if (btn.classList.contains('bkf-running')) return;
                    showConfirmationPopup(btn.classList.contains('bkf-disabled'));
                };
                document.body.appendChild(btn);
            }
            refreshBonusKillerState();
        }

        // ─────────────────────────────────────────
        // 4.2 MINES HUNTER (журнал балансу та профіль)
        // ─────────────────────────────────────────
        function isSuspicious(text) { return !!text && SUSPICIOUS_REGEX.test(text); }

        function scrollToMatch(index) {
            if (state.foundRows.length === 0) return;
            if (index >= state.foundRows.length) index = 0;
            if (index < 0) index = state.foundRows.length - 1;

            state.currentNavIndex = index;
            const row = state.foundRows[index];
            row.scrollIntoView({ behavior: 'smooth', block: 'center' });
            row.style.outline = '3px solid red';
            setTimeout(() => { row.style.outline = 'none'; }, 1000);
            updateWidget();
        }

        function processBatch(rows, startIndex, scanId, autoScroll) {
            if (scanId !== state.scanId) return;
            const limit = Math.min(startIndex + BATCH_SIZE, rows.length);

            for (let i = startIndex; i < limit; i++) {
                const row = rows[i];
                if (row.classList.contains('filters')) continue;

                let rowSuspicious = false;
                for (const cell of row.children) {
                    if (isSuspicious(cell.innerText)) {
                        rowSuspicious = true;
                        cell.classList.toggle('bkf-suspicious-cell', state.searchActive);
                    }
                }

                if (rowSuspicious) {
                    if (!row.dataset.bkfFound) {
                        row.dataset.bkfFound = 'true';
                        state.foundRows.push(row);
                    }
                    row.classList.toggle('bkf-suspicious-row', state.searchActive);
                }
            }
            updateWidget();

            if (limit < rows.length) {
                requestAnimationFrame(() => processBatch(rows, limit, scanId, autoScroll));
            } else {
                state.isProcessing = false;
                updateWidget();
                if (autoScroll && state.searchActive && state.foundRows.length > 0) scrollToMatch(0);
            }
        }

        function scanTable(autoScroll = false) {
            const table = findGridTable();
            if (!table) return;
            const rows = table.querySelectorAll('tbody tr');
            if (rows.length === 0) return;

            state.isProcessing = true;
            state.scanId++;
            state.foundRows = [];
            state.currentNavIndex = -1;
            table.querySelectorAll('[data-bkf-found]').forEach(el => { delete el.dataset.bkfFound; });

            updateWidget();
            processBatch(rows, 0, state.scanId, autoScroll);
        }

        function scanProfile() {
            let found = false;
            document.querySelectorAll('th').forEach(th => {
                if (th.innerText.includes('Последняя ставка') || th.innerText.includes('Last bet')) {
                    const td = th.nextElementSibling;
                    if (td && isSuspicious(td.innerText)) {
                        td.classList.add('bkf-highlight-profile');
                        found = true;
                    }
                }
            });
            const showMoreBtn = document.querySelector('#top-wins-show-more');
            if (showMoreBtn) {
                const hiddenDiv = showMoreBtn.nextElementSibling;
                if (hiddenDiv && isSuspicious(hiddenDiv.innerText) && !showMoreBtn.classList.contains('bkf-highlight-btn')) {
                    showMoreBtn.classList.add('bkf-highlight-btn');
                    showMoreBtn.insertAdjacentText('beforeend', ' ⚠️ MINES!');
                    found = true;
                }
            }
            document.querySelectorAll('table.detail-view a').forEach(link => {
                if (isSuspicious(link.innerText)) {
                    link.classList.add('bkf-highlight-link');
                    found = true;
                }
            });
            if (found && !document.getElementById('bkf-toast')) {
                showToast(`<div style="display:flex; gap:10px; align-items:center;"><div style="font-size:20px">💣</div><div><b>FOUND MINES</b></div></div>`);
            }
        }

        function createMinesWidget() {
            if (document.getElementById('bkf-search-widget')) return;
            const widget = document.createElement('div');
            widget.id = 'bkf-search-widget';
            widget.className = 'bkf-widget';
            widget.innerHTML = `
                <span id="bkf-prev" class="bkf-btn-nav" title="Попередня">⬅️</span>
                <div id="bkf-main" class="bkf-btn-main" title="Увімкнути/Вимкнути">💣 <span id="bkf-count" class="bkf-counter"></span></div>
                <span id="bkf-next" class="bkf-btn-nav" title="Наступна">➡️</span>
            `;
            document.body.appendChild(widget);
            state.widget = widget;
            document.getElementById('bkf-main').onclick = () => {
                state.searchActive = !state.searchActive;
                scanTable(state.searchActive);
            };
            document.getElementById('bkf-prev').onclick = (e) => { e.stopPropagation(); scrollToMatch(state.currentNavIndex - 1); };
            document.getElementById('bkf-next').onclick = (e) => { e.stopPropagation(); scrollToMatch(state.currentNavIndex + 1); };
        }

        function updateWidget() {
            if (!state.widget) return;
            const count = state.foundRows.length;
            const countText = document.getElementById('bkf-count');
            const prevBtn = document.getElementById('bkf-prev');
            const nextBtn = document.getElementById('bkf-next');

            if (state.searchActive && count > 0 && state.currentNavIndex !== -1) {
                countText.innerText = `${state.currentNavIndex + 1}/${count}`;
            } else {
                countText.innerText = count > 0 ? count : '';
            }

            const showNav = state.searchActive && count > 0;
            prevBtn.style.display = showNav ? 'block' : 'none';
            nextBtn.style.display = showNav ? 'block' : 'none';

            state.widget.className = 'bkf-widget';
            if (state.isProcessing) {
                state.widget.classList.add('processing');
                state.widget.classList.add(state.searchActive ? 'active' : 'found');
            } else if (state.searchActive) {
                state.widget.classList.add('active');
            } else if (count > 0) {
                state.widget.classList.add('found');
            }
        }

        // ─────────────────────────────────────────
        // 4.3 ПАГІНАЦІЯ ГРІДА
        // ─────────────────────────────────────────
        // Посилання пагінатора беремо з DOM, а НЕ з location.href: фільтри застосовуються
        // через AJAX, а Yii перемальовує пагінатор із уже вшитими параметрами фільтра.
        function getPagerLinks(root = document) {
            const table = findGridTable(root);
            if (!table) return [];
            const scope = table.closest('.grid-view, .list-view') || table.parentElement || root;
            return Array.from(scope.querySelectorAll('.pager a[href], .pagination a[href], ul.yiiPager a[href]'))
                .filter(a => {
                    const href = a.getAttribute('href');
                    return href && href !== '#' && !href.startsWith('javascript:');
                });
        }

        function linkUrl(a) {
            try { return new URL(a.getAttribute('href'), location.href); } catch (e) { return null; }
        }

        // Yii1 CLinkPager -> "Model_page", Yii2 -> "page". Обидва 1-based.
        function detectPageParam(links) {
            for (const a of links) {
                const u = linkUrl(a);
                if (!u) continue;
                for (const [k, v] of u.searchParams) {
                    if (/(^|_)page$/i.test(k) && /^\d+$/.test(v)) return k;
                }
            }
            return null;
        }

        function maxPageFrom(links, pageParam) {
            let max = 1;
            for (const a of links) {
                const u = linkUrl(a);
                if (!u) continue;
                const v = parseInt(u.searchParams.get(pageParam), 10);
                if (!isNaN(v) && v > max) max = v;
            }
            return max;
        }

        function buildPageUrl(links, pageParam, page) {
            const u = linkUrl(links[0]);
            if (!u) return null;
            u.searchParams.set(pageParam, page);
            u.searchParams.delete('ajax');  // інакше Yii віддасть лише фрагмент
            u.searchParams.delete('_');
            u.hash = '';
            return u.toString();
        }

        function getPagination() {
            const links = getPagerLinks();
            if (!links.length) return null;
            const pageParam = detectPageParam(links);
            if (!pageParam) return null;
            return { links, pageParam, maxPage: maxPageFrom(links, pageParam) };
        }

        // ─────────────────────────────────────────
        // 4.4 КАЛЬКУЛЯТОР БОНУСІВ (Ставки на спорт)
        // ─────────────────────────────────────────
        // «Рахувати»:
        //   1) перемикає фільтр гріда «Тип» на bonus (якщо ще не стоїть) і чекає, поки
        //      Yii перемалює таблицю;
        //   2) сумує колонку «Real Amount» по ВСІХ сторінках гріда;
        //   3) показує розбивку по періодах (за «Created At»).
        function formatMoney(amount) {
            return amount.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' ' + CURRENCY;
        }

        // Формат у гріді: "+16000.00" / "-3540.00". Кома як десятковий роздільник теж розуміється.
        function parseAmount(text) {
            let s = String(text).trim().replace(/\s/g, '');
            if (/,\d{1,2}$/.test(s) && !/\.\d/.test(s)) s = s.replace(',', '.');
            s = s.replace(/[^\d.-]/g, '');
            const v = parseFloat(s);
            return isNaN(v) ? null : v;
        }

        function hasCalcColumns(cols) {
            return !!cols && cols.typeColIdx !== -1 && cols.amountColIdx !== -1;
        }

        function newAccumulator() {
            return {
                sums: { d7: 0, d30: 0, d90: 0, d180: 0, d365: 0, all: 0 },
                count: 0, scannedRows: 0, badDates: 0, maxDaysAgo: -1, pages: 0, bonusNames: new Map()
            };
        }

        // Працює і з живим DOM, і з документом із DOMParser — без classList/scrollIntoView.
        function accumulate(table, cols, acc, now) {
            dataRows(table).forEach(row => {
                acc.scannedRows++;
                const cells = row.querySelectorAll('td');
                if (cells.length <= Math.max(cols.typeColIdx, cols.amountColIdx)) return;
                if (cellText(cells[cols.typeColIdx]).toLowerCase() !== 'bonus') return;

                const val = parseAmount(cellText(cells[cols.amountColIdx]));
                if (val === null) return;

                // Формат дати: "2026-05-01 05:45:35" (ISO, локальний час).
                let daysAgo = null;
                if (cols.dateColIdx !== -1 && cells[cols.dateColIdx]) {
                    const rowDate = new Date(cellText(cells[cols.dateColIdx]).replace(' ', 'T'));
                    if (!isNaN(rowDate)) daysAgo = (now - rowDate) / (1000 * 60 * 60 * 24);
                }

                if (daysAgo === null) {
                    acc.badDates++;
                } else {
                    if (daysAgo > acc.maxDaysAgo) acc.maxDaysAgo = daysAgo;
                    if (daysAgo <= 7) acc.sums.d7 += val;
                    if (daysAgo <= 30) acc.sums.d30 += val;
                    if (daysAgo <= 90) acc.sums.d90 += val;
                    if (daysAgo <= 180) acc.sums.d180 += val;
                    if (daysAgo <= 365) acc.sums.d365 += val;
                }

                if (cols.bonusColIdx !== -1) {
                    const name = cellText(cells[cols.bonusColIdx]);
                    if (name) acc.bonusNames.set(name, (acc.bonusNames.get(name) || 0) + val);
                }

                acc.sums.all += val;
                acc.count++;
            });
            acc.pages++;
        }

        function markBonusRows(table, cols) {
            dataRows(table).forEach(row => {
                row.classList.remove('bkf-bonus-row');
                const cells = row.querySelectorAll('td');
                if (cells.length <= Math.max(cols.typeColIdx, cols.amountColIdx)) return;
                if (cellText(cells[cols.typeColIdx]).toLowerCase() !== 'bonus') return;
                if (parseAmount(cellText(cells[cols.amountColIdx])) === null) return;
                row.classList.add('bkf-bonus-row');
            });
        }

        // ── Перемикання фільтра «Тип» на bonus ──
        function findTypeFilter(table) {
            const filters = table.querySelector('thead tr.filters');
            if (!filters) return null;
            const byName = filters.querySelector('select[name$="[type]"], select[id$="_type"]');
            if (byName) return byName;
            const cols = resolveColumns(table);
            const cell = cols ? cellAt(filters, cols.typeColIdx) : null;
            return cell ? cell.querySelector('select') : null;
        }

        function currentGrid() {
            const table = findGridTable();
            return table ? table.closest('.grid-view, .list-view') : null;
        }

        function gridBusy() {
            const g = currentGrid();
            return !!g && g.classList.contains('grid-view-loading');
        }

        // Повертає { switched } або кидає помилку.
        async function ensureBonusFilter() {
            const table = findGridTable();
            if (!table) throw new Error('Таблицю не знайдено');

            const select = findTypeFilter(table);
            if (!select) return { switched: false, note: 'фільтр «Тип» не знайдено — пораховано поточну вибірку' };
            if (select.value === 'bonus') return { switched: false };
            if (![...select.options].some(o => o.value === 'bonus')) {
                return { switched: false, note: 'у фільтрі «Тип» немає значення bonus — пораховано поточну вибірку' };
            }

            const before = gridSignature();
            select.value = 'bonus';
            // Нативна bubbling-подія — її ловить і делегований jQuery-обробник Yii.
            select.dispatchEvent(new Event('change', { bubbles: true }));

            // Якщо грід не почав оновлюватись сам — тиснемо «Применить фильтры».
            const started = await waitFor(() => gridBusy() || gridSignature() !== before, 600, 50);
            if (!started) {
                const grid = currentGrid();
                const gridId = grid && grid.id;
                const applyBtn = (gridId && document.querySelector(`.applyFiltersBtn[grid_id="${gridId}"]`)) ||
                    document.querySelector('.applyFiltersBtn');
                if (!applyBtn) throw new Error('Не знайдено кнопку «Применить фильтры»');
                applyBtn.click();
            }

            const done = await waitFor(() => !gridBusy() && gridSignature() !== before, FILTER_TIMEOUT, 150);
            if (!done) throw new Error('Таблиця не оновилась після перемикання «Тип» → bonus');

            // Даємо Yii дорендерити пагінатор/рядки.
            await sleep(100);
            return { switched: true };
        }

        function setCalcButton(text, busy = false) {
            const widget = document.getElementById('bkf-calc-widget');
            const btnText = document.getElementById('bkf-calc-text');
            if (btnText) btnText.innerHTML = text;
            if (widget) widget.classList.toggle('bkf-busy', busy);
        }

        function hidePanel() {
            const panel = document.getElementById('bkf-calc-panel');
            if (panel) panel.style.display = 'none';
        }

        function calcFail(msg) {
            hidePanel();
            setCalcButton(msg);
            setTimeout(() => setCalcButton('Рахувати'), 2500);
        }

        function renderCalcPanel(acc, opts) {
            const panel = document.getElementById('bkf-calc-panel');
            if (!panel) return;

            let html = `<h3>📊 Відіграні бонуси</h3>`;
            html += `<span class="bkf-calc-close" title="Закрити">✖</span>`;
            html += `<div class="bkf-calc-note">${opts.scopeNote}</div>`;

            if (acc.maxDaysAgo >= 0) html += `<div class="bkf-calc-row"><span>За останні 7 днів:</span> <b>${formatMoney(acc.sums.d7)}</b></div>`;
            if (acc.maxDaysAgo > 7) html += `<div class="bkf-calc-row"><span>За останні 30 днів:</span> <b>${formatMoney(acc.sums.d30)}</b></div>`;
            if (acc.maxDaysAgo > 30) html += `<div class="bkf-calc-row"><span>За останні 3 місяці:</span> <b>${formatMoney(acc.sums.d90)}</b></div>`;
            if (acc.maxDaysAgo > 90) html += `<div class="bkf-calc-row"><span>За останні 6 місяців:</span> <b>${formatMoney(acc.sums.d180)}</b></div>`;
            if (acc.maxDaysAgo > 180) html += `<div class="bkf-calc-row"><span>За останній рік:</span> <b>${formatMoney(acc.sums.d365)}</b></div>`;

            html += `<div class="bkf-calc-row bkf-calc-total" title="Клік — копіювати суму"><span>Разом (Real Amount):</span> <b>${formatMoney(acc.sums.all)}</b></div>`;

            if (opts.dateColMissing) {
                html += `<div class="bkf-calc-warn">⚠️ Колонку з датою не знайдено — розбивка по періодах недоступна, показано лише загальну суму.</div>`;
            } else if (acc.badDates > 0) {
                html += `<div class="bkf-calc-warn">⚠️ ${acc.badDates} ${acc.badDates === 1 ? 'рядок' : 'рядків'} з нерозпізнаною датою — вони враховані лише в загальній сумі.</div>`;
            }
            (opts.warnings || []).forEach(w => { html += `<div class="bkf-calc-warn">⚠️ ${escapeHtml(w)}</div>`; });

            panel.innerHTML = html;
            panel.querySelector('.bkf-calc-close').onclick = hidePanel;
            panel.querySelector('.bkf-calc-total').onclick = () => {
                copyRich(null, acc.sums.all.toFixed(2));
            };
            panel.style.display = 'block';
        }

        async function runBonusCalc() {
            // Під час роботи той самий клік працює як «Скасувати».
            if (state.calcRunning) {
                state.calcAbort = true;
                setCalcButton('⏹ Зупиняю...', true);
                return;
            }

            state.calcRunning = true;
            state.calcAbort = false;
            hidePanel();
            const warnings = [];

            try {
                setCalcButton('⏳ Тип → bonus...', true);
                const filter = await ensureBonusFilter();
                if (filter.note) warnings.push(filter.note);
                if (state.calcAbort) { calcFail('⏹ Скасовано'); return; }

                const liveTable = findGridTable();
                const cols = liveTable ? resolveColumns(liveTable) : null;
                if (!hasCalcColumns(cols)) throw new Error('Немає колонок «Тип» / «Real Amount»');

                markBonusRows(liveTable, cols);
                const acc = newAccumulator();
                const now = new Date();
                const pagination = getPagination();

                if (!pagination || pagination.maxPage <= 1) {
                    accumulate(liveTable, cols, acc, now);
                } else {
                    // Інші сторінки тягнемо fetch-ем у тій самій сесії — вкладка нікуди не переходить.
                    let lastPage = Math.min(pagination.maxPage, MAX_PAGES);
                    for (let page = 1; page <= lastPage; page++) {
                        if (state.calcAbort) {
                            warnings.push(`Обхід перервано на сторінці ${page} з ${lastPage} — суми неповні.`);
                            break;
                        }
                        setCalcButton(`⏳ Сторінка ${page}/${lastPage}`, true);

                        const url = buildPageUrl(pagination.links, pagination.pageParam, page);
                        if (!url) throw new Error('Не вдалося побудувати URL сторінки');

                        const res = await fetch(url, { credentials: 'same-origin' });
                        if (!res.ok) throw new Error(`Сторінка ${page}: сервер відповів ${res.status}`);

                        const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
                        const pageTable = findGridTable(doc);
                        const pageCols = pageTable ? resolveColumns(pageTable) : null;
                        // Протухла сесія = форма логіна; без перевірки мовчки нарахували б нуль.
                        if (!hasCalcColumns(pageCols)) {
                            throw new Error(`Сторінка ${page} не схожа на грід ставок (можливо, сесія завершилася)`);
                        }
                        accumulate(pageTable, pageCols, acc, now);

                        const pageLinks = getPagerLinks(doc);
                        if (pageLinks.length) {
                            const discovered = maxPageFrom(pageLinks, pagination.pageParam);
                            if (discovered > lastPage && discovered <= MAX_PAGES) lastPage = discovered;
                        }
                        if (page < lastPage) await sleep(PAGE_FETCH_DELAY);
                    }
                    if (pagination.maxPage > MAX_PAGES) {
                        warnings.push(`Оброблено перші ${MAX_PAGES} сторінок з ${pagination.maxPage}.`);
                    }
                }

                state.panelSignature = gridSignature();

                if (acc.count === 0) {
                    setCalcButton('🤷‍♂️ 0 бонусів');
                    setTimeout(() => setCalcButton('Рахувати'), 2500);
                    return;
                }

                const typeNote = filter.switched ? 'Тип перемкнено на <b>bonus</b>. ' : '';
                setCalcButton(`Дашборд (${acc.count} шт)`);
                renderCalcPanel(acc, {
                    scopeNote: `${typeNote}${acc.pages} стор., ${acc.scannedRows} рядків, з них ${acc.count} бонусних.<br>Клік по рядку таблиці — копіює назву бонусу.`,
                    dateColMissing: cols.dateColIdx === -1,
                    warnings
                });

            } catch (err) {
                console.error('[bkf] Calc Error:', err);
                showToast(
                    `<div style="display:flex; gap:10px; align-items:flex-start;">
                        <div style="font-size:20px">❌</div>
                        <div><b>Калькулятор бонусів</b><br>
                        <span style="font-size:13px">${escapeHtml(err.message)}</span></div>
                    </div>`
                );
                calcFail('❌ Помилка');
            } finally {
                state.calcRunning = false;
                state.calcAbort = false;
                const widget = document.getElementById('bkf-calc-widget');
                if (widget) widget.classList.remove('bkf-busy');
            }
        }

        function createCalcWidget() {
            if (document.getElementById('bkf-calc-widget')) return;

            const widget = document.createElement('div');
            widget.id = 'bkf-calc-widget';
            widget.className = 'bkf-calc-widget';
            widget.title = 'Перемкнути «Тип» на bonus і порахувати Real Amount по всіх сторінках';
            widget.innerHTML = '🧮 <span id="bkf-calc-text" style="font-size: 16px; font-weight: bold; margin-left: 5px;">Рахувати</span>';
            document.body.appendChild(widget);

            const panel = document.createElement('div');
            panel.id = 'bkf-calc-panel';
            panel.className = 'bkf-calc-panel';
            document.body.appendChild(panel);

            widget.onclick = runBonusCalc;
        }

        // ─────────────────────────────────────────
        // 4.5 КЛІК ПО РЯДКУ → КОПІЮВАННЯ НАЗВИ БОНУСУ (Ставки на спорт)
        // ─────────────────────────────────────────
        function decorateBonusRows() {
            const table = findGridTable();
            const cols = table ? resolveColumns(table) : null;
            if (!cols || cols.bonusColIdx === -1) return;
            const rows = dataRows(table);
            const byRef = bonusByReference(rows, cols);
            rows.forEach(row => {
                const name = rowBonusName(row, cols, byRef);
                if (name) {
                    if (!row.classList.contains('bkf-bonus-copyable')) row.classList.add('bkf-bonus-copyable');
                    row.title = 'Клік — копіювати: ' + name;
                } else if (row.classList.contains('bkf-bonus-copyable')) {
                    row.classList.remove('bkf-bonus-copyable');
                    row.removeAttribute('title');
                }
            });
        }

        function installBonusRowCopy() {
            document.addEventListener('click', (e) => {
                const target = e.target;
                if (!target.closest) return;
                const row = target.closest('.grid-view table > tbody > tr');
                if (!row || row.classList.contains('filters') || row.classList.contains('empty')) return;
                // Не заважаємо посиланням, кнопкам і полям у рядку.
                if (target.closest('a, button, input, select, textarea, label, .show-transaction-all-events-button')) return;
                // Користувач виділяє текст мишею — не перебиваємо його копіювання.
                if (String(window.getSelection() || '').trim()) return;

                const table = row.closest('table');
                const cols = resolveColumns(table);
                if (!cols || cols.bonusColIdx === -1) return;

                const name = rowBonusName(row, cols, bonusByReference(dataRows(table), cols));
                if (name) copyRich(null, name);
            });
        }

        // ─────────────────────────────────────────
        // 4.6 ЗАПУСК МОДУЛЯ
        // ─────────────────────────────────────────
        function init() {
            const url = window.location.href;

            if (url.includes('players/playersItems/balanceLog')) {
                createMinesWidget();
                scanTable(false);
                observeGrid(() => scanTable(false));
                // Таблиця може дорендеритись пізніше за старт скрипта.
                let n = 0;
                const t = setInterval(() => {
                    if (state.foundRows.length || ++n >= 5) clearInterval(t);
                    else scanTable(false);
                }, 500);

            } else if (url.includes('/players/sportBetting')) {
                createCalcWidget();
                installBonusRowCopy();
                decorateBonusRows();
                observeGrid(() => {
                    decorateBonusRows();
                    if (state.calcRunning) return;
                    // Після зміни фільтра цифри стосуються іншої вибірки — ховаємо панель.
                    // Але не після нашого ж перемикання «Тип → bonus» (підпис гріда той самий).
                    const panel = document.getElementById('bkf-calc-panel');
                    if (panel && panel.style.display === 'block' && gridSignature() !== state.panelSignature) {
                        hidePanel();
                        setCalcButton('Рахувати');
                    }
                });

            } else if (url.includes('players/playersItems/update')) {
                scanProfile();
                createBonusKillerWidget();
                showPendingMacroWarnings();
                // Галка «Отключить бонусы» і блок «Последняя ставка» можуть дорендеритись пізніше.
                let n = 0;
                const t = setInterval(() => {
                    scanProfile();
                    createBonusKillerWidget();
                    if (++n >= 5) clearInterval(t);
                }, 500);
            }
        }

        return { init };
    })();

    // ═════════════════════════════════════════════════════════════
    // 5. ALTENAR FRAUD (тільки Altenar)
    // ═════════════════════════════════════════════════════════════
    const AltenarFraud = (function () {
        const IP_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQywPvbX57EZNxXsWvbkT2zvKhVyDB_WK5gncbNeLL44QvMfF47V9lvPAmk1m21kPxaujDGPeL52mLm/pub?output=csv';
        const PLAYER_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQywPvbX57EZNxXsWvbkT2zvKhVyDB_WK5gncbNeLL44QvMfF47V9lvPAmk1m21kPxaujDGPeL52mLm/pub?gid=596301501&single=true&output=csv';
        const TRASH_LEAGUE_SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vQywPvbX57EZNxXsWvbkT2zvKhVyDB_WK5gncbNeLL44QvMfF47V9lvPAmk1m21kPxaujDGPeL52mLm/pub?gid=1207290000&single=true&output=csv';
        const SHEET_EDIT_URL = 'https://docs.google.com/spreadsheets/d/1KcwhDyn2PhH1ouJUU6vMZmQQdYVLBXCQYayHIYFxiqM/edit?gid=0#gid=0';

        const IP_CHECKER_URL = 'https://www.ip2proxy.com/demo?lang=ru&ip=';
        const BLACKLIST_UPDATE_INTERVAL = 60 * 60 * 1000;
        const VISITED_EXPIRATION_MS = 12 * 60 * 60 * 1000;

        // Ключі localStorage — ТІ САМІ, що в старому скрипті: налаштування й історія
        // відвіданих профілів переходять у новий скрипт без втрат.
        const SETTINGS_KEY = 'fbh_user_settings_v1';
        const VISITED_KEY = 'fbh_visited_players';

        const DEFAULT_SETTINGS = {
            duplicateEventsEnabled: true,
            duplicateIPsEnabled: true,
            largeBetEnabled: true,
            largeBetAmount: 200,
            bonusBetEnabled: true,
            bonusBetAmount: 50,
            fastSettledEnabled: true,
            fastSettledNormalSec: 180,
            fastSettledFastSec: 60,
            fastSettledVeryFastSec: 30,
            preliveEnabled: false,
            preliveHours: 6,
            preliveProfileOnly: false,
            limitBypassEnabled: false,
            trashOddsThreshold: 1.15,
            targetOddsThreshold: 1.60,
            visitedProfilesEnabled: true,
            blacklistEnabled: true,
            trashLeagueEnabled: true,
            trashLeagueStakeAmount: 50,
            skinBadgeEnabled: true
        };

        const stored = lsGet(SETTINGS_KEY, {});
        const userSettings = Object.assign({}, DEFAULT_SETTINGS, (stored && typeof stored === 'object') ? stored : {});
        delete userSettings.lowOddsThreshold;
        lsSet(SETTINGS_KEY, userSettings);

        const CLIENT_IP_SELECTOR = '[data-field="ClientIP"]';
        const EVENT_CELL_SELECTOR = '[data-field="BetFeedInfo.BetEvents"]';
        const ROW_SELECTOR = 'tr';
        const BET_ID_SELECTOR = '[data-field="BetId"]';
        const STATUS_SELECTOR = '[data-field="BetStatus"]';
        const BET_DATE_SELECTOR = '[data-field="CreatedDate"]';
        const SETTLEMENT_DATE_SELECTOR = '[data-field="SettlementDate"]';
        const LARGE_BET_SELECTOR = '[data-field="TotalStake"]';
        const BONUS_STAKE_SELECTOR = '[data-field="BonusStake"]';
        const SPORT_SELECTOR = '[data-field="BetFeedInfo.BetSports"]';
        const CHAMP_SELECTOR = '[data-field="BetFeedInfo.BetChamps"]';
        const SKIN_SELECTOR = '[data-field="SkinTitle"]';
        const MARKET_TYPE_SELECTOR = '[data-field="BetFeedInfo.BetMarkets"]';
        const EVENT_DATE_SELECTOR = '[data-field="BetFeedInfo.BetEventsDateString"]';
        const PRICE_SELECTOR = '[data-field="BetFeedInfo.BetPricesString"]';
        const NET_PRICE_SELECTOR = '[data-field="NetPrice"]';
        const TOTAL_ODDS_SELECTOR = '[data-field="TotalOdds"]';

        const SKIN_BADGE = { skin: 'wildwinz', label: 'WW', title: 'Проєкт Wildwinz' };

        const EVENT_HIGHLIGHT_COLORS = ['rgba(253, 255, 182, 0.7)', 'rgba(202, 255, 191, 0.7)', 'rgba(191, 234, 255, 0.7)', 'rgba(224, 187, 255, 0.7)', 'rgba(255, 214, 165, 0.7)', 'rgba(255, 173, 173, 0.7)', 'rgba(173, 255, 228, 0.7)', 'rgba(255, 219, 245, 0.7)', 'rgba(220, 220, 220, 0.7)', 'rgba(255, 242, 204, 0.7)', 'rgba(204, 255, 242, 0.7)', 'rgba(240, 220, 255, 0.7)'];

        const REAL_MONEY_SOFT_COLOR = 'rgba(255, 239, 213, 0.6)';
        const BONUS_MONEY_SOFT_COLOR = 'rgba(225, 245, 254, 0.8)';
        const IP_HIGHLIGHT_COLOR = 'rgba(255, 100, 100, 0.4)';
        const LATE_BET_COLOR = 'rgba(255, 255, 0, 0.4)';
        const LARGE_BET_COLOR = 'rgba(255, 165, 0, 0.5)';
        const BONUS_BET_COLOR = 'rgba(135, 206, 250, 0.8)';
        const PRELIVE_BET_COLOR = 'rgba(200, 150, 255, 0.15)';
        const LIMIT_BYPASS_COLOR = 'rgba(255, 152, 0, 0.25)';
        const BLACKLIST_BG_COLOR = 'rgba(244, 67, 54, 0.15)';

        const BLACKLIST_CATEGORIES = {
            '1': { name: 'Абуз бонусів', emoji: '🏴‍☠️' },
            '2': { name: 'Бонусхантери', emoji: '🎁' },
            '3': { name: 'Вилки', emoji: '⚖️' },
            '4': { name: 'Післяголи', emoji: '⏱️' },
            '5': { name: 'Договірні матчі', emoji: '🤝' },
            '6': { name: 'Треш ставки', emoji: '🗑️' }
        };

        const exactBlacklist = new Map();
        let cidrBlacklist = [];
        const playerBlacklist = new Map();
        const trashLeagueList = new Set();

        GM_addStyle(`
            #afh-ip-check-popup { position: absolute; z-index: 999999; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; padding: 5px 10px; font-size: 13px; cursor: pointer; box-shadow: 0 4px 10px rgba(0,0,0,0.5); display: none; font-family: sans-serif; }
            #afh-ip-check-popup:hover { background: #444; transform: scale(1.05); transition: 0.1s; }
            #afh-settings-btn { position: fixed; bottom: 25px; left: 25px; z-index: 999998; background: #343a40; color: white; border-radius: 50%; width: 48px; height: 48px; display: flex; justify-content: center; align-items: center; cursor: pointer; box-shadow: 0 4px 15px rgba(0,0,0,0.3); font-size: 24px; transition: all 0.3s ease; user-select: none; border: 2px solid #495057; }
            #afh-settings-btn:hover { background: #495057; transform: scale(1.1) rotate(45deg); }
            #afh-settings-panel { position: fixed; bottom: 85px; left: 25px; z-index: 999999; background: #ffffff; border: 1px solid #ced4da; border-radius: 8px; padding: 15px; box-shadow: 0 10px 25px rgba(0,0,0,0.2); font-family: sans-serif; display: none; width: 320px; max-height: 80vh; overflow-y: auto; }
            #afh-settings-panel h3 { margin: 0 0 15px 0; font-size: 16px; color: #333; text-align: center; }
            .afh-section { border: 1px solid #e0e0e0; border-radius: 6px; padding: 10px; margin-bottom: 12px; background: #fafafa; }
            .afh-setting-group { margin-bottom: 8px; margin-top: 8px; }
            .afh-setting-group label { display: block; font-size: 12px; color: #666; margin-bottom: 4px; font-weight: bold; }
            .afh-setting-group input[type="number"] { width: 100%; padding: 6px; border: 1px solid #ccc; border-radius: 4px; box-sizing: border-box; font-size: 13px; outline: none; }
            .afh-setting-group input[type="number"]:focus { border-color: #007bff; }
            .afh-checkbox-group { display: flex; align-items: center; gap: 8px; margin-bottom: 4px; }
            .afh-checkbox-group input { width: 16px; height: 16px; margin: 0; cursor: pointer; flex-shrink: 0; }
            .afh-checkbox-group label { font-size: 13px; color: #333; font-weight: bold; margin: 0; cursor: pointer; }
            .afh-btn-reset { background: #f8f9fa; border: 1px solid #ccc; color: #333; padding: 8px 10px; border-radius: 4px; cursor: pointer; width: 100%; font-size: 12px; margin-top: 5px; font-weight: bold; }
            .afh-btn-reset:hover { background: #e2e6ea; }
            .afh-btn-blacklist { background: #343a40; border: 1px solid #23272b; color: #fff; padding: 8px 10px; border-radius: 4px; cursor: pointer; width: 100%; font-size: 13px; margin-top: 10px; margin-bottom: 5px; font-weight: bold; transition: 0.2s; }
            .afh-btn-blacklist:hover { background: #23272b; }
            .afh-version { text-align: center; font-size: 11px; color: #999; margin-top: 8px; }
            .afh-prelive-icon { font-size: 12px; cursor: help; margin-right: 4px; display: inline-block; }
            .afh-limit-bypass { font-size: 16px; margin-left: 4px; cursor: help; display: inline-block; }
            .afh-visited-icon { font-size: 14px; cursor: help; margin-left: 4px; display: inline-block; filter: grayscale(100%); opacity: 0.8; }
            .afh-blacklist-icon { font-size: 16px; cursor: help; margin-left: 4px; display: inline-block; }
            .afh-player-blacklist-icon { font-size: 16px; cursor: help; margin-left: 4px; display: inline-block; }
            .afh-trash-league-icon { font-size: 18px; cursor: help; margin-left: 4px; display: inline-block; }
            .afh-skin-badge { display: inline-block; margin-left: 5px; padding: 1px 5px; border-radius: 3px; background: #6f42c1; color: #fff; font-size: 10px; font-weight: bold; font-family: sans-serif; letter-spacing: 0.5px; vertical-align: middle; cursor: help; }
        `);

        function trackProfileVisits() {
            if (!window.location.href.includes('/ManagePlayersProfile/')) return;
            const match = window.location.pathname.match(/\/ManagePlayersProfile\/[^/]+\/(\d+)/i);
            const playerId = match ? match[1] : null;
            if (!playerId) return;

            const visited = lsGet(VISITED_KEY, {}) || {};
            const now = Date.now();
            visited[playerId] = now;
            for (const key in visited) {
                if (now - visited[key] > VISITED_EXPIRATION_MS) delete visited[key];
            }
            lsSet(VISITED_KEY, visited);
        }

        function getPlayerCells(row) {
            const nameCell = row.querySelector('[data-field="PlayerName"]');
            if (!nameCell) return null;

            const internalIdMatch = nameCell.textContent.match(/\d+/);
            const internalId = internalIdMatch ? internalIdMatch[0] : null;

            let altenarId = null;
            const idCell = row.querySelector('[data-field="PlayerId"]');
            if (idCell && idCell.textContent.trim()) {
                const m = idCell.textContent.match(/\d+/);
                if (m) altenarId = m[0];
            } else {
                const link = nameCell.querySelector('a');
                if (link && link.hasAttribute('onclick')) {
                    const m = link.getAttribute('onclick').match(/(\d+)/);
                    if (m) altenarId = m[1];
                } else if (link && link.hasAttribute('href')) {
                    const m = link.getAttribute('href').match(/\/ManagePlayersProfile\/[^/]+\/(\d+)/i);
                    if (m) altenarId = m[1];
                }
            }

            return { targetCell: nameCell, internalId, altenarId };
        }

        function highlightVisitedPlayers() {
            if (!window.location.href.includes('/BetList')) return;

            document.querySelectorAll(ROW_SELECTOR).forEach(row => {
                const pData = getPlayerCells(row);
                if (pData) pData.targetCell.querySelectorAll('.afh-visited-icon').forEach(el => el.remove());
            });

            if (!userSettings.visitedProfilesEnabled) return;
            const visited = lsGet(VISITED_KEY, {}) || {};
            if (Object.keys(visited).length === 0) return;

            document.querySelectorAll(ROW_SELECTOR).forEach(row => {
                const pData = getPlayerCells(row);
                if (!pData || !pData.altenarId || !visited[pData.altenarId]) return;

                const timeDiff = Date.now() - visited[pData.altenarId];
                if (timeDiff > VISITED_EXPIRATION_MS) return;
                const hoursAgo = Math.floor(timeDiff / (1000 * 60 * 60));
                const minsAgo = Math.floor((timeDiff / (1000 * 60)) % 60);
                const timeString = hoursAgo > 0 ? `${hoursAgo} год. ${minsAgo} хв. тому` : `${minsAgo} хв. тому`;
                pData.targetCell.insertAdjacentHTML('beforeend', ` <span class="afh-visited-icon" title="Профіль вже переглядувся ${timeString}">👁️</span>`);
            });
        }

        function highlightBlacklistedPlayers() {
            document.querySelectorAll(ROW_SELECTOR).forEach(row => {
                const pData = getPlayerCells(row);
                if (!pData || !pData.internalId) return;
                pData.targetCell.querySelectorAll('.afh-player-blacklist-icon').forEach(el => el.remove());
                if (pData.targetCell.style.backgroundColor === BLACKLIST_BG_COLOR) pData.targetCell.style.backgroundColor = '';
            });

            if (!userSettings.blacklistEnabled || playerBlacklist.size === 0) return;

            document.querySelectorAll(ROW_SELECTOR).forEach(row => {
                const pData = getPlayerCells(row);
                if (!pData || !pData.internalId || !playerBlacklist.has(pData.internalId)) return;

                pData.targetCell.style.backgroundColor = BLACKLIST_BG_COLOR;
                const comment = playerBlacklist.get(pData.internalId);
                let tooltipText = 'Небажаний гравець';
                if (comment) tooltipText += ` | Коментар: ${comment}`;
                pData.targetCell.insertAdjacentHTML('beforeend', ` <span class="afh-player-blacklist-icon" title="${escapeHtml(tooltipText)}">⚠️</span>`);
            });
        }

        // Опис полів налаштувань: [ключ, id елемента, тип]. Одна таблиця замість
        // трьох паралельних списків (збереження / слухачі / скидання).
        const SETTING_FIELDS = [
            ['duplicateEventsEnabled', 'afh-val-duplicateEvents-enabled', 'bool'],
            ['duplicateIPsEnabled', 'afh-val-duplicateIPs-enabled', 'bool'],
            ['largeBetEnabled', 'afh-val-large-enabled', 'bool'],
            ['largeBetAmount', 'afh-val-large', 'num'],
            ['bonusBetEnabled', 'afh-val-bonus-enabled', 'bool'],
            ['bonusBetAmount', 'afh-val-bonus', 'num'],
            ['fastSettledEnabled', 'afh-val-fastSettled-enabled', 'bool'],
            ['fastSettledNormalSec', 'afh-val-fastSettledNormal', 'num'],
            ['fastSettledFastSec', 'afh-val-fastSettledFast', 'num'],
            ['fastSettledVeryFastSec', 'afh-val-fastSettledVeryFast', 'num'],
            ['preliveEnabled', 'afh-val-prelive-enabled', 'bool'],
            ['preliveProfileOnly', 'afh-val-prelive-profile', 'bool'],
            ['preliveHours', 'afh-val-prelive', 'num'],
            ['limitBypassEnabled', 'afh-val-limit-bypass-enabled', 'bool'],
            ['trashOddsThreshold', 'afh-val-trashodds', 'num'],
            ['targetOddsThreshold', 'afh-val-targetodds', 'num'],
            ['trashLeagueEnabled', 'afh-val-trashLeague-enabled', 'bool'],
            ['trashLeagueStakeAmount', 'afh-val-trashLeagueStake', 'num'],
            ['skinBadgeEnabled', 'afh-val-skinBadge-enabled', 'bool'],
            ['visitedProfilesEnabled', 'afh-val-visited-enabled', 'bool'],
            ['blacklistEnabled', 'afh-val-blacklist-enabled', 'bool'],
        ];

        function initUISettings() {
            if (document.getElementById('afh-settings-btn')) return;

            const chk = (id, key) => `<input type="checkbox" id="${id}" ${userSettings[key] ? 'checked' : ''}>`;
            const num = (id, key, step) => `<input type="number" ${step ? `step="${step}"` : ''} id="${id}" value="${userSettings[key]}">`;

            const btn = document.createElement('div');
            btn.id = 'afh-settings-btn';
            btn.title = 'Налаштування антифроду';
            btn.innerHTML = '⚙️';
            document.body.appendChild(btn);

            const panel = document.createElement('div');
            panel.id = 'afh-settings-panel';
            panel.innerHTML = `
                <h3>Налаштування Антифроду</h3>
                <button class="afh-btn-blacklist" id="afh-btn-blacklist">📊 Відкрити Чорний список (Таблиця)</button>

                <div class="afh-section"><div class="afh-checkbox-group">${chk('afh-val-duplicateEvents-enabled', 'duplicateEventsEnabled')}<label for="afh-val-duplicateEvents-enabled">🔁 Дублікати подій</label></div></div>

                <div class="afh-section"><div class="afh-checkbox-group">${chk('afh-val-duplicateIPs-enabled', 'duplicateIPsEnabled')}<label for="afh-val-duplicateIPs-enabled">🌐 Дублікати IP (різні гравці)</label></div></div>

                <div class="afh-section">
                    <div class="afh-checkbox-group">${chk('afh-val-large-enabled', 'largeBetEnabled')}<label for="afh-val-large-enabled">💰 Великі ставки</label></div>
                    <div class="afh-setting-group"><label>Порог (> EUR)</label>${num('afh-val-large', 'largeBetAmount')}</div>
                </div>

                <div class="afh-section">
                    <div class="afh-checkbox-group">${chk('afh-val-bonus-enabled', 'bonusBetEnabled')}<label for="afh-val-bonus-enabled">🎁 Бонусні ставки</label></div>
                    <div class="afh-setting-group"><label>Порог (> EUR)</label>${num('afh-val-bonus', 'bonusBetAmount')}</div>
                </div>

                <div class="afh-section">
                    <div class="afh-checkbox-group">${chk('afh-val-fastSettled-enabled', 'fastSettledEnabled')}<label for="afh-val-fastSettled-enabled">⏱️ Швидкий розрахунок (післяголи)</label></div>
                    <div class="afh-setting-group"><label title="Всі види спорту, крім перелічених нижче">Звичайні види (сек)</label>${num('afh-val-fastSettledNormal', 'fastSettledNormalSec')}</div>
                    <div class="afh-setting-group"><label title="E-Football, E-Basketball, E-Ice Hockey, настільний теніс (game), теніс (set game)">Швидкі види (сек)</label>${num('afh-val-fastSettledFast', 'fastSettledFastSec')}</div>
                    <div class="afh-setting-group"><label title="Теніс (point betting), E-sports + (map round)">Дуже швидкі види (сек)</label>${num('afh-val-fastSettledVeryFast', 'fastSettledVeryFastSec')}</div>
                </div>

                <div class="afh-section">
                    <div class="afh-checkbox-group">${chk('afh-val-prelive-enabled', 'preliveEnabled')}<label for="afh-val-prelive-enabled">⏳ Ранні ставки (PreLive)</label></div>
                    <div class="afh-checkbox-group">${chk('afh-val-prelive-profile', 'preliveProfileOnly')}<label for="afh-val-prelive-profile">Тільки в профілі гравця</label></div>
                    <div class="afh-setting-group"><label>Мінімум годин до матчу (>)</label>${num('afh-val-prelive', 'preliveHours')}</div>
                </div>

                <div class="afh-section">
                    <div class="afh-checkbox-group">${chk('afh-val-limit-bypass-enabled', 'limitBypassEnabled')}<label for="afh-val-limit-bypass-enabled">🥷 Обхід лімітів (двійники)</label></div>
                    <div class="afh-setting-group"><label>Сміттєвий кеф (<=)</label>${num('afh-val-trashodds', 'trashOddsThreshold', '0.01')}</div>
                    <div class="afh-setting-group"><label>Цільовий кеф (>=)</label>${num('afh-val-targetodds', 'targetOddsThreshold', '0.01')}</div>
                </div>

                <div class="afh-section">
                    <div class="afh-checkbox-group">${chk('afh-val-trashLeague-enabled', 'trashLeagueEnabled')}<label for="afh-val-trashLeague-enabled">🚩 Треш-ліги (великі ставки)</label></div>
                    <div class="afh-setting-group"><label>Поріг ставки (> EUR)</label>${num('afh-val-trashLeagueStake', 'trashLeagueStakeAmount')}</div>
                </div>

                <div class="afh-section"><div class="afh-checkbox-group">${chk('afh-val-skinBadge-enabled', 'skinBadgeEnabled')}<label for="afh-val-skinBadge-enabled">🏷️ Позначка проєкту (WW)</label></div></div>

                <div class="afh-section"><div class="afh-checkbox-group">${chk('afh-val-visited-enabled', 'visitedProfilesEnabled')}<label for="afh-val-visited-enabled">👁️ Відвідані профілі</label></div></div>

                <div class="afh-section"><div class="afh-checkbox-group">${chk('afh-val-blacklist-enabled', 'blacklistEnabled')}<label for="afh-val-blacklist-enabled">⚠️ Чорний список (IP + гравці)</label></div></div>

                <button class="afh-btn-reset" id="afh-btn-reset">Скинути до стандартних</button>
                <div class="afh-version">Betking ↔ Altenar Crosslink v${escapeHtml(currentVersion())}</div>
            `;
            document.body.appendChild(panel);

            btn.addEventListener('click', () => { panel.style.display = panel.style.display === 'block' ? 'none' : 'block'; });
            document.getElementById('afh-btn-blacklist').addEventListener('click', () => window.open(SHEET_EDIT_URL, '_blank'));

            const saveAndUpdate = () => {
                SETTING_FIELDS.forEach(([key, id, type]) => {
                    const el = document.getElementById(id);
                    userSettings[key] = type === 'bool' ? el.checked : (parseFloat(el.value) || 0);
                });
                lsSet(SETTINGS_KEY, userSettings);
                runLocalChecks();
            };

            SETTING_FIELDS.forEach(([, id, type]) => {
                document.getElementById(id).addEventListener(type === 'bool' ? 'change' : 'input', saveAndUpdate);
            });

            document.getElementById('afh-btn-reset').addEventListener('click', () => {
                SETTING_FIELDS.forEach(([key, id, type]) => {
                    const el = document.getElementById(id);
                    if (type === 'bool') el.checked = DEFAULT_SETTINGS[key];
                    else el.value = DEFAULT_SETTINGS[key];
                });
                saveAndUpdate();
            });

            document.addEventListener('click', (e) => {
                if (panel.style.display === 'block' && !panel.contains(e.target) && !btn.contains(e.target)) panel.style.display = 'none';
            });
        }

        function parseCustomDate(str) {
            try {
                const parts = str.split(' ');
                if (parts.length < 2) return null;
                const d = parts[0].split('/');
                const t = parts[1].split(':');
                return new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2] || 0);
            } catch (e) { return null; }
        }

        function isIpInCidr(ip, cidrRule) {
            const ipToLong = s => s.split('.').reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
            try {
                const [subnet, mask] = cidrRule.split('/');
                if (!mask) return false;
                const bits = parseInt(mask, 10);
                const m = bits === 0 ? 0 : (-1 << (32 - bits));
                return (ipToLong(ip) & m) === (ipToLong(subnet) & m);
            } catch (e) { return false; }
        }

        // ── ДЕТЕКЦІЯ ──
        function analyzeRowAnomalies() {
            const isProfilePage = window.location.href.includes('/ManagePlayersProfile/PlayerBetList');

            document.querySelectorAll(ROW_SELECTOR).forEach(row => {
                row.querySelectorAll('.afh-limit-bypass, .afh-prelive-icon').forEach(el => el.remove());
                if (row.style.backgroundColor === LIMIT_BYPASS_COLOR || row.style.backgroundColor === PRELIVE_BET_COLOR) {
                    row.style.backgroundColor = '';
                }

                const priceCell = row.querySelector(PRICE_SELECTOR);
                const netPriceCell = row.querySelector(NET_PRICE_SELECTOR) || row.querySelector(TOTAL_ODDS_SELECTOR) || priceCell;

                let hasTrashOdd = false;
                let hasTargetOdd = false;
                if (priceCell) {
                    const textContent = priceCell.innerHTML.replace(/<[^>]*>?/gm, ' ').replace(/,/g, '.');
                    const oddsMatches = textContent.match(/\b\d+\.\d+\b/g);
                    if (oddsMatches && oddsMatches.length >= 2) {
                        oddsMatches.forEach(oddStr => {
                            const odd = parseFloat(oddStr);
                            if (isNaN(odd)) return;
                            if (odd <= userSettings.trashOddsThreshold) hasTrashOdd = true;
                            if (odd >= userSettings.targetOddsThreshold) hasTargetOdd = true;
                        });
                    }
                }
                const isLimitBypass = userSettings.limitBypassEnabled && hasTrashOdd && hasTargetOdd;

                const betDateCell = row.querySelector(BET_DATE_SELECTOR);
                const eventDateCell = row.querySelector(EVENT_DATE_SELECTOR);
                const betIdCell = row.querySelector(BET_ID_SELECTOR);

                let isPreLive = false;
                let preliveHours = 0;
                if (userSettings.preliveEnabled && (!userSettings.preliveProfileOnly || isProfilePage) && betDateCell && eventDateCell && betIdCell) {
                    const betDate = parseCustomDate(betDateCell.textContent.trim());
                    const dateStrings = eventDateCell.textContent.match(/\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}:\d{2}/g);
                    if (betDate && dateStrings && dateStrings.length > 0) {
                        let earliestTime = Infinity;
                        for (const dStr of dateStrings) {
                            const eDate = parseCustomDate(dStr);
                            if (eDate && eDate.getTime() < earliestTime) earliestTime = eDate.getTime();
                        }
                        if (earliestTime !== Infinity) {
                            const diffHours = (earliestTime - betDate.getTime()) / (1000 * 60 * 60);
                            if (diffHours >= userSettings.preliveHours) {
                                isPreLive = true;
                                preliveHours = Math.round(diffHours);
                            }
                        }
                    }
                }

                if (isLimitBypass) {
                    if (!row.style.backgroundColor) row.style.backgroundColor = LIMIT_BYPASS_COLOR;
                    if (netPriceCell) netPriceCell.insertAdjacentHTML('beforeend', ` <span class="afh-limit-bypass" title="Обхід лімітів (двійники): кеф <= ${userSettings.trashOddsThreshold} та >= ${userSettings.targetOddsThreshold}">🥷</span>`);
                } else if (isPreLive) {
                    if (!row.style.backgroundColor) row.style.backgroundColor = PRELIVE_BET_COLOR;
                }

                if (isPreLive && betIdCell) {
                    betIdCell.insertAdjacentHTML('afterbegin', `<span class="afh-prelive-icon" title="Ставку зроблено за ${preliveHours} годин до матчу">⏳</span>`);
                }
            });
        }

        function highlightFastSettledBets() {
            document.querySelectorAll(ROW_SELECTOR).forEach(row => {
                const statusCell = row.querySelector(STATUS_SELECTOR);
                const betDateCell = row.querySelector(BET_DATE_SELECTOR);
                const settlementDateCell = row.querySelector(SETTLEMENT_DATE_SELECTOR);
                const marketTypeCell = row.querySelector(MARKET_TYPE_SELECTOR);
                const sportCell = row.querySelector(SPORT_SELECTOR);
                if (!statusCell || !betDateCell || !settlementDateCell || !marketTypeCell || !sportCell) return;

                if ([IP_HIGHLIGHT_COLOR, LIMIT_BYPASS_COLOR, PRELIVE_BET_COLOR].includes(row.style.backgroundColor)) return;
                if (row.style.backgroundColor === LATE_BET_COLOR) row.style.backgroundColor = '';
                if (!userSettings.fastSettledEnabled) return;

                const status = statusCell.textContent.trim();
                const betDateStr = betDateCell.textContent.trim();
                const settlementDateStr = settlementDateCell.textContent.trim();
                const marketType = marketTypeCell.textContent.trim();
                const sport = sportCell.textContent.trim();

                let limit = userSettings.fastSettledNormalSec * 1000;
                if (sport === 'Tennis' && marketType.includes('point betting')) limit = userSettings.fastSettledVeryFastSec * 1000;
                else if (sport === 'E-sports +' && marketType.includes('map round')) limit = userSettings.fastSettledVeryFastSec * 1000;
                else if (['E-Football', 'E-Basketball', 'E-Ice Hockey'].includes(sport)) limit = userSettings.fastSettledFastSec * 1000;
                else if (sport === 'Table Tennis' && marketType.includes('game -')) limit = userSettings.fastSettledFastSec * 1000;
                else if (sport === 'Tennis' && marketType.includes('set game')) limit = userSettings.fastSettledFastSec * 1000;

                if (status === 'Win' && betDateStr && settlementDateStr) {
                    const betDate = parseCustomDate(betDateStr);
                    const settlementDate = parseCustomDate(settlementDateStr);
                    if (betDate && settlementDate) {
                        const diffMs = settlementDate.getTime() - betDate.getTime();
                        if (diffMs > 0 && diffMs < limit) row.style.backgroundColor = LATE_BET_COLOR;
                    }
                }
            });
        }

        function highlightRealMoneyBets() {
            const isProfilePage = window.location.href.includes('/ManagePlayersProfile/PlayerBetList');
            document.querySelectorAll(LARGE_BET_SELECTOR).forEach(cell => {
                cell.style.backgroundColor = ''; cell.style.color = '';
                if (!userSettings.largeBetEnabled) return;
                const amt = parseFloat(cell.textContent.replace(/[^0-9.]/g, ''));
                if (!isNaN(amt) && amt > userSettings.largeBetAmount) { cell.style.backgroundColor = LARGE_BET_COLOR; cell.style.color = '#000'; }
                else if (!isNaN(amt) && isProfilePage && amt > 0) { cell.style.backgroundColor = REAL_MONEY_SOFT_COLOR; cell.style.color = '#000'; }
            });
        }

        function highlightBonusBets() {
            const isProfilePage = window.location.href.includes('/ManagePlayersProfile/PlayerBetList');
            document.querySelectorAll(BONUS_STAKE_SELECTOR).forEach(cell => {
                cell.style.backgroundColor = ''; cell.style.color = '';
                if (!userSettings.bonusBetEnabled) return;
                const amt = parseFloat(cell.textContent.replace(/[^0-9.]/g, ''));
                if (!isNaN(amt) && amt >= userSettings.bonusBetAmount) { cell.style.backgroundColor = BONUS_BET_COLOR; cell.style.color = '#000'; }
                else if (!isNaN(amt) && isProfilePage && amt > 0) { cell.style.backgroundColor = BONUS_MONEY_SOFT_COLOR; cell.style.color = '#000'; }
            });
        }

        function highlightDuplicateEvents() {
            const eventCells = document.querySelectorAll(EVENT_CELL_SELECTOR);
            if (eventCells.length === 0) return;
            eventCells.forEach(cell => {
                if (![LARGE_BET_COLOR, BONUS_BET_COLOR, PRELIVE_BET_COLOR, LIMIT_BYPASS_COLOR, LATE_BET_COLOR].includes(cell.style.backgroundColor)) {
                    cell.style.backgroundColor = ''; cell.style.color = '';
                }
            });
            if (!userSettings.duplicateEventsEnabled) return;

            const seenEvents = new Map();
            eventCells.forEach(cell => {
                const text = cell.textContent.trim();
                if (!text) return;
                if (!seenEvents.has(text)) seenEvents.set(text, []);
                seenEvents.get(text).push(cell);
            });
            let colorIndex = 0;
            seenEvents.forEach(cells => {
                if (cells.length < 2) return;
                const color = EVENT_HIGHLIGHT_COLORS[colorIndex % EVENT_HIGHLIGHT_COLORS.length];
                cells.forEach(cell => { cell.style.backgroundColor = color; cell.style.color = '#000'; });
                colorIndex++;
            });
        }

        function highlightBlacklistedIPs() {
            document.querySelectorAll(CLIENT_IP_SELECTOR).forEach(cell => {
                if (cell.style.backgroundColor === BLACKLIST_BG_COLOR) cell.style.backgroundColor = '';
                cell.querySelectorAll('.afh-blacklist-icon').forEach(el => el.remove());
            });

            if (!userSettings.blacklistEnabled) return;
            if (exactBlacklist.size === 0 && cidrBlacklist.length === 0) return;

            document.querySelectorAll(CLIENT_IP_SELECTOR).forEach(cell => {
                const ip = cell.textContent.trim();
                if (!ip) return;

                let matchData = exactBlacklist.get(ip);
                if (!matchData) matchData = cidrBlacklist.find(c => isIpInCidr(ip, c.rule));

                if (matchData && BLACKLIST_CATEGORIES[matchData.cat]) {
                    cell.style.backgroundColor = BLACKLIST_BG_COLOR;
                    const catInfo = BLACKLIST_CATEGORIES[matchData.cat];
                    let tooltipText = catInfo.name;
                    if (matchData.comment) tooltipText += ` | Коментар: ${matchData.comment}`;
                    cell.insertAdjacentHTML('beforeend', ` <span class="afh-blacklist-icon" title="${escapeHtml(tooltipText)}">${catInfo.emoji}</span>`);
                }
            });
        }

        function markSkinBets() {
            document.querySelectorAll(ROW_SELECTOR).forEach(row => {
                const pData = getPlayerCells(row);
                if (pData) pData.targetCell.querySelectorAll('.afh-skin-badge').forEach(el => el.remove());
            });
            if (!userSettings.skinBadgeEnabled) return;

            document.querySelectorAll(ROW_SELECTOR).forEach(row => {
                const skinCell = row.querySelector(SKIN_SELECTOR);
                if (!skinCell || skinCell.textContent.trim().toLowerCase() !== SKIN_BADGE.skin) return;
                const pData = getPlayerCells(row);
                if (!pData) return;
                pData.targetCell.insertAdjacentHTML('beforeend', ` <span class="afh-skin-badge" title="${SKIN_BADGE.title}">${SKIN_BADGE.label}</span>`);
            });
        }

        function isTrashLeagueMatch(champName) {
            const lower = champName.toLowerCase();
            for (const keyword of trashLeagueList) {
                if (lower.includes(keyword)) return true;
            }
            return false;
        }

        function highlightTrashLeagueBets() {
            document.querySelectorAll(CHAMP_SELECTOR).forEach(cell => {
                cell.querySelectorAll('.afh-trash-league-icon').forEach(el => el.remove());
            });
            if (!userSettings.trashLeagueEnabled || trashLeagueList.size === 0) return;

            document.querySelectorAll(ROW_SELECTOR).forEach(row => {
                const champCell = row.querySelector(CHAMP_SELECTOR);
                const stakeCell = row.querySelector(LARGE_BET_SELECTOR);
                if (!champCell || !stakeCell) return;

                const stake = parseFloat(stakeCell.textContent.replace(/[^0-9.]/g, ''));
                if (isNaN(stake) || stake <= userSettings.trashLeagueStakeAmount) return;

                const champNames = champCell.textContent.split('\n').map(s => s.trim()).filter(Boolean);
                const matched = champNames.find(name => isTrashLeagueMatch(name));
                if (matched) {
                    champCell.insertAdjacentHTML('beforeend', ` <span class="afh-trash-league-icon" title="Треш-ліга «${escapeHtml(matched)}» + ставка > ${userSettings.trashLeagueStakeAmount} EUR">🚩</span>`);
                }
            });
        }

        function highlightDuplicateIPs() {
            const rows = document.querySelectorAll(ROW_SELECTOR);
            rows.forEach(r => { if (r.style.backgroundColor === IP_HIGHLIGHT_COLOR) r.style.backgroundColor = ''; });
            if (!userSettings.duplicateIPsEnabled) return;

            const ipMap = new Map();
            rows.forEach(row => {
                const pData = getPlayerCells(row);
                const ipCell = row.querySelector(CLIENT_IP_SELECTOR);
                const ip = ipCell ? ipCell.textContent.trim() : '';
                if (!pData || !pData.internalId || !ip) return;
                if (!ipMap.has(ip)) ipMap.set(ip, { players: new Set(), rows: [] });
                ipMap.get(ip).players.add(pData.internalId);
                ipMap.get(ip).rows.push(row);
            });
            ipMap.forEach(data => {
                if (data.players.size > 1) data.rows.forEach(r => { if (!r.style.backgroundColor) r.style.backgroundColor = IP_HIGHLIGHT_COLOR; });
            });
        }

        // ── CSV (Google Sheets) ──
        const CSV_SPLIT = /,(?=(?:(?:[^"]*"){2})*[^"]*$)/;
        function csvRows(text) {
            return text.split(/\r?\n/).filter(Boolean).map(row =>
                (row.indexOf(';') > -1 ? row.split(';') : row.split(CSV_SPLIT)).map(c => c.replace(/['"]+/g, '').trim())
            );
        }

        function parseIPCSV(text) {
            exactBlacklist.clear(); cidrBlacklist = [];
            try {
                csvRows(text).slice(1).forEach(([ipStr = '', category = '', comment = '']) => {
                    if (!ipStr || !category) return;
                    if (ipStr.includes('/')) cidrBlacklist.push({ rule: ipStr, cat: category, comment });
                    else exactBlacklist.set(ipStr, { cat: category, comment });
                });
            } catch (e) { console.error('[afh] IP CSV Error:', e); }
        }

        function parsePlayerCSV(text) {
            playerBlacklist.clear();
            try {
                csvRows(text).forEach(([playerId = '', comment = '']) => {
                    if (/^\d+$/.test(playerId)) playerBlacklist.set(playerId, comment);
                });
            } catch (e) { console.error('[afh] Player CSV Error:', e); }
        }

        function parseTrashLeagueCSV(text) {
            trashLeagueList.clear();
            try {
                csvRows(text).forEach(([keyword = '']) => { if (keyword) trashLeagueList.add(keyword.toLowerCase()); });
            } catch (e) { console.error('[afh] Trash League CSV Error:', e); }
        }

        function fetchCsv(url, onText) {
            GM_xmlhttpRequest({
                method: 'GET',
                url: url + '&timestamp=' + Date.now(),
                timeout: 20000,
                onload(res) {
                    if (res.status === 200) onText(res.responseText);
                    else console.warn('[afh] CSV HTTP', res.status, url);
                    runLocalChecksSoon();
                },
                onerror(e) { console.warn('[afh] CSV мережа', e); },
                ontimeout() { console.warn('[afh] CSV таймаут', url); }
            });
        }

        function fetchBlacklists() {
            fetchCsv(IP_SHEET_URL, parseIPCSV);
            fetchCsv(PLAYER_SHEET_URL, parsePlayerCSV);
        }

        function fetchTrashLeagues() {
            fetchCsv(TRASH_LEAGUE_SHEET_URL, parseTrashLeagueCSV);
        }

        function initTextSelectionChecker() {
            if (document.getElementById('afh-ip-check-popup')) return;
            const checkButton = document.createElement('div');
            checkButton.id = 'afh-ip-check-popup';
            checkButton.innerHTML = '🔍 Check IP';
            document.body.appendChild(checkButton);
            let selectedIP = '';
            document.addEventListener('mouseup', function (e) {
                if (e.target.closest && e.target.closest('#afh-settings-panel')) return;
                const selection = window.getSelection().toString().trim();
                if (selection && /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(selection)) {
                    selectedIP = selection;
                    checkButton.style.display = 'block';
                    checkButton.style.left = (e.pageX + 10) + 'px';
                    checkButton.style.top = (e.pageY + 10) + 'px';
                } else if (e.target !== checkButton) {
                    checkButton.style.display = 'none';
                    selectedIP = '';
                }
            });
            checkButton.addEventListener('click', function () {
                if (!selectedIP) return;
                window.open(IP_CHECKER_URL + selectedIP, '_blank');
                checkButton.style.display = 'none';
                selectedIP = '';
            });
        }

        function runLocalChecks() {
            trackProfileVisits();
            highlightDuplicateEvents();
            analyzeRowAnomalies();
            highlightFastSettledBets();
            highlightRealMoneyBets();
            highlightBonusBets();
            highlightVisitedPlayers();
            highlightBlacklistedIPs();
            highlightBlacklistedPlayers();
            highlightDuplicateIPs();
            highlightTrashLeagueBets();
            markSkinBets();
        }

        // Дві CSV + треш-ліги приходять майже одночасно — не перераховуємо тричі.
        const runLocalChecksSoon = debounce(runLocalChecks, 300);

        function init() {
            // Реагуємо лише на появу нових рядків таблиць. Власні значки — це SPAN-и,
            // тож самі себе вони не перезапускають.
            let timeoutId;
            new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        if (node.nodeType === 1 && (node.tagName === 'TR' || node.tagName === 'TBODY' || node.tagName === 'TABLE' || node.querySelector('tr'))) {
                            clearTimeout(timeoutId);
                            timeoutId = setTimeout(runLocalChecks, 600);
                            return;
                        }
                    }
                }
            }).observe(document.body, { childList: true, subtree: true });

            trackProfileVisits();
            initUISettings();
            initTextSelectionChecker();
            fetchBlacklists();
            fetchTrashLeagues();
            setInterval(fetchBlacklists, BLACKLIST_UPDATE_INTERVAL);
            setInterval(fetchTrashLeagues, BLACKLIST_UPDATE_INTERVAL);
            setTimeout(runLocalChecks, 800);
        }

        return { init };
    })();

    // ═════════════════════════════════════════════════════════════
    // 6. ЗАПУСК
    // ═════════════════════════════════════════════════════════════
    const LEGACY_CHECK_DELAY = 1200;

    function startModule(kind, mod) {
        setTimeout(() => {
            if (detectLegacy(kind)) { warnLegacy(kind); return; }
            try { mod.init(); } catch (e) { console.error(`[xlink] модуль ${kind} впав:`, e); }
            // Старий скрипт міг стартувати пізніше — тоді хоча б попередимо.
            setTimeout(() => { if (detectLegacy(kind)) warnLegacy(kind); }, 4000);
        }, LEGACY_CHECK_DELAY);
    }

    function main() {
        try { Crosslink.init(); } catch (e) { console.error('[xlink] Crosslink впав:', e); }

        if (IS_BETKING_ADMIN) startModule('betking', BetkingFraud);
        if (IS_ALTENAR && !isAltenarLoginPage()) startModule('altenar', AltenarFraud);

        // Банер оновлення — лише там, де працює антифрод-команда, і не в службовій
        // вкладці автопошуку Altenar (вона закривається сама).
        if ((IS_BETKING_ADMIN || IS_ALTENAR) && !window.location.hash.includes('extId=') && !isAltenarLoginPage()) {
            try { checkForUpdates(); } catch (e) { console.error('[xlink] update check впав:', e); }
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main);
    else main();
})();
