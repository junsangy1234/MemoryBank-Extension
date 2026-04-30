document.addEventListener('DOMContentLoaded', () => {
    chrome.storage.local.get(
        ['memoryBankApiKey', 'userName', 'userRole', 'currentWorkspaceId', 'workspaces', 'isSavingInProgress', 'dailyCredits', 'hasStarterPack'],
        (data) => {
            if (!data.memoryBankApiKey || !data.workspaces) return;

            const currentRole = data.userRole || 'FREE';
            const hasStarterPack = data.hasStarterPack || false;

            showLoggedInUI(
                data.userName,
                data.workspaces,
                data.currentWorkspaceId,
                data.isSavingInProgress,
                data.dailyCredits ?? 0,
                currentRole,
                hasStarterPack
            );

            const tabMenu = document.getElementById('tab-menu');
            if (tabMenu) tabMenu.style.display = 'flex';
            updateStoreVisibility(currentRole, hasStarterPack);

            silentRefreshUserData();
            checkActiveJobProgress();
            renderHistory();
        }
    );
});

async function silentRefreshUserData() {
    chrome.storage.local.get(['memoryBankApiKey', 'userRole'], async (data) => {
        if (!data.memoryBankApiKey) return;

        try {
            const response = await fetch("https://aimemorybank.cloud/api/members/me", {
                method: "GET",
                headers: { "X-API-KEY": data.memoryBankApiKey }
            });

            if (response.ok) {
                const result = await response.json();

                chrome.storage.local.set({
                    userRole: result.role || data.userRole || 'FREE',
                    dailyCredits: result.dailyCredits ?? 0,
                    hasStarterPack: result.hasStarterPack || false
                });
            }
        } catch (e) {
            console.error("Real-time sync failed", e);
        }
    });
}

function silentRefreshViaGoogleToken(today) {
    return new Promise((resolve) => {
        chrome.identity.getAuthToken({ interactive: false }, async (token) => {
            if (chrome.runtime.lastError || !token) { resolve(); return; }
            try {
                const response = await fetch("https://aimemorybank.cloud/api/auth/google", {
                    method: "POST",
                    mode: "cors",
                    headers: { "Content-Type": "application/json", "Accept": "application/json" },
                    body: JSON.stringify({ accessToken: token })
                });
                if (!response.ok) { resolve(); return; }

                const data = await response.json();
                if (!data.apiKey) { resolve(); return; }

                const saveData = { userRole: data.role || 'FREE', dailyCredits: data.dailyCredits ?? 0 };
                if (today) saveData.lastCreditResetDate = today;
                chrome.storage.local.set(saveData);
            } catch (error) {
                console.error("Background sync failed:", error);
            }
            resolve();
        });
    });
}

chrome.storage.onChanged.addListener((changes) => {
    if (changes.isSavingInProgress) {
        if (changes.isSavingInProgress.newValue === true) {
            lockWorkspaceUI();
            const statusMsg = document.getElementById('status-message');
            statusMsg.style.color = '#ff9800';
            statusMsg.innerHTML = `⏳ <b>Task in progress on webpage!</b><br>Controls are restricted until completion.`;
        } else {
            location.reload();
        }
    }

    if (changes.dailyCredits) {
        const creditCount = document.getElementById('credit-count');
        if (creditCount) creditCount.textContent = changes.dailyCredits.newValue;
    }

    if (changes.userRole?.oldValue && changes.userRole.newValue !== changes.userRole.oldValue) {
        location.reload();
    }

    if (changes.activeMbJob || changes.activityHistory) {
        checkActiveJobProgress();
        renderHistory();
    }
});

function lockWorkspaceUI() {
    document.getElementById('workspace-container').classList.add('locked-ui');
    ['workspace-select', 'edit-workspace-btn', 'delete-workspace-btn', 'add-workspace-btn', 'logout-btn']
        .forEach(id => { document.getElementById(id).disabled = true; });
}

