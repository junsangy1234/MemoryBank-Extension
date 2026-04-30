console.log("🚀 AI Memory Bank Loaded");

// =========================================================
// 1. 스타일 주입
// =========================================================
const style = document.createElement('style');
style.textContent = `
    @keyframes mb-spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
    @keyframes float-up-fade { 0% { opacity: 1; transform: translate(-50%, 0); } 100% { opacity: 0; transform: translate(-50%, -40px); } }

    .mb-busy-ring { position: absolute; top: -4px; left: -4px; right: -4px; bottom: -4px; border: 4px solid transparent; border-top-color: #3b82f6; border-right-color: #3b82f6; border-radius: 50%; animation: mb-spin 1s linear infinite; pointer-events: none; display: none; }
    .mb-busy-mode .mb-busy-ring { display: block; }
    .mb-busy-mode { transform: scale(1) !important; background-color: #9ca3af !important; }

    #mb-fullscan-lockdown { position: fixed; top: 0; left: 0; width: 100vw; height: 100vh; background-color: rgba(0,0,0,0.85); z-index: 2147483647; display: flex; flex-direction: column; justify-content: center; align-items: center; backdrop-filter: blur(8px); color: white; text-align: center; }

    .mb-slash-mode { color: #3b82f6 !important; font-weight: bold !important; transition: color 0.3s ease; }
    .mb-input-blocker { position: absolute; background-color: rgba(255,255,255,0.9); display: flex; justify-content: center; align-items: center; z-index: 2147483647; font-size: 14px; font-weight: bold; color: #3b82f6; backdrop-filter: blur(4px); border-radius: 8px; box-shadow: 0 4px 15px rgba(0,0,0,0.1); cursor: not-allowed; }

    /* ===== Smart Compass Styles ===== */
    #mb-bookmark-compass {
        transition: border-color 0.3s ease, color 0.3s ease, box-shadow 0.3s ease, transform 0.3s ease, opacity 0.3s ease;
    }
    .mb-compass-icon {
        display: flex;
        justify-content: center;
        align-items: center;
        width: 32px;
        height: 32px;
        color: inherit;
        transition: transform 0.3s ease;
    }
    .mb-compass-icon svg { display: block; }
    .mb-compass-spin .mb-compass-icon { animation: mb-spin 1.4s linear infinite; }
    .mb-compass-found {
        border-color: #10b981 !important;
        color: #10b981 !important;
        box-shadow: 0 0 14px rgba(16, 185, 129, 0.55) !important;
        opacity: 1 !important;
    }
    .mb-compass-error {
        border-color: #ef4444 !important;
        color: #ef4444 !important;
        box-shadow: 0 0 14px rgba(239, 68, 68, 0.55) !important;
        opacity: 1 !important;
    }
    #mb-bookmark-compass { position: fixed; }
    #mb-bookmark-compass::after {
        content: attr(data-tooltip);
        position: absolute;
        right: calc(100% + 10px);
        top: 50%;
        transform: translateY(-50%);
        background: #111827;
        color: #fff;
        font-size: 12px;
        font-weight: 600;
        padding: 6px 10px;
        border-radius: 6px;
        white-space: nowrap;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.15s ease;   /* ← 여기서 속도 조절 */
    }
    #mb-bookmark-compass:hover::after { opacity: 1; }

`;
document.head.appendChild(style);

// =========================================================
// 2. 상수 및 전역 상태
// =========================================================
const CREDIT_COST = { SEARCH: 1, SYNC: 2, SAVE: 3 };
const API_BASE = "https://aimemorybank.cloud/api";

const siteConfig = {
    "chatgpt.com": 'article[data-testid^="conversation-turn"], [data-message-author-role]',
    "gemini.google.com": 'user-query, model-response',
    "claude.ai": '.font-user-message, .font-claude-message, [data-testid="user-message"], [data-testid="assistant-message"]',
    "grok.com": '.message-row, [data-testid="message-content"], .prose',
    "chat.deepseek.com": '.ds-markdown, .text-message',
    "perplexity.ai": '.prose, [dir="auto"]',
    "poe.com": '[class*="Message_botMessage"], [class*="Message_humanMessage"]'
};

// 나침반 SVG (위쪽 방향 - 저장점이 위에 있음)
const COMPASS_SVG_UP = `
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="16" cy="16" r="13" fill="#ffffff" stroke="currentColor" stroke-width="2"/>
    <path d="M16 5 L20.5 16 L16 13.2 L11.5 16 Z" fill="currentColor"/>
    <path d="M16 27 L20.5 16 L16 18.8 L11.5 16 Z" fill="currentColor" opacity="0.22"/>
    <circle cx="16" cy="16" r="1.8" fill="currentColor"/>
</svg>`;

// 나침반 SVG (아래쪽 방향 - 저장점이 아래에 있음)
const COMPASS_SVG_DOWN = `
<svg width="32" height="32" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
    <circle cx="16" cy="16" r="13" fill="#ffffff" stroke="currentColor" stroke-width="2"/>
    <path d="M16 27 L20.5 16 L16 18.8 L11.5 16 Z" fill="currentColor"/>
    <path d="M16 5 L20.5 16 L16 13.2 L11.5 16 Z" fill="currentColor" opacity="0.22"/>
    <circle cx="16" cy="16" r="1.8" fill="currentColor"/>
</svg>`;

chrome.storage.local.set({ isSavingInProgress: false });
window.mbIsBusy = false;
window.mbCompassLocked = false;
window.addEventListener('beforeunload', () => {
    if (window.mbIsBusy) chrome.storage.local.set({ isSavingInProgress: false });
});

// =========================================================
// 3. 유틸리티 함수
// =========================================================
function calculateFullScanCredits(textLength) {
    return Math.max(1, Math.ceil(textLength / 10000));
}

function getCleanedText(element) {
    if (!element) return "";
    return element.innerText.trim()
        .replace(/말씀하신 내용\n*/g, '')
        .replace(/^말씀하신 내용$/gm, '')
        .replace(/\n복사하기\n/g, '')
        .replace(/\n공유하기\n/g, '');
}

