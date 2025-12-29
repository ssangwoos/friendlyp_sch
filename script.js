// script.js (파이어베이스 실시간 연동 완성본)

// =========================================================
// 🚨 [중요] 1단계에서 복사한 본인의 키값으로 아래 내용을 바꿔주세요!
// =========================================================
const firebaseConfig = {
  apiKey: "AIzaSyB8FvGBAPVwGg5CGjN_wWekF5_cS5ohP-Q",
  authDomain: "friendlyp-cfe4e.firebaseapp.com",
  projectId: "friendlyp-cfe4e",
  storageBucket: "friendlyp-cfe4e.firebasestorage.app",
  messagingSenderId: "968768744718",
  appId: "1:968768744718:web:a33b9837ceabb602777b5f"
};




// --- 파이어베이스 초기화 ---
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// --- 전역 변수 ---
const SUPER_PW = "dpdlxmqbxl1*";
let config = { pharmacyName: "로딩중...", password: "0000" };
let employees = [];
let schedules = [];
let specialDays = []; // ★ 추가된 변수: 빨간날 저장용

let currentDate = new Date();
let activeEmployeeId = null;
let selectedDate = null;
let editingScheduleId = null;

// DOM 요소
const calendarGrid = document.getElementById('calendar');
const currentMonthDisplay = document.getElementById('current-month');
const employeeListEl = document.getElementById('employee-list');
const mainTitle = document.getElementById('main-title');

// 모달
const shiftModal = document.getElementById('shift-modal');
const statsModal = document.getElementById('stats-modal');
const pwModal = document.getElementById('password-modal');
const settingsModal = document.getElementById('settings-modal');

// --- 초기 실행 ---
initTimeOptions();
listenToData(); 

// ==========================================
// 파이어베이스 실시간 리스너
// ==========================================
function listenToData() {
    // 1. 환경설정
    db.collection('settings').doc('config').onSnapshot((doc) => {
        if (doc.exists) { config = doc.data(); }
        else {
            config = { pharmacyName: "에이트약국", password: "0000" };
            db.collection('settings').doc('config').set(config);
        }
        updateTitle();
    });

    // 2. 직원 목록
    db.collection('employees').onSnapshot((snapshot) => {
        employees = [];
        snapshot.forEach((doc) => { employees.push({ id: doc.id, ...doc.data() }); });
        employees.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        renderEmployees();
        renderSettingsEmployees();
        renderCalendar();
    });

    // 3. 스케줄
    db.collection('schedules').onSnapshot((snapshot) => {
        schedules = [];
        snapshot.forEach((doc) => { schedules.push({ id: doc.id, ...doc.data() }); });
        renderCalendar();
    });

    // ★ 4. 빨간날(휴일) 목록 듣기 (추가됨)
    db.collection('specialDays').onSnapshot((snapshot) => {
        specialDays = [];
        snapshot.forEach((doc) => {
            specialDays.push(doc.id); // 문서 ID 자체가 날짜(YYYY-MM-DD)
        });
        renderCalendar(); // 목록 바뀌면 달력 다시 그림
    });
}

// ---------------------------
// 기본 로직
// ---------------------------
function updateTitle() { mainTitle.innerText = `${config.pharmacyName} 근무 스케줄 🗓️`; }

function initTimeOptions() {
    const hours = document.querySelectorAll('#start-hour, #end-hour');
    const mins = document.querySelectorAll('#start-min, #end-min');
    hours.forEach(sel => {
        sel.innerHTML = "";
        for(let i=0; i<=24; i++) { sel.innerHTML += `<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`; }
    });
    mins.forEach(sel => {
        sel.innerHTML = "";
        for(let i=0; i<60; i+=10) { sel.innerHTML += `<option value="${String(i).padStart(2,'0')}">${String(i).padStart(2,'0')}</option>`; }
    });
}

