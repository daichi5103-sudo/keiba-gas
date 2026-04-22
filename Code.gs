// ============================================================
// 🏇 競馬メモ - Google Apps Script バックエンド
// ============================================================
// セットアップ手順:
//   1. Google Sheetsで新しいスプレッドシートを作成
//   2. URLのID部分をSPREADSHEET_IDに貼り付ける
//      例: docs.google.com/spreadsheets/d/【ここ】/edit
//   3. GASエディタで initializeSheets() を実行
//   4. 任意: addSampleData() でサンプルデータを追加
//   5. デプロイ → ウェブアプリとして公開
//      - 実行するユーザー: 自分
//      - アクセスできるユーザー: Googleアカウントを持つ全員
// ============================================================

const SPREADSHEET_ID = 'YOUR_SPREADSHEET_ID_HERE'; // ← ここを変更

const SHEET_RACES   = 'Races';
const SHEET_ENTRIES = 'Entries';
const SHEET_RESULTS = 'Results';
const SHEET_NOTES   = 'Notes';
const SHEET_FAMOUS  = 'Famous';

// ===== エントリーポイント =====

function doGet(e) {
  return HtmlService.createTemplateFromFile('index')
    .evaluate()
    .setTitle('🏇 競馬メモ')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

// ===== ユーティリティ =====

function getCurrentUser() {
  try {
    const email = Session.getActiveUser().getEmail();
    return email || 'anonymous@guest';
  } catch (e) {
    return 'anonymous@guest';
  }
}

function getSheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function sheetToObjects(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];
  const headers = data[0];
  return data.slice(1)
    .map(row => {
      const obj = {};
      headers.forEach((h, i) => { obj[h] = row[i]; });
      return obj;
    })
    .filter(obj => obj[headers[0]] !== '' && obj[headers[0]] != null);
}

function formatDateValue(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd');
  }
  return String(val);
}

function formatDateTimeValue(val) {
  if (!val) return '';
  if (val instanceof Date) {
    return Utilities.formatDate(val, 'Asia/Tokyo', 'yyyy-MM-dd HH:mm');
  }
  return String(val);
}

function toBool(val) {
  return val === true || val === 'TRUE' || val === 'true' || val === 1;
}

// ===== シート初期化 =====

function initializeSheets() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  const defs = {
    [SHEET_RACES]: [
      'race_id', 'date', 'venue', 'race_name', 'race_num',
      'distance', 'surface', 'grade', 'weather', 'track_condition'
    ],
    [SHEET_ENTRIES]: [
      'entry_id', 'race_id', 'horse_num', 'horse_name', 'jockey',
      'trainer', 'weight', 'horse_weight', 'odds', 'popularity'
    ],
    [SHEET_RESULTS]: [
      'result_id', 'race_id', 'horse_num', 'horse_name', 'finish_pos',
      'finish_time', 'last_3f', 'corner_1', 'corner_2', 'corner_3', 'corner_4', 'margin'
    ],
    [SHEET_NOTES]: [
      'note_id', 'race_id', 'horse_name', 'user_email',
      'content', 'is_public', 'tags', 'created_at', 'updated_at'
    ],
    [SHEET_FAMOUS]: [
      'famous_id', 'race_id', 'horse_name', 'person_name', 'pick_type', 'result_pos'
    ],
  };

  for (const [name, headers] of Object.entries(defs)) {
    let sheet = ss.getSheetByName(name);
    if (!sheet) {
      sheet = ss.insertSheet(name);
      const range = sheet.getRange(1, 1, 1, headers.length);
      range.setValues([headers]);
      range.setFontWeight('bold');
      range.setBackground('#1b5e20');
      range.setFontColor('#ffffff');
      sheet.setFrozenRows(1);
    }
  }
  return 'シートを初期化しました';
}

// ===== レース一覧 =====

function getRaces(filtersJson) {
  const filters = filtersJson ? JSON.parse(filtersJson) : {};
  let races = sheetToObjects(getSheet(SHEET_RACES)).map(r => ({
    ...r,
    date: formatDateValue(r.date),
  }));

  if (filters.date)   races = races.filter(r => r.date === filters.date);
  if (filters.venue)  races = races.filter(r => r.venue === filters.venue);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    races = races.filter(r =>
      String(r.race_name).toLowerCase().includes(q) ||
      String(r.venue).toLowerCase().includes(q)
    );
  }

  races.sort((a, b) => {
    if (b.date !== a.date) return b.date.localeCompare(a.date);
    return Number(a.race_num) - Number(b.race_num);
  });

  return JSON.stringify(races);
}