document.getElementById('login-btn').addEventListener('click', () => {
    const btn = document.getElementById('login-btn');
    const statusMsg = document.getElementById('status-message');
    btn.innerHTML = '⏳ Logging in...';
    btn.disabled = true;

    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
        if (chrome.runtime.lastError) {
            btn.innerHTML = 'Sign in with Google';
            btn.disabled = false;
            statusMsg.style.display = 'block';
            statusMsg.style.color = '#ef4444';
            statusMsg.innerHTML = `❌ Login failed: ${chrome.runtime.lastError.message}`;
            return;
        }
        try {
            const response = await fetch("https://aimemorybank.cloud/api/auth/google", {
                method: "POST",
                mode: "cors",
                headers: { "Content-Type": "application/json", "Accept": "application/json" },
                body: JSON.stringify({ accessToken: token })
            });

            if (!response.ok) throw new Error("Server authentication failed");
            const data = await response.json();

            if (!data.apiKey || !data.workspaces) throw new Error("Response data error");

            const defaultWorkspaceId = data.workspaces[0].id;
            const fetchedCredits = data.dailyCredits ?? 0;
            const safeRole = data.role || 'FREE';

            chrome.storage.local.set({
                memoryBankApiKey: data.apiKey,
                userName: data.name,
                userEmail: data.email,
                userRole: safeRole,
                currentWorkspaceId: defaultWorkspaceId,
                workspaces: data.workspaces,
                dailyCredits: fetchedCredits
            }, () => {
                showLoggedInUI(data.name, data.workspaces, defaultWorkspaceId, false, fetchedCredits, safeRole, data.hasStarterPack || false);
                document.getElementById('history-container').style.display = 'block';

                const tabMenu = document.getElementById('tab-menu');
                if (tabMenu) tabMenu.style.display = 'flex';
                updateStoreVisibility(safeRole, data.hasStarterPack || false);
            });
        } catch {
            btn.innerHTML = 'Sign in with Google';
            btn.disabled = false;
            statusMsg.style.display = 'block';
            statusMsg.style.color = '#ef4444';
            statusMsg.innerHTML = `🚨 Server connection failed`;
        }
    });
});

function showLoggedInUI(name, workspaces, currentWsId, isSaving, credits, role, hasStarterPack) {
    document.getElementById('login-btn').style.display = 'none';
    document.getElementById('desc').style.display = 'none';

    const creditBadge = document.getElementById('credit-badge');
    const creditCount = document.getElementById('credit-count');
    if (creditBadge && creditCount && credits !== undefined) {
        creditCount.textContent = credits;
        creditBadge.style.display = 'block';
    }

    const statusMsg = document.getElementById('status-message');
    statusMsg.style.display = 'block';

    let roleHtml = `<span class="role-badge ${role.toLowerCase()}">${role}</span>`;

    if (hasStarterPack) {
        roleHtml += `<span title="Starter Pack Owner" style="font-size: 14px; margin-left: 5px; vertical-align: middle; cursor: help; filter: drop-shadow(0 1px 1px rgba(0,0,0,0.1));">🐣</span>`;
    }

    if (isSaving) {
        lockWorkspaceUI();
        statusMsg.style.color = '#f59e0b';
        statusMsg.innerHTML = `⏳ <b>Task in progress on webpage!</b><br>Controls are restricted until completion.`;
    } else {
        statusMsg.style.color = '#10b981';
        statusMsg.innerHTML = `✅ Welcome, <b>${name}</b>! ${roleHtml}`;
    }

    const wsSelect = document.getElementById('workspace-select');
    const fragment = document.createDocumentFragment();
    workspaces.forEach(ws => {
        const option = document.createElement('option');
        option.value = ws.id;
        option.textContent = ws.name;
        if (ws.id == currentWsId) option.selected = true;
        fragment.appendChild(option);
    });
    wsSelect.innerHTML = '';
    wsSelect.appendChild(fragment);

    document.getElementById('workspace-container').style.display = 'block';
    document.getElementById('history-container').style.display = 'block';

    const limits = { FREE: 1, LITE: 2, PRO: 4, PREMIUM: 9999 };
    const currentLimit = limits[role] || 1;
    const currentCount = workspaces ? workspaces.length : 0;
    const addBtn = document.getElementById('add-workspace-btn');

    if (currentCount >= currentLimit) {
        addBtn.innerHTML = '🔒 Limit Reached';
        addBtn.style.background = '#f3f4f6';
        addBtn.style.color = '#9ca3af';
        addBtn.style.borderColor = '#d1d5db';
        addBtn.style.cursor = 'not-allowed';
    } else {
        addBtn.innerHTML = '✨ New Workspace';
        addBtn.style.background = 'white';
        addBtn.style.color = '#3b82f6';
        addBtn.style.borderColor = '#3b82f6';
        addBtn.style.cursor = 'pointer';
    }

    wsSelect.addEventListener('change', (e) => chrome.storage.local.set({ currentWorkspaceId: e.target.value }));
}

