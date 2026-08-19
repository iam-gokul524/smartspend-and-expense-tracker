// ================= STATE MANAGEMENT =================
let transactions = JSON.parse(localStorage.getItem('smartspend_transactions')) || [];
let recurringBills = JSON.parse(localStorage.getItem('smartspend_recurring')) || [
  { id: '1', title: 'Room Rent', amount: 6000, day: 5, category: 'Rent & Housing' },
  { id: '2', title: 'Wifi Bill', amount: 800, day: 10, category: 'Bills & Utilities' }
];
let splitBills = JSON.parse(localStorage.getItem('smartspend_splits')) || [];
let savedPin = localStorage.getItem('smartspend_pin') || '1234';
let currentPinInput = '';
let monthlyBudget = parseFloat(localStorage.getItem('smartspend_budget')) || 25000;
let isPrivacyHidden = false;
let expenseChart = null;
let deferredPwaPrompt = null;

// ================= DOM ELEMENTS =================
const pinOverlay = document.getElementById('pin-lock-overlay');
const pinDots = document.querySelectorAll('.pin-dots .dot');
const pinTitle = document.getElementById('pin-title');
const lockNowBtn = document.getElementById('lock-now-btn');

const totalBalanceEl = document.getElementById('total-balance');
const totalIncomeEl = document.getElementById('total-income');
const totalExpenseEl = document.getElementById('total-expense');
const savingsRateEl = document.getElementById('savings-rate-pct');
const budgetSpentTextEl = document.getElementById('budget-spent-text');
const budgetPctEl = document.getElementById('budget-pct');
const budgetProgressBar = document.getElementById('budget-progress-bar');
const editBudgetIcon = document.getElementById('edit-budget-icon');

const transactionForm = document.getElementById('transaction-form');
const descInput = document.getElementById('trx-desc');
const amountInput = document.getElementById('trx-amount');
const dateInput = document.getElementById('trx-date');
const categoryInput = document.getElementById('trx-category');
const paymentInput = document.getElementById('trx-payment');

const voiceLoggerBtn = document.getElementById('voice-logger-btn');
const voiceBtnText = document.getElementById('voice-btn-text');

const smsModal = document.getElementById('sms-modal');
const openSmsModalBtn = document.getElementById('open-sms-modal-btn');
const smsRawText = document.getElementById('sms-raw-text');

const splitModal = document.getElementById('split-modal');
const addSplitModalBtn = document.getElementById('add-split-modal-btn');
const splitForm = document.getElementById('split-form');
const splitContainer = document.getElementById('split-bills-container');

const receiptFileInput = document.getElementById('receipt-file-input');
const ocrLoader = document.getElementById('ocr-loader');
const ocrStatusText = document.getElementById('ocr-status-text');

const recurringContainer = document.getElementById('recurring-bills-container');
const recurringModal = document.getElementById('recurring-modal');
const addRecurringModalBtn = document.getElementById('add-recurring-modal-btn');
const recurringForm = document.getElementById('recurring-form');
const billsAlertBanner = document.getElementById('bills-alert-banner');
const billsAlertText = document.getElementById('bills-alert-text');

const transactionListEl = document.getElementById('transaction-list');
const noDataMsgEl = document.getElementById('no-data-msg');
const searchInput = document.getElementById('search-input');
const filterCategory = document.getElementById('filter-category');
const filterType = document.getElementById('filter-type');

const privacyBtn = document.getElementById('toggle-privacy-btn');
const eyeIcon = document.getElementById('eye-icon');
const exportCsvBtn = document.getElementById('export-csv-btn');
const pwaInstallBtn = document.getElementById('pwa-install-btn');

dateInput.valueAsDate = new Date();

// ================= 1. SECURITY PIN LOGIC =================
window.pressPin = function(digit) {
  if (currentPinInput.length < 4) {
    currentPinInput += digit;
    updatePinDots();
  }

  if (currentPinInput.length === 4) {
    setTimeout(verifyPin, 150);
  }
};

