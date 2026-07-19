// 都道府県クイズの「カテゴリ」定義（学習カレンダー用）
// 都道府県クイズ本体（index.html）は使わない。学習カレンダーが日付×カテゴリの
// マトリクスを作るときだけ、このファイルを読み込んでquestion_id(=都道府県コード)から
// カテゴリ（地方）を逆引きする。
//
// 依存なし。読み込むと window.QUESTIONS に {id, category} の配列がセットされる。
(function (global) {
  const AREA_DEFS = [
    { label: '北海道・東北', codes: [1, 2, 3, 4, 5, 6, 7] },
    { label: '関東', codes: [8, 9, 10, 11, 12, 13, 14] },
    { label: '中部', codes: [15, 16, 17, 18, 19, 20, 21, 22, 23] },
    { label: '近畿', codes: [24, 25, 26, 27, 28, 29, 30] },
    { label: '中国', codes: [31, 32, 33, 34, 35] },
    { label: '四国', codes: [36, 37, 38, 39] },
    { label: '九州・沖縄', codes: [40, 41, 42, 43, 44, 45, 46, 47] },
  ];

  const QUESTIONS = [];
  AREA_DEFS.forEach(area => {
    area.codes.forEach(code => {
      QUESTIONS.push({ id: code, category: area.label });
    });
  });

  global.QUESTIONS = QUESTIONS;
})(window);