document.getElementById('logout-btn').addEventListener('click', () => {
    chrome.storage.local.clear(() => chrome.identity.clearAllCachedAuthTokens(() => location.reload()));
});

document.getElementById('add-workspace-btn').addEventListener('click', async () => {
    chrome.storage.local.get(['memoryBankApiKey', 'workspaces', 'userRole'], async ({ memoryBankApiKey, workspaces, userRole }) => {

        const limits = { FREE: 1, LITE: 2, PRO: 4, PREMIUM: 9999 };
        const currentRole = userRole || 'FREE';
        const currentLimit = limits[currentRole] || 1;
        const currentCount = workspaces ? workspaces.length : 0;

        if (currentCount >= currentLimit) {
            const goStore = confirm(`🚨 Workspace Limit Exceeded!\n\nYour ${currentRole} plan can create up to ${currentLimit} workspaces.\n\nWould you like to upgrade your plan to increase the limit?`);

            if (goStore) {
                switchTab('store');
            }
            return;
        }

        const wsName = prompt("Enter a new workspace name:");
        if (!wsName?.trim()) return;

        try {
            const response = await fetch("https://aimemorybank.cloud/api/workspaces", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-API-KEY": memoryBankApiKey },
                body: JSON.stringify({ name: wsName.trim() })
            });
            if (!response.ok) throw new Error("Creation failed");

            const newWs = await response.json();
            const updated = [...(workspaces || []), newWs];
            chrome.storage.local.set({ workspaces: updated, currentWorkspaceId: newWs.id }, () => location.reload());
        } catch {
            alert("🚨 Error occurred while creating workspace.");
        }
    });
});

document.getElementById('edit-workspace-btn').addEventListener('click', () => {
    chrome.storage.local.get(['memoryBankApiKey', 'currentWorkspaceId', 'workspaces'], async ({ memoryBankApiKey, currentWorkspaceId, workspaces }) => {
        const currentWs = workspaces.find(w => w.id == currentWorkspaceId);
        const newName = prompt("Enter new name for the workspace:", currentWs?.name ?? "");
        if (!newName?.trim() || newName === currentWs?.name) return;

        try {
            const response = await fetch(`https://aimemorybank.cloud/api/workspaces/${currentWorkspaceId}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-API-KEY": memoryBankApiKey },
                body: JSON.stringify({ name: newName.trim() })
            });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const updated = workspaces.map(w => w.id == currentWorkspaceId ? { ...w, name: newName.trim() } : w);
            chrome.storage.local.set({ workspaces: updated }, () => location.reload());
        } catch {
            alert(`🚨 Name edit failed!`);
        }
    });
});

document.getElementById('delete-workspace-btn').addEventListener('click', () => {
    chrome.storage.local.get(['memoryBankApiKey', 'currentWorkspaceId', 'workspaces'], async ({ memoryBankApiKey, currentWorkspaceId, workspaces }) => {
        if (workspaces.length <= 1) {
            alert("You must keep at least 1 workspace.");
            return;
        }
        if (!confirm("Are you sure you want to delete this workspace?\nAll memories inside will be permanently deleted!")) return;

        try {
            const response = await fetch(`https://aimemorybank.cloud/api/workspaces/${currentWorkspaceId}`, {
                method: "DELETE",
                headers: { "X-API-KEY": memoryBankApiKey }
            });
            if (!response.ok) throw new Error("Deletion failed");

            const updated = workspaces.filter(w => w.id != currentWorkspaceId);
            chrome.storage.local.set({ workspaces: updated, currentWorkspaceId: updated[0].id }, () => location.reload());
        } catch {
            alert("🚨 Error occurred during deletion.");
        }
    });
});

document.getElementById('toggle-history-btn').addEventListener('click', () => {
    const list = document.getElementById('history-list');
    const arrow = document.getElementById('history-arrow');
    const isHidden = list.style.display === 'none';
    list.style.display = isHidden ? 'block' : 'none';
    arrow.textContent = isHidden ? '▲' : '▼';
    if (isHidden) renderHistory();
});