// ===== レース詳細 =====

function getRaceDetail(raceId) {
  const userEmail = getCurrentUser();

  // Race
  const raceRow = sheetToObjects(getSheet(SHEET_RACES)).find(r => r.race_id === raceId);
  const race = raceRow
    ? { ...raceRow, date: formatDateValue(raceRow.date) }
    : {};

  // Entries
  const entries = sheetToObjects(getSheet(SHEET_ENTRIES))
    .filter(r => r.race_id === raceId)
    .sort((a, b) => Number(a.horse_num) - Number(b.horse_num));

  // Results
  const results = sheetToObjects(getSheet(SHEET_RESULTS))
    .filter(r => r.race_id === raceId)
    .sort((a, b) => Number(a.finish_pos) - Number(b.finish_pos));

  // Notes: 自分のメモ + 公開メモ
  const allNotes = sheetToObjects(getSheet(SHEET_NOTES))
    .filter(r => r.race_id === raceId);

  const notes = allNotes
    .filter(r => r.user_email === userEmail || toBool(r.is_public))
    .map(r => ({
      ...r,
      is_own:    r.user_email === userEmail,
      is_public: toBool(r.is_public),
      created_at: formatDateTimeValue(r.created_at),
      updated_at: formatDateTimeValue(r.updated_at),
    }));

  // Famous picks（有名人予想）
  const famous = sheetToObjects(getSheet(SHEET_FAMOUS))
    .filter(r => r.race_id === raceId);

  return JSON.stringify({ race, entries, results, notes, famous, userEmail });
}

// ===== メモ保存 =====

function saveNote(noteJson) {
  const noteData = JSON.parse(noteJson);
  const userEmail = getCurrentUser();

  if (userEmail === 'anonymous@guest') {
    return JSON.stringify({ success: false, message: 'Googleアカウントでのログインが必要です' });
  }

  const sheet     = getSheet(SHEET_NOTES);
  const data      = sheet.getDataRange().getValues();
  const headers   = data[0];
  const isPublic  = toBool(noteData.is_public);
  const now       = new Date();

  const idx = data.slice(1).findIndex(row =>
    row[headers.indexOf('race_id')]    === noteData.race_id &&
    row[headers.indexOf('horse_name')] === noteData.horse_name &&
    row[headers.indexOf('user_email')] === userEmail
  );

  if (idx >= 0) {
    const rowNum = idx + 2;
    sheet.getRange(rowNum, headers.indexOf('content')    + 1).setValue(noteData.content);
    sheet.getRange(rowNum, headers.indexOf('is_public')  + 1).setValue(isPublic);
    sheet.getRange(rowNum, headers.indexOf('tags')       + 1).setValue(noteData.tags || '');
    sheet.getRange(rowNum, headers.indexOf('updated_at') + 1).setValue(now);
    return JSON.stringify({ success: true, action: 'updated' });
  }

  const noteId = 'N' + Date.now();
  const newRow  = headers.map(h => ({
    note_id:    noteId,
    race_id:    noteData.race_id,
    horse_name: noteData.horse_name,
    user_email: userEmail,
    content:    noteData.content,
    is_public:  isPublic,
    tags:       noteData.tags || '',
    created_at: now,
    updated_at: now,
  }[h] ?? ''));
  sheet.appendRow(newRow);

  return JSON.stringify({ success: true, action: 'created', note_id: noteId });
}

// ===== メモ削除 =====

function deleteNote(raceId, horseName) {
  const userEmail = getCurrentUser();
  if (userEmail === 'anonymous@guest') {
    return JSON.stringify({ success: false, message: 'ログインが必要です' });
  }

  const sheet   = getSheet(SHEET_NOTES);
  const data    = sheet.getDataRange().getValues();
  const headers = data[0];

  const idx = data.slice(1).findIndex(row =>
    row[headers.indexOf('race_id')]    === raceId &&
    row[headers.indexOf('horse_name')] === horseName &&
    row[headers.indexOf('user_email')] === userEmail
  );

  if (idx >= 0) {
    sheet.deleteRow(idx + 2);
    return JSON.stringify({ success: true });
  }
  return JSON.stringify({ success: false, message: 'メモが見つかりません' });
}