window.deletePin = function() {
  currentPinInput = currentPinInput.slice(0, -1);
  updatePinDots();
};

function updatePinDots() {
  pinDots.forEach((dot, index) => {
    if (index < currentPinInput.length) {
      dot.classList.add('filled');
    } else {
      dot.classList.remove('filled');
    }
  });
}

function verifyPin() {
  if (currentPinInput === savedPin) {
    pinOverlay.style.opacity = '0';
    setTimeout(() => { pinOverlay.style.display = 'none'; }, 250);
    currentPinInput = '';
    updatePinDots();
  } else {
    alert('Incorrect PIN! Please try again.');
    currentPinInput = '';
    updatePinDots();
  }
}

window.togglePinReset = function() {
  const oldPin = prompt('Enter current PIN to change (Default: 1234):');
  if (oldPin === savedPin) {
    const newPin = prompt('Enter new 4-digit PIN:');
    if (newPin && newPin.length === 4 && !isNaN(newPin)) {
      savedPin = newPin;
      localStorage.setItem('smartspend_pin', savedPin);
      alert('Security PIN updated successfully!');
    } else {
      alert('PIN must be exactly 4 numeric digits.');
    }
  } else {
    alert('Wrong current PIN!');
  }
};

lockNowBtn.addEventListener('click', () => {
  currentPinInput = '';
  updatePinDots();
  pinOverlay.style.display = 'flex';
  pinOverlay.style.opacity = '1';
});

// ================= 2. VOICE LOGGER (WEB SPEECH API) =================
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
  const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new SpeechRecognition();
  recognition.continuous = false;
  recognition.lang = 'en-IN';

  voiceLoggerBtn.addEventListener('click', () => {
    voiceLoggerBtn.classList.add('voice-recording');
    voiceBtnText.innerText = 'Listening... Speak now (e.g. "Spent 150 for Petrol")';
    recognition.start();
  });

  recognition.onresult = (event) => {
    const transcript = event.results[0][0].transcript.toLowerCase();
    voiceBtnText.innerText = `Heard: "${transcript}"`;

    // Extract numbers (Amount)
    const amountMatch = transcript.match(/\d+/g);
    let detectedAmount = amountMatch ? parseFloat(amountMatch[0]) : null;

    if (detectedAmount) {
      amountInput.value = detectedAmount;
      descInput.value = transcript.replace(/\d+/g, '').replace(/spent|for|rupees|rs|paid/g, '').trim() || 'Voice Log Entry';

      // Auto Category Guessing
      if (transcript.includes('petrol') || transcript.includes('fuel') || transcript.includes('auto') || transcript.includes('bus') || transcript.includes('uber')) {
        categoryInput.value = 'Travel & Fuel';
      } else if (transcript.includes('tea') || transcript.includes('food') || transcript.includes('lunch') || transcript.includes('dinner') || transcript.includes('snacks')) {
        categoryInput.value = 'Food & Dining';
      } else if (transcript.includes('rent') || transcript.includes('room')) {
        categoryInput.value = 'Rent & Housing';
      }

      alert(`Voice Detected: ₹${detectedAmount} for "${descInput.value}". Form auto-filled!`);
    } else {
      alert(`Could not detect amount from: "${transcript}". Please try again.`);
    }

    voiceLoggerBtn.classList.remove('voice-recording');
    voiceBtnText.innerText = 'Voice Log (e.g. "Spent 150 for Petrol")';
  };

  recognition.onerror = () => {
    voiceLoggerBtn.classList.remove('voice-recording');
    voiceBtnText.innerText = 'Voice Log (e.g. "Spent 150 for Petrol")';
    alert('Could not capture voice. Please check microphone permission.');
  };
} else {
  voiceLoggerBtn.addEventListener('click', () => {
    alert('Web Speech API is not supported on this browser. Please use Google Chrome.');
  });
}

// ================= 3. SMS / BANK MESSAGE PARSER =================
openSmsModalBtn.addEventListener('click', () => {
  smsModal.style.display = 'flex';
});

