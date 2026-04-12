// Инициализация Telegram WebApp
const tg = window.Telegram?.WebApp;

// Состояние приложения
let state = {
    invoiceId: null,
    amountRub: 0,
    amountUsdt: 0,
    selectedCurrency: 'USDT',
    isPaid: false,
    isChecking: false
};

// DOM элементы
const elements = {
    userBalance: document.getElementById('userBalance'),
    amountRub: document.getElementById('amountRub'),
    amountUsdt: document.getElementById('amountUsdt'),
    invoiceId: document.getElementById('invoiceId'),
    payBtn: document.getElementById('payBtn'),
    checkBtn: document.getElementById('checkBtn'),
    statusCard: document.getElementById('statusCard'),
    statusIcon: document.getElementById('statusIcon'),
    statusTitle: document.getElementById('statusTitle'),
    statusMessage: document.getElementById('statusMessage'),
    currencyButtons: document.querySelectorAll('.currency-btn')
};

// Показать уведомление
function showToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.style.background = isError ? 'rgba(255, 82, 82, 0.9)' : 'rgba(0, 0, 0, 0.9)';
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 3000);
}

// Получить данные из URL
function getInvoiceFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const startParam = urlParams.get('tgWebAppStartParam');
    
    if (startParam && startParam.startsWith('invoice-')) {
        return startParam.replace('invoice-', '');
    }
    
    const pathParts = window.location.pathname.split('/');
    const invoiceIndex = pathParts.indexOf('invoices');
    if (invoiceIndex !== -1 && pathParts[invoiceIndex + 1]) {
        return pathParts[invoiceIndex + 1];
    }
    
    return null;
}

