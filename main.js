// =============================================
// 주의: 이 파일은 index.html에서 직접 사용되지 않습니다.
// saju-vision은 순수 HTML/JS 구조로, 모든 로직은 index.html 인라인 스크립트에 있습니다.
// 토스 SDK는 toss-sdk.js (CDN 번들)로 로드됩니다.
// =============================================

// =============================================
// 앱 상태 변수
// =============================================
let uploadedPhoto = null;
let currentMode   = 'past';
let lastResult    = null;

// =============================================
// 별 생성
// =============================================
(function(){
  const c = document.getElementById('stars');
  for(let i=0;i<80;i++){
    const s=document.createElement('span');
    const sz=Math.random()*2+.5;
    s.style.cssText=`width:${sz}px;height:${sz}px;top:${Math.random()*100}%;left:${Math.random()*100}%;--d:${2+Math.random()*4}s;--o:${.3+Math.random()*.5};animation-delay:${Math.random()*4}s;`;
    c.appendChild(s);
  }
})();

// =============================================
// 모드 전환
// =============================================
window.setMode = function(mode){
  currentMode=mode;
  document.getElementById('tab-past').classList.toggle('active',mode==='past');
  document.getElementById('tab-spouse').classList.toggle('active',mode==='spouse');
  document.getElementById('tab-face')?.classList.toggle('active',mode==='face');
  document.getElementById('tab-today')?.classList.toggle('active',mode==='today');
  
  if (mode === 'past') document.getElementById('btnLabel').textContent = '전생의 문을 열다';
  else if (mode === 'spouse') document.getElementById('btnLabel').textContent = '인연의 문을 열다';
  else if (mode === 'face') document.getElementById('btnLabel').textContent = '관상의 문을 열다';
  else document.getElementById('btnLabel').textContent = '오늘의 운명을 읽다';

  document.getElementById('photoCard').style.display = (mode === 'today') ? 'none' : 'block';

  const noteEl = document.getElementById('photoNote');
  if (noteEl) {
    if (mode === 'face') {
      noteEl.innerHTML = '<span style="color:#e8a0a0;">* 관상 분석은 사진 업로드가 필수입니다</span>';
    } else {
      noteEl.textContent = '사진이 있으면 외모 특징을 분석에 반영합니다';
    }
  }
}

// =============================================
// 사진 업로드
// =============================================
document.getElementById('photoInput').addEventListener('change',function(e){
  const file=e.target.files[0]; if(!file)return;
  const reader=new FileReader();
  reader.onload=ev=>{
    uploadedPhoto={dataUrl:ev.target.result,base64:ev.target.result.split(',')[1],mediaType:file.type};
    document.getElementById('photoDrop').innerHTML=`<img src="${ev.target.result}" alt="업로드 사진">`;
    document.getElementById('photoSkipBtn').textContent='✕ 사진 제거';
  };
  reader.readAsDataURL(file);
});

window.clearPhoto = function(){
  uploadedPhoto=null;
  document.getElementById('photoInput').value='';
  document.getElementById('photoDrop').innerHTML=`
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1">
      <rect x="3" y="3" width="18" height="18" rx="1"/>
      <circle cx="8.5" cy="8.5" r="1.5"/>
      <path d="m21 15-5-5L5 21"/>
    </svg>
    <p>클릭하여<br>사진 업로드</p>`;
  document.getElementById('photoSkipBtn').textContent='✕ 사진 없이 진행하기';
}

// =============================================
// 로딩 메시지
// =============================================
function setLoadingStep(t){document.getElementById('loadingStep').textContent=t;}