window.closeSmsModal = function() {
  smsModal.style.display = 'none';
};

window.parseSmsText = function() {
  const text = smsRawText.value.trim();
  if (!text) return;

  // Regex to extract Amount
  const amountRegex = /(?:inr|rs\.?|debited by|spent)\s*([0-9,]+(?:\.[0-9]{2})?)/i;
  const match = text.match(amountRegex);

  let extractedAmount = null;
  if (match) {
    extractedAmount = parseFloat(match[1].replace(/,/g, ''));
  } else {
    const num = text.match(/\b\d{2,6}(?:\.\d{2})?\b/);
    if (num) extractedAmount = parseFloat(num[0]);
  }

  if (extractedAmount) {
    amountInput.value = extractedAmount;
    
    // Extract merchant if available
    let merchant = 'Bank Debit / UPI Payment';
    const atMatch = text.match(/(?:at|to|info)\s+([A-Za-z0-9\s_-]{3,20})/i);
    if (atMatch) merchant = atMatch[1].trim();

    descInput.value = merchant;
    paymentInput.value = 'UPI / GPay';
    
    closeSmsModal();
    smsRawText.value = '';
    alert(`Auto-Extracted ₹${extractedAmount} for ${merchant}! Check form below.`);
    descInput.focus();
  } else {
    alert('Could not automatically parse amount from SMS text. Please check the text.');
  }
};

// ================= 4. SPLIT BILL WITH FRIENDS =================
addSplitModalBtn.addEventListener('click', () => {
  splitModal.style.display = 'flex';
});

window.closeSplitModal = function() {
  splitModal.style.display = 'none';
};

splitForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('split-title').value.trim();
  const totalAmount = parseFloat(document.getElementById('split-total-amount').value);
  const peopleCount = parseInt(document.getElementById('split-people-count').value);
  const friendsText = document.getElementById('split-friends').value.trim();

  if (!title || isNaN(totalAmount) || isNaN(peopleCount)) return;

  const perHead = Math.round(totalAmount / peopleCount);
  const friendList = friendsText.split(',').map(f => ({ name: f.trim(), status: 'Pending' }));

  splitBills.unshift({
    id: Date.now().toString(),
    title,
    totalAmount,
    peopleCount,
    perHead,
    friends: friendList
  });

  localStorage.setItem('smartspend_splits', JSON.stringify(splitBills));
  renderSplitBills();
  closeSplitModal();
  splitForm.reset();
});

function renderSplitBills() {
  splitContainer.innerHTML = '';
  if (splitBills.length === 0) {
    splitContainer.innerHTML = '<p class="text-muted" style="font-size:0.85rem;">No active split bills.</p>';
    return;
  }

  splitBills.forEach(s => {
    const card = document.createElement('div');
    card.className = 'split-card-item';
    card.innerHTML = `
      <div class="split-header">
        <span class="split-title">${escapeHTML(s.title)}</span>
        <span class="badge badge-accent">${s.peopleCount} People</span>
      </div>
      <div class="split-amount">Total: ₹${s.totalAmount.toLocaleString('en-IN')}</div>
      <div class="split-per-head"><strong>₹${s.perHead.toLocaleString('en-IN')}</strong> per person</div>
      <div style="margin-top:6px; font-size:0.8rem; color:var(--text-muted);">
        Friends: ${s.friends.map(f => `<span class="badge" style="background:rgba(255,255,255,0.06); margin:2px;">${escapeHTML(f.name)}</span>`).join('')}
      </div>
      <div class="rec-actions">
        <button class="delete-btn" onclick="deleteSplitBill('${s.id}')" title="Delete Split">
          <i class="fa-regular fa-trash-can"></i> Remove
        </button>
      </div>
    `;
    splitContainer.appendChild(card);
  });
}

window.deleteSplitBill = function(id) {
  splitBills = splitBills.filter(s => s.id !== id);
  localStorage.setItem('smartspend_splits', JSON.stringify(splitBills));
  renderSplitBills();
};