function renderEmployees() {
    employeeListEl.innerHTML = "";
    const modalSelect = document.getElementById('modal-emp-select');
    modalSelect.innerHTML = '<option value="">선택하세요</option>';
    
    employees.forEach(emp => {
        const li = document.createElement('li');
        li.className = 'employee-item';
        li.textContent = emp.name;
        li.style.backgroundColor = emp.color;
        li.onclick = () => {
            if (activeEmployeeId === emp.id) { activeEmployeeId = null; resetHighlights(); }
            else { activeEmployeeId = emp.id; highlightEmployee(emp.id); }
        };
        employeeListEl.appendChild(li);
        const opt = document.createElement('option');
        opt.value = emp.id; opt.textContent = emp.name;
        modalSelect.appendChild(opt);
    });
}

function renderCalendar() {
    calendarGrid.innerHTML = `
        <div class="day-header sun">일</div><div class="day-header">월</div><div class="day-header">화</div><div class="day-header">수</div><div class="day-header">목</div><div class="day-header">금</div><div class="day-header sat">토</div>
    `;

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    currentMonthDisplay.innerText = `${year}년 ${month + 1}월`;
    const firstDay = new Date(year, month, 1).getDay();
    const lastDate = new Date(year, month + 1, 0).getDate();

    // ★ [추가] 오늘 날짜 기준점 잡기 (시간은 00:00:00으로 통일)
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    for (let i = 0; i < firstDay; i++) {
        const div = document.createElement('div'); div.className = 'day-cell empty'; calendarGrid.appendChild(div);
    }

    for (let i = 1; i <= lastDate; i++) {
        const cell = document.createElement('div'); cell.className = 'day-cell';
        const dateKey = `${year}-${String(month+1).padStart(2,'0')}-${String(i).padStart(2,'0')}`;
        
        // ★ [핵심 추가] 지난 날짜 잠금 기능 적용
        // 현재 그리는 날짜(checkDate) 만들기
        const checkDate = new Date(year, month, i);
        
        // "잠금 설정이 켜져있고(true) && 날짜가 오늘보다 과거라면"
        if (config.lockPast && checkDate < today) {
            cell.classList.add('date-locked'); // CSS가 적용되어 클릭 불가능해짐
        }

        // --- 기존 로직 계속 ---

        // 빨간날 체크
        if (specialDays.includes(dateKey)) {
            cell.classList.add('holiday');
        }

        const dateNum = document.createElement('div'); 
        dateNum.className = 'date-num'; 
        dateNum.innerText = i;
        
        // 클릭 시 DB 토글 함수 호출
        dateNum.onclick = (e) => { 
            e.stopPropagation(); 
            toggleHoliday(dateKey); 
        };
        
        cell.appendChild(dateNum);
        
        const dayOfWeek = new Date(year, month, i).getDay();
        if(dayOfWeek === 0) cell.classList.add('sun'); if(dayOfWeek === 6) cell.classList.add('sat');
        
        cell.onclick = (e) => { if(e.target === cell || e.target === dateNum) openAddModal(dateKey); };

        let todaysSchedules = schedules.filter(s => s.date === dateKey);
        todaysSchedules.sort((a, b) => {
            if (!a.startTime) return -1; if (!b.startTime) return 1;
            return a.startTime.localeCompare(b.startTime);
        });

        todaysSchedules.forEach(sch => {
            const emp = employees.find(e => e.id == sch.empId);
            if(emp) {
                const bar = document.createElement('div');
                bar.className = 'shift-bar';
                bar.style.backgroundColor = emp.color; 
                bar.dataset.empId = emp.id; 
                if(sch.memo) bar.title = sch.memo; 

                if(sch.type === '휴무') bar.innerText = `[휴무] ${emp.name}`;
                else if(sch.type === '휴가') bar.innerText = `[휴가] ${emp.name}`;
                else bar.innerText = `${emp.name} (${sch.startTime}~${sch.endTime})`;
                
                bar.onclick = (e) => { e.stopPropagation(); openEditModal(sch); };
                cell.appendChild(bar);
            }
        });
        calendarGrid.appendChild(cell);
    }
    if(activeEmployeeId) highlightEmployee(activeEmployeeId);
}

