/**
 * Balance & Billing Page - Token Management UI
 *
 * Manages user's token balance, transaction history, token packages,
 * and usage statistics with auto-refresh every 30 seconds.
 */

let usageChart = null;
let breakdownChart = null;
let autoRefreshInterval = null;

/**
 * Initialize balance page on load
 */
async function initBalance() {
    try {
        const chatId = getChatId();
        if (!chatId) {
            showToast('Требуется авторизация', 'error');
            return;
        }

        // Load all data
        await refreshData();

        // Setup auto-refresh every 30 seconds
        setupAutoRefresh();

        // Add event listeners for package cards (dynamically after packages load)
        document.addEventListener('packageCardClick', handlePackageClick);
    } catch (error) {
        console.error('[BALANCE] Init error:', error);
        showToast('Ошибка инициализации', 'error');
    }
}

/**
 * Refresh all data on page
 */
async function refreshData() {
    try {
        const chatId = getChatId();

        const [balance, transactions, usage, packages] = await Promise.all([
            loadBalance(chatId),
            loadTransactions(chatId),
            loadUsageStats(chatId),
            loadPackages()
        ]);

        updateBalanceDisplay(balance);
        renderTransactionTable(transactions);
        renderUsageCharts(usage);
        renderPackages(packages);

        showToast('Данные обновлены', 'success');
    } catch (error) {
        console.error('[BALANCE] Refresh error:', error);
        showToast('Ошибка при обновлении данных', 'error');
    }
}

/**
 * GET /api/billing/balance - Fetch user balance and plan info
 */
async function loadBalance(chatId) {
    try {
        const response = await fetch(`/api/billing/balance?telegram_id=${chatId}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('[BALANCE] loadBalance error:', error);
        throw error;
    }
}

/**
 * GET /api/billing/transactions - Fetch transaction history
 */
async function loadTransactions(chatId, limit = 50, offset = 0) {
    try {
        const params = new URLSearchParams({
            telegram_id: chatId,
            limit,
            offset
        });

        const response = await fetch(`/api/billing/transactions?${params}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data.transactions || [];
    } catch (error) {
        console.error('[BALANCE] loadTransactions error:', error);
        throw error;
    }
}

/**
 * GET /api/billing/usage - Fetch usage statistics
 */
async function loadUsageStats(chatId, period = '7d') {
    try {
        const params = new URLSearchParams({
            telegram_id: chatId,
            period
        });

        const response = await fetch(`/api/billing/usage?${params}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('[BALANCE] loadUsageStats error:', error);
        throw error;
    }
}

/**
 * GET /api/billing/packages - Fetch available token packages
 */
async function loadPackages() {
    try {
        const response = await fetch('/api/billing/packages');

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data.packages || [];
    } catch (error) {
        console.error('[BALANCE] loadPackages error:', error);
        throw error;
    }
}

/**
 * Update balance display section with fetched data
 */
function updateBalanceDisplay(balance) {
    try {
        const balanceDisplay = document.getElementById('balanceDisplay');
        const planDisplay = document.getElementById('planDisplay');
        const usageDisplay = document.getElementById('usageDisplay');
        const countDisplay = document.getElementById('countDisplay');

        if (balanceDisplay) {
            balanceDisplay.textContent = formatNumber(balance.balance_tokens || 0);
        }

        if (planDisplay) {
            planDisplay.textContent = balance.plan_id || 'free';
        }

        if (usageDisplay) {
            usageDisplay.textContent = formatNumber(balance.usage_this_month || 0);
        }

        if (countDisplay) {
            countDisplay.textContent = '—'; // Placeholder - could be transaction count
        }
    } catch (error) {
        console.error('[BALANCE] updateBalanceDisplay error:', error);
    }
}

/**
 * Render transaction history table
 */
function renderTransactionTable(transactions) {
    try {
        const tbody = document.getElementById('transactionsBody');

        if (!tbody) return;

        if (!transactions || transactions.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="no-data">Нет транзакций</td></tr>';
            return;
        }

        tbody.innerHTML = transactions.map(t => `
            <tr>
                <td>${formatDate(t.created_at)}</td>
                <td>${t.amount > 0 ? '➕ Пополнение' : '➖ Расход'}</td>
                <td>${t.reason || '—'}</td>
                <td>${t.model || '—'}</td>
                <td>${t.prompt_tokens ? formatNumber(t.prompt_tokens) : '—'}</td>
                <td>${t.completion_tokens ? formatNumber(t.completion_tokens) : '—'}</td>
                <td class="${t.amount > 0 ? 'amount-positive' : 'amount-negative'}">
                    ${t.amount > 0 ? '+' : ''}${formatNumber(Math.abs(t.amount))}
                </td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('[BALANCE] renderTransactionTable error:', error);
    }
}

/**
 * Render usage charts (line chart for daily usage, pie chart for usage by type)
 */
function renderUsageCharts(usage) {
    try {
        renderDailyUsageChart(usage.daily_breakdown || []);
        renderBreakdownChart(usage.usage_by_type || []);
    } catch (error) {
        console.error('[BALANCE] renderUsageCharts error:', error);
    }
}

/**
 * Render daily usage line chart
 */
function renderDailyUsageChart(dailyBreakdown) {
    try {
        const ctx = document.getElementById('usageChart');
        if (!ctx) return;

        // Prepare data
        const dates = dailyBreakdown.map(d => d.date);
        const tokens = dailyBreakdown.map(d => d.tokens_spent);

        // Destroy existing chart if it exists
        if (usageChart) {
            usageChart.destroy();
        }

        usageChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Токены использованы',
                    data: tokens,
                    borderColor: '#667eea',
                    backgroundColor: 'rgba(102, 126, 234, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#667eea',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top'
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        title: {
                            display: true,
                            text: 'Токены'
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('[BALANCE] renderDailyUsageChart error:', error);
    }
}

/**
 * Render usage breakdown pie chart (by model/type)
 */
function renderBreakdownChart(usageByType) {
    try {
        const ctx = document.getElementById('breakdownChart');
        if (!ctx) return;

        // Prepare data
        const labels = usageByType.map(u => u.type || 'unknown');
        const data = usageByType.map(u => u.tokens_spent);

        // Color palette
        const colors = [
            '#667eea', '#764ba2', '#f093fb', '#4facfe', '#00f2fe',
            '#43e97b', '#fa709a', '#fee140', '#30b0fe', '#ec7063'
        ];

        // Destroy existing chart if it exists
        if (breakdownChart) {
            breakdownChart.destroy();
        }

        breakdownChart = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, labels.length),
                    borderColor: '#fff',
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    }
                }
            }
        });
    } catch (error) {
        console.error('[BALANCE] renderBreakdownChart error:', error);
    }
}