// ================= AI RECEIPT OCR (Tesseract.js) =================
receiptFileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  ocrLoader.style.display = 'flex';
  ocrStatusText.innerText = 'AI is reading receipt text...';

  try {
    const worker = await Tesseract.createWorker('eng');
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();

    const amountRegex = /(?:total|amount|inr|rs\.?|₹|net payable)\s*[:=]?\s*([0-9,]+(?:\.[0-9]{2})?)/gi;
    let matches = [...text.matchAll(amountRegex)];
    let extractedAmount = null;

    if (matches.length > 0) {
      extractedAmount = parseFloat(matches[matches.length - 1][1].replace(/,/g, ''));
    } else {
      const allNumbers = text.match(/\b\d{2,6}\.\d{2}\b/g);
      if (allNumbers && allNumbers.length > 0) extractedAmount = parseFloat(allNumbers[allNumbers.length - 1]);
    }

    if (extractedAmount && !isNaN(extractedAmount)) {
      amountInput.value = extractedAmount;
      descInput.value = 'Scanned Receipt Item';
      ocrStatusText.innerText = `Found Amount: ₹${extractedAmount}! Form auto-filled.`;
    } else {
      ocrStatusText.innerText = 'Scanned, but amount was unclear. Please type manually.';
    }

    setTimeout(() => { ocrLoader.style.display = 'none'; }, 3000);
  } catch (err) {
    ocrStatusText.innerText = 'Failed to scan image. Please try again.';
    setTimeout(() => { ocrLoader.style.display = 'none'; }, 3000);
  }
});

// ================= RECURRING BILLS =================
function renderRecurringBills() {
  recurringContainer.innerHTML = '';
  const today = new Date();
  const currentDay = today.getDate();
  let dueSoonBills = [];

  recurringBills.forEach(b => {
    let daysLeft = b.day - currentDay;
    if (daysLeft < 0) daysLeft += 30;

    if (daysLeft <= 3) dueSoonBills.push(`${b.title} (₹${b.amount})`);

    const card = document.createElement('div');
    card.className = 'recurring-card-item';
    card.innerHTML = `
      <div class="rec-header">
        <span class="rec-title">${escapeHTML(b.title)}</span>
        <span class="badge ${daysLeft <= 3 ? 'badge-warning' : 'badge-accent'}">
          ${daysLeft === 0 ? 'Due Today!' : `Due in ${daysLeft} days`}
        </span>
      </div>
      <div class="rec-amount">₹${b.amount.toLocaleString('en-IN')}</div>
      <div class="rec-due"><i class="fa-regular fa-calendar"></i> Due on ${b.day}th of every month</div>
      <div class="rec-actions">
        <button class="btn btn-primary btn-sm" onclick="payRecurringBill('${b.id}')"><i class="fa-solid fa-check"></i> Paid</button>
        <button class="delete-btn" onclick="deleteRecurringBill('${b.id}')"><i class="fa-regular fa-trash-can"></i></button>
      </div>
    `;
    recurringContainer.appendChild(card);
  });

  if (dueSoonBills.length > 0) {
    billsAlertBanner.style.display = 'flex';
    billsAlertText.innerText = `Upcoming Bills: ${dueSoonBills.join(', ')} due within 3 days!`;
  } else {
    billsAlertBanner.style.display = 'none';
  }
}

window.payRecurringBill = function(id) {
  const bill = recurringBills.find(b => b.id === id);
  if (!bill) return;

  transactions.unshift({
    id: Date.now().toString(),
    type: 'expense',
    description: bill.title + ' (Monthly Bill)',
    amount: bill.amount,
    date: new Date().toISOString().slice(0, 10),
    category: bill.category,
    payment: 'UPI / GPay'
  });
  syncData();
  alert(`Recorded ₹${bill.amount} for ${bill.title}!`);
};

window.deleteRecurringBill = function(id) {
  recurringBills = recurringBills.filter(b => b.id !== id);
  localStorage.setItem('smartspend_recurring', JSON.stringify(recurringBills));
  renderRecurringBills();
};