function normalizeForMatch(text) {
    return text ? text.replace(/[^가-힣a-zA-Z0-9]/g, '') : "";
}

function isSystemPrompt(text) {
    if (!text) return false;
    const clean = text.trim();
    return clean.startsWith("Memory Bank\n[System Instruction:") ||
        clean.startsWith("[System Instruction: Memorize the following");
}

function getCurrentPlatform() {
    const hostname = window.location.hostname;
    return Object.keys(siteConfig).find(d => hostname.includes(d)) || null;
}

function getFlagKey(auth) {
    const hostname = window.location.hostname;
    const cleanPath = window.location.pathname.split('/').filter(Boolean).join('_');
    const safeEmail = auth.userEmail?.replace(/[^a-zA-Z0-9]/g, "") ?? "guest";
    return `mb_flag_v3_${safeEmail}_${auth.workspaceId}_${hostname}_${cleanPath}`;
}

function getAuthInfo() {
    return new Promise(resolve => {
        chrome.storage.local.get(['memoryBankApiKey', 'currentWorkspaceId', 'userEmail', 'userRole', 'hasStarterPack'], result => {
            resolve({
                apiKey: result.memoryBankApiKey,
                workspaceId: result.currentWorkspaceId,
                userEmail: result.userEmail,
                userRole: result.userRole || 'FREE',
                hasStarterPack: result.hasStarterPack || false
            });
        });
    });
}

function showLoginPrompt() {
    alert("Please open the Memory Bank extension popup to log in first!");
}

function showPaywallModal(actionType) {
    const msg = `⚡ All charged credits have been exhausted! (Action: ${actionType})\n\nNeed more? Upgrade to the LITE plan and get 100 credits daily!\n\nClick [OK] to securely proceed to the checkout page.`;

    if (confirm(msg)) {
        getAuthInfo().then(auth => {
            if (auth.userEmail) {
                const checkoutUrl = `https://memory-bank.lemonsqueezy.com/checkout/buy/48419913-7c97-4859-b3b6-50438e33db61?checkout[custom][user_email]=${encodeURIComponent(auth.userEmail)}&checkout[email]=${encodeURIComponent(auth.userEmail)}`;
                window.open(checkoutUrl, '_blank');
            } else {
                alert("Please open the extension popup to log in first!");
            }
        });
    }
}

function insertTextAndTrigger(target, text) {
    target.focus();

    if (target.isContentEditable) {
        document.execCommand('selectAll', false, null);
        const htmlText = text.replace(/\r?\n/g, '<br>');
        document.execCommand('insertHTML', false, htmlText);

        target.dispatchEvent(new Event('input', { bubbles: true }));
    } else {
        const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set;
        if (nativeSetter) {
            nativeSetter.call(target, text);
        } else {
            target.value = text;
        }
        target.dispatchEvent(new Event('input', { bubbles: true }));
        target.dispatchEvent(new Event('change', { bubbles: true }));
    }

    setTimeout(() => {
        const sendBtn = document.querySelector('button[data-testid="send-button"], button[aria-label*="Send"], button[title*="Send"], .send-button');

        if (sendBtn && !sendBtn.disabled) {
            sendBtn.click();
        } else {
            target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', which: 13, keyCode: 13, bubbles: true }));
        }
    }, 200);
}

// =========================================================
// 4. 크레딧 관련
// =========================================================
function deductLocalCredit(auth, cost, actionName) {
    chrome.storage.local.get(['dailyCredits', 'activityHistory'], (data) => {
        const c = data.dailyCredits ?? 0;
        let newCredit;

        if (c < cost) {
            const maxMap = { PREMIUM: 1000, PRO: 300, LITE: 100 };
            const max = maxMap[auth.userRole] ?? 10;
            newCredit = max - cost;
        } else {
            newCredit = c - cost;
        }

        const history = data.activityHistory || [];
        const now = new Date();
        const timeString = `${now.getMonth()+1}/${now.getDate()} ${now.getHours().toString().padStart(2,'0')}:${now.getMinutes().toString().padStart(2,'0')}`;

        history.unshift({ action: actionName, cost: cost, time: timeString });
        if (history.length > 20) history.pop();

        chrome.storage.local.set({
            dailyCredits: Math.max(0, newCredit),
            activityHistory: history
        });
    });
}

function showTokenDeduction(element, cost) {
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const floating = document.createElement('div');
    floating.textContent = `-${cost} ⚡`;
    Object.assign(floating.style, {
        position: 'fixed', left: `${rect.left + rect.width / 2}px`, top: `${rect.top}px`,
        color: '#f59e0b', fontWeight: '900', fontSize: '18px', zIndex: '2147483647',
        pointerEvents: 'none', animation: 'float-up-fade 1s ease-out forwards', textShadow: '0px 2px 4px rgba(0,0,0,0.2)', transform: 'translateX(-50%)'
    });
    document.body.appendChild(floating);
    setTimeout(() => floating.remove(), 1100);
}

// =========================================================
// 5. UI 헬퍼: 락다운 오버레이
// =========================================================
function getOrCreateEl(id, tag = 'div') {
    return document.getElementById(id) || (() => {
        const el = document.createElement(tag);
        el.id = id;
        document.body.appendChild(el);
        return el;
    })();
}

function showFullScanLockdown(textLength) {
    const overlay = getOrCreateEl('mb-fullscan-lockdown');
    overlay.innerHTML = `
        <div style="font-size:60px;animation:mb-spin 2s linear infinite;margin-bottom:20px;">⏳</div>
        <h2 style="margin:0 0 10px 0; font-family: sans-serif;">Scanning Full Conversation...</h2>
        <p style="font-size:16px;font-weight:bold;color:#60a5fa; font-family: sans-serif;">Please do not close the window or scroll during data loading.</p>
        <p style="margin-top:10px;color:#9ca3af; font-family: sans-serif;">Collected characters: ${textLength.toLocaleString()} chars</p>
    `;
}

function hideFullScanLockdown() {
    document.getElementById('mb-fullscan-lockdown')?.remove();
}

