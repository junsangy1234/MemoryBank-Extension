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

function showTabAlert(tabId, message) {
    chrome.scripting.executeScript({
        target: { tabId },
        func: (msg) => alert(msg),
        args: [message]
    });
}

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId !== "save-to-memory-bank") return;

    if (savingPromise) {
        console.log("⏳ A save operation is already in progress. Ignoring duplicate click.");
        return;
    }

    const selectedText = info.selectionText?.replace(EMOJI_REGEX, "");
    if (!selectedText) return;

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
                showTabAlert(tab.id, "✅ Successfully saved to Memory Bank!");
            } else {
                throw new Error("Server Error");
            }
        } catch {
            showTabAlert(tab.id, "🚨 [Save Failed]\nAn error occurred while communicating with the server.");
        } finally {
            savingPromise = null;
            setMenuState(false);
        }
    })();
});