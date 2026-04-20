/**
 * Admin Billing Page - Token Management Dashboard
 *
 * Manages admin access to system-wide token billing statistics,
 * user management, and balance adjustments.
 */

let purchaseChart = null;
let consumptionChart = null;
let currentPage = 1;
let usersPerPage = 20;
let allUsers = [];
let currentAdminPassword = null;
let selectedUserId = null;

/**
 * Initialize admin billing page on load
 */
async function initAdminBilling() {
    try {
        // Check if admin is authenticated
        const adminPassword = localStorage.getItem('adminPassword');

        if (adminPassword) {
            currentAdminPassword = adminPassword;
            document.getElementById('mainSection').style.display = 'block';
            document.getElementById('authSection').style.display = 'none';
            await loadAdminDashboard();
        } else {
            document.getElementById('mainSection').style.display = 'none';
            document.getElementById('authSection').style.display = 'block';
        }
    } catch (error) {
        console.error('[ADMIN BILLING] Init error:', error);
        showToast('Ошибка инициализации', 'error');
    }
}

/**
 * Handle admin authentication
 */
async function handleAdminAuth(event) {
    event.preventDefault();

    try {
        const password = document.getElementById('adminPassword').value;

        if (!password) {
            showToast('Введите пароль', 'error');
            return;
        }

        // Test with a request using the password
        const response = await fetch('/api/billing/stats', {
            headers: {
                'Authorization': `Bearer ${password}`
            }
        });

        if (!response.ok) {
            throw new Error('Invalid password');
        }

        // Store password in localStorage
        localStorage.setItem('adminPassword', password);
        currentAdminPassword = password;

        // Show main section
        document.getElementById('mainSection').style.display = 'block';
        document.getElementById('authSection').style.display = 'none';

        // Clear password field
        document.getElementById('adminPassword').value = '';

        showToast('Авторизация успешна', 'success');

        // Load dashboard
        await loadAdminDashboard();
    } catch (error) {
        console.error('[ADMIN BILLING] Auth error:', error);
        showToast('Неправильный пароль администратора', 'error');
    }
}

/**
 * Load all admin dashboard data
 */
async function loadAdminDashboard() {
    try {
        const [stats, users] = await Promise.all([
            loadStats(),
            loadUsers(1)
        ]);

        updateStatsDashboard(stats);
        await renderCharts(stats);
    } catch (error) {
        console.error('[ADMIN BILLING] Load dashboard error:', error);
        showToast('Ошибка при загрузке данных', 'error');
    }
}

/**
 * GET /api/billing/stats - Fetch system-wide statistics
 */