// =========================================================
// 6. 전체 저장 모달
// =========================================================
function showFullScanConfirmModal(scanData, auth, unifiedFlagKey, unlockCallback) {
    const overlay = document.createElement('div');
    Object.assign(overlay.style, {
        position: 'fixed', top: '0', left: '0', width: '100vw', height: '100vh',
        backgroundColor: 'rgba(0,0,0,0.6)', zIndex: '2147483647',
        display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    const box = document.createElement('div');
    Object.assign(box.style, {
        backgroundColor: '#ffffff', padding: '32px', borderRadius: '16px',
        textAlign: 'center', width: '360px', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.1), 0 10px 10px -5px rgba(0,0,0,0.04)'
    });

    box.innerHTML = `
        <div style="font-size:48px;margin-bottom:12px;">📋</div>
        <h3 style="margin:0 0 16px 0; color:#111827; font-size: 20px; font-weight: 700;">Scan Complete!</h3>
        <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;padding:16px;margin-bottom:24px;text-align:left;font-size:14px;color:#374151;">
            <div style="display:flex;justify-content:space-between;margin-bottom:10px;">
                <span style="color:#6b7280;font-weight:600;">Collected Text:</span>
                <strong style="color:#111827;">${scanData.textLength.toLocaleString()} chars</strong>
            </div>
            <div style="display:flex;justify-content:space-between;">
                <span style="color:#6b7280;font-weight:600;">Estimated Credits:</span>
                <strong style="color:#2563eb;font-size:15px;">${scanData.estimatedCredits} ⚡</strong>
            </div>
        </div>
        <p style="color:#9ca3af;font-size:12px;margin-bottom:24px;line-height:1.4;">Upon confirmation, progress will be shown in the center,<br>and it will be safely saved in the background.</p>
        <div style="display:flex;gap:12px;">
            <button id="mb-scan-cancel" style="flex:1;background:#f3f4f6;color:#374151;border:none;padding:14px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;transition:background 0.2s;">Cancel</button>
            <button id="mb-scan-confirm" style="flex:1;background:#3b82f6;color:white;border:none;padding:14px;border-radius:10px;font-weight:600;font-size:14px;cursor:pointer;box-shadow:0 4px 6px -1px rgba(59,130,246,0.3);transition:background 0.2s;">Confirm Save</button>
        </div>
    `;
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    document.getElementById('mb-scan-cancel').onmouseover = function(){this.style.background='#e5e7eb';};
    document.getElementById('mb-scan-cancel').onmouseout = function(){this.style.background='#f3f4f6';};
    document.getElementById('mb-scan-confirm').onmouseover = function(){this.style.background='#2563eb';};
    document.getElementById('mb-scan-confirm').onmouseout = function(){this.style.background='#3b82f6';};

    document.getElementById('mb-scan-cancel').onclick = () => { overlay.remove(); unlockCallback(); };

    document.getElementById('mb-scan-confirm').onclick = async () => {
        const confirmBtn = document.getElementById('mb-scan-confirm');
        confirmBtn.textContent = "⏳ Submitting to server...";
        confirmBtn.disabled = true;

        try {
            const initRes = await fetch(`${API_BASE}/memories/full-save/init`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-API-KEY": auth.apiKey },
                body: JSON.stringify({
                    workspaceId: auth.workspaceId,
                    rawContent: scanData.rawText,
                    estimatedTokens: scanData.estimatedCredits,
                    estimatedCredits: scanData.estimatedCredits
                })
            });

            if (initRes.status === 402) {
                overlay.remove(); showPaywallModal(`Full Scan(${scanData.estimatedCredits}⚡)`); unlockCallback(); return;
            }
            if (!initRes.ok) throw new Error("Submission Failed");

            deductLocalCredit(auth, scanData.estimatedCredits, "🚀 Full Scan");

            const responseText = await initRes.text();
            const match = responseText.match(/ID: (\d+)/);
            if (!match) throw new Error("Failed to parse Job ID");

            const jobId = match[1];

            chrome.storage.local.set({
                activeMbJob: { jobId, flagKey: unifiedFlagKey, newFlag: scanData.newFlag, estimatedCredits: scanData.estimatedCredits, startTime: Date.now() }
            });

            overlay.remove();
            unlockCallback();

            alert("🚀 Bulk save started!\n\nYou can continue working on this page. Check the progress in the extension popup (🧠).");

            startJobPolling(jobId, auth, scanData.estimatedCredits, unifiedFlagKey, scanData.newFlag);

        } catch (error) {
            alert("🚨 Error occurred: " + error.message);
            overlay.remove(); unlockCallback();
        }
    };
}

// =========================================================
// 7. 폴링: 백그라운드 태스크
// =========================================================
function startJobPolling(jobId, auth, estimatedCredits, flagKey, newFlag) {
    const pollInterval = setInterval(async () => {
        try {
            const res = await fetch(`${API_BASE}/memories/full-save/${jobId}/status`, {
                headers: { "X-API-KEY": auth.apiKey }
            });
            if (!res.ok) return;

            const data = await res.json();

            if (data.status === "COMPLETED") {
                clearInterval(pollInterval);

                localStorage.setItem(flagKey, newFlag);
                chrome.storage.local.remove(['activeMbJob']);

                alert("✅ Full conversation background save successfully completed!");
            } else if (data.status === "FAILED") {
                clearInterval(pollInterval);
                chrome.storage.local.remove(['activeMbJob']);
                alert("🚨 Server error occurred during background save.");
            }
        } catch {
        }
    }, 2000);
}