// =============================================
// 메인 실행 함수
// =============================================
window.startReveal = async function(){
  const name=document.getElementById('name').value.trim();
  const birthDate=document.getElementById('birthDate').value;
  const birthHour=document.getElementById('birthHour').value;
  const gender=document.getElementById('gender').value;
  const calType=document.getElementById('calType').value;
  const errorEl=document.getElementById('errorMsg');
  errorEl.classList.remove('show');

  if(!name)return showError('이름을 입력해주세요.');
  if(!birthDate)return showError('생년월일을 입력해주세요.');
  if(currentMode === 'face' && !uploadedPhoto) return showError('관상 분석은 사진 업로드가 필요합니다.');

  const btn=document.getElementById('revealBtn');
  btn.disabled=true;
  document.getElementById('loadingOverlay').classList.add('show');
  document.getElementById('resultSection').classList.remove('show');

  try {
    let caricaturePhoto = uploadedPhoto;
    let caricatureData = null;

    if (currentMode === 'face') {
      setLoadingStep('사진을 캐릭터로 변환하는 중...');
      const caricatureRes = await fetch('/api/caricature', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo: uploadedPhoto })
      });
      if (!caricatureRes.ok) {
        const e = await caricatureRes.json().catch(() => ({}));
        throw new Error(e.error || '캐리커처 변환 실패');
      }
      caricatureData = await caricatureRes.json();
      caricaturePhoto = {
        base64: caricatureData.imageData,
        mediaType: caricatureData.mimeType
      };
    }

    setLoadingStep(currentMode === 'face' ? '관상을 분석하는 중...' : '사주의 기운을 읽는 중...');
    const prompt = buildPrompt(name, birthDate, birthHour, gender, calType, currentMode);

    const analyzeRes = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, photo: caricaturePhoto })
    });
    if (!analyzeRes.ok) {
      const e = await analyzeRes.json().catch(() => ({}));
      throw new Error(e.error || `분석 서버 오류: ${analyzeRes.status}`);
    }
    const { text } = await analyzeRes.json();

    let parsed;
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('JSON 없음');
      parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {
      throw new Error(`분석 결과 해석 실패: ${e.message} / 원문: ${text.slice(0, 300)}`);
    }

    lastResult = { parsed, name, birthDate, birthHour, gender, calType, mode: currentMode };

    let imgUrl = null;

    if (currentMode === 'face') {
      imgUrl = `data:${caricatureData.mimeType};base64,${caricatureData.imageData}`;
    } else if (currentMode === 'today') {
      // 오늘의 운세는 이미지 생성 스킵
    } else {
      let nextMsg = '운명의 배우자를 불러오는 중...';
      if (currentMode === 'past') nextMsg = '전생의 모습을 소환하는 중...';
      setLoadingStep(nextMsg);

      const imageRes = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: parsed.imagePrompt,
          photo: (currentMode === 'past') ? uploadedPhoto : null,
          mode: currentMode
        })
      });

      if (imageRes.ok) {
        const imgData = await imageRes.json();
        if (imgData.imageData) imgUrl = `data:${imgData.mimeType};base64,${imgData.imageData}`;
      } else {
        const errText = await imageRes.text();
        console.error("Image API Error:", errText);
      }
    }

    displayResult(parsed, imgUrl, currentMode);

  }catch(err){
    showError(err.message||'오류가 발생했습니다. 잠시 후 다시 시도해주세요.');
    console.error(err);
  }finally{
    btn.disabled=false;
    document.getElementById('loadingOverlay').classList.remove('show');
  }
}