async function loadStats() {
    try {
        const response = await fetch('/api/billing/stats', {
            headers: {
                'Authorization': `Bearer ${currentAdminPassword}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('[ADMIN BILLING] loadStats error:', error);
        throw error;
    }
}

/**
 * GET /api/billing/users - Fetch user list
 */
async function loadUsers(page = 1) {
    try {
        const limit = usersPerPage;
        const offset = (page - 1) * limit;

        const response = await fetch(
            `/api/billing/users?limit=${limit}&offset=${offset}`,
            {
                headers: {
                    'Authorization': `Bearer ${currentAdminPassword}`
                }
            }
        );

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();

        // For mock data (if endpoint not fully implemented)
        if (!data.users || data.users.length === 0) {
            // In production, this would fetch real data
            // For now, render empty state
            renderUsersTable([]);
            renderPagination(data.total || 0, page);
            return data;
        }

        allUsers = data.users;
        currentPage = page;

        renderUsersTable(data.users);
        renderPagination(data.total || 0, page);

        return data;
    } catch (error) {
        console.error('[ADMIN BILLING] loadUsers error:', error);
        throw error;
    }
}

/**
 * GET /api/billing/user/:id/transactions - Fetch user transactions
 */
async function loadUserTransactions(userId) {
    try {
        const response = await fetch(`/api/billing/user/${userId}/transactions?limit=100`, {
            headers: {
                'Authorization': `Bearer ${currentAdminPassword}`
            }
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error('[ADMIN BILLING] loadUserTransactions error:', error);
        throw error;
    }
}

/**
 * Update statistics dashboard cards
 */
function updateStatsDashboard(stats) {
    try {
        document.getElementById('totalUsersCount').textContent =
            formatNumber(stats.total_users || 0);

        document.getElementById('totalIssuedTokens').textContent =
            formatNumber(stats.tokens?.total_issued_lifetime || 0);

        document.getElementById('totalConsumedTokens').textContent =
            formatNumber(stats.tokens?.total_consumed_lifetime || 0);

        document.getElementById('averageBalancePerUser').textContent =
            formatNumber(stats.tokens?.average_balance_per_user || 0);

        document.getElementById('estimatedRevenue').textContent =
            formatNumber(stats.revenue?.estimated_revenue_rub || 0);
    } catch (error) {
        console.error('[ADMIN BILLING] updateStatsDashboard error:', error);
    }
}

/**
 * Render users table
 */
function renderUsersTable(users) {
    try {
        const tbody = document.getElementById('usersTableBody');

        if (!tbody) return;

        if (!users || users.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">Нет пользователей</td></tr>';
            return;
        }

        tbody.innerHTML = users.map(user => `
            <tr onclick="openUserModal(${user.telegram_id})">
                <td>${user.telegram_id}</td>
                <td>${formatNumber(user.balance_current || 0)}</td>
                <td>${formatNumber(user.total_spent || 0)}</td>
                <td><span style="background: #e8f5e9; color: #2e7d32; padding: 4px 8px; border-radius: 4px;">Активен</span></td>
                <td><button class="btn btn-secondary" onclick="event.stopPropagation(); openUserModal(${user.telegram_id})">Управление</button></td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('[ADMIN BILLING] renderUsersTable error:', error);
    }
}

/**
 * Render pagination controls
 */
function renderPagination(total, currentPage) {
    try {
        const container = document.getElementById('paginationControls');
        if (!container) return;

        const totalPages = Math.ceil(total / usersPerPage);

        if (totalPages <= 1) {
            container.innerHTML = '';
            return;
        }

        let html = '';

        // Previous button
        if (currentPage > 1) {
            html += `<button class="btn btn-secondary" onclick="loadUsers(${currentPage - 1})">← Предыдущая</button>`;
        }

        // Page numbers
        const startPage = Math.max(1, currentPage - 2);
        const endPage = Math.min(totalPages, currentPage + 2);

        if (startPage > 1) {
            html += `<button class="btn btn-secondary" onclick="loadUsers(1)">1</button>`;
            if (startPage > 2) html += '<span style="padding: 8px; color: #666;">...</span>';
        }

        for (let i = startPage; i <= endPage; i++) {
            html += `<button class="btn ${i === currentPage ? 'btn-primary active' : 'btn-secondary'}" onclick="loadUsers(${i})">${i}</button>`;
        }

        if (endPage < totalPages) {
            if (endPage < totalPages - 1) html += '<span style="padding: 8px; color: #666;">...</span>';
            html += `<button class="btn btn-secondary" onclick="loadUsers(${totalPages})">${totalPages}</button>`;
        }

        // Next button
        if (currentPage < totalPages) {
            html += `<button class="btn btn-secondary" onclick="loadUsers(${currentPage + 1})">Следующая →</button>`;
        }

        container.innerHTML = html;
    } catch (error) {
        console.error('[ADMIN BILLING] renderPagination error:', error);
    }
}

/**
 * Handle user search/filtering
 */
async function handleUserSearch() {
    try {
        const searchInput = document.getElementById('searchInput');
        const query = searchInput.value.trim();

        if (!query) {
            await loadUsers(1);
            return;
        }

        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">Поиск...</td></tr>';

        // Try to load specific user by telegram_id
        const telegramId = parseInt(query);
        if (isNaN(telegramId)) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">Введите корректный Telegram ID</td></tr>';
            return;
        }

        const userTransactions = await loadUserTransactions(telegramId);

        if (!userTransactions || !userTransactions.telegram_id) {
            tbody.innerHTML = '<tr><td colspan="5" class="no-data">Пользователь не найден</td></tr>';
            return;
        }

        // Display search result
        renderUsersTable([{
            telegram_id: userTransactions.telegram_id,
            balance_current: userTransactions.balance_current,
            total_spent: 0
        }]);
    } catch (error) {
        console.error('[ADMIN BILLING] handleUserSearch error:', error);
        const tbody = document.getElementById('usersTableBody');
        tbody.innerHTML = '<tr><td colspan="5" class="no-data">Ошибка при поиске</td></tr>';
    }
}

/**
 * Open user details modal
 */
async function openUserModal(userId) {
    try {
        selectedUserId = userId;

        const userModal = document.getElementById('userModal');
        userModal.classList.add('active');

        // Load user data
        const userTransactions = await loadUserTransactions(userId);

        // Display user info
        const userInfo = document.getElementById('userInfo');
        userInfo.innerHTML = `
            <div class="info-row">
                <span class="info-label">Telegram ID:</span>
                <span class="info-value">${userId}</span>
            </div>
            <div class="info-row">
                <span class="info-label">Текущий баланс:</span>
                <span class="info-value">${formatNumber(userTransactions.balance_current || 0)} токенов</span>
            </div>
            <div class="info-row">
                <span class="info-label">Всего потрачено:</span>
                <span class="info-value">${formatNumber(userTransactions.transactions?.reduce((sum, t) => sum + (t.amount < 0 ? Math.abs(t.amount) : 0), 0) || 0)} токенов</span>
            </div>
        `;

        // Display transactions
        const transactionsList = document.getElementById('userTransactionsList');
        if (!userTransactions.transactions || userTransactions.transactions.length === 0) {
            transactionsList.innerHTML = '<div class="no-data">Нет транзакций</div>';
        } else {
            transactionsList.innerHTML = userTransactions.transactions
                .slice(0, 20)
                .map(t => `
                    <div class="transaction-item">
                        <div class="transaction-info">
                            <div class="transaction-reason">${t.reason || 'Транзакция'}</div>
                            <div class="transaction-date">${formatDate(t.created_at)}</div>
                        </div>
                        <div class="transaction-amount ${t.amount > 0 ? 'amount-positive' : 'amount-negative'}">
                            ${t.amount > 0 ? '+' : ''}${formatNumber(Math.abs(t.amount))}
                        </div>
                    </div>
                `)
                .join('');
        }

        // Reset form
        document.getElementById('balanceAdjustmentForm').reset();
    } catch (error) {
        console.error('[ADMIN BILLING] openUserModal error:', error);
        showToast('Ошибка при загрузке данных пользователя', 'error');
    }
}

/**
 * Close user modal
 */
function closeUserModal() {
    const userModal = document.getElementById('userModal');
    userModal.classList.remove('active');
    selectedUserId = null;
}

/**
 * Handle balance adjustment form submission
 */
async function handleBalanceAdjustment(event) {
    event.preventDefault();

    try {
        if (!selectedUserId) {
            showToast('Пользователь не выбран', 'error');
            return;
        }

        const amount = parseInt(document.getElementById('adjustAmount').value);
        const reason = document.getElementById('adjustReason').value.trim();

        if (!amount || amount === 0) {
            showToast('Введите ненулевую сумму', 'error');
            return;
        }

        if (!reason) {
            showToast('Укажите причину', 'error');
            return;
        }

        // Confirm action
        const action = amount > 0 ? 'добавить' : 'вычесть';
        if (!confirm(`Вы уверены, что хотите ${action} ${Math.abs(amount)} токенов? Причина: ${reason}`)) {
            return;
        }

        // Send adjustment request
        const response = await fetch(`/api/billing/user/${selectedUserId}/balance`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentAdminPassword}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                amount,
                reason
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || 'Ошибка при корректировке баланса');
        }

        const result = await response.json();

        showToast(
            `✅ Баланс скорректирован. Было: ${formatNumber(result.balance_before)}, стало: ${formatNumber(result.balance_after)}`,
            'success'
        );

        // Close modal and refresh data
        closeUserModal();
        await loadAdminDashboard();
    } catch (error) {
        console.error('[ADMIN BILLING] handleBalanceAdjustment error:', error);
        showToast(`Ошибка: ${error.message}`, 'error');
    }
}