addRecurringModalBtn.addEventListener('click', () => {
  recurringModal.style.display = 'flex';
});

window.closeRecurringModal = function() {
  recurringModal.style.display = 'none';
};

recurringForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const title = document.getElementById('rec-title').value.trim();
  const amount = parseFloat(document.getElementById('rec-amount').value);
  const day = parseInt(document.getElementById('rec-day').value);
  const category = document.getElementById('rec-category').value;

  if (!title || isNaN(amount) || isNaN(day)) return;

  recurringBills.push({ id: Date.now().toString(), title, amount, day, category });
  localStorage.setItem('smartspend_recurring', JSON.stringify(recurringBills));
  renderRecurringBills();
  closeRecurringModal();
  recurringForm.reset();
});

// ================= CORE CALCULATIONS & DASHBOARD =================
function formatCurrency(amount) {
  if (isPrivacyHidden) return '₹ ••••••';
  return '₹' + amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function updateMetrics() {
  const income = transactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const expense = transactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const balance = income - expense;
  const savingsRate = income > 0 ? Math.max(0, ((income - expense) / income) * 100).toFixed(1) : 0;

  totalBalanceEl.innerText = formatCurrency(balance);
  totalIncomeEl.innerText = formatCurrency(income);
  totalExpenseEl.innerText = formatCurrency(expense);
  savingsRateEl.innerText = `${savingsRate}%`;

  const budgetPct = Math.min(100, Math.round((expense / monthlyBudget) * 100));
  budgetSpentTextEl.innerText = `${formatCurrency(expense)} / ${formatCurrency(monthlyBudget)}`;
  budgetPctEl.innerText = `${budgetPct}%`;
  budgetProgressBar.style.width = `${budgetPct}%`;

  if (budgetPct >= 90) {
    budgetProgressBar.style.background = 'var(--accent-red)';
    budgetPctEl.style.background = 'var(--accent-glow-red)';
    budgetPctEl.style.color = 'var(--accent-red)';
  } else if (budgetPct >= 70) {
    budgetProgressBar.style.background = 'var(--accent-orange)';
    budgetPctEl.style.background = 'rgba(240, 136, 62, 0.2)';
    budgetPctEl.style.color = 'var(--accent-orange)';
  } else {
    budgetProgressBar.style.background = 'var(--accent-blue)';
    budgetPctEl.style.background = 'var(--accent-glow-blue)';
    budgetPctEl.style.color = 'var(--accent-blue)';
  }
}

editBudgetIcon.addEventListener('click', () => {
  const newBudget = prompt('Enter your Monthly Budget Target (₹):', monthlyBudget);
  if (newBudget && !isNaN(newBudget) && parseFloat(newBudget) > 0) {
    monthlyBudget = parseFloat(newBudget);
    localStorage.setItem('smartspend_budget', monthlyBudget);
    updateMetrics();
  }
});

function renderTransactions() {
  const searchTerm = searchInput.value.toLowerCase();
  const catFilter = filterCategory.value;
  const typeFilter = filterType.value;

  const filtered = transactions.filter(t => {
    const matchSearch = t.description.toLowerCase().includes(searchTerm);
    const matchCat = catFilter === 'ALL' || t.category === catFilter;
    const matchType = typeFilter === 'ALL' || t.type === typeFilter;
    return matchSearch && matchCat && matchType;
  });

  transactionListEl.innerHTML = '';

  if (filtered.length === 0) {
    noDataMsgEl.style.display = 'block';
  } else {
    noDataMsgEl.style.display = 'none';
    filtered.forEach(t => {
      const tr = document.createElement('tr');
      const isInc = t.type === 'income';
      const badgeClass = isInc ? 'badge-income' : 'badge-expense';
      const sign = isInc ? '+' : '-';
      const amountColor = isInc ? 'text-green' : 'text-red';

      tr.innerHTML = `
        <td>${t.date}</td>
        <td><strong>${escapeHTML(t.description)}</strong></td>
        <td><span class="badge" style="background: rgba(255,255,255,0.06);">${t.category}</span></td>
        <td>${t.payment}</td>
        <td><span class="badge ${badgeClass}">${t.type.toUpperCase()}</span></td>
        <td class="${amountColor}"><strong>${isPrivacyHidden ? '••••••' : sign + ' ' + formatCurrency(t.amount)}</strong></td>
        <td>
          <button class="delete-btn" onclick="deleteTransaction('${t.id}')">
            <i class="fa-regular fa-trash-can"></i>
          </button>
        </td>
      `;
      transactionListEl.appendChild(tr);
    });
  }
}

function escapeHTML(str) {
  return str.replace(/[&<>'"]/g, tag => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[tag] || tag));
}

transactionForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const type = document.querySelector('input[name="trx-type"]:checked').value;
  const description = descInput.value.trim();
  const amount = parseFloat(amountInput.value);
  const date = dateInput.value;
  const category = categoryInput.value;
  const payment = paymentInput.value;

  if (!description || isNaN(amount) || amount <= 0 || !date) return;

  transactions.unshift({ id: Date.now().toString(), type, description, amount, date, category, payment });
  syncData();
  descInput.value = '';
  amountInput.value = '';
  descInput.focus();
});

window.deleteTransaction = function(id) {
  transactions = transactions.filter(t => t.id !== id);
  syncData();
};

function syncData() {
  localStorage.setItem('smartspend_transactions', JSON.stringify(transactions));
  updateMetrics();
  renderTransactions();
  updateChart();
}

searchInput.addEventListener('input', renderTransactions);
filterCategory.addEventListener('change', renderTransactions);
filterType.addEventListener('change', renderTransactions);

privacyBtn.addEventListener('click', () => {
  isPrivacyHidden = !isPrivacyHidden;
  eyeIcon.className = isPrivacyHidden ? 'fa-solid fa-eye-slash text-red' : 'fa-solid fa-eye';
  updateMetrics();
  renderTransactions();
});

exportCsvBtn.addEventListener('click', () => {
  if (transactions.length === 0) {
    alert('No transactions to export!');
    return;
  }
  let csvContent = 'data:text/csv;charset=utf-8,ID,Date,Description,Type,Category,Payment_Method,Amount\n';
  transactions.forEach(t => {
    csvContent += `"${t.id}","${t.date}","${t.description.replace(/"/g, '""')}","${t.type}","${t.category}","${t.payment}",${t.amount}\n`;
  });
  const encodedUri = encodeURI(csvContent);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', `SmartSpend_Export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
});

// ================= CHART.JS ANALYTICS =================
function updateChart() {
  const expenseTransactions = transactions.filter(t => t.type === 'expense');
  const categoryTotals = {};

  expenseTransactions.forEach(t => {
    categoryTotals[t.category] = (categoryTotals[t.category] || 0) + t.amount;
  });

  const labels = Object.keys(categoryTotals);
  const data = Object.values(categoryTotals);
  const colors = ['#2F81F7', '#F85149', '#F0883E', '#2EA043', '#A371F7', '#FF7B72', '#388BFD', '#56D364'];

  const ctx = document.getElementById('expenseChart').getContext('2d');
  if (expenseChart) expenseChart.destroy();

  if (labels.length === 0) {
    expenseChart = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['No Expenses'],
        datasets: [{ data: [1], backgroundColor: ['rgba(255, 255, 255, 0.08)'], borderWidth: 0 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { enabled: false } }
      }
    });
    return;
  }

  expenseChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors.slice(0, labels.length),
        borderColor: '#161B22',
        borderWidth: 2,
        hoverOffset: 6
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: { color: '#8B949E', font: { size: 12, family: 'Plus Jakarta Sans' }, boxWidth: 14 }
        },
        tooltip: {
          callbacks: {
            label: (ctx) => ` ${ctx.label}: ₹${ctx.raw.toLocaleString('en-IN')}`
          }
        }
      },
      cutout: '68%'
    }
  });
}

// ================= INITIAL LOAD =================
syncData();
renderRecurringBills();
renderSplitBills();