// =============================================
// 프롬프트 생성
// =============================================
function buildPrompt(name,birthDate,birthHour,gender,calType,mode){
  let photoNote=uploadedPhoto?'첨부된 사진을 참고하여 인물의 외모적 특징을 분석에 반영하세요.':'사진 없이 사주 정보만으로 분석하세요.';
  if (mode === 'face') {
    photoNote = '첨부된 사진 속 인물은 실제 사람이 아닌 가상의 캐릭터입니다. 이 캐릭터의 얼굴을 관상학적으로 분석해주세요.';
  }

  let jsonTemplate, modeInstruction;

  if (mode === 'past') {
    jsonTemplate = `{"era":"","region":"","role":"","socialClass":"","childhood":"","lifeStory":"","talent":"","relationships":"","loveStory":"","tragedy":"","death":"","karma":"","lessonForNow":"","connectionToPresent":"","description":"","fortuneTellerComment":"","keywords":["","","",""],"imagePrompt":""}`;
    modeInstruction = `
분석 톤: 명리학에 근거하면서도 시적이고 신비로운 술사. 풍부한 디테일과 감정선을 살릴 것.

분석: 이 사람의 전생 (각 항목을 구체적이고 길게, 절대 짧게 끝내지 말 것)
- era: 전생의 시대 (예: 조선 중기, 고려 말, 신라 전성기, 명나라 중기 등 구체적으로)
- region: 전생을 살았던 지역/나라 한 줄
- role: 전생의 신분/직업 구체적으로
- socialClass: 당시 사회적 위치와 영향력 60자
- childhood: 유년기 환경과 결정적 경험 120자
- lifeStory: 청년기~중년기 인생 흐름 서술 250자 이상
- talent: 타고난 재능과 그 재능이 인생에 미친 영향 100자
- relationships: 전생의 핵심 인연(가족·스승·연인·라이벌) 180자 이상
- loveStory: 전생에서의 사랑과 그 결말 150자
- tragedy: 인생에서 겪은 가장 큰 시련 100자
- death: 어떤 죽음을 맞았는지, 마지막 순간의 감정 150자
- karma: 전생에서 현생으로 이어진 업보 150자
- lessonForNow: 그 전생이 현생의 당신에게 주는 교훈 120자
- connectionToPresent: 현생의 성격·습관·인연에 어떻게 흔적이 남아있는지 150자
- description: 전생 삶에 대한 시적이고 신비로운 서술 300자 이상.
- fortuneTellerComment: 점술가가 직접 말하듯 전생 핵심 조언 200자 이상.
- keywords: 전생을 상징하는 키워드 6개
- imagePrompt: 영문 이미지 프롬프트. "${gender==='남성'?'Male':'Female'} figure in [era] Korean historical setting, [role], dramatic lighting, ink wash painting style, mysterious atmosphere, 8k"`;
  } else if (mode === 'face') {
    jsonTemplate = `{"category":"","faceType":"","forehead":"","eyes":"","nose":"","mouth":"","earsAndJaw":"","fiveElements":"","youthFlow":"","middleFlow":"","lateFlow":"","personality":"","strength":"","weakness":"","wealth":"","career":"","love":"","health":"","socialLuck":"","caution":"","growthDirection":"","description":"","fortuneTellerComment":"","keywords":["","","",""],"imagePrompt":""}`;
    modeInstruction = `
분석: 관상 분석 (각 항목 구체적·풍부하게)
- category: 관상 유형 명칭
- faceType: 전체 인상 한 줄 요약
- forehead: 이마(천정·관록궁) 분석 80자
- eyes: 눈(감정·지혜의 창) 분석 100자
- nose: 코(재물궁) 분석 80자
- mouth: 입(복록궁·언변) 분석 80자
- earsAndJaw: 귀와 턱(말년운·의지력) 분석 100자
- fiveElements: 오행 관상 분류와 그 의미 100자
- youthFlow: 청년기(20~30대) 운세 흐름 120자
- middleFlow: 중년기(40~50대) 운세 흐름 120자
- lateFlow: 말년기(60대 이후) 운세 흐름 120자
- personality: 내면 성향과 기질 150자
- strength: 타고난 장점·재능 100자
- weakness: 보완해야 할 점 100자
- wealth: 재물운 상세 120자
- career: 직업운과 어울리는 직군 120자
- love: 연애·결혼운 120자
- health: 건강운과 주의 부위 100자
- socialLuck: 인덕·대인관계운 100자
- caution: 인생에서 주의할 시기와 사건 100자
- growthDirection: 발전을 위한 구체적 방향 120자
- description: 관상에 대한 신비롭고 시적인 서술 300자 이상.
- fortuneTellerComment: 점술가가 직접 말하듯 핵심 관상 조언 200자 이상.
- keywords: 이 관상을 상징하는 키워드 6개
- imagePrompt: 초상화 영문 프롬프트`;
  } else if (mode === 'today') {
    const todayStr = new Date().toLocaleDateString('ko-KR');
    jsonTemplate = `{"dayFlow":"","luckyElements":[{"category":"","value":""}],"cautions":[{"title":"","desc":""}],"hourlyFlow":[{"hour":"","score":0,"label":""}],"mentorAdvice":"","naeryeok":"","successQuote":"","fortuneTellerComment":""}`;
    modeInstruction = `
분석: 오늘의 운세 (기준 날짜: ${todayStr})
- dayFlow: 오늘 하루 전체적인 기운 흐름 (2~3문장)
- luckyElements: 행운 요소 5개 (색상, 방향, 음식, 시간대, 행운의 말)
- cautions: 주의 항목 3개 (제목+설명)
- hourlyFlow: 06시부터 22시까지 2시간 간격 9개 데이터 (score는 0~100)
- mentorAdvice: 오늘 핵심 조언 (3~4문장)
- naeryeok: 명리학적 해석 (2~3문장)
- successQuote: 오늘의 격언 1개 (출처 포함)
- fortuneTellerComment: 점술가 스타일의 마무리 한 줄`;
  } else {
    jsonTemplate = `{"meetAge":"","meetSeason":"","firstMeeting":"","firstImpression":"","appearance":"","style":"","celebrity":"","animalFace":"","mbtiGuess":"","bloodType":"","job":"","income":"","family":"","hometown":"","hobbies":"","personality":"","strengths":"","flaws":"","loveStyle":"","marriedLife":"","children":"","signs":"","redFlags":"","compatibility":"","description":"","fortuneTellerComment":"","keywords":["","","",""],"imagePrompt":""}`;
    modeInstruction = `
분석: 이 사람의 미래 배우자 (각 항목 구체적이고 풍부하게)
- meetAge: 만날 가능성이 높은 나이대와 시기
- meetSeason: 만나는 계절과 분위기 60자
- firstMeeting: 처음 만나는 상황과 장소를 구체적으로 120자
- firstImpression: 첫인상과 첫 대화 분위기 100자
- appearance: 배우자 외모 묘사 150자
- style: 평소 스타일·패션 80자
- celebrity: 닮은 한국 연예인 2~3명 + 어느 부분이 닮았는지
- animalFace: 동물 관상 + 이유 100자
- mbtiGuess: 추측 MBTI와 그 근거 80자
- bloodType: 추측 혈액형과 분위기적 근거 50자
- job: 추측 직업군 3가지 + 이유 150자
- income: 경제력·재물 성향 80자
- family: 가족 환경과 형제관계 80자
- hometown: 출신 지역 분위기 60자
- hobbies: 취미·관심사 100자
- personality: 배우자 성격 특징 150자
- strengths: 배우자의 가장 큰 매력 100자
- flaws: 배우자의 단점·맞춰야 할 부분 100자
- loveStyle: 연애 스타일과 표현 방식 120자
- marriedLife: 결혼 후 함께할 삶의 모습 150자
- children: 자녀 운과 가정 분위기 80자
- signs: 만나기 전 나타나는 징조 3~4가지 150자
- redFlags: 인연 만나기 전 피해야 할 사람 유형 80자
- compatibility: 사주상 궁합과 상생 포인트 120자
- description: 미래 배우자에 대한 신비로운 서술 300자 이상.
- fortuneTellerComment: 점술가가 직접 말하듯 인연 조언 200자 이상.
- keywords: 이 인연을 상징하는 키워드 6개
- imagePrompt: 영문 이미지 프롬프트. "Portrait of a ${gender==='남성'?'beautiful Korean woman':'handsome Korean man'}, [appearance], soft warm lighting, photorealistic, romantic atmosphere, 8k"`;
  }

  return `당신은 한국의 사주명리학 전문가이자 신비로운 점술가입니다.
${photoNote}

[사주 정보]
- 이름: ${name}
- 생년월일: ${birthDate} (${calType})
- 태어난 시: ${birthHour}
- 성별: ${gender}
${modeInstruction}

반드시 JSON만 출력하세요. 마크다운 없이:
${jsonTemplate}`;
}

