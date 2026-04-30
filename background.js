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
const MAX_SNIPPET_LENGTH = 50000;

function setMenuState(isLoading) {
    chrome.contextMenus.update("save-to-memory-bank", {
        title: isLoading ? "⏳ AI analyzing & saving..." : "🧠 Save snippet to Memory Bank",
        enabled: !isLoading
    });
}

function showTabAlert(tabId, message) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: (msg) => alert(String(msg)),
        args: [String(message)]
    }).catch(() => {});
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "save-to-memory-bank") return;

    if (savingPromise) {
        console.log("⏳ A save operation is already in progress. Ignoring duplicate click.");
        return;
    }

    let selectedText = info.selectionText?.replace(EMOJI_REGEX, "")?.trim();
    if (!selectedText) return;

    // [SECURITY] 길이 제한 — 비정상적으로 큰 페이로드 차단
    if (selectedText.length > MAX_SNIPPET_LENGTH) {
        selectedText = selectedText.slice(0, MAX_SNIPPET_LENGTH);
    }

    savingPromise = (async () => {
        setMenuState(true);
        try {
            const { memoryBankApiKey, currentWorkspaceId } = await chrome.storage.local.get([
                'memoryBankApiKey',
                'currentWorkspaceId'
            ]);

            if (!memoryBankApiKey) {
                showTabAlert(tab.id, "🚨 Login is required. Please open the extension popup.");
                return;
            }

            // [SECURITY FIX] 하드코딩된 workspace=1 fallback 제거
            // 워크스페이스 없으면 명시적으로 거부 (다른 유저 ws에 잘못 저장 방지)
            if (!currentWorkspaceId) {
                showTabAlert(tab.id, "🚨 No workspace selected.\nPlease open the extension popup and choose a workspace first.");
                return;
            }

            const response = await fetch("https://aimemorybank.cloud/api/memories/join", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-KEY": memoryBankApiKey
                },
                body: JSON.stringify({
                    workspaceId: currentWorkspaceId,
                    content: selectedText,
                    type: "SNIPPET"
                })
            });

            if (response.ok) {
                showTabAlert(tab.id, "✅ Successfully saved to Memory Bank!");
            } else if (response.status === 401 || response.status === 403) {
                showTabAlert(tab.id, "🚨 Authentication failed. Please log in again from the popup.");
            } else {
                throw new Error("Server Error " + response.status);
            }
        } catch {
            showTabAlert(tab.id, "🚨 [Save Failed]\nAn error occurred while communicating with the server.");
        } finally {
            savingPromise = null;
            setMenuState(false);
        }
    })();
});