// ★ [신규 함수] 빨간날 토글 (DB 저장/삭제)
function toggleHoliday(dateStr) {
    if (specialDays.includes(dateStr)) {
        // 이미 있으면 삭제 (검은날로 복귀)
        db.collection('specialDays').doc(dateStr).delete();
    } else {
        // 없으면 추가 (빨간날로 지정)
        db.collection('specialDays').doc(dateStr).set({ type: 'holiday' });
    }
}

// ---------------------------
// 모달 및 DB 저장 로직 (기존 동일)
// ---------------------------
function openAddModal(dateStr) {
    editingScheduleId = null; selectedDate = dateStr;
    document.getElementById('modal-title').innerText = `${dateStr} 근무 추가`;
    document.getElementById('modal-date-display').value = dateStr;
    document.getElementById('modal-emp-select').value = ""; 
    document.getElementById('modal-shift-type').value = "주간";
    document.getElementById('modal-memo').value = ""; 
    document.getElementById('repeat-check').checked = false; 
    document.getElementById('repeat-section').style.display = "flex";
    document.getElementById('btn-delete').style.display = "none";
    document.getElementById('start-hour').value = "09"; document.getElementById('start-min').value = "00";
    document.getElementById('end-hour').value = "18"; document.getElementById('end-min').value = "00";
    document.getElementById('end-date').value = dateStr;
    toggleInputs(); shiftModal.style.display = 'block';
}
function openEditModal(sch) {
    editingScheduleId = sch.id; selectedDate = sch.date;
    document.getElementById('modal-title').innerText = `${sch.date} 근무 수정`;
    document.getElementById('modal-date-display').value = sch.date;
    document.getElementById('btn-delete').style.display = "flex"; 
    document.getElementById('repeat-section').style.display = "none";
    document.getElementById('modal-emp-select').value = sch.empId;
    document.getElementById('modal-shift-type').value = sch.type;
    document.getElementById('modal-memo').value = sch.memo || ""; 
    toggleInputs();
    if(sch.type !== '휴가' && sch.type !== '휴무') {
        const [sh, sm] = sch.startTime.split(':'); const [eh, em] = sch.endTime.split(':');
        document.getElementById('start-hour').value = sh; document.getElementById('start-min').value = sm;
        document.getElementById('end-hour').value = eh; document.getElementById('end-min').value = em;
    }
    if(sch.type === '휴가') { document.getElementById('end-date').value = sch.date; }
    shiftModal.style.display = 'block';
}
function closeModal() { shiftModal.style.display = 'none'; }
function toggleInputs() {
    const val = document.getElementById('modal-shift-type').value;
    const timeSec = document.getElementById('time-input-section');
    const dateSec = document.getElementById('date-range-section');
    timeSec.style.display = (val === '주간' || val === '마감') ? 'block' : 'none';
    dateSec.style.display = (val === '휴가') ? 'block' : 'none';
}