function renderHistory() {
    chrome.storage.local.get(['activityHistory'], (data) => {
        const list = document.getElementById('history-list');
        const history = data.activityHistory || [];
        if (history.length === 0) {
            list.innerHTML = '<li style="text-align: center; color: #9ca3af; padding: 10px;">No recent history.</li>';
            return;
        }
        list.innerHTML = history.map(item => `
            <li style="display: flex; justify-content: space-between; padding: 8px 6px; border-bottom: 1px solid #f3f4f6;">
                <span style="color: #4b5563; font-weight: 600;">${item.action}</span>
                <div style="text-align: right;">
                    <span style="color: #f59e0b; font-weight: 800; margin-right: 6px;">-${item.cost}⚡</span>
                    <span style="color: #9ca3af; font-size: 10px;">${item.time}</span>
                </div>
            </li>
        `).join('');
    });
}

let activePollInterval = null;
let simulatedPercent = 0;

function checkActiveJobProgress() {
    chrome.storage.local.get(['memoryBankApiKey', 'activeMbJob'], (data) => {
        const container = document.getElementById('job-progress-container');
        if (!data.activeMbJob || !data.memoryBankApiKey) {
            container.style.display = 'none';
            if (activePollInterval) clearInterval(activePollInterval);
            return;
        }

        container.style.display = 'block';
        const { jobId, startTime } = data.activeMbJob;

        if (startTime) {
            const elapsedSeconds = (Date.now() - startTime) / 1000;
            simulatedPercent = Math.min(85, elapsedSeconds * 1.5);
        }

        const percentEl = document.getElementById('job-percent');
        const barEl = document.getElementById('job-progress-bar');
        const statusEl = document.getElementById('job-status-text');

        percentEl.textContent = `${Math.round(simulatedPercent)}%`;
        barEl.style.width = `${Math.round(simulatedPercent)}%`;

        if (activePollInterval) clearInterval(activePollInterval);

        activePollInterval = setInterval(async () => {
            try {
                const res = await fetch(`https://aimemorybank.cloud/api/memories/full-save/${jobId}/status`, {
                    headers: { "X-API-KEY": data.memoryBankApiKey }
                });
                if (!res.ok) return;
                const jobData = await res.json();

                if (jobData.status === "PENDING") {
                    let actualProcessed = jobData.processed || 0;
                    let total = jobData.total || 0;

                    if (total > 0) {
                        let targetPercent = ((actualProcessed + 0.9) / total) * 100;
                        if (targetPercent > 99) targetPercent = 99;
                        let minPercent = (actualProcessed / total) * 100;
                        if (simulatedPercent < minPercent) simulatedPercent = minPercent;
                        simulatedPercent += (targetPercent - simulatedPercent) * 0.15;
                    } else {
                        simulatedPercent += (90 - simulatedPercent) * 0.05;
                    }

                    const displayPercent = Math.min(99, Math.round(simulatedPercent));

                    percentEl.textContent = `${displayPercent}%`;
                    barEl.style.width = `${displayPercent}%`;
                    statusEl.textContent = total > 0 ? `Analyzing... (${actualProcessed}/${total} blocks)` : "Server parsing text...";

                } else if (jobData.status === "COMPLETED") {
                    clearInterval(activePollInterval);
                    percentEl.textContent = "100%";
                    barEl.style.width = "100%";
                    statusEl.textContent = "✅ Save Complete!";
                    setTimeout(() => { container.style.display = 'none'; renderHistory(); }, 2500);
                } else if (jobData.status === "FAILED") {
                    clearInterval(activePollInterval);
                    statusEl.textContent = "🚨 Server Processing Failed";
                    statusEl.style.color = "#ef4444";
                    setTimeout(() => { container.style.display = 'none'; }, 3000);
                }
            } catch (e) {
                console.error("Progress polling error", e);
            }
        }, 1500);
    });
}

// =========================================================
// [결제 연동] 레몬스퀴지 체크아웃 팝업 띄우기
// =========================================================

const CHECKOUT_LINKS = {
    STARTER: "https://memory-bank.lemonsqueezy.com/checkout/buy/5673c702-c027-4ce2-94d3-2d3abbc703ba",
    LITE: "https://memory-bank.lemonsqueezy.com/checkout/buy/48419913-7c97-4859-b3b6-50438e33db61",
    PRO: "https://memory-bank.lemonsqueezy.com/checkout/buy/b6069143-22c7-4a59-ab74-bff25050e880",
    PREMIUM: "https://memory-bank.lemonsqueezy.com/checkout/buy/49f98617-3a0d-4940-bbe4-ac2389965cd8"
};