/**
 * Render available token packages as purchase cards
 */
function renderPackages(packages) {
    try {
        const container = document.getElementById('packagesContainer');

        if (!container) return;

        if (!packages || packages.length === 0) {
            container.innerHTML = '<div class="no-data">Нет доступных пакетов</div>';
            return;
        }

        container.innerHTML = packages
            .filter(p => p.is_active)
            .map(pkg => `
                <div class="package-card" onclick="handlePackagePurchase('${pkg.package_id}', '${pkg.name}', ${pkg.tokens_amount})">
                    <div class="package-name">${pkg.name}</div>
                    <div class="package-tokens">${formatNumber(pkg.tokens_amount)}</div>
                    <div style="font-size: 0.9rem; color: #666; margin: 10px 0;">токенов</div>
                    <div class="package-price">${pkg.price_rub.toLocaleString('ru-RU')} ₽</div>
                    <button style="margin-top: 10px; padding: 8px 16px; background: #667eea; color: white; border: none; border-radius: 6px; cursor: pointer; font-weight: 600;">
                        Купить
                    </button>
                </div>
            `)
            .join('');
    } catch (error) {
        console.error('[BALANCE] renderPackages error:', error);
    }
}

/**
 * Handle package purchase click
 */
async function handlePackagePurchase(packageId, packageName, tokensAmount) {
    try {
        const chatId = getChatId();
        if (!chatId) {
            showToast('Требуется авторизация', 'error');
            return;
        }

        // Confirm purchase
        if (!confirm(`Купить пакет "${packageName}" (${formatNumber(tokensAmount)} токенов)?`)) {
            return;
        }

        // Send purchase request
        const response = await fetch('/api/billing/purchase', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                telegram_id: chatId,
                package_id: packageId
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при покупке');
        }

        const result = await response.json();

        showToast(`✅ Пакет куплен! Баланс: ${formatNumber(result.balance_tokens)} токенов`, 'success');

        // Refresh data
        await refreshData();
    } catch (error) {
        console.error('[BALANCE] handlePackagePurchase error:', error);
        showToast(`Ошибка: ${error.message}`, 'error');
    }
}

/**
 * Setup auto-refresh every 30 seconds
 */
function setupAutoRefresh() {
    try {
        // Clear existing interval if any
        if (autoRefreshInterval) {
            clearInterval(autoRefreshInterval);
        }

        // Update status indicator
        const statusEl = document.getElementById('autoRefreshStatus');
        if (statusEl) {
            statusEl.textContent = 'Авто-обновление: ВКЛ (30s)';
        }

        // Setup interval
        autoRefreshInterval = setInterval(async () => {
            try {
                const chatId = getChatId();
                const [balance, transactions, usage] = await Promise.all([
                    loadBalance(chatId),
                    loadTransactions(chatId),
                    loadUsageStats(chatId)
                ]);

                updateBalanceDisplay(balance);
                renderTransactionTable(transactions);
                renderUsageCharts(usage);
            } catch (error) {
                console.error('[BALANCE] Auto-refresh error:', error);
                // Don't show toast for auto-refresh errors, just log them
            }
        }, 30000);
    } catch (error) {
        console.error('[BALANCE] setupAutoRefresh error:', error);
    }
}

/**
 * Format large numbers with spaces
 */
function formatNumber(num) {
    if (typeof num !== 'number') return num;
    return num.toLocaleString('ru-RU');
}

/**
 * Format date string to readable format
 */
function formatDate(dateString) {
    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('ru-RU', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit'
        }) + ' ' + date.toLocaleTimeString('ru-RU', {
            hour: '2-digit',
            minute: '2-digit'
        });
    } catch (error) {
        return dateString || '—';
    }
}

/**
 * Show toast notification (reuse from common.js if available, fallback to alert)
 */
function showToast(message, type = 'info') {
    // Try to use common.js showToast if available
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        // Fallback to console and alert
        console.log(`[${type.toUpperCase()}] ${message}`);
        if (type === 'error') {
            alert(`❌ ${message}`);
        }
    }
}

/**
 * Clean up on page unload
 */
window.addEventListener('beforeunload', () => {
    if (autoRefreshInterval) {
        clearInterval(autoRefreshInterval);
    }
    if (usageChart) {
        usageChart.destroy();
    }
    if (breakdownChart) {
        breakdownChart.destroy();
    }
});
