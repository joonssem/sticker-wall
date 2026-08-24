/** 스티커 담벼락 로컬 AI 도우미 — 실행: node ai-helper.js */
const http = require('node:http');

const HOST = '127.0.0.1';
const PORT = 8787;
const ALLOWED_ORIGIN = 'https://joon0noh.github.io';
let config = { apiKey: '', model: 'solar-pro3' };

const setupPage = `<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>스티커 담벼락 AI 도우미</title><style>body{margin:0;background:#f2f5ff;color:#24213d;font:16px system-ui,sans-serif}.wrap{max-width:640px;margin:7vh auto;padding:28px}.card{background:#fffdf9;border-radius:24px;padding:28px;box-shadow:0 12px 36px #24213d18}h1{margin-top:0}label{display:grid;gap:8px;margin:18px 0;font-weight:700}input{padding:13px;border:1px solid #cbc5e9;border-radius:12px;font:inherit}button{border:0;border-radius:12px;padding:12px 16px;background:#5946d8;color:white;font:inherit;font-weight:800;cursor:pointer}.muted{color:#66627b;line-height:1.6}.ok{color:#18794e}.error{color:#b42318}</style><main class="wrap"><section class="card"><h1>스티커 담벼락 AI 도우미</h1><p class="muted">이 창은 교사 컴퓨터에서만 열립니다. API 키는 실행 중인 메모리에만 보관되며 GitHub·Firebase·파일에는 저장되지 않습니다.</p><form id="form"><label>Upstage API 키<input id="key" type="password" autocomplete="off" placeholder="API 키를 입력하세요" required></label><label>모델 이름<input id="model" value="solar-pro3" autocomplete="off" required></label><button>연결 테스트 및 사용 시작</button></form><p id="result" class="muted">아직 연결하지 않았습니다.</p><hr><p class="muted">수업이 끝나면 이 창을 닫거나 터미널에서 Ctrl+C를 누르면 키가 메모리에서 사라집니다.</p></section></main><script>const f=document.querySelector('#form'),r=document.querySelector('#result');f.onsubmit=async e=>{e.preventDefault();r.className='muted';r.textContent='연결을 확인하고 있어요…';try{const x=await fetch('/configure',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({apiKey:key.value,model:model.value})}),d=await x.json();if(!x.ok)throw Error(d.error);key.value='';r.className='ok';r.textContent='연결되었습니다. 이제 담벼락 교사 화면에서 AI 기능을 사용할 수 있어요.'}catch(e){r.className='error';r.textContent='연결하지 못했습니다: '+e.message}};</script></html>`;