document.getElementById('tab-settings').addEventListener('click', () => switchTab('settings'));
document.getElementById('tab-store').addEventListener('click', () => switchTab('store'));

function switchTab(tab) {
    const isSettings = tab === 'settings';
    document.getElementById('content-settings').style.display = isSettings ? 'block' : 'none';
    document.getElementById('content-store').style.display = isSettings ? 'none' : 'block';

    document.getElementById('tab-settings').style.color = isSettings ? '#3b82f6' : '#6b7280';
    document.getElementById('tab-settings').style.borderBottom = isSettings ? '2px solid #3b82f6' : 'none';
    document.getElementById('tab-store').style.color = isSettings ? '#6b7280' : '#3b82f6';
    document.getElementById('tab-store').style.borderBottom = isSettings ? 'none' : '2px solid #3b82f6';
}

document.addEventListener('click', (e) => {
    if (e.target.classList.contains('upgrade-btn')) {
        const plan = e.target.getAttribute('data-plan');
        const baseUrl = CHECKOUT_LINKS[plan];

        chrome.storage.local.get(['userEmail'], (data) => {
            const email = data.userEmail;
            if (!email) { alert("Login is required."); return; }

            const finalUrl = `${baseUrl}?checkout[custom][user_email]=${encodeURIComponent(email)}&checkout[email]=${encodeURIComponent(email)}`;
            chrome.tabs.create({ url: finalUrl });
        });
    }
});

function updateStoreVisibility(role, hasStarterPack) {
    const starter = document.getElementById('card-starter');
    const lite = document.getElementById('card-lite');
    const pro = document.getElementById('card-pro');
    const premium = document.getElementById('card-premium');
    const storeTab = document.getElementById('tab-store');

    if (!starter || !lite || !pro || !premium) {
        console.error("Store UI elements not found.");
        return;
    }

    starter.style.display = 'block';
    lite.style.display = 'block';
    pro.style.display = 'block';
    premium.style.display = 'block';
    if (storeTab) storeTab.style.display = 'block';

    if (role === 'FREE') {
    } else if (role === 'LITE') {
        starter.style.display = 'none';
        lite.style.display = 'none';
    } else if (role === 'PRO') {
        starter.style.display = 'none';
        lite.style.display = 'none';
        pro.style.display = 'none';
    }
    else if (role === 'PREMIUM') {
        starter.style.display = 'none';
        lite.style.display = 'none';
        pro.style.display = 'none';
        premium.style.display = 'none';
    }

    if (hasStarterPack) {
        starter.style.display = 'none';
    }
}


// =========================================================
// [결제 관리] 레몬스퀴지 고객 포털 팝업 띄우기
// =========================================================

document.addEventListener('click', async (e) => {
    if (e.target.id === 'manage-subscription-btn') {
        const btn = e.target;
        btn.innerHTML = '⏳ Loading...';
        btn.disabled = true;

        chrome.storage.local.get(['memoryBankApiKey'], async (data) => {
            if (!data.memoryBankApiKey) {
                alert("Login is required to manage subscription.");
                btn.innerHTML = 'Manage Subscription';
                btn.disabled = false;
                return;
            }

            try {
                // 백엔드에 레몬스퀴지 고객 포털 URL 요청
                const response = await fetch("https://aimemorybank.cloud/api/billing/portal", {
                    method: "GET",
                    headers: { "X-API-KEY": data.memoryBankApiKey }
                });

                if (!response.ok) {
                    if (response.status === 404) {
                        alert("No active subscription found. You can purchase a plan first.");
                    } else {
                        throw new Error("Failed to retrieve billing portal URL");
                    }
                    return;
                }

                const result = await response.json();

                // 받아온 URL로 새 탭 열기
                if (result.portalUrl) {
                    chrome.tabs.create({ url: result.portalUrl });
                } else {
                    alert("Error: Missing portal URL in response.");
                }

            } catch (error) {
                console.error("Billing Portal Error:", error);
                alert("🚨 Failed to open billing portal. Please try again later.");
            } finally {
                btn.innerHTML = 'Manage Subscription';
                btn.disabled = false;
            }
        });
    }
});