// Загрузить данные счёта
async function loadInvoiceData(invoiceId) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/getInvoices`, {
            headers: {
                'Crypto-Pay-API-Token': CONFIG.API_TOKEN
            },
            params: {
                invoice_ids: invoiceId
            }
        });
        
        const data = await response.json();
        if (data.ok && data.result.items.length > 0) {
            const invoice = data.result.items[0];
            state.amountUsdt = parseFloat(invoice.amount);
            state.amountRub = state.amountUsdt * CONFIG.RATE_USDT_TO_RUB;
            state.invoiceId = invoiceId;
            
            // Обновляем UI
            elements.amountRub.textContent = Math.round(state.amountRub) + ' ₽';
            elements.amountUsdt.textContent = state.amountUsdt.toFixed(2) + ' USDT';
            elements.invoiceId.textContent = invoiceId;
            
            return invoice;
        }
        return null;
    } catch (error) {
        console.error('Ошибка загрузки счёта:', error);
        return null;
    }
}

// Создать новый счёт
async function createInvoice(amountRub, currency) {
    const amountUsdt = amountRub / CONFIG.RATE_USDT_TO_RUB;
    
    try {
        const response = await fetch(`${CONFIG.API_URL}/createInvoice`, {
            method: 'POST',
            headers: {
                'Crypto-Pay-API-Token': CONFIG.API_TOKEN,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                asset: currency,
                amount: amountUsdt.toFixed(2),
                description: `Оплата ${amountRub} RUB через Mini App`,
                expires_in: 3600
            })
        });
        
        const data = await response.json();
        if (data.ok) {
            return {
                success: true,
                invoiceId: data.result.invoice_id,
                payUrl: data.result.pay_url
            };
        }
        return { success: false, error: data.error };
    } catch (error) {
        return { success: false, error: error.message };
    }
}

// Проверить статус оплаты
async function checkPayment(invoiceId) {
    try {
        const response = await fetch(`${CONFIG.API_URL}/getInvoices?invoice_ids=${invoiceId}`, {
            headers: {
                'Crypto-Pay-API-Token': CONFIG.API_TOKEN
            }
        });
        
        const data = await response.json();
        if (data.ok && data.result.items.length > 0) {
            const invoice = data.result.items[0];
            return {
                status: invoice.status,
                isPaid: invoice.status === 'paid'
            };
        }
        return { status: 'not_found', isPaid: false };
    } catch (error) {
        return { status: 'error', isPaid: false, error: error.message };
    }
}

// Обработка оплаты
async function handlePayment() {
    if (state.isPaid) {
        showToast('Счёт уже оплачен');
        return;
    }
    
    // Показываем загрузку
    const btnText = elements.payBtn.querySelector('.btn-text');
    const btnLoader = elements.payBtn.querySelector('.btn-loader');
    btnText.style.display = 'none';
    btnLoader.style.display = 'inline-block';
    elements.payBtn.disabled = true;
    
    try {
        // Создаём счёт
        const result = await createInvoice(state.amountRub, state.selectedCurrency);
        
        if (result.success) {
            state.invoiceId = result.invoiceId;
            elements.invoiceId.textContent = result.invoiceId;
            
            // Открываем платёжную ссылку в Telegram WebView
            if (tg && tg.openTelegramLink) {
                tg.openTelegramLink(result.payUrl);
            } else {
                window.open(result.payUrl, '_blank');
            }
            
            // Показываем карточку статуса
            elements.statusCard.style.display = 'block';
            elements.statusIcon.textContent = '⏳';
            elements.statusTitle.textContent = 'Ожидание оплаты';
            elements.statusMessage.textContent = 'Оплатите счёт в открывшемся окне';
            
            showToast('Счёт создан! Перейдите к оплате');
        } else {
            showToast('Ошибка создания счёта: ' + result.error, true);
        }
    } catch (error) {
        showToast('Ошибка: ' + error.message, true);
    } finally {
        btnText.style.display = 'inline-block';
        btnLoader.style.display = 'none';
        elements.payBtn.disabled = false;
    }
}

// Проверить статус
async function handleCheckPayment() {
    if (!state.invoiceId) {
        showToast('Нет активного счёта', true);
        return;
    }
    
    if (state.isChecking) return;
    state.isChecking = true;
    
    const checkBtn = elements.checkBtn;
    const originalText = checkBtn.textContent;
    checkBtn.textContent = '⏳ Проверяем...';
    checkBtn.disabled = true;
    
    try {
        const result = await checkPayment(state.invoiceId);
        
        if (result.isPaid) {
            state.isPaid = true;
            elements.statusIcon.textContent = '✅';
            elements.statusTitle.textContent = 'Оплачено!';
            elements.statusMessage.textContent = 'Спасибо за оплату!';
            elements.payBtn.style.display = 'none';
            showToast('✅ Оплата подтверждена!');
            
            // Уведомляем Telegram
            if (tg) {
                tg.close();
            }
        } else if (result.status === 'active') {
            elements.statusIcon.textContent = '⏳';
            elements.statusTitle.textContent = 'Ожидание оплаты';
            elements.statusMessage.textContent = 'Счёт ещё не оплачен. Пожалуйста, оплатите.';
            showToast('Счёт ещё не оплачен', true);
        } else if (result.status === 'expired') {
            elements.statusIcon.textContent = '⏰';
            elements.statusTitle.textContent = 'Счёт просрочен';
            elements.statusMessage.textContent = 'Создайте новый счёт';
            showToast('Счёт просрочен', true);
        }
    } catch (error) {
        showToast('Ошибка проверки: ' + error.message, true);
    } finally {
        checkBtn.textContent = originalText;
        checkBtn.disabled = false;
        state.isChecking = false;
    }
}

// Выбор валюты
function initCurrencySelector() {
    elements.currencyButtons.forEach(btn => {
        btn.addEventListener('click', () => {
            const currency = btn.dataset.currency;
            state.selectedCurrency = currency;
            
            elements.currencyButtons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

// Инициализация Telegram WebApp
function initTelegram() {
    if (tg) {
        tg.ready();
        tg.expand();
        
        // Устанавливаем тему
        if (tg.colorScheme === 'dark') {
            document.body.classList.add('dark');
        }
        document.body.classList.add('telegram');
        
        // Получаем данные пользователя
        if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
            const user = tg.initDataUnsafe.user;
            console.log('Пользователь:', user.first_name);
        }
    }
}

// Загрузка баланса пользователя (через API)
async function loadUserBalance() {
    try {
        const response = await fetch(`${CONFIG.API_URL}/getBalance`, {
            headers: {
                'Crypto-Pay-API-Token': CONFIG.API_TOKEN
            }
        });
        
        const data = await response.json();
        if (data.ok && data.result) {
            const usdtBalance = data.result.find(b => b.currency === 'USDT');
            if (usdtBalance) {
                elements.userBalance.textContent = usdtBalance.available.toFixed(2);
            }
        }
    } catch (error) {
        console.error('Ошибка загрузки баланса:', error);
        elements.userBalance.textContent = '0.00';
    }
}

// Инициализация приложения
async function init() {
    initTelegram();
    initCurrencySelector();
    
    // Проверяем, есть ли ID счёта в URL
    const invoiceId = getInvoiceFromURL();
    if (invoiceId) {
        const invoice = await loadInvoiceData(invoiceId);
        if (invoice) {
            // Показываем существующий счёт
            elements.payBtn.textContent = '💳 Перейти к оплате';
            elements.statusCard.style.display = 'block';
        } else {
            // Создаём тестовый счёт для демо
            state.amountRub = 100;
            state.amountUsdt = 100 / CONFIG.RATE_USDT_TO_RUB;
            elements.amountRub.textContent = '100 ₽';
            elements.amountUsdt.textContent = state.amountUsdt.toFixed(2) + ' USDT';
        }
    }
    
    // Загружаем баланс
    await loadUserBalance();
    
    // Обработчики кнопок
    elements.payBtn.addEventListener('click', handlePayment);
    elements.checkBtn.addEventListener('click', handleCheckPayment);
}

// Запуск
init();
