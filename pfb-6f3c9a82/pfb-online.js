'use strict';

const PFBOnline=(()=>{
    let client=null, loadedRevision=-1, library=null, creating=false;
    const dialog=()=>document.getElementById('online-dialog');
    const info=()=>document.getElementById('online-description');
    const message=(text)=>{info().textContent=text};
    const active=()=>Boolean(client?.code);
    const close=()=>{if(dialog().open)dialog().close()};
    const seatNumber=seat=>PFBOnlineCore.SEATS.indexOf(seat);
    async function connect(){
        const config=window.PFB_ONLINE_CONFIG;
        if(!config?.enabled||!config.firebase?.projectId)throw new Error('オンライン対戦の接続先が未設定です。');
        if(!library)library=(async()=>{
            for(const part of ['app','auth','firestore'])await new Promise((resolve,reject)=>{
                const script=document.createElement('script');
                script.src=`https://www.gstatic.com/firebasejs/10.8.0/firebase-${part}-compat.js`;
                script.onload=resolve;script.onerror=()=>reject(new Error('オンライン対戦に接続できません。'));
                document.head.append(script);
            });
            const app=firebase.initializeApp(config.firebase,'pfb-room');
            const auth=app.auth();
            await auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL);
            const account=auth.currentUser||(await auth.signInAnonymously()).user;
            return {db:app.firestore(),uid:account.uid};
        })().catch(error=>{library=null;throw error});
        return library;
    }
    function explain(error){
        const byCode={noRoom:'その部屋を開けません。',full:'この部屋は満員です。',code:'8桁の部屋番号を入力してください。',
            timeout:'応答がありません。両方の画面を開いてください。',outOfTurn:'相手の操作を待っています。',
            stale:'操作が更新されました。表示を確認してください。','permission-denied':'PFB用のルーム権限を接続先に設定してください。'};
        return byCode[error?.code]||byCode[error?.message]||error?.message||'接続できません。';
    }
    function open(){
        const select=document.getElementById('online-opponent');
        select.innerHTML=rosterTeams().filter(team=>team!==setup.assigned).map(team=>
            `<option value="${esc(team)}">${esc(teamShort(team))}</option>`).join('');
        message('作成者が先攻です。8桁の部屋番号を相手に伝えてください。');
        if(!dialog().open)dialog().showModal();
    }
    function status(key,error){
        if(key==='error'){message(explain(error));return}
        if(key==='closed'){message('この部屋は終了しました。');return}
        if(!client?.code) return;
        const title=key==='waiting'?'参加待ち':key==='offline'?'再接続中':'接続中';
        message(`部屋番号 ${client.code}　${title}`);
        if(gameInst?.onlineMatch)document.getElementById('game-log').textContent=`オンライン　${client.code}　${title}`;
    }
    function show(data,seat){
        if(!data.guest||data.rev===loadedRevision)return;
        const previous=gameInst;
        const oldLog=previous?.onlineMatch?previous.log.length:0;
        const {game:fresh,actions}=PFBOnlineCore.unpack(null,players,null,data.public);
        fresh.matchId='online-'+client.code;
        fresh.humanSide=seatNumber(seat);
        gameInst=fresh;
        loadedRevision=data.rev;
        close();
        const sameMatch=previous?.matchId===fresh.matchId;
        if(fresh.gameOver&&!sameMatch){renderFinalResult();return}
        const continuedChoice=sameMatch&&previous.pending&&actions.at(-1)?.action.startsWith('choice:');
        updateUI(sameMatch&&(fresh.gameOver||continuedChoice));
        if(sameMatch&&fresh.log.length>oldLog){
            const anim=determineAnim(fresh.log.slice(oldLog),playerName(previous.batter),previous.batIdx[previous.batSide]+1);
            if(anim)playResultAnim(anim,continuedChoice);
        }
        if(fresh.gameOver)showFinalPlay();
        else render();
    }
    function render(){
        if(!gameInst?.onlineMatch||gameInst.gameOver)return;
        const g=gameInst;
        const owner=seatNumber(PFBOnlineCore.actor(g));
        const choices=PFBOnlineCore.choices(g);
        renderButtons(choices,owner,g.pending?.title||(owner!==g.humanSide?'相手の操作を待っています':''));
    }
    async function start(make){
        if(creating||active())return;
        creating=true;
        message('オンラインに接続中…');
        try{
            const {db,uid}=await connect();
            const teams=make?{away:setup.assigned,home:document.getElementById('online-opponent').value}:null;
            client=new PFB_ROOM.RoomClient({db,uid,D:teams,md:players,core:PFBOnlineCore,onView:show,onStatus:status});
            loadedRevision=-1;
            if(make){
                const code=await client.create('ja',firebase.firestore.Timestamp);
                message(`部屋番号 ${code}　参加待ち`);
            }else{
                await client.join(document.getElementById('online-code').value,'ja');
            }
        }catch(error){
            client?.detach();client=null;
            message(explain(error));
        }finally{creating=false}
    }
    function localMenu(g,action){
        const back=['戻る','online-back','bn'];
        if(action==='online-back'){render();return true}
        if(showPinchRunnerMenu(g,action,'online-back'))return true;
        if(action==='pinch'){
            renderButtons([...g.bench.map((row,i)=>[playerName(row),`pinch:${i}`,'bs']),back],g.batSide,'代打を選択');return true;
        }
        if(action==='def_pitcher'){
            renderButtons([...g.pitchers[g.defSide].filter(p=>!p.isUsed).map((p,i)=>[pitcherChoiceLabel(p),`chpitch:${i}`,'bs']),back],g.defSide,'登板する投手を選択');return true;
        }
        if(action==='def_fielder'){
            renderButtons([...g.defLineup.map((p,i)=>[playerName(p),`defout:${i}`,'bs']),back],g.defSide,'交代する野手を選択');return true;
        }
        if(action.startsWith('defout:')){
            const index=Number(action.slice(7));
            renderButtons([...g.defBench.map((p,i)=>[playerName(p),`defsub:${index}:${i}`,'bs']),back],g.defSide,'出場する野手を選択');return true;
        }
        if(action==='steal_menu'){
            renderButtons([...g.stealGroups().map((group,i)=>[g.stealLabel(group),`steal:${i}`,'bp']),back],g.batSide,'盗塁する走者を選択');return true;
        }
        return false;
    }
    function click(action){
        const g=gameInst;
        if(!g?.onlineMatch || action==='restart' || action==='final_report')return false;
        if(!active()||g.gameOver||PFBOnlineCore.actor(g)!==client.seat)return true;
        if(localMenu(g,action))return true;
        void client.send('play',[action]).catch(error=>{
            document.getElementById('game-log').textContent=explain(error);
            render();
        });
        return true;
    }
    function leave(){
        client?.detach();client=null;
        loadedRevision=-1;
        close();
    }
    document.getElementById('online-create').addEventListener('click',()=>start(true));
    document.getElementById('online-join').addEventListener('click',()=>start(false));
    document.getElementById('online-cancel').addEventListener('click',leave);
    dialog().addEventListener('cancel',leave);
    return {active,open,click,leave};
})();