// =============================================
// 결과 표시
// =============================================
function displayResult(data,imgUrl,mode){
  document.getElementById('pastLifeCard').style.display='none';
  document.getElementById('spouseCard').style.display='none';
  if(document.getElementById('faceCard')) document.getElementById('faceCard').style.display='none';
  if(document.getElementById('todayCard')) document.getElementById('todayCard').style.display='none';

  if(mode==='past'){
    document.getElementById('pastLifeCard').style.display='block';
    document.getElementById('pastLifeMeta').textContent=`${data.era} · ${data.role}`;
    document.getElementById('pastLifeDesc').textContent=data.description;
    document.getElementById('pastLifeBlocks').innerHTML=`
      <div class="info-blocks">
        <div class="info-block"><div class="info-block-title"><i>✦</i> 살았던 땅과 신분</div><div class="info-block-text">${(data.region||'')} · ${(data.socialClass||'')}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 유년기의 풍경</div><div class="info-block-text">${data.childhood||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 흐르던 생의 기록</div><div class="info-block-text">${data.lifeStory||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 타고난 재능</div><div class="info-block-text">${data.talent||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 얽매인 전생의 인연</div><div class="info-block-text">${data.relationships||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 전생의 사랑</div><div class="info-block-text">${data.loveStory||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 가장 큰 시련</div><div class="info-block-text">${data.tragedy||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 생의 마감과 마지막 감정</div><div class="info-block-text">${data.death||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 현생으로 이어진 업보</div><div class="info-block-text">${data.karma||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 현생에 남은 흔적</div><div class="info-block-text">${data.connectionToPresent||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 지금의 당신에게</div><div class="info-block-text">${data.lessonForNow||''}</div></div>
      </div>
    `;
    document.getElementById('pastLifeFortune').textContent=data.fortuneTellerComment;
    renderTags('pastLifeTags',data.keywords);
    renderImg('pastLifeImg','pastLifeImgPh',imgUrl);
  }else if(mode==='face'){
    document.getElementById('faceCard').style.display='block';
    document.getElementById('faceMeta').textContent=data.category;
    document.getElementById('faceDesc').textContent=data.description;
    document.getElementById('faceBlocks').innerHTML=`
      <div class="info-blocks">
        <div class="info-block"><div class="info-block-title"><i>✦</i> 전체 인상</div><div class="info-block-text">${data.faceType||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 오행 관상</div><div class="info-block-text">${data.fiveElements||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 이마(천정)</div><div class="info-block-text">${data.forehead||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 눈</div><div class="info-block-text">${data.eyes||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 코(재물궁)</div><div class="info-block-text">${data.nose||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 입(복록궁)</div><div class="info-block-text">${data.mouth||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 귀와 턱</div><div class="info-block-text">${data.earsAndJaw||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 청년기 운세</div><div class="info-block-text">${data.youthFlow||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 중년기 운세</div><div class="info-block-text">${data.middleFlow||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 말년기 운세</div><div class="info-block-text">${data.lateFlow||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 내면의 성향</div><div class="info-block-text">${data.personality||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 타고난 장점</div><div class="info-block-text">${data.strength||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 보완할 점</div><div class="info-block-text">${data.weakness||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 재물운</div><div class="info-block-text">${data.wealth||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 직업운</div><div class="info-block-text">${data.career||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 애정·결혼운</div><div class="info-block-text">${data.love||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 건강운</div><div class="info-block-text">${data.health||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 인덕·대인관계</div><div class="info-block-text">${data.socialLuck||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 삶의 주의점</div><div class="info-block-text">${data.caution||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 발전 방향</div><div class="info-block-text">${data.growthDirection||''}</div></div>
      </div>
    `;
    document.getElementById('faceFortune').textContent=data.fortuneTellerComment;
    renderTags('faceTags',data.keywords);
    renderImg('faceImg','faceImgPh',imgUrl);
  }else if(mode==='today'){
    renderToday(data);
  }else{
    document.getElementById('spouseCard').style.display='block';
    document.getElementById('spouseMeta').textContent=`첫 만남 · ${data.firstMeeting}`;
    document.getElementById('spouseDesc').textContent=data.description;
    document.getElementById('spouseBlocks').innerHTML=`
      <div class="info-blocks">
        <div class="info-block"><div class="info-block-title"><i>✦</i> 만나는 시기</div><div class="info-block-text">${(data.meetAge||'')} · ${(data.meetSeason||'')}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 첫인상</div><div class="info-block-text">${data.firstImpression||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 외모</div><div class="info-block-text">${data.appearance||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 평소 스타일</div><div class="info-block-text">${data.style||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 닮은꼴 연예인</div><div class="info-block-text">${data.celebrity||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 동물 관상</div><div class="info-block-text">${data.animalFace||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 추측 MBTI</div><div class="info-block-text">${data.mbtiGuess||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 추측 혈액형</div><div class="info-block-text">${data.bloodType||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 예상 직업군</div><div class="info-block-text">${data.job||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 경제력</div><div class="info-block-text">${data.income||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 가족 환경</div><div class="info-block-text">${data.family||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 출신 지역</div><div class="info-block-text">${data.hometown||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 취미·관심사</div><div class="info-block-text">${data.hobbies||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 성격</div><div class="info-block-text">${data.personality||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 가장 큰 매력</div><div class="info-block-text">${data.strengths||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 맞춰야 할 부분</div><div class="info-block-text">${data.flaws||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 연애 스타일</div><div class="info-block-text">${data.loveStyle||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 결혼 후 모습</div><div class="info-block-text">${data.marriedLife||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 자녀운</div><div class="info-block-text">${data.children||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 만나기 전의 징조</div><div class="info-block-text">${data.signs||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 피해야 할 인연</div><div class="info-block-text">${data.redFlags||''}</div></div>
        <div class="info-block"><div class="info-block-title"><i>✦</i> 사주 궁합</div><div class="info-block-text">${data.compatibility||''}</div></div>
      </div>
    `;
    document.getElementById('spouseFortune').textContent=data.fortuneTellerComment;
    renderTags('spouseTags',data.keywords);
    renderImg('spouseImg','spouseImgPh',imgUrl);
  }
  document.getElementById('resultSection').classList.add('show');
  setTimeout(()=>document.getElementById('resultSection').scrollIntoView({behavior:'smooth',block:'start'}),300);
}

