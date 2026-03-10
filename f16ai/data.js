// ==========================================
// data.js - 外部JSデータファイル読み込み・展開エンジン (完全クリーン版)
// ==========================================

window.planeData = {};
window.COMBAT_CHARTS = { GUN: {}, HS: {}, RH: {} };
window.SCENARIO_INFO = {};

// ==========================================
// 1. 機体データと命中チャートのパース処理
// ==========================================
function parseKitaiData(csvText) {
    if (!csvText) return;
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    let currentPlane = "";
    for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const planeName = cols[0] ? cols[0].trim() : "";
        const statusType = cols[1] ? cols[1].trim() : ""; 

        if (planeName) {
            currentPlane = planeName;
            if (!window.planeData[currentPlane]) {
                window.planeData[currentPlane] = { speed: [], alt: [], turn: [] };
            }
        }

        const plane = window.planeData[currentPlane];
        const rowData = [];
        
        for(let r=0; r<5; r++){
            const row = [];
            for(let c=0; c<5; c++){
                let val = cols[2 + (r * 5) + c];
                row.push(val ? val.trim() : "");
            }
            rowData.push(row);
        }

        if (statusType === '直進') plane.speed = rowData;
        if (statusType === '高度') plane.alt = rowData;
        if (statusType === '旋回') plane.turn = rowData;
    }
}

function parseStatasData(csvText) {
    if (!csvText) return;
    const lines = csvText.split(/\r?\n/).filter(line => line.trim() !== '');
    let currentMode = '';
    let hsHeaders = [];
    let rhHeaders = [];

    for (let i = 0; i < lines.length; i++) {
        const cols = lines[i].split(',');
        const header = cols[0] ? cols[0].trim() : "";

        if (header === '機関砲') {
            currentMode = 'GUN';
            continue;
        } else if (header === 'HS') {
            currentMode = 'HS';
            // チャートの1行目にある「5/7」や「21+」という文字を記憶する
            hsHeaders = cols.slice(1).map(h => h.trim()).filter(h => h !== "");
            continue;
        } else if (header === 'RH') {
            currentMode = 'RH';
            // チャートの1行目にある「4/6」や「31+」という文字を記憶する
            rhHeaders = cols.slice(1).map(h => h.trim()).filter(h => h !== "");
            continue;
        }

        if (currentMode === 'GUN' && header.match(/^[A-G]$/i)) {
            const type = header.toUpperCase();
            window.COMBAT_CHARTS.GUN[type] = {
                "前方": [parseInt(cols[1]) || 0, parseInt(cols[2]) || 0, parseInt(cols[3]) || 0],
                "後方側面": [parseInt(cols[4]) || 0, parseInt(cols[5]) || 0, parseInt(cols[6]) || 0], 
                "後方": [parseInt(cols[7]) || 0, parseInt(cols[8]) || 0, parseInt(cols[9]) || 0]
            };
        } else if (currentMode === 'HS' && header && hsHeaders.length > 0) {
            let rowData = {};
            for (let j = 0; j < hsHeaders.length; j++) {
                rowData[hsHeaders[j]] = parseInt(cols[j + 1]) || 0;
            }
            window.COMBAT_CHARTS.HS[header] = rowData;
        } else if (currentMode === 'RH' && header && rhHeaders.length > 0) {
            let rowData = {};
            for (let j = 0; j < rhHeaders.length; j++) {
                rowData[rhHeaders[j]] = parseInt(cols[j + 1]) || 0;
            }
            window.COMBAT_CHARTS.RH[header] = rowData;
        }
    }
}

// ==========================================
// 2. 外部JSファイルから読み込まれた変数を展開
// ==========================================
if (typeof rawKitaiCsv !== 'undefined') parseKitaiData(rawKitaiCsv);
if (typeof rawStatasCsv !== 'undefined') parseStatasData(rawStatasCsv);

// ※悪さをしていた古い「シナリオ配置プログラム」や「勝手な命中判定プログラム」はすべて完全に削除しました。