// ===== マイメモ一覧 =====

function getMyNotes() {
  const userEmail = getCurrentUser();
  if (userEmail === 'anonymous@guest') return JSON.stringify([]);

  const notes = sheetToObjects(getSheet(SHEET_NOTES))
    .filter(r => r.user_email === userEmail)
    .map(r => ({
      ...r,
      is_public:  toBool(r.is_public),
      updated_at: formatDateTimeValue(r.updated_at),
      created_at: formatDateTimeValue(r.created_at),
    }))
    .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));

  return JSON.stringify(notes);
}

// ===== 馬の成績履歴 =====

function getHorseHistory(horseName) {
  const raceMap = {};
  sheetToObjects(getSheet(SHEET_RACES)).forEach(r => {
    raceMap[r.race_id] = { ...r, date: formatDateValue(r.date) };
  });

  const history = sheetToObjects(getSheet(SHEET_RESULTS))
    .filter(r => r.horse_name === horseName)
    .map(r => ({ ...r, race: raceMap[r.race_id] || {} }))
    .sort((a, b) =>
      String(b.race.date || '').localeCompare(String(a.race.date || ''))
    );

  return JSON.stringify(history);
}

// ===== サンプルデータ（テスト用） =====

function addSampleData() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);

  // レース
  const raceSheet = ss.getSheetByName(SHEET_RACES);
  raceSheet.appendRow(['R001', new Date('2025-04-13'), '阪神', '桜花賞', 11, 1600, '芝', 'G1', '晴', '良']);
  raceSheet.appendRow(['R002', new Date('2025-03-30'), '中山', 'スプリングステークス', 10, 1800, '芝', 'G2', '曇', '良']);
  raceSheet.appendRow(['R003', new Date('2025-03-23'), '阪神', '毎日杯', 9, 1800, '芝', 'G3', '晴', '良']);

  // 出走馬
  const entrySheet = ss.getSheetByName(SHEET_ENTRIES);
  [
    ['E101','R001',1,'スターライトローズ','武豊','藤原英昭',55,452,3.5,1],
    ['E102','R001',2,'フラワーポート','C.ルメール','国枝栄',55,468,4.2,2],
    ['E103','R001',3,'ムーンシャイン','川田将雅','矢作芳人',55,440,7.8,3],
    ['E104','R001',4,'サクラクイーン','福永祐一','角居勝彦',55,456,12.3,4],
    ['E105','R001',5,'ラベンダーウィンド','横山武史','堀宣行',55,434,15.6,5],
    ['E106','R001',6,'ブリリアントスター','岩田康誠','音無秀孝',55,462,18.4,6],
  ].forEach(r => entrySheet.appendRow(r));

  // 結果
  const resultSheet = ss.getSheetByName(SHEET_RESULTS);
  [
    ['RS101','R001',2,'フラワーポート',    1,'1:34.2',34.1, 4,3,2,1,''],
    ['RS102','R001',1,'スターライトローズ',2,'1:34.4',33.8, 2,2,2,2,'1/2'],
    ['RS103','R001',3,'ムーンシャイン',    3,'1:34.6',34.3, 6,5,4,3,'1'],
    ['RS104','R001',5,'ラベンダーウィンド',4,'1:34.9',34.8,10,8,7,5,'2'],
    ['RS105','R001',4,'サクラクイーン',    5,'1:35.2',35.2, 3,4,5,6,'3'],
    ['RS106','R001',6,'ブリリアントスター',6,'1:35.8',35.9, 1,1,1,4,'5'],
  ].forEach(r => resultSheet.appendRow(r));

  // 有名人予想
  const famousSheet = ss.getSheetByName(SHEET_FAMOUS);
  [
    ['F001','R001','スターライトローズ','粗品','本命',2],
    ['F002','R001','サクラクイーン',    '恋',  '本命',5],
    ['F003','R001','ムーンシャイン',    '中田敦彦','対抗',3],
  ].forEach(r => famousSheet.appendRow(r));

  return 'サンプルデータを追加しました';
}