function renderImg(imgId,phId,url){
  const img=document.getElementById(imgId),ph=document.getElementById(phId);
  if(url){img.src=url;img.style.display='block';ph.style.display='none';}
  else{ph.textContent='이미지를 불러올 수 없습니다';}
}

function renderTags(elId,keywords){
  if(!keywords?.length)return;
  document.getElementById(elId).innerHTML=keywords.map(k=>`<span class="tag">${k}</span>`).join('');
}

function renderToday(data) {
  const card = document.getElementById('todayCard');
  card.style.display = 'block';
  
  document.getElementById('todayMeta').textContent = `오늘의 운세 · ${new Date().toLocaleDateString()}`;
  document.getElementById('todayFlow').textContent = data.dayFlow;
  
  const luckyGrid = document.getElementById('todayLuckyElements');
  luckyGrid.innerHTML = (data.luckyElements || []).map(el => `
    <div class="info-block">
      <div class="info-block-title"><i>✦</i> ${el.category}</div>
      <div class="info-block-text">${el.value}</div>
    </div>
  `).join('');
  
  const chartEl = document.getElementById('todayChart');
  const hFlow = data.hourlyFlow || [];
  const maxH = 100;
  const svgW = 100, svgH = 60;
  const barW = svgW / hFlow.length - 2;
  
  let bars = hFlow.map((d, i) => {
    const x = i * (svgW / hFlow.length) + 1;
    const barHeight = (d.score / maxH) * (svgH - 15);
    const y = svgH - 5 - barHeight;
    let color = 'rgba(139,26,26,.5)';
    if (d.score >= 70) color = 'var(--gold)';
    else if (d.score >= 50) color = 'rgba(201,150,58,.45)';
    
    return `
      <rect x="${x}" y="${y}" width="${barW}" height="${barHeight}" fill="${color}" rx="0.5" />
      <text x="${x + barW/2}" y="${y - 2}" text-anchor="middle" font-size="2.5" fill="var(--gold)" style="font-family:sans-serif;">${d.label}</text>
      <text x="${x + barW/2}" y="${svgH - 1}" text-anchor="middle" font-size="2.5" fill="var(--mist)" style="font-family:sans-serif;">${d.hour}</text>
    `;
  }).join('');

  chartEl.innerHTML = `<svg viewBox="0 0 ${svgW} ${svgH}" width="100%">${bars}</svg>`;

  const cautionEl = document.getElementById('todayCautions');
  cautionEl.innerHTML = (data.cautions || []).map(c => `
    <div class="caution-card">
      <div class="caution-title">✦ ${c.title}</div>
      <div class="caution-desc">${c.desc}</div>
    </div>
  `).join('');
  
  document.getElementById('todayMentorAdvice').textContent = data.mentorAdvice;

  const naeryeokBlock = document.getElementById('todayNaeryeokBlock');
  const naeryeokEl = document.getElementById('todayNaeryeok');
  if (data.naeryeok) {
    naeryeokEl.textContent = data.naeryeok;
    naeryeokBlock.style.display = 'block';
  } else {
    naeryeokBlock.style.display = 'none';
  }

  const successQuoteBlock = document.getElementById('todaySuccessQuoteBlock');
  const successQuoteEl = document.getElementById('todaySuccessQuote');
  if (data.successQuote) {
    successQuoteEl.textContent = data.successQuote;
    successQuoteBlock.style.display = 'block';
  } else {
    successQuoteBlock.style.display = 'none';
  }

  document.getElementById('todayFortune').textContent = data.fortuneTellerComment;
}

