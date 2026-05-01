console.log("Memory Bank Background Load");

let savingPromise = null;

chrome.runtime.onInstalled.addListener(() => {
    chrome.contextMenus.create({
        id: "save-to-memory-bank",
        title: "🧠 Save snippet to Memory Bank",
        contexts: ["selection"]
    });
});

const EMOJI_REGEX = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{FE00}-\u{FE0F}\u{1F004}\u{1F0CF}]/gu;

function setMenuState(isLoading) {
    chrome.contextMenus.update("save-to-memory-bank", {
        title: isLoading ? "⏳ AI analyzing & saving..." : "🧠 Save snippet to Memory Bank",
        enabled: !isLoading
    });
}

// 🌟 [NEW] 투박한 alert 대신 예쁜 토스트 알림을 띄우는 함수
function showToastOnTab(tabId, message, type = 'info') {
    chrome.scripting.executeScript({
        target: { tabId },
        func: (msg, msgType) => {
            // 이미 띄워진 토스트가 있다면 제거 (중복 방지)
            document.getElementById('mb-toast-notification')?.remove();

            const toast = document.createElement('div');
            toast.id = 'mb-toast-notification';
            toast.textContent = msg;

            // 색상 결정 (info: 파란색, success: 초록색, error: 빨간색)
            const bgColor = msgType === 'success' ? '#10b981' : (msgType === 'error' ? '#ef4444' : '#3b82f6');

            Object.assign(toast.style, {
                position: 'fixed', bottom: '40px', left: '50%', transform: 'translateX(-50%) translateY(20px)',
                backgroundColor: bgColor, color: 'white', padding: '12px 24px', borderRadius: '30px',
                fontSize: '14px', fontWeight: 'bold', zIndex: '2147483647', pointerEvents: 'none',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)', opacity: '0', transition: 'all 0.3s ease',
                fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif'
            });

            document.body.appendChild(toast);

            // 스르륵 나타나는 애니메이션
            requestAnimationFrame(() => {
                toast.style.opacity = '1';
                toast.style.transform = 'translateX(-50%) translateY(0)';
            });

            // 3초 뒤에 자연스럽게 사라짐
            setTimeout(() => {
                toast.style.opacity = '0';
                toast.style.transform = 'translateX(-50%) translateY(20px)';
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        },
        args: [message, type]
    }).catch(err => console.error("Could not inject toast:", err));
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
    // 저장 메뉴를 클릭했을 때
    if (info.menuItemId === "saveSnippetMenuId") { // (실제 대표님이 쓰신 메뉴 ID로 맞추세요)

        // 🚀 [추가된 핵심 방어 로직] 스토리지에서 실행 중인 작업 확인
        const storageData = await new Promise(resolve => chrome.storage.local.get(['activeMbJob'], resolve));

        if (storageData.activeMbJob) {
            // 주의: background.js에서는 alert() 함수가 안 먹히기 때문에,
            // 사용자가 보고 있는 현재 탭(tab.id)에 스크립트를 쏴서 경고창을 띄워야 합니다.
            chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: () => alert("⏳ A Full Scan is currently running!\nTo prevent duplicate data, please wait until the scan is complete.")
            });
            return; // 여기서 로직을 멈춰서 저장을 차단!
        }

    const selectedText = info.selectionText?.replace(EMOJI_REGEX, "");
    if (!selectedText) return;

    savingPromise = (async () => {
        setMenuState(true);
        // 🌟 저장 시작 시 "저장 중" 알림 띄우기
        showToastOnTab(tab.id, "⏳ AI analyzing & saving snippet...", "info");

        try {
            const { memoryBankApiKey, currentWorkspaceId } = await chrome.storage.local.get([
                'memoryBankApiKey',
                'currentWorkspaceId'
            ]);

            if (!memoryBankApiKey) {
                showToastOnTab(tab.id, "🚨 Login is required. Please open the popup.", "error");
                return;
            }

            const response = await fetch("https://aimemorybank.cloud/api/memories/join", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-KEY": memoryBankApiKey
                },
                body: JSON.stringify({
                    workspaceId: currentWorkspaceId || 1,
                    content: selectedText,
                    type: "SNIPPET"
                })
            });

            if (response.ok) {
                // 🌟 저장 성공 시 "완료" 알림 띄우기
                showToastOnTab(tab.id, "✅ Successfully saved to Memory Bank!", "success");
            } else if (response.status === 402) {
                showToastOnTab(tab.id, "⚡ Insufficient credits!", "error");
            } else {
                throw new Error("Server Error");
            }
        } catch {
            showToastOnTab(tab.id, "🚨 [Save Failed] Server communication error.", "error");
        } finally {
            savingPromise = null;
            setMenuState(false);
        }
    })();
});