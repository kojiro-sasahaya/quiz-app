// 単元ごとの成績をlocalStorageにキャッシュし、出題優先度を計算する共通ロジック
// 依存: shared/api-client.js (window.QuizAPI) を先に読み込むこと
(function (global) {
  function cacheKey(unitId) {
    return `quiz-stats-cache-${unitId}`;
  }

  function loadCache(unitId) {
    try {
      const raw = localStorage.getItem(cacheKey(unitId));
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveCache(unitId, statsByQuestion) {
    localStorage.setItem(cacheKey(unitId), JSON.stringify(statsByQuestion));
  }

  // GASのstats応答 { questions: [{question_id,...}, ...] } を
  // question_idをキーにしたオブジェクトへ変換
  function normalizeFromServer(questionsArr) {
    const obj = {};
    (questionsArr || []).forEach(q => {
      obj[q.question_id] = q;
    });
    return obj;
  }

  // サーバーから最新集計を取得してキャッシュを更新（失敗時はキャッシュのみで動く＝オフライン対応）
  async function syncFromServer(unitId) {
    try {
      const data = await global.QuizAPI.getStats(unitId);
      const normalized = normalizeFromServer(data.questions);
      saveCache(unitId, normalized);
      return normalized;
    } catch (e) {
      console.warn('サーバーからの成績取得に失敗。ローカルキャッシュを使用します。', e);
      return loadCache(unitId);
    }
  }

  // 出題優先度スコア（高いほど優先して出題）
  // 未出題は最優先(1000)、連続不正解ボーナス(+200/回)、正答率が低いほど+最大500、出題回数が少ないほど+最大200
  function calcScore(stat) {
    if (!stat || !stat.total) return 1000;
    const correctRate = stat.correct / stat.total;
    const streakBonus = (stat.streak_wrong || 0) * 200;
    const accuracyScore = (1 - correctRate) * 500;
    const totalScore = Math.max(0, 200 - stat.total * 10);
    return accuracyScore + streakBonus + totalScore;
  }

  // pool: 問題データの配列, statsByQuestion: syncFromServer()の戻り値
  // idKey: 各問題オブジェクトの中で question_id に対応するプロパティ名（例: 'code', 'id'）
  function buildPriorityList(pool, statsByQuestion, count, idKey) {
    const scored = pool.map(item => ({
      ...item,
      score: calcScore(statsByQuestion[item[idKey]]) + Math.random() * 50,
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, Math.min(count, pool.length));
  }

  global.StatsCache = { loadCache, saveCache, syncFromServer, calcScore, buildPriorityList };
})(window);