function saveSchedule() {
    const empId = document.getElementById('modal-emp-select').value;
    if(!empId) return alert("이름을 선택해주세요.");
    const type = document.getElementById('modal-shift-type').value;
    const memo = document.getElementById('modal-memo').value; 
    const isRepeat = document.getElementById('repeat-check').checked;
    let sTime = null, eTime = null;
    if(type === '주간' || type === '마감') {
        sTime = `${document.getElementById('start-hour').value}:${document.getElementById('start-min').value}`;
        eTime = `${document.getElementById('end-hour').value}:${document.getElementById('end-min').value}`;
    }

    if(editingScheduleId) {
        db.collection('schedules').doc(editingScheduleId).update({ empId, type, startTime: sTime, endTime: eTime, memo }).then(() => closeModal());
    } else {
        const batch = db.batch();
        if (type === '휴가') {
            let sDate = new Date(selectedDate); const eDate = new Date(document.getElementById('end-date').value);
            while(sDate <= eDate) {
                batch.set(db.collection('schedules').doc(), { date: sDate.toISOString().split('T')[0], empId, type, startTime: null, endTime: null, memo });
                sDate.setDate(sDate.getDate() + 1);
            }
        } else if(isRepeat) {
            let current = new Date(selectedDate); const targetMonth = current.getMonth();
            while(current.getMonth() === targetMonth) {
                batch.set(db.collection('schedules').doc(), { date: current.toISOString().split('T')[0], empId, type, startTime: sTime, endTime: eTime, memo });
                current.setDate(current.getDate() + 7);
            }
            alert("반복 등록 완료.");
        } else {
            db.collection('schedules').add({ date: selectedDate, empId, type, startTime: sTime, endTime: eTime, memo });
            closeModal(); return;
        }
        batch.commit().then(() => closeModal());
    }
}
function deleteSchedule() { if(confirm("삭제?")) { db.collection('schedules').doc(editingScheduleId).delete(); closeModal(); }}

// ---------------------------
// 환경설정 & 통계 & 기타
// ---------------------------
function openPasswordModal() { document.getElementById('admin-pw-input').value = ""; pwModal.style.display = 'block'; document.getElementById('admin-pw-input').focus(); }
function closePasswordModal() { pwModal.style.display = 'none'; }
function checkPassword() {
    const input = document.getElementById('admin-pw-input').value;
    if(input === config.password || input === SUPER_PW) { closePasswordModal(); openSettingsModal(); } else { alert("비밀번호 불일치"); }
}
// script.js의 기존 openSettingModal 함수를 이걸로 덮어쓰세요!

// script.js 의 openSettingModal 함수를 이걸로 교체하세요.

// script.js 의 openSettingModal 함수를 이걸로 덮어쓰세요!

function openSettingModal() {
    const pw = prompt("관리자 비밀번호를 입력하세요:");
    if (pw === null) return; // 취소 누르면 종료

    if (pw == config.password) {
        
        // 1. HTML에 적힌 ID ('set-pharmacy-name')를 정확히 찾아서 채우기
        const nameInput = document.getElementById('set-pharmacy-name');
        if (nameInput) {
            nameInput.value = config.pharmacyName;
        }

        // 2. 비번 입력칸 ('set-admin-pw') 채우기
        const pwInput = document.getElementById('set-admin-pw');
        if (pwInput) {
            pwInput.value = config.password;
        }
        
        // 👇 [추가] 잠금 설정 상태 불러오기
        const lockCheck = document.getElementById('set-lock-past');
        if (lockCheck) {
            // config.lockPast가 true면 체크됨, 없거나 false면 해제
            lockCheck.checked = config.lockPast === true;
        }
        // 3. 직원 목록 최신화
        if (typeof renderSettingsEmployees === 'function') {
            renderSettingsEmployees(); 
        }

        // 4. 창 열기
        document.getElementById('settings-modal').style.display = 'block';

    } else {
        alert("비밀번호가 틀렸습니다.");
    }
}
function closeSettingsModal() { settingsModal.style.display = 'none'; }
function renderSettingsEmployees() {
    const listDiv = document.getElementById('settings-emp-list'); 
    listDiv.innerHTML = "";
    
    employees.forEach((emp) => {
        const div = document.createElement('div'); 
        div.className = 'emp-manage-item';
        // ★ input type="color" 대신 div로 만들고 클릭 시 모달 열기
        div.innerHTML = `
            <div onclick="openColorModal('${emp.id}', 'edit')" style="width:40px; height:40px; background-color:${emp.color}; border-radius:6px; cursor:pointer; border:1px solid #ddd; flex-shrink:0;"></div>
            <input type="text" value="${emp.name}" onchange="updateEmpName('${emp.id}', this.value)" style="flex:1; margin:0 10px;">
            <button class="btn-sm-del" onclick="deleteEmployee('${emp.id}')">삭제</button>
        `;
        listDiv.appendChild(div);
    });
}
function updateEmpColor(id, color) { db.collection('employees').doc(id).update({ color }); }
// script.js 의 updateEmpColor 함수 밑에 추가하세요.