/**
 * Render charts (daily purchases and consumption)
 */
async function renderCharts(stats) {
    try {
        // Create dummy data if stats don't have daily breakdown
        const dailyData = stats.daily_stats || generateDummyDailyData();

        renderPurchaseChart(dailyData);
        renderConsumptionChart(dailyData);
    } catch (error) {
        console.error('[ADMIN BILLING] renderCharts error:', error);
    }
}

/**
 * Render daily purchase chart
 */
function renderPurchaseChart(dailyData) {
    try {
        const ctx = document.getElementById('purchaseChart');
        if (!ctx) return;

        const dates = dailyData.map(d => d.date);
        const purchases = dailyData.map(d => d.purchases_count || 0);

        if (purchaseChart) {
            purchaseChart.destroy();
        }

        purchaseChart = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Покупки пакетов',
                    data: purchases,
                    backgroundColor: '#667eea',
                    borderColor: '#667eea',
                    borderWidth: 0,
                    borderRadius: 4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1
                        }
                    }
                }
            }
        });
    } catch (error) {
        console.error('[ADMIN BILLING] renderPurchaseChart error:', error);
    }
}

/**
 * Render daily consumption chart
 */
function renderConsumptionChart(dailyData) {
    try {
        const ctx = document.getElementById('consumptionChart');
        if (!ctx) return;

        const dates = dailyData.map(d => d.date);
        const consumption = dailyData.map(d => d.tokens_consumed || 0);

        if (consumptionChart) {
            consumptionChart.destroy();
        }

        consumptionChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Потреблено токенов',
                    data: consumption,
                    borderColor: '#764ba2',
                    backgroundColor: 'rgba(118, 75, 162, 0.1)',
                    borderWidth: 2,
                    fill: true,
                    tension: 0.4,
                    pointBackgroundColor: '#764ba2',
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true
                    }
                }
            }
        });
    } catch (error) {
        console.error('[ADMIN BILLING] renderConsumptionChart error:', error);
    }
}