// =========================================================
// 8. 플로팅 메뉴 (FAB) 모던 테마
// =========================================================
function injectFloatingMenu() {
    if (document.getElementById('memory-bank-fab-container')) return;

    const fabContainer = document.createElement('div');
    fabContainer.id = 'memory-bank-fab-container';
    const isGrok = window.location.hostname.includes('grok.com');
    Object.assign(fabContainer.style, {
        position: 'fixed', bottom: isGrok ? '30px' : '20px', right: isGrok ? '80px' : '20px', zIndex: '2147483640',
        // [FIX] alignItems 'center' → 'flex-end' 로 변경하여 서브 버튼이 펼쳐질 때
        // 메인 아이콘 위치가 흔들리지 않도록 우측 기준으로 고정
        display: 'flex', flexDirection: 'column-reverse', alignItems: 'flex-end', gap: '10px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    const mainBtn = document.createElement('button');
    mainBtn.innerHTML = `
        <svg width="28" height="28" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
          <rect x="0" y="0" width="16" height="16" rx="3" fill="#ffffff"></rect>
          <circle cx="6.5" cy="6.5" r="4" stroke="#3b82f6" stroke-width="2" fill="none"></circle>
          <line x1="9.5" y1="9.5" x2="14" y2="14" stroke="#3b82f6" stroke-width="2" stroke-linecap="round"></line>
        </svg>
    `;
    mainBtn.id = 'mb-main-fab';
    Object.assign(mainBtn.style, {
        position: 'relative', width: '56px', height: '56px', borderRadius: '50%',
        backgroundColor: '#3b82f6', color: 'white', border: 'none', fontSize: '24px',
        cursor: 'pointer', boxShadow: '0 4px 10px rgba(59, 130, 246, 0.3)', transition: 'transform 0.3s ease',
        display: 'flex', justifyContent: 'center', alignItems: 'center',
        // [FIX] 서브 버튼들이 좌측으로 펼쳐져도 메인 버튼은 우측 끝에 고정
        flexShrink: '0', alignSelf: 'flex-end'
    });

    const spinnerRing = document.createElement('div');
    spinnerRing.className = 'mb-busy-ring';
    mainBtn.appendChild(spinnerRing);

    const setupSubButton = (btn, text, costStr) => {
        btn.innerHTML = `<span class="mb-btn-text">${text}</span> <span class="mb-btn-cost" style="color:#3b82f6;font-size:11px;opacity:0;max-width:0;overflow:hidden;transition:all 0.3s ease;white-space:nowrap;">(-${costStr})</span>`;
        Object.assign(btn.style, {
            padding: '12px 18px', backgroundColor: '#ffffff', color: '#111827',
            border: '1px solid #e5e7eb', borderRadius: '30px', fontSize: '13px', fontWeight: '600',
            cursor: 'pointer', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)', transition: 'all 0.2s ease-in-out',
            opacity: '0', transform: 'translateY(20px)', pointerEvents: 'none',
            display: 'flex', alignItems: 'center',
            // [FIX] 서브 버튼도 우측 정렬 명시 (안정성 강화)
            alignSelf: 'flex-end', flexShrink: '0'
        });

        const showCost = (show) => {
            const c = btn.querySelector('.mb-btn-cost');
            if (!c) return;
            c.style.opacity = show ? '1' : '0';
            c.style.maxWidth = show ? '60px' : '0px';
            c.style.marginLeft = show ? '6px' : '0px';
        };
        btn.onmouseenter = () => showCost(true);
        btn.onmouseleave = () => showCost(false);
    };

    const saveBtn = document.createElement('button'); setupSubButton(saveBtn, '💾 Save Snippet', `${CREDIT_COST.SAVE}⚡`);
    const loadBtn = document.createElement('button'); setupSubButton(loadBtn, '📥 Sync Memory', `${CREDIT_COST.SYNC}⚡`);
    const scanBtn = document.createElement('button'); setupSubButton(scanBtn, '🚀 Full Scan', `1⚡/10k chars`);

    const subBtns = [saveBtn, loadBtn, scanBtn];

    const setBusyState = (isBusy) => {
        window.mbIsBusy = isBusy;
        chrome.storage.local.set({ isSavingInProgress: isBusy });
        if (isBusy) {
            mainBtn.classList.add('mb-busy-mode');
            subBtns.forEach(b => { b.style.opacity = '0'; b.style.pointerEvents = 'none'; });
        } else {
            mainBtn.classList.remove('mb-busy-mode');
        }
    };

    fabContainer.onmouseenter = () => {
        if (window.mbIsBusy) return;
        mainBtn.style.transform = 'scale(1.1)';
        subBtns.forEach((btn, i) => {
            btn.style.opacity = '1';
            btn.style.transform = 'translateY(0) scale(1)';
            btn.style.pointerEvents = 'auto';
            btn.style.transitionDelay = `${i * 0.05}s`;
        });

        getAuthInfo().then(auth => {
            const textSpan = scanBtn.querySelector('.mb-btn-text');
            if (textSpan) {
                const isLocked = auth.userRole === 'FREE' && !auth.hasStarterPack;
                textSpan.textContent = isLocked ? '🔒 Full Scan' : '✨ Full Scan';
            }
        });
    };

    fabContainer.onmouseleave = () => {
        if (window.mbIsBusy) return;
        mainBtn.style.transform = 'scale(1)';
        subBtns.forEach(btn => {
            btn.style.opacity = '0';
            btn.style.transform = 'translateY(20px)';
            btn.style.pointerEvents = 'none';
            btn.style.transitionDelay = '0s';
        });
    };

    // 🚀 전체 스캔
    scanBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (window.mbIsBusy) return;

        try {
            const auth = await getAuthInfo();
            if (!auth.apiKey || !auth.workspaceId) { showLoginPrompt(); return; }
            if (auth.userRole === 'FREE' && !auth.hasStarterPack) { alert("🔒 Full conversation scan is available for LITE tier and above."); return; }

            const currentPlatform = getCurrentPlatform();
            if (!currentPlatform) { alert("❌ Unsupported platform."); return; }

            setBusyState(true);

            const flagKey = getFlagKey(auth);
            const stopFlagText = localStorage.getItem(flagKey);
            const safeTarget = stopFlagText ? normalizeForMatch(stopFlagText).slice(-60) : null;

            showFullScanLockdown(0);

            let reachedFlag = false;
            const seenTexts = new Set();
            let collectedChunks = [];
            let sameTopCount = 0;
            let previousFirstMessage = "";

            window.scrollTo(0, document.body.scrollHeight);
            await new Promise(r => setTimeout(r, 800));

            while (!reachedFlag) {
                const bubbles = document.querySelectorAll(siteConfig[currentPlatform]);
                if (bubbles.length === 0) break;

                const chunkForThisView = [];
                for (let i = bubbles.length - 1; i >= 0; i--) {
                    const rawText = bubbles[i].innerText;
                    if (isSystemPrompt(rawText)) continue;

                    const cleanText = getCleanedText(bubbles[i]);
                    if (safeTarget && normalizeForMatch(cleanText).includes(safeTarget)) { reachedFlag = true; break; }
                    if (cleanText.length > 0 && !seenTexts.has(cleanText)) {
                        seenTexts.add(cleanText);
                        chunkForThisView.unshift(cleanText);
                    }
                }

                if (chunkForThisView.length > 0) {
                    collectedChunks.unshift(chunkForThisView.join('\n\n'));
                    showFullScanLockdown(collectedChunks.join('\n\n').length);
                }

                if (reachedFlag) break;

                window.scrollTo(0, 0);
                document.querySelectorAll('*').forEach(el => {
                    if (el.scrollHeight > el.clientHeight && el.scrollTop > 0) el.scrollTo(0, 0);
                });

                await new Promise(r => setTimeout(r, 1500));

                const newBubbles = document.querySelectorAll(siteConfig[currentPlatform]);
                const currentFirstMessage = newBubbles[0]?.innerText ?? "";

                if (currentFirstMessage === previousFirstMessage) {
                    if (++sameTopCount >= 3) break;
                } else {
                    sameTopCount = 0;
                }
                previousFirstMessage = currentFirstMessage;
            }

            window.scrollTo(0, document.body.scrollHeight);
            hideFullScanLockdown();

            let rawFinalText = collectedChunks.join('\n\n');
            let textLength = rawFinalText.length;

            if (textLength < 10) { alert("⚠️ No new conversation to scan."); setBusyState(false); return; }

            if (textLength > 4000000) {
                alert(`⚠️ Conversation is too large! (${textLength.toLocaleString()} chars)\n\nScanning up to 4 million recent characters to protect browser memory.`);
                rawFinalText = rawFinalText.slice(-4000000);
                textLength = 4000000;
            }

            const estimatedCredits = calculateFullScanCredits(textLength);

            let newFlagText = "";
            const finalBubbles = document.querySelectorAll(siteConfig[currentPlatform]);
            for (let i = finalBubbles.length - 1; i >= 0; i--) {
                if (!isSystemPrompt(finalBubbles[i].innerText)) {
                    newFlagText = getCleanedText(finalBubbles[i]);
                    break;
                }
            }

            showFullScanConfirmModal(
                { rawText: rawFinalText, textLength, estimatedCredits, newFlag: newFlagText },
                auth, flagKey, () => setBusyState(false)
            );

        } catch (error) {
            hideFullScanLockdown();
            setBusyState(false);
            alert("🚨 Error occurred during scan: " + error.message);
        }
    };

    // 💾 단일 저장
    saveBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (window.mbIsBusy) return;

        try {
            const auth = await getAuthInfo();
            if (!auth.apiKey || !auth.workspaceId) { showLoginPrompt(); return; }

            const currentPlatform = getCurrentPlatform();
            if (!currentPlatform) { alert("❌ Unsupported platform."); return; }

            const allBubbles = document.querySelectorAll(siteConfig[currentPlatform]);
            if (allBubbles.length === 0) { alert("❌ No conversation found to save."); return; }

            const flagKey = getFlagKey(auth);
            const flagText = localStorage.getItem(flagKey);
            const safeTarget = flagText ? normalizeForMatch(flagText).slice(-60) : null;

            let startIndex = 0;
            if (safeTarget) {
                for (let i = allBubbles.length - 1; i >= 0; i--) {
                    if (isSystemPrompt(allBubbles[i].innerText)) continue;
                    if (normalizeForMatch(getCleanedText(allBubbles[i])).includes(safeTarget)) {
                        startIndex = i + 1;
                        break;
                    }
                }
            }

            const newBubbles = Array.from(allBubbles).slice(startIndex);
            if (newBubbles.length === 0) { alert("✅ Recent conversations are already perfectly saved."); return; }

            const cleanedBubbles = [];
            let currentLength = 0;
            let isTruncated = false;
            const seenBubbleTexts = new Set();

            for (let i = newBubbles.length - 1; i >= 0; i--) {
                const rawText = newBubbles[i].innerText;
                if (isSystemPrompt(rawText)) continue;

                const text = getCleanedText(newBubbles[i]);
                if (!text || seenBubbleTexts.has(text)) continue;

                if (currentLength + text.length > 10000) {
                    if (cleanedBubbles.length === 0) {
                        cleanedBubbles.unshift(text.substring(0, 10000) + "\n\n...[Content too long, truncated]");
                    }
                    isTruncated = true;
                    break;
                }

                seenBubbleTexts.add(text);
                cleanedBubbles.unshift(text);
                currentLength += text.length;
            }

            if (cleanedBubbles.length === 0) {
                alert("⚠️ No new plain text conversation to save. (Only system prompts exist)");
                setBusyState(false);
                return;
            }

            if (isTruncated) {
                const proceed = confirm(
                    `⚠️ The text is too long for a single save. Only recent content up to the limit (10,000 chars) will be saved.\n\n(Use '🚀 Full Scan' to save everything seamlessly.)\nProceed?`
                );
                if (!proceed) { setBusyState(false); return; }
            }

            setBusyState(true);

            const response = await fetch(`${API_BASE}/memories/join`, {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-API-KEY": auth.apiKey },
                body: JSON.stringify({ workspaceId: auth.workspaceId, content: cleanedBubbles.join('\n\n'), type: "FULL_CONV" })
            });

            if (response.status === 402) { showPaywallModal(`Save Snippet(${CREDIT_COST.SAVE}⚡)`); throw new Error("INSUFFICIENT_CREDITS"); }
            if (!response.ok) throw new Error("Server communication error occurred.");

            deductLocalCredit(auth, CREDIT_COST.SAVE,"💾 Save Snippet");

            for (let i = newBubbles.length - 1; i >= 0; i--) {
                let rawText = newBubbles[i].innerText;
                if (!isSystemPrompt(rawText)) {
                    let clean = getCleanedText(newBubbles[i]);
                    if (clean.length > 5) {
                        localStorage.setItem(flagKey, clean);
                        break;
                    }
                }
            }

            showTokenDeduction(saveBtn, CREDIT_COST.SAVE);
            setTimeout(() => { alert("✅ Latest conversation saved successfully!"); setBusyState(false); }, 300);

        } catch (error) {
            setBusyState(false);
            if (error.message !== "INSUFFICIENT_CREDITS") alert("🚨 Save Snippet Failed: " + error.message);
        }
    };

    // 📥 기억 연동
    loadBtn.onclick = async (e) => {
        e.preventDefault(); e.stopPropagation();
        if (window.mbIsBusy) return;

        try {
            const auth = await getAuthInfo();
            if (!auth.apiKey || !auth.workspaceId) { showLoginPrompt(); return; }

            setBusyState(true);

            const safeEmail = auth.userEmail?.replace(/[^a-zA-Z0-9]/g, "") ?? "unknown";
            const syncStorageKey = `mb_sync_${safeEmail}_${auth.workspaceId}_${window.location.hostname}_${window.location.pathname}`;
            const lastId = parseInt(localStorage.getItem(syncStorageKey)) || 0;

            const response = await fetch(
                `${API_BASE}/memories/sync?workspaceId=${auth.workspaceId}&lastId=${lastId}&limit=50`,
                { method: 'GET', headers: { "Content-Type": "application/json", "X-API-KEY": auth.apiKey } }
            );

            if (response.status === 402) { showPaywallModal(`Sync Memory(${CREDIT_COST.SYNC}⚡)`); throw new Error("INSUFFICIENT_CREDITS"); }
            if (!response.ok) throw new Error("Server Error");

            const result = await response.json();
            const memories = result.data || [];

            if (memories.length === 0) {
                alert("✅ All latest memories are already synced.");
                setBusyState(false);
                return;
            }

            deductLocalCredit(auth, CREDIT_COST.SYNC, "📥 Sync Memory");

            const newLastId = memories[memories.length - 1].id;
            const memoryContents = memories.map((m, i) => `${i + 1}. ${m.content}`).join('\n');
            const cleanSyncPrompt = `[System Instruction: Memorize the following data and reply strictly with "Yes, I have updated my memory."]\n\n[Loaded Memory Chunk]\n${memoryContents}`.trim();

            const inputTarget = document.querySelector('textarea:not([hidden]):not([style*="display: none"]), [contenteditable="true"]:not([hidden]):not([style*="display: none"])');
            if (inputTarget) {
                insertTextAndTrigger(inputTarget, cleanSyncPrompt);
                localStorage.setItem(syncStorageKey, newLastId);
                showTokenDeduction(loadBtn, CREDIT_COST.SYNC);
                setTimeout(() => { alert("✅ Sync Complete"); setBusyState(false); }, 1000);
            } else {
                setBusyState(false);
                alert("Chat input box not found.");
            }
        } catch (e) {
            setBusyState(false);
            if (e.message !== "INSUFFICIENT_CREDITS") alert("🚨 Memory Sync Failed");
        }
    };

    fabContainer.append(scanBtn, loadBtn, saveBtn, mainBtn);
    document.body.appendChild(fabContainer);
}