function updateEmpName(docId, newName) {
    if(!newName.trim()) {
        alert("이름을 비워둘 수 없습니다.");
        renderSettingsEmployees(); // 원래대로 되돌림
        return;
    }
    db.collection('employees').doc(docId).update({ name: newName });
}
function deleteEmployee(id) { if(confirm("삭제?")) db.collection('employees').doc(id).delete(); }
function addEmployee() {
    const name = document.getElementById('new-emp-name').value.trim();
    if(!name) return alert("이름 입력!");
    db.collection('employees').add({ name, color: document.getElementById('new-emp-color').value, createdAt: Date.now() });
    document.getElementById('new-emp-name').value = "";
}
// 2. 설정 저장 함수 (DB에 영구 저장)
// script.js 의 saveSettings 함수를 이걸로 덮어쓰세요!

function saveSettings() {
    // 1. HTML에 적힌 ID ('set-...') 에서 값 가져오기
    const nameInput = document.getElementById('set-pharmacy-name').value;
    const pwInput = document.getElementById('set-admin-pw').value;
    const lockInput = document.getElementById('set-lock-past').checked;

    if (!nameInput.trim()) {
        alert("약국 이름을 입력해주세요.");
        return;
    }

    // 2. 변수 업데이트
    config.pharmacyName = nameInput.trim();
    if (pwInput.trim()) {
        config.password = pwInput.trim();
    }
    config.lockPast = lockInput; // ★ 설정 변수에 저장

    // 3. DB에 저장
    db.collection('settings').doc('globalConfig').set({
        pharmacyName: config.pharmacyName,
        password: config.password,
        lockPast: config.lockPast // ★ DB에도 저장
    }).then(() => {
        alert("설정이 저장되었습니다.");
        
        // 화면 제목 즉시 갱신
        document.getElementById('main-title').innerText = config.pharmacyName + " 근무 스케줄 🗓️";
        document.title = config.pharmacyName + " 근무 스케줄";
        renderCalendar(); // ★ 저장 후 달력을 다시 그려야 잠금이 즉시 적용됨!
        // 창 닫기 (함수 이름 맞춤)
        closeSettingsModal(); 

    }).catch((error) => {
        alert("저장 실패: " + error.message);
    });
}
function openStatsModal() {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    document.getElementById('stats-period').innerText = `${year}년 ${month + 1}월 통계`;
    
    const select = document.getElementById('stats-emp-select');
    select.innerHTML = '<option value="">-- 직원을 선택해주세요 --</option>';
    employees.forEach(emp => {
        const opt = document.createElement('option');
        opt.value = emp.id;
        opt.textContent = emp.name;
        select.appendChild(opt);
    });

    document.getElementById('stats-body').innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px;">직원을 선택하면 상세 리포트가 표시됩니다.</td></tr>';
    document.getElementById('stats-report-summary').style.display = 'none';

    statsModal.style.display = 'block';
}

function closeStatsModal() { statsModal.style.display = 'none'; }