/**
 * Generate dummy daily data for past 30 days
 */
function generateDummyDailyData() {
    const data = [];
    const now = new Date();

    for (let i = 29; i >= 0; i--) {
        const date = new Date(now);
        date.setDate(date.getDate() - i);

        data.push({
            date: date.toISOString().split('T')[0],
            purchases_count: Math.floor(Math.random() * 10),
            tokens_consumed: Math.floor(Math.random() * 100000)
        });
    }

    return data;
}

/**
 * Export users to CSV
 */
async function exportUsersToCSV() {
    try {
        showToast('Подготовка экспорта...', 'info');

        // Load all users (simplified - in production would need pagination)
        const response = await fetch('/api/billing/users?limit=1000', {
            headers: {
                'Authorization': `Bearer ${currentAdminPassword}`
            }
        });

        if (!response.ok) {
            throw new Error('Ошибка при загрузке данных');
        }

        const data = await response.json();
        const users = data.users || [];

        // Generate CSV
        const headers = ['Telegram ID', 'Баланс', 'Потрачено всего'];
        const rows = users.map(u => [
            u.telegram_id,
            u.balance_current || 0,
            u.total_spent || 0
        ]);

        const csv = [
            headers.join(','),
            ...rows.map(row => row.join(','))
        ].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement('a');
        const url = URL.createObjectURL(blob);

        link.setAttribute('href', url);
        link.setAttribute('download', `billing_export_${new Date().toISOString().split('T')[0]}.csv`);
        link.style.visibility = 'hidden';

        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        showToast('✅ Экспорт завершён', 'success');
    } catch (error) {
        console.error('[ADMIN BILLING] exportUsersToCSV error:', error);
        showToast('Ошибка при экспорте', 'error');
    }
}

/**
 * Format large numbers
 */
function formatNumber(num) {
    if (typeof num !== 'number') return num;
    return num.toLocaleString('ru-RU');
}

/**
 * Format date
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
 * Show toast notification
 */
function showToast(message, type = 'info') {
    if (typeof window.showToast === 'function') {
        window.showToast(message, type);
    } else {
        console.log(`[${type.toUpperCase()}] ${message}`);
        if (type === 'error') {
            alert(`❌ ${message}`);
        }
    }
}

/**
 * Logout and clear session
 */
function logout() {
    localStorage.removeItem('adminPassword');
    location.reload();
}

/**
 * Close modal on Escape key
 */
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeUserModal();
    }
});

/**
 * Close modal when clicking outside
 */
document.addEventListener('click', (e) => {
    const modal = document.getElementById('userModal');
    if (modal && e.target === modal) {
        closeUserModal();
    }
});
