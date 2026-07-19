// GAS Web App との通信を担当する共通クライアント
// 依存: shared/config.js (window.QUIZ_CONFIG) を先に読み込むこと
(function (global) {
  const { GAS_URL, API_TOKEN } = global.QUIZ_CONFIG || {};
  const QUEUE_KEY = 'quiz-submit-queue';

  function buildGetUrl(params) {
    const usp = new URLSearchParams({ ...params, token: API_TOKEN });
    return `${GAS_URL}?${usp.toString()}`;
  }

  // 単元の問題別集計・セッション履歴を取得
  async function getStats(unitId) {
    const res = await fetch(buildGetUrl({ action: 'stats', unit_id: unitId }));
    if (!res.ok) throw new Error('stats fetch failed: ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data; // { unit_id, questions: [...], sessions: [...] }
  }

  // 全単元の概要（ダッシュボードのトップ用）
  async function getUnitsSummary() {
    const res = await fetch(buildGetUrl({ action: 'units' }));
    if (!res.ok) throw new Error('units fetch failed: ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data; // [{unit_id, total_answers, total_correct, accuracy, last_studied}, ...]
  }

  function makeSessionId() {
    if (global.crypto && global.crypto.randomUUID) return global.crypto.randomUUID();
    return 'sess-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  }

  // 1回分のクイズ結果を送信（失敗時は自動で再送キューに積む）
  async function submitSession(unitId, answers) {
    const payload = {
      action: 'submitSession',
      token: API_TOKEN,
      unit_id: unitId,
      session_id: makeSessionId(),
      answers,
    };
    try {
      await postPayload(payload);
      return true;
    } catch (e) {
      queuePayload(payload);
      return false;
    }
  }

  // text/plain で送るとブラウザのCORSプリフライトが発生せず、GAS側でも受け取りやすい
  async function postPayload(payload) {
    const res = await fetch(GAS_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('submit failed: ' + res.status);
    const data = await res.json();
    if (data.error) throw new Error(data.error);
    return data;
  }

  function queuePayload(payload) {
    const q = readQueue();
    q.push(payload);
    localStorage.setItem(QUEUE_KEY, JSON.stringify(q));
  }

  function readQueue() {
    try {
      return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
    } catch (e) {
      return [];
    }
  }

  // オフライン時などに送れなかった結果を再送する（ページ読み込み時などに呼ぶ）
  async function flushQueue() {
    const q = readQueue();
    if (q.length === 0) return;
    const remaining = [];
    for (const payload of q) {
      try {
        await postPayload(payload);
      } catch (e) {
        remaining.push(payload);
      }
    }
    localStorage.setItem(QUEUE_KEY, JSON.stringify(remaining));
  }

  global.QuizAPI = { getStats, getUnitsSummary, submitSession, flushQueue };
})(window);