// =============================================
// PDF 내보내기 (기존 코드 그대로)
// =============================================
window.exportPDF = async function(){
  if(!lastResult)return;
  const{parsed,name,birthDate,birthHour,gender,calType,mode}=lastResult;
  const today=new Date().toLocaleDateString('ko-KR',{year:'numeric',month:'long',day:'numeric'});
  const imgEl=document.getElementById(mode==='past'?'pastLifeImg':(mode==='face'?'faceImg':'spouseImg'));
  const imgShown=imgEl&&imgEl.style.display!=='none'&&imgEl.src;
  const imgHtml=imgShown?`<img src="${imgEl.src}" alt="결과 이미지" crossorigin="anonymous">`:`<div class="pdf-img-placeholder">이미지를 불러올 수 없습니다</div>`;
  const tagsHtml=(parsed.keywords||[]).map(k=>`<span class="pdf-tag">${k}</span>`).join('');
  const tr = (t) => { if(!t)return ''; return t; };

  let bodyHtml='';
  if(mode==='past'){
    bodyHtml=`
      <div class="pdf-section-title">전생 모습 보기 · PAST LIFE</div>
      <div class="pdf-meta">${parsed.era} · ${parsed.role}</div>
      <div class="pdf-img-wrap">${imgHtml}</div>
      <div class="pdf-desc">${tr(parsed.description)}</div>
      <div class="pdf-info-blocks">
        <div class="pdf-info-block"><span class="pdf-info-title">✦ 흐르던 생의 기록: </span><span class="pdf-info-text">${tr(parsed.lifeStory)}</span></div>
        <div class="pdf-info-block"><span class="pdf-info-title">✦ 얽매인 전생의 인연: </span><span class="pdf-info-text">${tr(parsed.relationships)}</span></div>
        <div class="pdf-info-block"><span class="pdf-info-title">✦ 생의 마감: </span><span class="pdf-info-text">${tr(parsed.death)}</span></div>
        <div class="pdf-info-block"><span class="pdf-info-title">✦ 현생으로 이어진 업보: </span><span class="pdf-info-text">${tr(parsed.karma)}</span></div>
      </div>
      <div class="pdf-fortune"><div class="pdf-fortune-label">✦ 점술가의 말</div><div class="pdf-fortune-text">${tr(parsed.fortuneTellerComment)}</div></div>
      <div class="pdf-tags">${tagsHtml}</div>`;
  } else {
    bodyHtml=`<div class="pdf-section-title">결과</div><div class="pdf-desc">${tr(parsed.description)}</div>`;
  }

  const pdfInlineStyles = `<style>
    *{box-sizing:border-box;margin:0;padding:0;}
    .pdf-page{width:794px;min-height:1123px;padding:64px 64px 72px;position:relative;background:#fff;color:#1a1008;font-family:'Gowun Batang',serif;}
    .pdf-header{text-align:center;border-bottom:1.5px solid #c9963a;padding-bottom:14px;margin-bottom:20px;}
    .pdf-title{font-family:'Nanum Myeongjo',serif;font-size:32px;font-weight:800;color:#8b5e1a;}
    .pdf-subtitle{font-size:11px;letter-spacing:4px;color:#999;margin-top:4px;}
    .pdf-section-title{font-family:'Nanum Myeongjo',serif;font-size:19px;color:#8b5e1a;letter-spacing:3px;margin-bottom:14px;padding-bottom:6px;border-bottom:1px solid #e8dcc8;}
    .pdf-meta{font-size:13px;color:#7a6040;letter-spacing:2px;margin-bottom:12px;}
    .pdf-img-wrap{text-align:center;margin:10px 0 14px;}
    .pdf-img-wrap img{max-width:230px;max-height:200px;object-fit:contain;border:1px solid #e8dcc8;}
    .pdf-img-placeholder{width:180px;height:240px;display:inline-flex;align-items:center;justify-content:center;background:#faf7f0;border:1px solid #e8dcc8;color:#ccc;font-size:13px;text-align:center;line-height:1.8;}
    .pdf-desc{font-size:13px;line-height:1.9;text-align:justify;color:#2a2010;margin-bottom:14px;word-break:keep-all;}
    .pdf-info-blocks{margin-bottom:14px;}
    .pdf-info-block{margin-bottom:8px;}
    .pdf-info-title{font-family:'Nanum Myeongjo',serif;font-size:13px;color:#8b5e1a;font-weight:700;}
    .pdf-info-text{font-size:13px;line-height:1.9;color:#3a2a10;}
    .pdf-fortune{background:#fdf8ee;border-left:3px solid #c9963a;padding:14px 18px;margin:14px 0;}
    .pdf-fortune-label{font-size:10px;color:#c9963a;letter-spacing:3px;margin-bottom:6px;}
    .pdf-fortune-text{font-size:13px;line-height:1.9;color:#4a3820;font-style:italic;word-break:keep-all;}
    .pdf-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:14px;}
    .pdf-tag{padding:4px 12px;border:1px solid #c9963a;font-size:11px;color:#8b5e1a;letter-spacing:1px;}
    .pdf-footer{position:absolute;bottom:28px;left:64px;right:64px;text-align:center;font-size:10px;color:#bbb;letter-spacing:2px;border-top:1px solid #e8dcc8;padding-top:8px;}
  </style>`;

  const printAreaEl = document.getElementById('printArea');
  const pdfHeaderHtml = `<div class="pdf-header"><div class="pdf-title">운명의 거울</div><div class="pdf-subtitle">사주로 읽는 전생과 미래의 인연</div></div>`;
  
  printAreaEl.innerHTML = pdfInlineStyles + `<div class="pdf-page">${pdfHeaderHtml}${bodyHtml}<div class="pdf-footer">운명의 거울 · ${today}</div></div>`;

  const isMobile = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
  if(!isMobile){
    window.print();
    return;
  }

  const overlay = document.getElementById('loadingOverlay');
  const stepEl = document.getElementById('loadingStep');
  overlay.classList.add('show');
  stepEl.textContent = 'PDF를 생성하는 중...';

  const origStyle = printAreaEl.style.cssText;
  printAreaEl.style.cssText = 'display:block !important; position:fixed; left:-9999px; top:0; width:794px; background:#fff;';

  try {
    await document.fonts.ready;
    const { jsPDF } = window.jspdf;
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageEls = printAreaEl.querySelectorAll('.pdf-page');
    for(let i = 0; i < pageEls.length; i++){
      if(i > 0) pdf.addPage();
      const pageEl = pageEls[i];
      pageEl.style.height = '1123px';
      pageEl.style.overflow = 'hidden';
      const pageCanvas = await html2canvas(pageEl, {
        scale: 2, useCORS: true, allowTaint: true,
        backgroundColor: '#ffffff', logging: false,
        width: 794, height: 1123, windowWidth: 794
      });
      const imgData = pageCanvas.toDataURL('image/jpeg', 0.95);
      pdf.addImage(imgData, 'JPEG', 0, 0, 210, 297);
    }
    const fileName = `운명의거울_${name}_${new Date().toISOString().slice(0,10)}.pdf`;
    const pdfBlob = pdf.output('blob');
    overlay.classList.remove('show');

    if(navigator.share && navigator.canShare){
      const file = new File([pdfBlob], fileName, {type:'application/pdf'});
      if(navigator.canShare({files:[file]})){
        await navigator.share({ files: [file], title: '운명의 거울 - 사주 분석 결과' });
        return;
      }
    }
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url; a.download = fileName;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(()=>URL.revokeObjectURL(url), 60000);
  } catch(err){
    console.error(err);
    overlay.classList.remove('show');
    alert('PDF 생성 중 오류가 발생했습니다.');
  } finally {
    printAreaEl.style.cssText = origStyle;
  }
}

function showError(msg){const el=document.getElementById('errorMsg');el.textContent='⚠ '+msg;el.classList.add('show');}