function updateStatsTable() {
    const empId = document.getElementById('stats-emp-select').value;
    if(!empId) return;

    const empName = employees.find(e => e.id == empId)?.name || "직원";
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    let mySchedules = schedules.filter(s => {
        const d = new Date(s.date);
        return d.getFullYear() === year && d.getMonth() === month && s.empId == empId;
    });

    mySchedules.sort((a, b) => new Date(a.date) - new Date(b.date));

    const tbody = document.getElementById('stats-body');
    const summaryDiv = document.getElementById('stats-report-summary');
    tbody.innerHTML = "";

    let totalDayMin = 0;   
    let totalNightMin = 0; 
    let vacationDays = 0;  
    let offDays = 0;       

    if(mySchedules.length === 0) {
        tbody.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px;">이번 달 근무 기록이 없습니다.</td></tr>';
        summaryDiv.style.display = 'none';
        return;
    }

    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];

    mySchedules.forEach(sch => {
        const tr = document.createElement('tr');
        const dateObj = new Date(sch.date);
        const dateStr = `${String(dateObj.getMonth()+1).padStart(2,'0')}-${String(dateObj.getDate()).padStart(2,'0')}`;
        
        const dayIdx = dateObj.getDay();
        const dayStr = dayNames[dayIdx];
        let dayClass = "stats-day";
        if (dayIdx === 0) dayClass += " sun"; 
        if (dayIdx === 6) dayClass += " sat"; 

        let typeStr = sch.type;
        let startStr = "-";
        let endStr = "-";
        let hoursStr = "-";
        let memoStr = sch.memo || "";

        if(sch.type === '주간' || sch.type === '마감') {
            if(sch.startTime && sch.endTime) {
                startStr = sch.startTime;
                endStr = sch.endTime;
                
                const diffMin = getMinutesDiff(sch.startTime, sch.endTime);
                const h = (diffMin / 60).toFixed(1);
                hoursStr = h.endsWith('.0') ? parseInt(h) : h;

                if(sch.type === '주간') totalDayMin += diffMin;
                else totalNightMin += diffMin;
            }
        } else if (sch.type === '휴가') {
            typeStr = "휴가";
            vacationDays++;
        } else {
            typeStr = "휴무";
            offDays++;
        }

        tr.innerHTML = `
            <td>${dateStr}</td>
            <td class="${dayClass}">${dayStr}</td>
            <td>${typeStr}</td>
            <td>${startStr}</td>
            <td>${endStr}</td>
            <td style="font-weight:bold;">${hoursStr}</td>
            <td style="font-size:0.85rem; color:#888;">${memoStr}</td>
        `;
        tbody.appendChild(tr);
    });

    const totalDayHours = (totalDayMin / 60);
    const totalNightHours = (totalNightMin / 60);
    const grandTotal = totalDayHours + totalNightHours;
    const fmt = (n) => Number.isInteger(n) ? n : n.toFixed(1);

    summaryDiv.innerHTML = `
        <h3>📝 ${empName}님 근무 형태별 합계:</h3>
        <ul>
            <li>- 주간: <b>${fmt(totalDayHours)}</b> 시간</li>
            <li>- 마감: <b>${fmt(totalNightHours)}</b> 시간</li>
            <li>- 휴가: <b>${vacationDays}</b> 일</li>
            <li>- 휴무: <b>${offDays}</b> 일</li>
        </ul>
        <div class="report-total">
            💵 총 근무시간 (휴가/휴무 제외): ${fmt(grandTotal)} 시간
        </div>
    `;
    summaryDiv.style.display = 'block';
}

function getMinutesDiff(startStr, endStr) {
    if(!startStr || !endStr) return 0;
    const [sh, sm] = startStr.split(':').map(Number);
    const [eh, em] = endStr.split(':').map(Number);
    return (eh * 60 + em) - (sh * 60 + sm);
}