function send(res,status,data,origin){
  const headers={'content-type':'application/json; charset=utf-8'};
  if(origin===ALLOWED_ORIGIN){
    headers['access-control-allow-origin']=ALLOWED_ORIGIN;
    headers['access-control-allow-private-network']='true';
    headers['access-control-allow-methods']='GET, POST, OPTIONS';
    headers['access-control-allow-headers']='content-type';
  }
  res.writeHead(status,headers);
  res.end(status===204?'':JSON.stringify(data));
}
function allowed(origin){return !origin||origin===`http://${HOST}:${PORT}`||origin===ALLOWED_ORIGIN;}
function readJson(req){return new Promise((resolve,reject)=>{let body='';req.on('data',chunk=>{body+=chunk;if(body.length>250000)req.destroy();});req.on('end',()=>{try{resolve(JSON.parse(body||'{}'));}catch{reject(new Error('JSON 형식이 아닙니다.'));}});req.on('error',reject);});}
async function callLlm(instructions,input){
  if(!config.apiKey||!config.model)throw new Error('먼저 로컬 AI 도우미 설정 화면에서 API 키와 모델을 연결하세요.');
  const formatRule=' 출력은 일반 텍스트로만 작성하세요. Markdown 제목 기호(#), 굵게 표시 기호(**), 표를 사용하지 마세요.';
  const response=await fetch('https://api.upstage.ai/v1/chat/completions',{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${config.apiKey}`},body:JSON.stringify({model:config.model,messages:[{role:'system',content:instructions+formatRule},{role:'user',content:JSON.stringify(input)}],max_tokens:700,stream:false})});
  const data=await response.json();
  if(!response.ok)throw new Error(data?.error?.message||'Upstage API 요청에 실패했습니다.');
  return data.choices?.[0]?.message?.content||'요약 결과를 읽지 못했습니다.';
}
const ASSIST_PROMPTS={
  order:'당신은 초등 교사의 수업 보조자입니다. 익명 담벼락을 읽고 학생을 평가·서열화하지 마세요. 출석번호·이름·닉네임을 추정하거나 만들지 마세요. 질문 수만 따르지 말고 주제 다양성과 아직 다루지 않은 경험을 고려해 발표 후보 3개를 제안하세요. 각 후보는 글의 첫 12자 이내 인용과 한 문장 이유로 씁니다. 최종 선택은 교사에게 있다고 덧붙이세요.',
  followup:'당신은 초등 교사의 수업 보조자입니다. 선택된 글이 있다면 그 글을 바탕으로, 없다면 활동 전체를 바탕으로 발표 뒤 자연스럽게 이어 갈 열린 질문 3개를 만드세요. 사실 확인·평가·경쟁이 아닌 경험과 느낌을 듣는 말투로 작성하세요. 학생의 이름·출석번호·색을 언급하지 마세요.',
  diversity:'당신은 초등 교사의 수업 보조자입니다. 질문들의 반복되는 표현과 아직 적은 질문 방향을 간단히 살피세요. 학급이나 개인을 점수화하지 말고, 교사가 학생에게 제안할 수 있는 새로운 질문 방향 3가지를 한 줄씩 제시하세요.',
  guide:'당신은 초등 교사의 수업 보조자입니다. 현재 활동 단계에 맞는 1~2문장짜리 따뜻하고 짧은 교사 안내 문구를 만드세요. 특정 학생을 지목하거나 경쟁을 유도하지 마세요.',
  safety:'당신은 초등 교사의 수업 보조자입니다. 글에서 개인정보 노출, 놀림·배제, 자해·위험 신호처럼 교사가 검토할 만한 표현만 조심스럽게 찾아 요약하세요. 애매한 내용은 문제라고 단정하지 말고 "교사 확인 권장"으로 표현하세요. 학생을 공개적으로 지목하거나 자동 삭제를 권하지 마세요. 해당 표현이 없다면 "지금 확인할 표현은 보이지 않음"이라고 답하세요.'
};

const server=http.createServer(async(req,res)=>{
  const origin=req.headers.origin;
  if(req.method==='OPTIONS')return send(res,204,{},origin);
  if(!allowed(origin))return send(res,403,{error:'허용되지 않은 웹사이트 요청입니다.'},origin);
  if(req.method==='GET'&&req.url==='/'){res.writeHead(200,{'content-type':'text/html; charset=utf-8'});return res.end(setupPage);}
  if(req.method==='GET'&&req.url==='/status')return send(res,200,{running:true,configured:Boolean(config.apiKey),model:config.apiKey?config.model:null},origin);
  try{
    const body=await readJson(req);
    if(req.method==='POST'&&req.url==='/configure'){
      if(origin&&origin!==`http://${HOST}:${PORT}`)return send(res,403,{error:'설정은 로컬 도우미 화면에서만 할 수 있습니다.'},origin);
      config={apiKey:String(body.apiKey||'').trim(),model:String(body.model||'solar-pro3').trim()};
      if(!config.apiKey)throw new Error('API 키를 입력해 주세요.');
      await callLlm('연결 테스트입니다. 한국어로 "연결 확인"이라고만 답하세요.',{});
      return send(res,200,{ok:true},origin);
    }
    if(req.method==='POST'&&req.url==='/summary'){
      if(origin!==ALLOWED_ORIGIN)return send(res,403,{error:'담벼락 교사 화면에서만 사용할 수 있습니다.'},origin);
      const result=await callLlm('당신은 초등 교사의 수업 보조자입니다. 제공된 익명 담벼락만 읽고, 학생을 평가·서열화하지 마세요. 출석번호·이름·닉네임을 추정하거나 만들지 마세요. 교사가 수업 중 바로 읽을 수 있게 3문장 이내로 현재 주제와 질문 참여 양상을 따뜻하게 요약하고, 다음 진행 제안 1가지를 덧붙이세요.',body);
      return send(res,200,{result},origin);
    }
    if(req.method==='POST'&&req.url==='/assist'){
      if(origin!==ALLOWED_ORIGIN)return send(res,403,{error:'담벼락 교사 화면에서만 사용할 수 있습니다.'},origin);
      const instructions=ASSIST_PROMPTS[body.mode];
      if(!instructions)throw new Error('지원하지 않는 AI 기능입니다.');
      const result=await callLlm(instructions,body.activity||{});
      return send(res,200,{result},origin);
    }
    return send(res,404,{error:'없는 요청입니다.'},origin);
  }catch(error){return send(res,400,{error:error.message||'요청을 처리하지 못했습니다.'},origin);}
});
server.listen(PORT,HOST,()=>console.log(`스티커 담벼락 AI 도우미: http://${HOST}:${PORT}`));