const fabObserver = new MutationObserver(() => {
    if (!document.getElementById('memory-bank-fab-container')) injectFloatingMenu();
});
fabObserver.observe(document.body, { childList: true, subtree: false });
injectFloatingMenu();

// =========================================================
// 9. /m 인라인 검색 커맨드 (엔터 & 마우스 클릭 완벽 대응)
// =========================================================
function initSlashCommandListener() {
    document.addEventListener('input', (e) => {
        const target = e.target;
        if (target.tagName !== 'TEXTAREA' && !target.isContentEditable && target.tagName !== 'INPUT') return;
        const text = target.value !== undefined ? target.value : target.innerText;
        target.classList.toggle('mb-slash-mode', text.startsWith('/m '));
    });

    async function executeInlineSearch(target, text, originalEvent) {
        if (!text.startsWith('/m ')) return false;

        if (originalEvent) {
            originalEvent.preventDefault();
            originalEvent.stopPropagation();
            originalEvent.stopImmediatePropagation();
        }

        if (target.dataset.mbSearching === "true") return true;

        const query = text.substring(3).trim();
        if (!query) { alert("Please enter a question to search. (e.g., /m What is my favorite food?)"); return true; }

        target.dataset.mbSearching = "true";

        const rect = target.getBoundingClientRect();
        const blocker = document.createElement('div');
        blocker.id = 'mb-input-blocker';
        blocker.textContent = '⏳ Memory Bank AI Searching...';
        blocker.className = 'mb-input-blocker';
        Object.assign(blocker.style, {
            position: 'absolute', top: `${rect.top + window.scrollY}px`, left: `${rect.left + window.scrollX}px`,
            width: `${rect.width}px`, height: `${rect.height}px`, borderRadius: window.getComputedStyle(target).borderRadius
        });
        document.body.appendChild(blocker);

        const removeBlocker = () => document.getElementById('mb-input-blocker')?.remove();

        try {
            const auth = await getAuthInfo();
            if (!auth.apiKey) throw new Error("NO_AUTH");

            const response = await fetch(
                `${API_BASE}/memories/search?workspaceId=${auth.workspaceId}&question=${encodeURIComponent(query)}&topK=10`,
                { method: 'GET', headers: { "X-API-KEY": auth.apiKey } }
            );

            if (response.status === 402) { showPaywallModal(`Search(${CREDIT_COST.SEARCH}⚡)`); throw new Error("NO_CREDIT"); }
            if (!response.ok) throw new Error("SEARCH_FAILED");

            const responseData = await response.json();
            const memoryResults = responseData.data || [];

            const memoryText = memoryResults.length > 0
                ? memoryResults.map((mem, idx) => `${idx + 1}. ${mem}`).join('\n')
                : "No relevant memories found.";

            const finalPrompt = `Memory Bank\n[System Instruction: You are my personal assistant. Answer my question based ONLY on the provided [Loaded Memory] data below. If you don't know the answer based on the data, simply say "I don't know. Please rewrite the question.".]\n\n[Loaded Memory]\n${memoryText.trim()}\n\n[Question]\n${query}`;

            removeBlocker();
            target.dataset.mbSearching = "false";
            target.classList.remove('mb-slash-mode');

            deductLocalCredit(auth, CREDIT_COST.SEARCH, "🔍 AI Memory Search");
            showTokenDeduction(target, CREDIT_COST.SEARCH);

            insertTextAndTrigger(target, finalPrompt);

        } catch (error) {
            removeBlocker();
            target.dataset.mbSearching = "false";
            if (error.message !== "NO_CREDIT" && error.message !== "NO_AUTH") alert("🚨 Error occurred during search.");
        }
        return true;
    }

    document.addEventListener('keydown', (e) => {
        const target = e.target;
        if ((target.tagName !== 'TEXTAREA' && !target.isContentEditable && target.tagName !== 'INPUT') || e.key !== 'Enter' || e.shiftKey) return;

        const text = target.value !== undefined ? target.value : target.innerText;
        executeInlineSearch(target, text, e);
    }, true);

    document.addEventListener('click', (e) => {
        const sendBtn = e.target.closest('button[data-testid="send-button"], button[aria-label*="Send"], button[title*="Send"], .send-button');
        if (!sendBtn) return;

        const target = document.querySelector('textarea:not([hidden]):not([style*="display: none"]), [contenteditable="true"]:not([hidden]):not([style*="display: none"])');
        if (!target) return;

        const text = target.value !== undefined ? target.value : target.innerText;
        if (text.startsWith('/m ')) {
            executeInlineSearch(target, text, e);
        }
    }, true);
}
setTimeout(initSlashCommandListener, 2000);

