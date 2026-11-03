// wsm_ai_ui.js — AI設定モーダル UI（wsm_hub.html / sandbox.html 共通）
// 前提: wsm_ai.js が先に読み込まれていること (AI_PARAMS_DEFAULT, aiGetParams, aiApplyParams 等を提供)

// 各キーの選択肢:
//   配列 = プルダウン候補
//   'bool' = true/false プルダウン
//   'free' = 自由入力 (配列値など)
const AI_PARAM_OPTIONS = {
  // 先読み
  lookahead: [1, 2],
  lookaheadCurrentWeight: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  lookaheadNextWeight: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  lookaheadTopK: [5, 10, 15, 20, 25, 30, 40, 50],
  // 索敵・選定
  searchRadius: [3, 4, 5, 6, 7, 8, 9, 10, 12, 15, 20],
  selectDistCoef: [0, 1, 2, 3, 4, 5, 7, 10],
  selectWeaknessWeight: [0, 5, 10, 20, 30, 50, 75, 100],
  selectUpwindPenalty: [0, 25, 50, 75, 100, 150, 200],
  // scoreEnd 共通
  rakeBonus: [0, 50, 100, 150, 200, 250, 300, 400, 500, 750],
  rakedPenalty: [0, 50, 100, 150, 200, 250, 300, 400, 500],
  rakeAvoidBonus: [0, 50, 100, 150, 200, 250, 300],
  enemyTipAdjacentBonus: [0, 50, 100, 150, 200, 250],
  // scoreEnd US
  boardingScores: 'free',
  boardingContinuousCoef: [0, 20, 40, 60, 80, 100, 150, 200],
  // scoreEnd JP
  jpStayDistance: [4, 5, 6, 7, 8, 9, 10, 12, 15],
  jpStayBonus: [0, 250, 500, 750, 1000, 1500, 2000],
  jpFarBaseBonus: [0, 500, 1000, 1500, 2000, 2500],
  jpFarDecayPerHex: [0, 25, 50, 75, 100, 150, 200],
  jpBroadsideFarBonus: [0, 100, 250, 500, 750, 1000],
  jpAvoidAdjacentEnemy: 'bool',
  // scoreEnd 近距離詳細
  bowFarBonus: [0, 10, 20, 30, 40, 50, 75, 100],
  sideFarBonus: [0, 10, 20, 30, 40, 50, 75, 100],
  otherFarPenalty: [0, 10, 20, 30, 40, 50, 75, 100],
  broadsideNearBonus: [0, 20, 40, 60, 80, 100, 120, 150, 200],
  bowNearBonus: [0, 20, 40, 60, 80, 100],
  sternNearPenalty: [0, 20, 40, 60, 80, 100, 120, 150],
  otherNearPenalty: [0, 20, 40, 60, 80, 100, 120, 150],
  enemyBroadsidePenalty: [0, 20, 40, 60, 80, 100, 120, 150],
  // aiFireDecide
  fireBroadsideBonus: [0, 25, 50, 75, 100, 150, 200],
  // aiBoardDecide
  boardGrappleRatio: [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.5, 2.0],
  boardUngrappleRatio: [0.5, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1],
  // aiAnchorDecide
  anchorMinDist: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  anchorMaxDist: [3, 4, 5, 6, 7, 8, 9, 10, 12, 15],
  // aiSailDecide
  sailFullDistOver: [2, 3, 4, 5, 6, 7, 8, 9, 10],
  sailBattleDistUnder: [1, 2, 3, 4, 5, 6, 7, 8],
  // aiAmmoDecide
  rigSailTargetThreshold: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  ammoCloseRange: [0, 1, 2, 3, 4, 5],
  ammoLongRange: [5, 6, 7, 8, 9, 10, 12, 15],
  ammoDoubleHullPct: [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  ammoGrapeCrewMin: [0, 2, 4, 6, 8, 10, 12, 15, 20],
  // ランダム要素
  scoreEndRandomness: [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5],
  selectTargetRandomness: [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5],
  fireDecideRandomness: [0, 0.05, 0.1, 0.15, 0.2, 0.3, 0.5],
  boardingRatioJitter: [0, 0.025, 0.05, 0.1, 0.15, 0.2],
};

// 各項目: [key, label, helpText]
const AI_PARAM_GROUPS = [
  { title:'先読み (A案: lookahead=2推奨)', keys:[
    ['lookahead','先読み深度 (1=単発/2=2ターン)',
      'AIが何ターン先まで読むか。\n1 = 今ターンの結果のみで判断（軽量・短期）。\n2 = 今ターン位置 + そこから次ターンに到達可能な最良位置までブレンド評価（風変化や敵接近を見越せる）。\n値が大きいほど計算量増。3以上は未対応。'],
    ['lookaheadCurrentWeight','現ターン重み (0〜1)',
      'lookahead=2 の時、今ターンの位置スコアにかける重み。\n例: 0.4 = 今ターン4割重視。\n上げると保守的（現状の良位置に留まる）、下げると未来重視（次ターンに賭ける）。\nlookaheadNextWeight と合計1になるよう調整推奨。'],
    ['lookaheadNextWeight','次ターン重み (0〜1)',
      'lookahead=2 の時、次ターン到達可能な最良位置のスコアにかける重み。\n例: 0.6 = 未来6割重視。\n上げると風変化や敵移動先を見越した位置取り。\n0にすると次ターン無視（lookahead=1 相当）。'],
    ['lookaheadTopK','次ターン展開する上位leaf数',
      'lookahead=2 の時、現ターン候補のうちスコア上位この数だけを次ターン展開する（全候補展開だと重い）。\n20 = 上位20候補から最良を選ぶ。\n大きいほど精度↑だが計算負荷↑。10〜30が現実的。'],
  ]},
  { title:'索敵・目標選定', keys:[
    ['searchRadius','索敵半径 (hex)',
      'AIが攻撃目標として候補にする最大距離(hex)。\n10 = 砲射程いっぱい。\n大きくすれば遠方の弱った敵も追跡、小さくすれば近場の敵だけに集中。\naiFireDecide の距離係数や scoreEnd 縦射回避にも参照される。'],
    ['selectDistCoef','距離係数 -d×?',
      '目標選定時の距離ペナルティ係数。スコア = -d × この値 + ...。\n例: 2 = 1hex遠ざかるごとに -2点。\n上げると近い敵を強く優先、下げると弱さ重視に傾く。'],
    ['selectWeaknessWeight','弱さ重み weakness×?',
      '目標選定時の弱さ加点係数。\nweakness = 2 - 敵船体残率% - 敵乗員残率%（最大2.0）。\n例: 30 = 瀕死敵(weakness=2.0)で +60点。\n上げるとトドメ志向、下げると距離優先。'],
    ['selectUpwindPenalty','逆風ペナルティ',
      '敵への方向に艦首を向けても移動力0(完全逆風)の場合、目標スコアから減点する量。\n例: 50 = 「届かない敵は避ける」/ 0 = 風を無視。\n到達不能敵を追って停止する馬鹿げた挙動を防ぐ。'],
  ]},
  { title:'scoreEnd 共通 (縦射/隣接)', keys:[
    ['rakeBonus','縦射 me→target ボーナス',
      '自分が敵に縦射(bow_rake/stern_rake)できる位置の加点。\n縦射は通常ダメージの2〜3倍（クリティカル多）。\n上げると縦射機会を強く狙う。\n近距離(≤5)のみ評価。'],
    ['rakedPenalty','被縦射 target→me ペナルティ(絶対値)',
      '敵に縦射されている向きの減点(絶対値で入力, スコアからは引かれる)。\n例: 200 = 被縦射位置を-200点。\n上げると被縦射回避を強く優先。\n近距離(≤5)のみ評価。'],
    ['rakeAvoidBonus','縦射回避ボーナス',
      'searchRadius以内で「敵から縦射されない向き」を取れた時のボーナス。\nrakedPenalty より穏やかな加点で、距離10以内でも常に評価。\n両陣営共通。'],
    ['enemyTipAdjacentBonus','敵艦首/艦尾先 隣接ボーナス',
      '敵艦首先hexまたは艦尾先hexに隣接できた時の加点。\n次ターンに縦射を仕掛ける前段位置取り。\n上げると縦射の前段確保を強く狙う。\n近距離(≤5)のみ評価。'],
  ]},
  { title:'scoreEnd (US=連合/接舷重視) E案', keys:[
    ['boardingScores','接舷段階加点 [d≤1, d≤2, d≤5] カンマ区切り',
      '連合(US)側の接舷加点。距離別に段階加算（重なって加算される）。\n例: 800,500,250 = 距離1で +800、距離2でさらに +500（合計+1300）、距離5でさらに +250。\n第1要素を大きくすれば突撃志向、小さくすれば射撃距離も考慮。\nE案デフォルトは [800,500,250]（過度な突撃抑制）。'],
    ['boardingContinuousCoef','連続加点係数 (50-d)×?',
      '連合(US)側の連続加点係数。max(0, 50-d) × この値 を距離スコアに加算。\n例: 80 = 距離50を超えるまで近付くほど連続的に加点。\n0にすると遠距離からの接近誘導が消える。'],
  ]},
  { title:'scoreEnd (JP=英/砲撃重視)', keys:[
    ['jpStayDistance','留まり距離',
      '英(JP)側 留まり距離(hex)。これ以内なら距離スコアを jpStayBonus 固定にし、砲撃距離を維持する。\n例: 10 = 砲射程いっぱいまで詰めて維持。\n小さくすれば短距離まで近付く。'],
    ['jpStayBonus','留まり加点',
      '英側 留まり距離内の固定加点。\n例: 1000 = ベースライン。\njpFarBaseBonus との大小で「近付くか」「遠ざかるか」のバランスが決まる。'],
    ['jpFarBaseBonus','遠距離基準',
      '英側 留まり距離超え時の基準加点。\nスコア = max(0, この値 - (d - jpStayDistance) × jpFarDecayPerHex)。\n例: 1500 = 遠距離からも誘導が効く。'],
    ['jpFarDecayPerHex','遠距離減衰/hex',
      '英側 距離超過1hexごとの減衰量。\n例: 50 = jpStayDistanceから1hex離れるごとに -50点。\n大きくすれば遠方を強く嫌う、0にすれば距離無関係。'],
    ['jpBroadsideFarBonus','舷射界ボーナス(遠距離含)',
      '英側 舷射界(port/stbd)に敵が入っている時の加点。\n例: 500 = 砲撃重視のため大きめ。\n上げると舷射界維持を強く優先。'],
    ['jpAvoidAdjacentEnemy','敵隣接leaf除外 (true/false)',
      '英側で敵隣接(distance≤1)になる移動候補を除外する。\ntrue = 白兵戦回避（砲戦距離維持）。\nfalse = 接舷を許可（連合に対しても突撃可）。'],
  ]},
  { title:'scoreEnd 近距離詳細 (連合のみ・英は別系統)', keys:[
    ['bowFarBonus','艦首向き(遠)',
      '遠距離(>5)で艦首が敵を向いている時の加点。\n例: 50 = 接近誘導。上げると艦首を敵に向ける動きを強化。'],
    ['sideFarBonus','舷向き(遠)',
      '遠距離(>5)で舷向き(port/stbd)加点。\n例: 20 = 艦首向きより小さめ（近付き優先）。'],
    ['otherFarPenalty','その他向き(遠)',
      '遠距離(>5)で艦尾向き等への減点(絶対値)。\n例: 30 = 後ろを向いて遠ざかる候補を抑制。'],
    ['broadsideNearBonus','舷射界(近)',
      '近距離(≤5)で舷射界の加点。\n例: 80 = 砲撃可能位置の標準ボーナス。\njpBroadsideFarBonus とは別系統（連合・英共通）。'],
    ['bowNearBonus','艦首向き(近)',
      '近距離(≤5)で艦首向きの加点。\n例: 20 = 接舷準備や追撃用。'],
    ['sternNearPenalty','艦尾向き(近)ペナルティ',
      '近距離(≤5)で艦尾を敵に向けた時の減点(絶対値)。\n例: 40 = 被縦射されやすい向きを抑制。'],
    ['otherNearPenalty','その他向き(近)ペナルティ',
      '近距離(≤5)でその他向き(死角)の減点(絶対値)。\n例: 60 = 完全に弾を撃てない向きを強く抑制。'],
    ['enemyBroadsidePenalty','敵舷射界に自分 ペナルティ',
      '自分が敵舷射界(port/stbd)に入っている時の減点(絶対値)。\n例: 80 = 被砲撃を嫌う。\n上げると敵砲列を避ける動きが強くなる。'],
  ]},
  { title:'aiFireDecide (砲撃判断: 最寄り敵固定)', keys:[
    ['fireBroadsideBonus','同距離複数時の舷射界ボーナス',
      '最寄り敵が同距離で複数いる場合の選択用。舷射界(port/stbd)に入っている方を優先。\n例: 50 = 艦首射界より優先される量。'],
  ]},
  { title:'aiBoardDecide (白兵戦/鉤縄)', keys:[
    ['boardGrappleRatio','myStr≥enStr×? で鉤縄',
      '白兵戦戦力比 myStr ≥ enStr × この値 で鉤縄を仕掛ける。\nmyStr/enStr = 乗員数 × クルー質(elite=5..poor=1)。\n例: 1.1 = 自分が1割以上強ければ仕掛ける / 1.0 = 互角でも仕掛ける / 1.5 = 圧倒的優位のみ。'],
    ['boardUngrappleRatio','myStr<enStr×? で解除',
      '白兵戦戦力比 myStr < enStr × この値 で鉤縄解除を試みる。\n例: 0.9 = 自分が1割以上弱くなったら逃げる / 1.0 = 互角になったら逃げる / 0.5 = 半分以下まで耐える。'],
  ]},
  { title:'aiAnchorDecide (投錨) F案', keys:[
    ['anchorMinDist','投錨可能 最小距離',
      '投錨可能 最小距離(hex)。これ以下なら接近して機動を続ける（投錨しない）。\n例: 4 = 距離3以下では機動。\n小さくすれば近距離でも投錨（接舷待ち）、大きくすれば遠距離でしか投錨しない。'],
    ['anchorMaxDist','投錨可能 最大距離',
      '投錨可能 最大距離(hex)。これ以上なら接近を続ける（投錨しない）。\n例: 7 = 距離8以上では機動。\n小さくすれば近距離戦のみで投錨、大きくすれば遠距離砲撃でも投錨。'],
  ]},
  { title:'aiSailDecide (帆切替)', keys:[
    ['sailFullDistOver','最近敵>? でfull',
      '最近敵がこの距離より遠ければ全帆 (full sail) に切替。\n例: 6 = 砲射程外なら最大速度。\n上げると battle に戻すタイミングが早まる（保守的）。'],
    ['sailBattleDistUnder','最近敵≤? でbattle',
      '最近敵がこの距離以下なら戦闘帆 (battle sail) に切替。\n例: 4 = 接戦距離に入ったら減速。\n上げると早めに減速、下げると最後まで全速で突進。'],
  ]},
  { title:'aiAmmoDecide (弾種) G案', keys:[
    ['rigSailTargetThreshold','索具残率 ≥? で帆狙い継続',
      '敵索具残率(セクション合計)がこの値以上なら帆狙い(chain/round)を継続。\n例: 0.3 = 30%以上残ってれば帆狙い継続。\n上げると早く船体狙いに切替、下げると索具に固執。'],
    ['ammoCloseRange','chain使用 最大距離',
      'chain(鎖弾)使用 最大距離(hex)。これ以下なら帆狙いで chain を撃つ。\n例: 3 = ルール上 chain は3hex以内のみ撃てる。\n通常変更不要（ルール準拠）。'],
    ['ammoLongRange','>? で round 強制',
      'これを超える距離では round 強制。\n例: 10 = ルール上の射程上限。\n通常変更不要。'],
    ['ammoDoubleHullPct','船体残率 ≤? で double',
      '敵船体残率がこの値以下なら double（連発弾）で仕留め狙い。\n例: 0.3 = 瀕死で連発弾。\n上げると早く double に切替（撃破速度↑だが弾消費↑）。'],
    ['ammoGrapeCrewMin','敵乗員 ≥? で grape (距離1)',
      '距離1で敵乗員数がこの値以上なら grape (散弾)で乗員削り。\n例: 8 = 多数乗員には散弾優先。\n下げると軽め乗員でも散弾、白兵戦準備強化。'],
  ]},
  { title:'ランダム要素 (判断のゆらぎ)', keys:[
    ['scoreEndRandomness','位置評価のゆらぎ',
      '移動先の位置評価(scoreEnd)に乗算するランダム係数の幅。\nスコア × (1 + (rand-0.5)×2×この値)。\n0 = 完全決定論（毎回同じ判断）。\n0.1 = ±10% (穏やかなゆらぎ、推奨)。\n0.3 = ±30% (大きく揺らぐ、予測困難)。\n値を上げるとAIの移動が読みにくくなるが、最良手から外れる確率も増える。'],
    ['selectTargetRandomness','目標選定のゆらぎ',
      '攻撃目標選定スコアに乗算するランダム係数の幅。\n0.1 = ±10%。\n値を上げるとAIが「最も狙いやすい敵」以外を選ぶ確率が増え、複数艦が分散攻撃する可能性が出る。'],
    ['fireDecideRandomness','砲撃対象選定のゆらぎ',
      '砲撃判断(aiFireDecide)スコアに乗算するランダム係数の幅。\n0.1 = ±10%。\n値を上げると同条件の敵2隻からどちらを撃つか毎回変わる。'],
    ['boardingRatioJitter','白兵戦戦力比のゆらぎ',
      '鉤縄仕掛/解除の戦力比閾値に毎回 ±この値 を加算するジッター。\n例: 0.05 = boardGrappleRatio 1.10 → 毎回 1.05〜1.15 のどこかでランダム判定。\n0 = 完全決定論。値を上げると「微妙な戦力差で迷う」表現になる。'],
  ]},
];

function _aiUiEscAttr(s) { return String(s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function _aiUiEscHtml(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'); }

// 現在編集中の陣営
let _aiUiCurrentSide = 'jp';
const _SIDE_LABEL = { jp: '英 (jp)', us: '連合 (us)' };
const _SIDE_COLOR = { jp: '#88ccff', us: '#ff8866' };

// モーダル DOM が無ければ body に挿入
function _aiUiEnsureModal() {
  if (document.getElementById('aiSettingsModal')) return;
  const modal = document.createElement('div');
  modal.id = 'aiSettingsModal';
  modal.className = (modal.className ? modal.className + ' ' : '') + 'no-lang';
  modal.style.cssText = 'display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:9999;align-items:center;justify-content:center;';
  modal.innerHTML = `
    <div style="background:#13243a;color:#fff;border:1px solid #456;border-radius:8px;padding:18px;max-width:920px;max-height:88vh;overflow:auto;width:92%;">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap;">
        <h2 style="color:#88ccff;margin:0;flex:1;">⚙️ AIロジック設定</h2>
        <button onclick="aiSettingsExportJson()" style="background:#468;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">📋 JSON出力</button>
        <button onclick="aiSettingsImportPrompt()" style="background:#468;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">📥 JSON読込</button>
        <button onclick="aiSettingsResetDefaults()" style="background:#844;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;">↺ この陣営をデフォルトへ</button>
      </div>
      <div style="background:#0a1a2a;border:1px solid #345;border-radius:4px;padding:8px;margin-bottom:10px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
        <span style="color:#ffcc88;font-weight:bold;">編集中陣営:</span>
        <button id="aiSideBtnJp" onclick="aiSettingsSwitchSide('jp')" style="border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">英 (jp)</button>
        <button id="aiSideBtnUs" onclick="aiSettingsSwitchSide('us')" style="border:none;padding:6px 14px;border-radius:4px;cursor:pointer;font-weight:bold;">連合 (us)</button>
        <span style="flex:1;"></span>
        <button onclick="aiSettingsCopyToOther()" style="background:#646;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:0.85em;" title="現在編集中の陣営設定をもう一方にコピー">⇄ もう一方にコピー</button>
        <button onclick="aiSettingsApplyBoth()" style="background:#484;color:#fff;border:none;padding:6px 12px;border-radius:4px;cursor:pointer;font-size:0.85em;" title="現在のフォーム値を両陣営に同時適用">⇒ 両陣営に同時適用</button>
      </div>
      <div style="font-size:0.85em;color:#bcd;margin-bottom:8px;">数値プルダウンを変えて「適用」を押すと該当陣営のみに反映、ブラウザに保存されます。配列はカンマ区切り。各項目右の❓で詳細表示。</div>
      <div id="aiSettingsBody" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:8px;"></div>
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end;">
        <button onclick="closeAiSettingsModal()" style="background:#555;color:#fff;border:none;padding:8px 18px;border-radius:4px;cursor:pointer;">キャンセル</button>
        <button onclick="aiSettingsApply()" style="background:#2a8;color:#fff;border:none;padding:8px 18px;border-radius:4px;cursor:pointer;font-weight:bold;">✔ この陣営に適用</button>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function _aiUiUpdateSideButtons() {
  const j = document.getElementById('aiSideBtnJp');
  const u = document.getElementById('aiSideBtnUs');
  if (!j || !u) return;
  const sel = (s) => (s === _aiUiCurrentSide);
  j.style.background = sel('jp') ? _SIDE_COLOR.jp : '#234';
  j.style.color = sel('jp') ? '#000' : '#cde';
  u.style.background = sel('us') ? _SIDE_COLOR.us : '#234';
  u.style.color = sel('us') ? '#000' : '#cde';
}

function aiSettingsSwitchSide(side) {
  if (side !== 'jp' && side !== 'us') return;
  _aiUiCurrentSide = side;
  openAiSettingsModal();
}

function toggleAiHelp(btn) {
  const help = btn.parentElement.parentElement.querySelector('.ai-help-text');
  if (!help) return;
  const open = help.style.display !== 'none';
  help.style.display = open ? 'none' : 'block';
  btn.style.background = open ? '#345' : '#fa5';
  btn.style.color = open ? '#cde' : '#000';
}

function openAiSettingsModal() {
  _aiUiEnsureModal();
  _aiUiUpdateSideButtons();
  const body = document.getElementById('aiSettingsBody');
  if (!body) return;
  const cur = (typeof aiGetParams === 'function') ? aiGetParams(_aiUiCurrentSide) : (window.AI_PARAMS_BY_SIDE?.[_aiUiCurrentSide] || {});
  const def = (typeof aiGetDefaultParams === 'function') ? aiGetDefaultParams() : (window.AI_PARAMS_DEFAULT || {});
  let html = '';
  for (const grp of AI_PARAM_GROUPS) {
    html += `<div style="grid-column:1 / -1;color:#ffcc88;font-weight:bold;border-bottom:1px solid #345;padding:6px 0 2px;margin-top:6px;">${grp.title}</div>`;
    for (const item of grp.keys) {
      const k = item[0], lbl = item[1], help = item[2] || '(説明なし)';
      const v = cur[k];
      const dv = def[k];
      const isArr = Array.isArray(v);
      const isBool = typeof v === 'boolean';
      let val;
      if (isArr) val = v.join(',');
      else if (isBool) val = v ? 'true' : 'false';
      else val = String(v ?? '');
      const defLabel = isArr ? (Array.isArray(dv) ? dv.join(',') : '') : (isBool ? (dv?'true':'false') : String(dv));
      const opt = AI_PARAM_OPTIONS[k];
      let inputHtml;
      if (Array.isArray(opt)) {
        let optsHtml = '';
        let hasMatch = false;
        for (const o of opt) {
          const sel = (Number(o) === Number(val)) ? ' selected' : '';
          if (sel) hasMatch = true;
          optsHtml += `<option value="${_aiUiEscAttr(o)}"${sel}>${_aiUiEscHtml(o)}</option>`;
        }
        if (!hasMatch && val !== '' && !isNaN(Number(val))) {
          optsHtml = `<option value="${_aiUiEscAttr(val)}" selected>${_aiUiEscHtml(val)} (現在値)</option>` + optsHtml;
        }
        inputHtml = `<select data-aikey="${k}" data-aitype="number" style="flex:1;background:#222;color:#fff;border:1px solid #456;padding:4px 6px;border-radius:3px;font-family:monospace;">${optsHtml}</select>`;
      } else if (opt === 'bool') {
        const vTrue = (val === 'true' || val === true);
        inputHtml = `<select data-aikey="${k}" data-aitype="bool" style="flex:1;background:#222;color:#fff;border:1px solid #456;padding:4px 6px;border-radius:3px;font-family:monospace;">
          <option value="true"${vTrue?' selected':''}>true</option>
          <option value="false"${!vTrue?' selected':''}>false</option>
        </select>`;
      } else {
        inputHtml = `<input type="text" data-aikey="${k}" data-aitype="free" value="${_aiUiEscAttr(val)}" style="flex:1;background:#222;color:#fff;border:1px solid #456;padding:4px 6px;border-radius:3px;font-family:monospace;">`;
      }
      html += `<label style="background:#0f1d2e;padding:6px 8px;border-radius:4px;display:block;font-size:0.85em;">
        <span style="display:flex;align-items:center;gap:4px;margin-bottom:3px;">
          <span style="color:#cde;flex:1;">${_aiUiEscHtml(lbl)}</span>
          <button type="button" onclick="toggleAiHelp(this)" title="詳細を表示" style="background:#345;color:#cde;border:none;width:22px;height:22px;border-radius:50%;cursor:pointer;font-size:0.85em;font-weight:bold;flex-shrink:0;">❓</button>
        </span>
        <span style="display:flex;gap:4px;align-items:center;">
          ${inputHtml}
          <span style="color:#789;font-size:0.85em;" title="デフォルト">def:${_aiUiEscHtml(defLabel)}</span>
        </span>
        <div class="ai-help-text" style="display:none;background:#1a2f48;color:#cde;border-left:3px solid #fa5;padding:6px 8px;margin-top:6px;border-radius:3px;font-size:0.82em;line-height:1.5;">${_aiUiEscHtml(help)}</div>
      </label>`;
    }
  }
  body.innerHTML = html;
  document.getElementById('aiSettingsModal').style.display = 'flex';
}

function closeAiSettingsModal() {
  const m = document.getElementById('aiSettingsModal');
  if (m) m.style.display = 'none';
}

function aiSettingsCollect() {
  const def = (typeof aiGetDefaultParams === 'function') ? aiGetDefaultParams() : (window.AI_PARAMS_DEFAULT || {});
  const out = {};
  document.querySelectorAll('#aiSettingsBody [data-aikey]').forEach(inp => {
    const k = inp.dataset.aikey;
    const raw = String(inp.value).trim();
    const dv = def[k];
    if (Array.isArray(dv)) {
      out[k] = raw.split(',').map(s => Number(s.trim())).filter(n => !isNaN(n));
    } else if (typeof dv === 'boolean') {
      out[k] = (raw === 'true' || raw === '1');
    } else if (typeof dv === 'number') {
      const n = Number(raw);
      out[k] = isNaN(n) ? dv : n;
    } else {
      out[k] = raw;
    }
  });
  return out;
}

function aiSettingsApply() {
  if (typeof aiApplyParams !== 'function') { alert('aiApplyParams not loaded (wsm_ai.js)'); return; }
  const obj = aiSettingsCollect();
  aiApplyParams(_aiUiCurrentSide, obj);
  if (typeof addLog === 'function') addLog(`⚙️ AIパラメーター適用 (${_SIDE_LABEL[_aiUiCurrentSide]})`);
  closeAiSettingsModal();
}

function aiSettingsApplyBoth() {
  if (typeof aiApplyParams !== 'function') { alert('aiApplyParams not loaded (wsm_ai.js)'); return; }
  if (!confirm('現在フォームの値を 英(jp) と 連合(us) の両方に同時適用しますか？')) return;
  const obj = aiSettingsCollect();
  aiApplyParams('jp', obj);
  aiApplyParams('us', obj);
  if (typeof addLog === 'function') addLog('⚙️ AIパラメーター 両陣営に同時適用');
  closeAiSettingsModal();
}

function aiSettingsCopyToOther() {
  const dst = (_aiUiCurrentSide === 'jp') ? 'us' : 'jp';
  if (!confirm(`${_SIDE_LABEL[_aiUiCurrentSide]} の現在保存値を ${_SIDE_LABEL[dst]} にコピーしますか？\n（フォームの未適用変更は反映されません。先に「適用」を）`)) return;
  if (typeof aiCopyParams === 'function') aiCopyParams(_aiUiCurrentSide, dst);
  if (typeof addLog === 'function') addLog(`⚙️ ${_SIDE_LABEL[_aiUiCurrentSide]} → ${_SIDE_LABEL[dst]} にコピー`);
}

function aiSettingsResetDefaults() {
  if (!confirm(`${_SIDE_LABEL[_aiUiCurrentSide]} のパラメーターをデフォルトに戻しますか？`)) return;
  if (typeof aiResetParams === 'function') aiResetParams(_aiUiCurrentSide);
  if (typeof addLog === 'function') addLog(`⚙️ AIパラメーター: ${_SIDE_LABEL[_aiUiCurrentSide]} デフォルトへ`);
  openAiSettingsModal();
}

function aiSettingsExportJson() {
  const obj = (typeof aiGetParams === 'function') ? aiGetParams(_aiUiCurrentSide) : (window.AI_PARAMS_BY_SIDE?.[_aiUiCurrentSide] || {});
  const wrapped = { side: _aiUiCurrentSide, params: obj };
  const txt = JSON.stringify(wrapped, null, 2);
  navigator.clipboard?.writeText(txt).then(
    () => alert(`${_SIDE_LABEL[_aiUiCurrentSide]} のAIパラメーターをクリップボードにコピーしました`),
    () => prompt('コピー失敗 - 手動でコピーしてください', txt)
  );
}

function aiSettingsImportPrompt() {
  const txt = prompt(`AIパラメーター JSON を貼り付け (現在編集中の ${_SIDE_LABEL[_aiUiCurrentSide]} に適用):`);
  if (!txt) return;
  try {
    const parsed = JSON.parse(txt);
    // {side, params} 形式と素のparams形式の両対応
    const obj = (parsed && parsed.params && typeof parsed.params === 'object') ? parsed.params : parsed;
    if (typeof aiApplyParams === 'function') aiApplyParams(_aiUiCurrentSide, obj);
    openAiSettingsModal();
    if (typeof addLog === 'function') addLog(`⚙️ AIパラメーター JSON 読込 (${_SIDE_LABEL[_aiUiCurrentSide]})`);
  } catch (e) {
    alert('JSONパース失敗: ' + e.message);
  }
}

if (typeof window !== 'undefined') {
  window.openAiSettingsModal = openAiSettingsModal;
  window.closeAiSettingsModal = closeAiSettingsModal;
  window.aiSettingsApply = aiSettingsApply;
  window.aiSettingsApplyBoth = aiSettingsApplyBoth;
  window.aiSettingsCopyToOther = aiSettingsCopyToOther;
  window.aiSettingsResetDefaults = aiSettingsResetDefaults;
  window.aiSettingsExportJson = aiSettingsExportJson;
  window.aiSettingsImportPrompt = aiSettingsImportPrompt;
  window.aiSettingsSwitchSide = aiSettingsSwitchSide;
  window.toggleAiHelp = toggleAiHelp;
}