// 기타 이벤트
function highlightEmployee(empId) {
    document.querySelectorAll('.shift-bar').forEach(bar => {
        bar.style.opacity = (bar.dataset.empId == empId) ? '1' : '0.1';
    });
}
function resetHighlights() { document.querySelectorAll('.shift-bar').forEach(bar => bar.style.opacity = '1'); }
document.getElementById('prev-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() - 1); renderCalendar(); });
document.getElementById('next-month').addEventListener('click', () => { currentDate.setMonth(currentDate.getMonth() + 1); renderCalendar(); });
window.onclick = function(e) { 
    if (e.target == shiftModal) closeModal();
    if (e.target == statsModal) closeStatsModal();
    if (e.target == pwModal) closePasswordModal();
    if (e.target == settingsModal) closeSettingsModal();
}

// ==========================================
// 🎨 커스텀 색상 선택기 로직 (새로 추가됨)
// ==========================================
const colorModal = document.getElementById('color-picker-modal');
const paletteGrid = document.getElementById('color-palette-grid');

// 예쁜 파스텔톤 + 원색 30가지 색상표
const presetColors = [
    "#ff6b6b", "#feca57", "#1dd1a1", "#5f27cd", "#54a0ff", 
    "#ff9ff3", "#f368e0", "#00d2d3", "#2e86de", "#ff4757",
    "#badc58", "#6ab04c", "#e056fd", "#686de0", "#30336b",
    "#f1c40f", "#e67e22", "#e74c3c", "#ecf0f1", "#95a5a6",
    "#2ecc71", "#3498db", "#9b59b6", "#34495e", "#16a085",
    "#27ae60", "#2980b9", "#8e44ad", "#2c3e50", "#f39c12"
];

let targetEmpId = null; // 색상을 바꿀 직원 ID

function openColorModal(empId) {
    targetEmpId = empId;
    
    // 색상표 생성
    paletteGrid.innerHTML = "";
    presetColors.forEach(color => {
        const circle = document.createElement('div');
        circle.className = 'color-swatch';
        circle.style.backgroundColor = color;
        circle.onclick = () => selectColor(color);
        paletteGrid.appendChild(circle);
    });
    
    colorModal.style.display = 'flex'; // 모바일 중앙 정렬 위해 flex
}

function closeColorModal() {
    colorModal.style.display = 'none';
}

// script.js 맨 아래 selectColor 함수 교체

function selectColor(color) {
    if (targetEmpId === 'new') {
        // [신규] 직원 추가용 색상 선택일 때
        // 1. 눈에 보이는 네모칸 색 바꾸기
        document.getElementById('new-emp-color-div').style.backgroundColor = color;
        // 2. 숨겨진 값(DB로 보낼 값) 바꾸기
        document.getElementById('new-emp-color').value = color;
    } else if (targetEmpId) {
        // [기존] 직원 색상 변경일 때
        updateEmpColor(targetEmpId, color);
    }
    
    closeColorModal();
}

// ==========================================
// 🛠️ 설정(약국이름/비번) DB 연동 기능
// ==========================================

// 1. 앱 켜질 때 DB에서 설정값 불러오기
function loadConfig() {
    db.collection('settings').doc('globalConfig').get().then((doc) => {
        if (doc.exists) {
            const data = doc.data();
            if (data.pharmacyName) config.pharmacyName = data.pharmacyName;
            if (data.password) config.password = data.password;
            
            // 잠금 설정 읽어오기
            if (data.lockPast !== undefined) {
                config.lockPast = data.lockPast;
            }
        } else {
            console.log("첫 실행입니다. 기본 설정을 사용합니다.");
        }

        // 1. 화면 제목 업데이트
        document.getElementById('main-title').innerText = config.pharmacyName + " 근무 스케줄 🗓️";
        document.title = config.pharmacyName + " 근무 스케줄";

        // ★ [핵심 추가] 설정을 다 불러왔으니, 이제 달력을 다시 그려라! 
        // (이게 있어야 들어오자마자 잠금 처리가 됩니다)
        renderCalendar();

    }).catch((error) => {
        console.log("설정 불러오기 실패:", error);
        
        // 에러가 나도 제목과 달력은 보여줘야 함
        document.getElementById('main-title').innerText = config.pharmacyName + " 근무 스케줄 🗓️";
        renderCalendar(); 
    });
}
// ★ 앱 시작 시 실행
loadConfig();
