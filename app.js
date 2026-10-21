/**
 * Aura Habits — Telegram Mini App Core Logic
 * 24/7 Cloud Sync via Telegram CloudStorage + LocalStorage Fallback
 */

(function () {
  'use strict';

  var state = {
    habits: [],
    logs: {},
    settings: { soundEnabled: true, hapticsEnabled: true },
    selectedDate: getTodayString(),
    activeFilter: 'all',
    isTelegram: false
  };

  var elements = {
    currentDateSubtitle: document.getElementById('currentDateSubtitle'),
    syncStatusBadge: document.getElementById('syncStatusBadge'),
    syncStatusText: document.getElementById('syncStatusText'),
    syncStatusDot: document.querySelector('.status-dot'),
    openStatsModalBtn: document.getElementById('openStatsModalBtn'),
    openAddModalBtn: document.getElementById('openAddModalBtn'),
    fabAddBtn: document.getElementById('fabAddBtn'),

    heroProgressRing: document.getElementById('heroProgressRing'),
    heroProgressPercent: document.getElementById('heroProgressPercent'),
    heroMotivationalTitle: document.getElementById('heroMotivationalTitle'),
    heroMotivationalDesc: document.getElementById('heroMotivationalDesc'),
    heroCompletedCount: document.getElementById('heroCompletedCount'),
    heroStreakCount: document.getElementById('heroStreakCount'),
    heroTotalCompletions: document.getElementById('heroTotalCompletions'),

    weekStripContainer: document.getElementById('weekStripContainer'),
    prevDayBtn: document.getElementById('prevDayBtn'),
    nextDayBtn: document.getElementById('nextDayBtn'),
    goToTodayBtn: document.getElementById('goToTodayBtn'),
    filterPillsContainer: document.getElementById('filterPillsContainer'),
    habitsListContainer: document.getElementById('habitsListContainer'),
    emptyStateContainer: document.getElementById('emptyStateContainer'),
    emptyStateAddBtn: document.getElementById('emptyStateAddBtn'),

    habitModalOverlay: document.getElementById('habitModalOverlay'),
    closeHabitModalBtn: document.getElementById('closeHabitModalBtn'),
    cancelHabitBtn: document.getElementById('cancelHabitBtn'),
    habitForm: document.getElementById('habitForm'),
    habitModalTitle: document.getElementById('habitModalTitle'),
    habitFormId: document.getElementById('habitFormId'),
    habitFormTitle: document.getElementById('habitFormTitle'),
    habitFormCategory: document.getElementById('habitFormCategory'),
    habitFormTimeOfDay: document.getElementById('habitFormTimeOfDay'),
    habitModalEmojiBadge: document.getElementById('habitModalEmojiBadge'),
    emojiSelector: document.getElementById('emojiSelector'),
    colorSelector: document.getElementById('colorSelector'),

    statsModalOverlay: document.getElementById('statsModalOverlay'),
    closeStatsModalBtn: document.getElementById('closeStatsModalBtn'),
    statsBestStreak: document.getElementById('statsBestStreak'),
    statsSuccessRate: document.getElementById('statsSuccessRate'),
    statsTotalChecks: document.getElementById('statsTotalChecks'),
    heatmapContainer: document.getElementById('heatmapContainer'),
    habitsStatsBreakdown: document.getElementById('habitsStatsBreakdown'),

    confettiCanvas: document.getElementById('confettiCanvas')
  };

  // --- TELEGRAM WEBAPP NATIVE SETUP ---
  var tg = (window.Telegram && window.Telegram.WebApp) ? window.Telegram.WebApp : null;

  if (tg) {
    state.isTelegram = true;
    try {
      tg.ready();
      tg.expand();
      if (tg.setHeaderColor) tg.setHeaderColor('#080c14');
      if (tg.setBackgroundColor) tg.setBackgroundColor('#080c14');
      if (tg.enableClosingConfirmation) tg.enableClosingConfirmation();
    } catch (e) {
      console.warn('Telegram WebApp setup error:', e);
    }
  }

  // --- AUDIO SYNTHESIS (Web Audio API) ---
  var audioCtx = null;
  function getAudioContext() {
    if (!audioCtx) {
      var AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) audioCtx = new AudioContext();
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  }

  function playSuccessChime() {
    if (!state.settings.soundEnabled) return;
    try {
      var ctx = getAudioContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      [659.25, 987.77].forEach(function (freq, idx) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + idx * 0.04);
        gain.gain.setValueAtTime(0.001, now + idx * 0.04);
        gain.gain.exponentialRampToValueAtTime(0.12, now + idx * 0.04 + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.04 + 0.45);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.04);
        osc.stop(now + idx * 0.04 + 0.5);
      });
    } catch (e) {}
  }

  function playFanfareChime() {
    if (!state.settings.soundEnabled) return;
    try {
      var ctx = getAudioContext();
      if (!ctx) return;
      var now = ctx.currentTime;
      [523.25, 659.25, 783.99, 1046.50].forEach(function (freq, idx) {
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.09);
        gain.gain.setValueAtTime(0.001, now + idx * 0.09);
        gain.gain.exponentialRampToValueAtTime(0.18, now + idx * 0.09 + 0.03);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + idx * 0.09 + 0.5);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now + idx * 0.09);
        osc.stop(now + idx * 0.09 + 0.55);
      });
    } catch (e) {}
  }

  // --- TACTILE HAPTICS (Telegram native / Navigator vibrate) ---
  function triggerHaptic(type) {
    if (!state.settings.hapticsEnabled) return;
    if (tg && tg.HapticFeedback) {
      try {
        if (type === 'success') {
          tg.HapticFeedback.notificationOccurred('success');
        } else {
          tg.HapticFeedback.impactOccurred('medium');
        }
        return;
      } catch (e) {}
    }
    if ('vibrate' in navigator) {
      try {
        navigator.vibrate(type === 'success' ? [30, 40, 30] : [20, 30, 20]);
      } catch (e) {}
    }
  }

  // --- CONFETTI CELEBRATION ---
  function launchConfetti() {
    var canvas = elements.confettiCanvas;
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var colors = ['#06b6d4', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#ffffff'];
    var particles = [];

    for (var i = 0; i < 70; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.45,
        vx: (Math.random() - 0.5) * 16,
        vy: -Math.random() * 14 - 4,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotSpeed: (Math.random() - 0.5) * 12,
        alpha: 1,
        shape: Math.random() > 0.5 ? 'circle' : 'rect'
      });
    }

    var animationId;
    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var alive = false;
      particles.forEach(function (p) {
        p.x += p.vx;
        p.y += p.vy;
        p.vy += 0.4;
        p.vx *= 0.98;
        p.rotation += p.rotSpeed;
        p.alpha -= 0.012;
        if (p.alpha > 0) {
          alive = true;
          ctx.save();
          ctx.globalAlpha = Math.max(0, p.alpha);
          ctx.translate(p.x, p.y);
          ctx.rotate((p.rotation * Math.PI) / 180);
          ctx.fillStyle = p.color;
          if (p.shape === 'circle') {
            ctx.beginPath();
            ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
            ctx.fill();
          } else {
            ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          }
          ctx.restore();
        }
      });
      if (alive) {
        animationId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animationId);
      }
    }
    render();
  }

  // --- DATE HELPERS ---
  function getTodayString() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatDateFriendly(dateStr) {
    var parts = dateStr.split('-').map(Number);
    var date = new Date(parts[0], parts[1] - 1, parts[2]);
    var days = ['Воскресенье', 'Понедельник', 'Вторник', 'Среда', 'Четверг', 'Пятница', 'Суббота'];
    var months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    if (dateStr === getTodayString()) return 'Сегодня, ' + date.getDate() + ' ' + months[date.getMonth()];
    return days[date.getDay()] + ', ' + date.getDate() + ' ' + months[date.getMonth()];
  }

  function getDayOfWeekShort(date) {
    return ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'][date.getDay()];
  }

  function setSyncStatus(status, text) {
    elements.syncStatusText.textContent = text;
    elements.syncStatusDot.className = 'status-dot ' + (status === 'syncing' ? 'offline' : 'online');
  }

  // --- STORAGE: TELEGRAM CLOUDSTORAGE + LOCALSTORAGE ---
  function getDefaultHabits() {
    return [
      { id: 'h-1', title: 'Выпить 2 литра воды', category: 'health', timeOfDay: 'all', emoji: '💧', color: '#06b6d4' },
      { id: 'h-2', title: 'Утренняя зарядка и растяжка', category: 'sport', timeOfDay: 'morning', emoji: '⚡', color: '#10b981' },
      { id: 'h-3', title: 'Чтение книги (20 страниц)', category: 'mind', timeOfDay: 'evening', emoji: '📚', color: '#8b5cf6' },
      { id: 'h-4', title: 'Медитация или отдых без экрана', category: 'mind', timeOfDay: 'morning', emoji: '🧘', color: '#f59e0b' },
      { id: 'h-5', title: 'Прогулка 30 минут на воздухе', category: 'health', timeOfDay: 'day', emoji: '🚶', color: '#f43f5e' },
      { id: 'h-6', title: 'Отход ко сну до 23:30', category: 'health', timeOfDay: 'evening', emoji: '🌙', color: '#3b82f6' }
    ];
  }

  function loadData() {
    // 1. Instant local display from cache
    var local = localStorage.getItem('aura_habits_data_v2');
    if (local) {
      try {
        var parsed = JSON.parse(local);
        state.habits = parsed.habits || [];
        state.logs = parsed.logs || {};
        renderAll();
      } catch (e) {}
    } else {
      state.habits = getDefaultHabits();
      state.logs = {};
      state.logs[getTodayString()] = { 'h-1': true, 'h-2': true };
      renderAll();
    }

    // 2. Sync from Telegram CloudStorage (synchronizes across all devices!)
    if (tg && tg.CloudStorage) {
      setSyncStatus('syncing', 'Синхронизация...');
      tg.CloudStorage.getItem('aura_habits_store', function (err, value) {
        if (!err && value) {
          try {
            var cloudData = JSON.parse(value);
            if (cloudData.habits && cloudData.habits.length > 0) {
              state.habits = cloudData.habits;
            }
            if (cloudData.logs) {
              state.logs = Object.assign(state.logs, cloudData.logs);
            }
            localStorage.setItem('aura_habits_data_v2', JSON.stringify({ habits: state.habits, logs: state.logs }));
            setSyncStatus('online', 'Telegram Cloud');
            renderAll();
            return;
          } catch (e) {}
        }
        // Save initial state to Telegram Cloud
        saveData();
        setSyncStatus('online', 'Telegram Cloud');
      });
    } else {
      setSyncStatus('online', 'В сети');
    }
  }

  function saveData() {
    var payload = { habits: state.habits, logs: state.logs, lastUpdated: new Date().toISOString() };
    localStorage.setItem('aura_habits_data_v2', JSON.stringify(payload));

    if (tg && tg.CloudStorage) {
      setSyncStatus('syncing', 'Сохранение...');
      tg.CloudStorage.setItem('aura_habits_store', JSON.stringify(payload), function (err, success) {
        if (!err && success) {
          setSyncStatus('online', 'Telegram Cloud');
        } else {
          setSyncStatus('online', 'Локально');
        }
      });
    }
  }

  // --- HABIT ACTIONS ---
  function toggleHabit(habitId, dateStr) {
    var isDone = Boolean(state.logs[dateStr] && state.logs[dateStr][habitId]);
    var newStatus = !isDone;

    if (!state.logs[dateStr]) state.logs[dateStr] = {};
    if (newStatus) {
      state.logs[dateStr][habitId] = true;
      playSuccessChime();
      triggerHaptic('impact');

      var total = state.habits.length;
      var count = Object.keys(state.logs[dateStr]).length;
      if (total > 0 && count === total) {
        setTimeout(function () {
          triggerHaptic('success');
          playFanfareChime();
          launchConfetti();
        }, 150);
      }
    } else {
      delete state.logs[dateStr][habitId];
      triggerHaptic('impact');
    }

    saveData();
    renderAll();
  }

  // --- STREAKS & CALCULATIONS ---
  function calculateHabitStreak(habitId) {
    var streak = 0;
    var checkDate = new Date();
    var todayStr = getTodayString();
    if (Boolean(state.logs[todayStr] && state.logs[todayStr][habitId])) {
      streak++;
      checkDate.setDate(checkDate.getDate() - 1);
    } else {
      checkDate.setDate(checkDate.getDate() - 1);
      var yStr = checkDate.getFullYear() + '-' + String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + String(checkDate.getDate()).padStart(2, '0');
      if (!Boolean(state.logs[yStr] && state.logs[yStr][habitId])) return 0;
    }

    while (true) {
      var dStr = checkDate.getFullYear() + '-' + String(checkDate.getMonth() + 1).padStart(2, '0') + '-' + String(checkDate.getDate()).padStart(2, '0');
      if (Boolean(state.logs[dStr] && state.logs[dStr][habitId])) {
        streak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else break;
    }
    return streak;
  }

  function calculateBestOverallStreak() {
    var best = 0;
    state.habits.forEach(function (h) {
      var s = calculateHabitStreak(h.id);
      if (s > best) best = s;
    });
    return best;
  }

  function calculateTotalCompletions() {
    var total = 0;
    for (var d in state.logs) total += Object.keys(state.logs[d] || {}).length;
    return total;
  }

  // --- RENDERING ---
  function renderAll() {
    elements.currentDateSubtitle.textContent = formatDateFriendly(state.selectedDate);

    // Hero Progress
    var totalHabits = state.habits.length;
    var completedHabits = state.logs[state.selectedDate] ? Object.keys(state.logs[state.selectedDate]).length : 0;
    var percent = totalHabits > 0 ? Math.round((completedHabits / totalHabits) * 100) : 0;
    var circumference = 326.7;
    elements.heroProgressRing.style.strokeDashoffset = circumference - (percent / 100) * circumference;
    elements.heroProgressPercent.textContent = percent + '%';
    elements.heroCompletedCount.textContent = completedHabits + '/' + totalHabits;
    elements.heroStreakCount.textContent = '🔥 ' + calculateBestOverallStreak();
    elements.heroTotalCompletions.textContent = calculateTotalCompletions();

    if (percent === 100 && totalHabits > 0) {
      elements.heroMotivationalTitle.textContent = '🎉 Идеальный день! Все цели закрыты!';
      elements.heroMotivationalDesc.textContent = 'Вы отлично поработали над собой. Отдыхайте с чистой совестью!';
    } else if (percent >= 50) {
      elements.heroMotivationalTitle.textContent = '🔥 Отличный темп, вы на волне!';
      elements.heroMotivationalDesc.textContent = 'Осталось еще ' + (totalHabits - completedHabits) + ' шага до победы.';
    } else {
      elements.heroMotivationalTitle.textContent = 'Новый день — новые победы';
      elements.heroMotivationalDesc.textContent = 'Маленькие шаги формируют устойчивые привычки.';
    }

    // Week Strip
    elements.weekStripContainer.innerHTML = '';
    var selected = new Date(state.selectedDate + 'T00:00:00');
    var todayStr = getTodayString();
    for (var offset = -3; offset <= 3; offset++) {
      var d = new Date(selected);
      d.setDate(d.getDate() + offset);
      var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var isToday = dateStr === todayStr;
      var isSelected = dateStr === state.selectedDate;

      var dayLogs = state.logs[dateStr] || {};
      var count = Object.keys(dayLogs).length;
      var dotClass = '';
      if (state.habits.length > 0) {
        if (count >= state.habits.length) dotClass = 'complete';
        else if (count > 0) dotClass = 'partial';
      }

      var pill = document.createElement('div');
      pill.className = 'day-pill ' + (isSelected ? 'active' : '') + ' ' + (isToday ? 'today' : '');
      pill.setAttribute('data-date', dateStr);
      pill.innerHTML = '<span class="day-name">' + getDayOfWeekShort(d) + '</span><span class="day-num">' + d.getDate() + '</span><span class="day-dot ' + dotClass + '"></span>';
      pill.addEventListener('click', function () {
        triggerHaptic('impact');
        state.selectedDate = this.getAttribute('data-date');
        renderAll();
      });
      elements.weekStripContainer.appendChild(pill);
    }

    // Habits List
    elements.habitsListContainer.innerHTML = '';
    var filtered = state.habits.filter(function (h) {
      if (state.activeFilter === 'all') return true;
      if (['morning', 'day', 'evening'].indexOf(state.activeFilter) !== -1) {
        return h.timeOfDay === state.activeFilter || h.timeOfDay === 'all';
      }
      return h.category === state.activeFilter;
    });

    if (filtered.length === 0) {
      elements.emptyStateContainer.style.display = 'block';
      return;
    }
    elements.emptyStateContainer.style.display = 'none';

    filtered.forEach(function (habit) {
      var isDone = Boolean(state.logs[state.selectedDate] && state.logs[state.selectedDate][habit.id]);
      var streak = calculateHabitStreak(habit.id);
      var card = document.createElement('div');
      card.className = 'habit-card ' + (isDone ? 'completed' : '');
      card.style.setProperty('--card-color', habit.color || '#06b6d4');
      card.style.setProperty('--card-glow', (habit.color || '#06b6d4') + '55');

      var timeMap = { all: '🕒 Любое время', morning: '🌅 Утро', day: '☀️ День', evening: '🌙 Вечер' };
      var timeText = timeMap[habit.timeOfDay || 'all'] || '🕒 Любое время';

      card.innerHTML = 
        '<div class="habit-icon-badge" style="background: ' + (habit.color || '#06b6d4') + '18; color: ' + (habit.color || '#06b6d4') + ';">' + (habit.emoji || '✨') + '</div>' +
        '<div class="habit-details">' +
          '<div class="habit-title">' + escapeHtml(habit.title) + '</div>' +
          '<div class="habit-meta">' +
            '<span class="habit-tag">' + timeText + '</span>' +
            '<span class="habit-streak">🔥 ' + streak + ' дн.</span>' +
          '</div>' +
        '</div>' +
        '<div class="habit-actions">' +
          '<button class="toggle-check-btn ' + (isDone ? 'checked' : '') + '" title="Отметить">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"></polyline></svg>' +
          '</button>' +
          '<button class="habit-menu-btn" title="Опции">' +
            '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"></circle><circle cx="12" cy="5" r="1"></circle><circle cx="12" cy="19" r="1"></circle></svg>' +
          '</button>' +
        '</div>';

      card.querySelector('.toggle-check-btn').addEventListener('click', function () {
        toggleHabit(habit.id, state.selectedDate);
      });

      card.querySelector('.habit-menu-btn').addEventListener('click', function (e) {
        e.stopPropagation();
        triggerHaptic('impact');
        if (confirm('Удалить привычку "' + habit.title + '"?')) {
          state.habits = state.habits.filter(function (h) { return h.id !== habit.id; });
          saveData();
          renderAll();
        }
      });

      elements.habitsListContainer.appendChild(card);
    });
  }

  // --- MODALS & FORM ---
  var selectedEmoji = '💧';
  var selectedColor = '#06b6d4';

  function openAddHabitModal() {
    triggerHaptic('impact');
    elements.habitModalTitle.textContent = 'Новая привычка';
    elements.habitFormId.value = '';
    elements.habitFormTitle.value = '';
    elements.habitFormCategory.value = 'health';
    elements.habitFormTimeOfDay.value = 'all';
    selectedEmoji = '💧';
    selectedColor = '#06b6d4';
    updatePickerUI();
    elements.habitModalOverlay.classList.add('open');
    elements.habitFormTitle.focus();
  }

  function closeHabitModal() {
    elements.habitModalOverlay.classList.remove('open');
  }

  function updatePickerUI() {
    elements.habitModalEmojiBadge.textContent = selectedEmoji;
    document.querySelectorAll('.emoji-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.emoji === selectedEmoji);
    });
    document.querySelectorAll('.color-btn').forEach(function (btn) {
      btn.classList.toggle('active', btn.dataset.color === selectedColor);
    });
  }

  elements.emojiSelector.addEventListener('click', function (e) {
    var btn = e.target.closest('.emoji-btn');
    if (btn) {
      triggerHaptic('impact');
      selectedEmoji = btn.dataset.emoji;
      updatePickerUI();
    }
  });

  elements.colorSelector.addEventListener('click', function (e) {
    var btn = e.target.closest('.color-btn');
    if (btn) {
      triggerHaptic('impact');
      selectedColor = btn.dataset.color;
      updatePickerUI();
    }
  });

  elements.habitForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var title = elements.habitFormTitle.value.trim();
    if (!title) return;

    var habitData = {
      id: elements.habitFormId.value || ('h-' + Date.now()),
      title: title,
      category: elements.habitFormCategory.value,
      timeOfDay: elements.habitFormTimeOfDay.value,
      emoji: selectedEmoji,
      color: selectedColor
    };

    closeHabitModal();
    triggerHaptic('impact');

    var idx = state.habits.findIndex(function (h) { return h.id === habitData.id; });
    if (idx !== -1) {
      state.habits[idx] = habitData;
    } else {
      state.habits.push(habitData);
    }
    saveData();
    renderAll();
  });

  // --- STATS MODAL ---
  function openStatsModal() {
    triggerHaptic('impact');
    elements.statsBestStreak.textContent = '🔥 ' + calculateBestOverallStreak() + ' дн.';
    elements.statsTotalChecks.textContent = calculateTotalCompletions();
    elements.heatmapContainer.innerHTML = '';
    var now = new Date();
    var totalPossible = 0;
    var totalCompleted = 0;

    for (var i = 29; i >= 0; i--) {
      var d = new Date();
      d.setDate(now.getDate() - i);
      var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      var count = Object.keys(state.logs[dateStr] || {}).length;
      var total = state.habits.length || 1;
      totalPossible += total;
      totalCompleted += count;
      var ratio = count / total;
      var levelClass = '';
      if (ratio > 0.75) levelClass = 'level-4';
      else if (ratio > 0.5) levelClass = 'level-3';
      else if (ratio > 0.25) levelClass = 'level-2';
      else if (ratio > 0) levelClass = 'level-1';

      var cell = document.createElement('div');
      cell.className = 'heatmap-cell ' + levelClass;
      cell.title = dateStr + ': ' + count + '/' + total;
      elements.heatmapContainer.appendChild(cell);
    }

    var rate = totalPossible > 0 ? Math.round((totalCompleted / totalPossible) * 100) : 0;
    elements.statsSuccessRate.textContent = rate + '%';

    elements.habitsStatsBreakdown.innerHTML = '';
    state.habits.forEach(function (habit) {
      var checks = 0;
      for (var i = 29; i >= 0; i--) {
        var d = new Date();
        d.setDate(now.getDate() - i);
        var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (Boolean(state.logs[dateStr] && state.logs[dateStr][habit.id])) checks++;
      }
      var pct = Math.round((checks / 30) * 100);
      var row = document.createElement('div');
      row.className = 'breakdown-row';
      row.innerHTML = 
        '<span style="font-size: 18px;">' + habit.emoji + '</span>' +
        '<span class="breakdown-name">' + escapeHtml(habit.title) + '</span>' +
        '<div class="breakdown-bar-bg">' +
          '<div class="breakdown-bar-fill" style="width: ' + pct + '%; background: ' + (habit.color || '#06b6d4') + ';"></div>' +
        '</div>' +
        '<span class="breakdown-percent">' + pct + '%</span>';
      elements.habitsStatsBreakdown.appendChild(row);
    });

    elements.statsModalOverlay.classList.add('open');
  }

  // --- EVENT LISTENERS ---
  elements.openAddModalBtn.addEventListener('click', openAddHabitModal);
  elements.fabAddBtn.addEventListener('click', openAddHabitModal);
  elements.emptyStateAddBtn.addEventListener('click', openAddHabitModal);
  elements.closeHabitModalBtn.addEventListener('click', closeHabitModal);
  elements.cancelHabitBtn.addEventListener('click', closeHabitModal);

  elements.openStatsModalBtn.addEventListener('click', openStatsModal);
  elements.closeStatsModalBtn.addEventListener('click', function () {
    elements.statsModalOverlay.classList.remove('open');
  });

  elements.filterPillsContainer.addEventListener('click', function (e) {
    var pill = e.target.closest('.filter-pill');
    if (pill) {
      triggerHaptic('impact');
      document.querySelectorAll('.filter-pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      state.activeFilter = pill.dataset.filter;
      renderAll();
    }
  });

  elements.prevDayBtn.addEventListener('click', function () {
    triggerHaptic('impact');
    var d = new Date(state.selectedDate + 'T00:00:00');
    d.setDate(d.getDate() - 1);
    state.selectedDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    renderAll();
  });

  elements.nextDayBtn.addEventListener('click', function () {
    triggerHaptic('impact');
    var d = new Date(state.selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    state.selectedDate = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    renderAll();
  });

  elements.goToTodayBtn.addEventListener('click', function () {
    triggerHaptic('impact');
    state.selectedDate = getTodayString();
    renderAll();
  });

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // --- START ---
  loadData();
})();
