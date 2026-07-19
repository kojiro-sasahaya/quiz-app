/**
 * クイズアプリ用 データAPI（Google Apps Script）
 *
 * 使い方:
 * 1. このコードをスプレッドシートに紐づいたApps Scriptプロジェクトに貼り付ける
 *    （スプレッドシート → 拡張機能 → Apps Script）
 * 2. 下の API_TOKEN を好きな文字列に変更する（誰でも叩けるAPIになるための簡易対策）
 * 3. デプロイ → 新しいデプロイ → 種類「ウェブアプリ」
 *      - 次のユーザーとして実行: 自分
 *      - アクセスできるユーザー: 全員
 * 4. 発行されたウェブアプリのURLを、フロント側 config.js の GAS_URL に設定
 * 5. フロント側 config.js の API_TOKEN にも同じ文字列を設定
 */

// ==== 設定 ====
const API_TOKEN = 'CHANGE_ME_TO_ANY_SECRET_STRING'; // フロントのconfig.jsと同じ値にする
const SHEET_ANSWER_LOG = 'AnswerLog';
const SHEET_SESSION_LOG = 'SessionLog';

const ANSWER_LOG_HEADERS = ['timestamp', 'unit_id', 'question_id', 'question_label', 'mode', 'result', 'session_id'];
const SESSION_LOG_HEADERS = ['session_id', 'timestamp', 'unit_id', 'question_count', 'correct_count', 'accuracy'];

// ==== エントリーポイント ====

function doGet(e) {
  try {
    checkToken(e.parameter.token);
    const action = e.parameter.action;

    if (action === 'stats') {
      return jsonResponse(getStats(e.parameter.unit_id));
    }
    if (action === 'units') {
      return jsonResponse(getUnitsSummary());
    }
    if (action === 'log') {
      return jsonResponse(getAnswerLogEntries(e.parameter.unit_id));
    }
    return jsonResponse({ error: 'unknown action' }, 400);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 400);
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    checkToken(body.token);

    if (body.action === 'submitSession') {
      submitSession(body);
      return jsonResponse({ ok: true });
    }
    return jsonResponse({ error: 'unknown action' }, 400);
  } catch (err) {
    return jsonResponse({ error: String(err) }, 400);
  }
}

// ==== 認証（簡易） ====

function checkToken(token) {
  if (!API_TOKEN || API_TOKEN === 'CHANGE_ME_TO_ANY_SECRET_STRING') return; // 未設定なら素通り（開発中用）
  if (token !== API_TOKEN) throw new Error('invalid token');
}

// ==== 書き込み ====

function submitSession(body) {
  const unitId = body.unit_id;
  const sessionId = body.session_id || Utilities.getUuid();
  const answers = body.answers || [];
  const now = new Date();

  const answerSheet = getOrCreateSheet(SHEET_ANSWER_LOG, ANSWER_LOG_HEADERS);
  const rows = answers.map(a => [
    now, unitId, a.question_id, a.question_label || '', a.mode || '', a.result, sessionId,
  ]);
  if (rows.length > 0) {
    answerSheet.getRange(answerSheet.getLastRow() + 1, 1, rows.length, ANSWER_LOG_HEADERS.length).setValues(rows);
  }

  const correctCount = answers.filter(a => a.result === 'correct').length;
  const questionCount = answers.length;
  const accuracy = questionCount > 0 ? correctCount / questionCount : 0;

  const sessionSheet = getOrCreateSheet(SHEET_SESSION_LOG, SESSION_LOG_HEADERS);
  sessionSheet.appendRow([sessionId, now, unitId, questionCount, correctCount, accuracy]);
}

// ==== 読み取り／集計 ====

function getStats(unitId) {
  if (!unitId) throw new Error('unit_id is required');

  const answerRows = readSheetAsObjects(SHEET_ANSWER_LOG, ANSWER_LOG_HEADERS)
    .filter(r => r.unit_id === unitId);

  // question_idごとにグルーピングして集計
  const byQuestion = {};
  answerRows
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .forEach(r => {
      if (!byQuestion[r.question_id]) {
        byQuestion[r.question_id] = { question_id: r.question_id, question_label: '', total: 0, correct: 0, streak_wrong: 0, last_answered: null };
      }
      const q = byQuestion[r.question_id];
      q.total += 1;
      if (r.result === 'correct') {
        q.correct += 1;
        q.streak_wrong = 0;
      } else {
        q.streak_wrong += 1;
      }
      q.question_label = r.question_label || q.question_label;
      q.last_answered = formatDate(r.timestamp);
    });

  const sessionRows = readSheetAsObjects(SHEET_SESSION_LOG, SESSION_LOG_HEADERS)
    .filter(r => r.unit_id === unitId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(r => ({
      session_id: r.session_id,
      timestamp: formatDate(r.timestamp),
      question_count: Number(r.question_count),
      correct_count: Number(r.correct_count),
      accuracy: Number(r.accuracy),
    }));

  return {
    unit_id: unitId,
    questions: Object.values(byQuestion),
    sessions: sessionRows,
  };
}

// 日付×カテゴリのカレンダー表示用に、生の回答ログを返す
// （カテゴリはサーバー側では持たず、フロント側で各単元のデータからquestion_idをもとに引く）
function getAnswerLogEntries(unitId) {
  if (!unitId) throw new Error('unit_id is required');

  const entries = readSheetAsObjects(SHEET_ANSWER_LOG, ANSWER_LOG_HEADERS)
    .filter(r => r.unit_id === unitId)
    .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
    .map(r => ({
      date: formatDate(r.timestamp),
      question_id: r.question_id,
      result: r.result,
    }));

  return { unit_id: unitId, entries: entries };
}

function getUnitsSummary() {
  const answerRows = readSheetAsObjects(SHEET_ANSWER_LOG, ANSWER_LOG_HEADERS);
  const sessionRows = readSheetAsObjects(SHEET_SESSION_LOG, SESSION_LOG_HEADERS);

  const units = {};
  answerRows.forEach(r => {
    if (!units[r.unit_id]) units[r.unit_id] = { unit_id: r.unit_id, total_answers: 0, total_correct: 0, last_studied: null };
    const u = units[r.unit_id];
    u.total_answers += 1;
    if (r.result === 'correct') u.total_correct += 1;
    const d = formatDate(r.timestamp);
    if (!u.last_studied || d > u.last_studied) u.last_studied = d;
  });

  sessionRows.forEach(r => {
    if (!units[r.unit_id]) units[r.unit_id] = { unit_id: r.unit_id, total_answers: 0, total_correct: 0, last_studied: null };
  });

  return Object.values(units).map(u => ({
    ...u,
    accuracy: u.total_answers > 0 ? u.total_correct / u.total_answers : 0,
  }));
}

// ==== シート操作の共通ヘルパー ====

function getOrCreateSheet(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(name);
  if (!sheet) {
    sheet = ss.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function readSheetAsObjects(name, headers) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName(name);
  if (!sheet || sheet.getLastRow() < 2) return [];
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, headers.length).getValues();
  return values.map(row => {
    const obj = {};
    headers.forEach((h, i) => { obj[h] = row[i]; });
    return obj;
  });
}

function formatDate(d) {
  const date = (d instanceof Date) ? d : new Date(d);
  return Utilities.formatDate(date, Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// ==== レスポンス生成 ====

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