// =========================================================
// 10. 스마트 나침반 (SVG 아이콘 기반 — 깔끔 모던 리뉴얼)
// =========================================================
let isNavigatorInitialized = false;

async function initSmartNavigator() {
    if (isNavigatorInitialized) return;
    isNavigatorInitialized = true;

    const compass = document.createElement('button');
    compass.id = 'mb-bookmark-compass';
    const isGrok = window.location.hostname.includes('grok.com');

    Object.assign(compass.style, {
        position: 'fixed', right: isGrok ? '80px' : '20px', bottom: '260px',
        backgroundColor: '#ffffff', border: '2px solid #3b82f6', color: '#3b82f6',
        width: '52px', height: '52px', padding: '0', borderRadius: '50%',
        cursor: 'pointer', zIndex: '2147483647',
        display: 'none', justifyContent: 'center', alignItems: 'center',
        boxShadow: '0 4px 10px rgba(0,0,0,0.1)', opacity: '0.75',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
    });

    // 내부 아이콘 컨테이너 (회전 애니메이션 대상)
    const compassIcon = document.createElement('div');
    compassIcon.className = 'mb-compass-icon';
    compass.appendChild(compassIcon);

    compass.onmouseenter = () => {
        // 상태 락(found/error) 중에는 호버 색상 덮어쓰지 않음
        if (compass.classList.contains('mb-compass-found') || compass.classList.contains('mb-compass-error')) return;
        Object.assign(compass.style, { backgroundColor: '#3b82f6', opacity: '1', transform: 'scale(1.08)' });
        compass.style.color = '#ffffff';
    };
    compass.onmouseleave = () => {
        if (compass.classList.contains('mb-compass-found') || compass.classList.contains('mb-compass-error')) return;
        Object.assign(compass.style, { backgroundColor: '#ffffff', opacity: '0.75', transform: 'scale(1)' });
        compass.style.color = '#3b82f6';
    };
    document.body.appendChild(compass);

    // 나침반 상태 변경 헬퍼
    // state: 'default' | 'searching' | 'found' | 'notfound'
    // direction: 'up' | 'down' (default 상태일 때만 사용)
    function setCompassState(state, direction = 'up') {
        compass.classList.remove('mb-compass-spin', 'mb-compass-found', 'mb-compass-error');

        if (state === 'default') {
            compassIcon.innerHTML = direction === 'up' ? COMPASS_SVG_UP : COMPASS_SVG_DOWN;
            compass.dataset.tooltip = direction === 'up'
                ? 'Saved Point is above (Click to find)'
                : 'Saved Point is below (Click to find)';
            // 색상 원복 (호버 상태가 아니면)
            if (compass.style.backgroundColor !== 'rgb(59, 130, 246)') {
                compass.style.color = '#3b82f6';
            }
        } else if (state === 'searching') {
            compass.classList.add('mb-compass-spin');
            compass.dataset.tooltip = 'Finding location...';
            // 검색 중에는 위쪽 화살표 유지(사용자가 위로 스크롤하며 찾는 중)
            if (!compassIcon.innerHTML.trim()) compassIcon.innerHTML = COMPASS_SVG_UP;
        } else if (state === 'found') {
            compass.classList.add('mb-compass-found');
            compass.dataset.tooltip = 'Found it!';
        } else if (state === 'notfound') {
            compass.classList.add('mb-compass-error');
            compass.dataset.tooltip = 'Location not found';
        }
    }

    const track = async () => {
        // 상태 락(2초/3초 표시) 중에는 갱신 차단
        if (window.mbCompassLocked) return;

        const auth = await getAuthInfo();
        if (!auth.apiKey) return;

        const currentPlatform = getCurrentPlatform();
        if (!currentPlatform) return;

        const flagKey = getFlagKey(auth);
        const targetText = localStorage.getItem(flagKey);

        if (!targetText || normalizeForMatch(targetText).slice(-60).length < 5) {
            compass.style.display = 'none';
            document.querySelectorAll('[data-mb-flagged="true"]').forEach(el => {
                delete el.dataset.mbFlagged;
                el.querySelector('.mb-flag-line')?.remove();
            });
            return;
        }

        const searchTarget = normalizeForMatch(targetText).slice(-60);

        const bubbles = document.querySelectorAll(siteConfig[currentPlatform]);
        let targetBubble = null;

        for (let i = bubbles.length - 1; i >= 0; i--) {
            if (isSystemPrompt(bubbles[i].innerText)) continue;

            let clean = getCleanedText(bubbles[i]);
            if (normalizeForMatch(clean).includes(searchTarget)) {
                targetBubble = bubbles[i];
                break;
            }
        }

        if (targetBubble) {
            const role = targetBubble.getAttribute('data-message-author-role');
            const tagName = targetBubble.tagName.toLowerCase();
            if (role === 'user' || tagName === 'user-query') {
                const idx = Array.from(bubbles).indexOf(targetBubble);
                if (idx >= 0 && idx < bubbles.length - 1) targetBubble = bubbles[idx + 1];
            }
        }

        if (targetBubble && !targetBubble.dataset.mbFlagged) {
            document.querySelectorAll('[data-mb-flagged="true"]').forEach(el => {
                delete el.dataset.mbFlagged;
                el.querySelector('.mb-flag-line')?.remove();
            });

            targetBubble.dataset.mbFlagged = "true";
            targetBubble.style.position = "relative";

            const line = document.createElement('div');
            line.className = 'mb-flag-line';
            Object.assign(line.style, {
                position: 'absolute', bottom: '-5px', left: '0', width: '100%', height: '3px',
                backgroundColor: '#3b82f6', zIndex: '2147483646', boxShadow: '0 0 8px rgba(59,130,246,0.6)'
            });

            const badge = document.createElement('div');
            badge.textContent = "💾 Last Saved Point";
            Object.assign(badge.style, {
                position: 'absolute', top: '-12px', right: '10px', backgroundColor: '#3b82f6',
                color: 'white', padding: '4px 14px', borderRadius: '15px', fontSize: '11px',
                fontWeight: 'bold', zIndex: '2147483647', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif'
            });
            line.appendChild(badge);
            targetBubble.appendChild(line);
        }

        if (!targetBubble) {
            // 저장점이 DOM에 없음 → 위로 스크롤하며 찾아야 함
            if (!window.isNavSearching) setCompassState('default', 'up');
            compass.style.display = 'flex';

            // 🌟 말풍선 갯수 카운팅으로 진짜 끝 판단
            compass.onclick = () => {
                if (window.isNavSearching) return;
                window.isNavSearching = true;
                setCompassState('searching');

                let sameBubbleCount = 0;
                let previousBubbleCount = 0;

                const searchInterval = setInterval(() => {
                    const currentBubbles = document.querySelectorAll(siteConfig[currentPlatform]);
                    let found = null;
                    for (let i = currentBubbles.length - 1; i >= 0; i--) {
                        if (isSystemPrompt(currentBubbles[i].innerText)) continue;
                        let clean = getCleanedText(currentBubbles[i]);
                        if (normalizeForMatch(clean).includes(searchTarget)) {
                            found = currentBubbles[i]; break;
                        }
                    }

                    if (found) {
                        clearInterval(searchInterval);
                        window.isNavSearching = false;
                        found.scrollIntoView({ behavior: 'smooth', block: 'center' });

                        // 발견 시각적 피드백 (말풍선 하이라이트)
                        const originalBg = found.style.backgroundColor;
                        found.style.backgroundColor = 'rgba(59, 130, 246, 0.1)';
                        setTimeout(() => found.style.backgroundColor = originalBg, 2000);

                        // 나침반: 초록 테두리 2초 표시
                        setCompassState('found');
                        window.mbCompassLocked = true;
                        setTimeout(() => {
                            window.mbCompassLocked = false;
                            track();
                        }, 2000);
                    } else {
                        // 페이지 내 모든 스크롤 가능 영역을 맨 위로 (로딩 트리거)
                        window.scrollTo(0, 0);
                        document.querySelectorAll('*').forEach(el => {
                            if (el.scrollHeight > el.clientHeight && el.scrollTop > 0) el.scrollTo(0, 0);
                        });

                        const currentBubbleCount = currentBubbles.length;
                        if (currentBubbleCount === previousBubbleCount) {
                            if (++sameBubbleCount >= 4) {
                                clearInterval(searchInterval);
                                window.isNavSearching = false;

                                // 나침반: 빨간 테두리 3초 표시
                                setCompassState('notfound');
                                window.mbCompassLocked = true;
                                setTimeout(() => {
                                    window.mbCompassLocked = false;
                                    track();
                                }, 3000);
                                return;
                            }
                        } else {
                            sameBubbleCount = 0;
                        }
                        previousBubbleCount = currentBubbleCount;
                    }
                }, 1500);
            };
        } else {
            window.isNavSearching = false;
            const rect = targetBubble.getBoundingClientRect();
            const moveToTarget = () => targetBubble.scrollIntoView({ behavior: 'smooth', block: 'end' });

            if (rect.bottom < 0) {
                // 저장점이 화면 위쪽에 있음
                setCompassState('default', 'up');
                compass.style.display = 'flex';
                compass.onclick = moveToTarget;
            } else if (rect.top > window.innerHeight) {
                // 저장점이 화면 아래쪽에 있음
                setCompassState('default', 'down');
                compass.style.display = 'flex';
                compass.onclick = moveToTarget;
            } else {
                // 화면 안에 있음 → 나침반 숨김
                compass.style.display = 'none';
            }
        }
    };

    setInterval(track, 1000);
}
setTimeout(initSmartNavigator, 1500);

// =========================================================
// 11. 페이지 복귀 시 진행 중인 저장 작업 재개
// =========================================================
async function checkPendingJobs() {
    chrome.storage.local.get(['activeMbJob'], async ({ activeMbJob }) => {
        if (!activeMbJob) return;
        const auth = await getAuthInfo();
        if (!auth.apiKey) return;

        startJobPolling(activeMbJob.jobId, auth, activeMbJob.estimatedCredits, activeMbJob.flagKey, activeMbJob.newFlag);
    });
}
setTimeout(checkPendingJobs, 2500);
