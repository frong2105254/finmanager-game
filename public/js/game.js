// public/js/game.js

// ทำการเชื่อมต่อ Socket.IO
// หากเล่นแบบทดสอบในเครื่องตัวเอง (localhost) ระบบจะเชื่อมต่อไปที่หลังบ้านของเครื่องตัวเองโดยอัตโนมัติ
// หากนำหน้าบ้านขึ้น Cloudflare Pages แล้ว ให้นำ URL ของ Backend เซิร์ฟเวอร์ที่ได้ (เช่น จาก Render/Railway) มาแก้ไขแทนลิงก์ด้านล่างนี้
const BACKEND_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? '' 
  : 'https://finmanager-backend.onrender.com'; // 📌 ใส่ URL Backend จริงของคุณที่นี่ภายหลัง

const socket = io(BACKEND_URL);

// จัดการตรวจสอบและกู้คืนสิทธิ์เข้าร่วมห้องเล่นเกมโดยอัตโนมัติเมื่อเกิดการเชื่อมต่อใหม่ (Auto-Reconnect)
socket.on('connect', () => {
  console.log('Socket connected/reconnected:', socket.id);
  socket.emit('getHighScores');
  if (myState.roomCode && myState.name) {
    console.log(`Auto-rejoining room ${myState.roomCode} as ${myState.name}`);
    socket.emit('joinRoom', {
      roomCode: myState.roomCode,
      playerName: `${myState.avatar} ${myState.name}`
    });
    if (myState.hasSubmitted && myLastAllocation) {
      socket.emit('submitAllocation', myLastAllocation);
    }
  }
});

// ฟังก์ชันล็อก/ปลดล็อกการเลื่อนของ Body สำหรับช่วยแก้ปัญหาสกรอลล์บนมือถือ (iOS)
function setBodyScroll(scrollable) {
  if (scrollable) {
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.height = '';
  } else {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.height = '100%';
  }
}

// สถานะของผู้เล่นคนปัจจุบัน
let myState = {
  id: '',
  name: '',
  avatar: '🐱',
  money: 1000000,
  isHost: false,
  isBankrupt: false,
  roomCode: '',
  hasSubmitted: false,
  lastDifficulty: 'easy'
};

let globalHighScores = { easy: [], medium: [], hard: [] };
let currentLeaderboardDiff = 'easy';

// ช่วยแปลงอักขระพิเศษสำหรับแสดงผลใน HTML อย่างปลอดภัย
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderLeaderboardModal() {
  const listContainer = document.getElementById('leaderboard-modal-list');
  if (!listContainer) return;
  const scores = globalHighScores[currentLeaderboardDiff] || [];
  if (scores.length === 0) {
    listContainer.innerHTML = `
      <div style="text-align: center; padding: 30px 10px; color: #888; font-family: var(--font-thai); font-size: 0.85rem;">
        ยังไม่มีผู้ทำสถิติในระดับความยากนี้<br>
        <span style="font-size: 0.7rem; color: #555;">เป็นคนแรกที่สร้างประวัติศาสตร์เลย!</span>
      </div>
    `;
    return;
  }
  let html = '';
  scores.forEach((item, index) => {
    const rank = index + 1;
    let medal = `${rank}.`;
    let rankClass = '';
    if (rank === 1) { medal = '🥇'; rankClass = 'rank-1'; }
    else if (rank === 2) { medal = '🥈'; }
    else if (rank === 3) { medal = '🥉'; }
    
    html += `
      <div class="leaderboard-row ${rankClass}" style="margin-bottom: 8px; border-radius: 4px; padding: 10px 12px; display: flex; justify-content: space-between; align-items: center; background-color: rgba(0,0,0,0.3);">
        <div style="display: flex; align-items: center; gap: 8px;">
          <span style="font-size: 1.1rem; min-width: 25px; text-align: center;">${medal}</span>
          <span style="font-weight: bold; font-size: 0.9rem;">${item.avatar || '👾'} ${escapeHtml(item.name || 'Anonymous')}</span>
        </div>
        <div style="color: var(--neon-green); font-weight: bold; font-size: 0.95rem;">
          ฿${(item.money || 0).toLocaleString()}
        </div>
      </div>
    `;
  });
  listContainer.innerHTML = html;
}

socket.on('highScoresUpdate', (data) => {
  if (data) {
    globalHighScores = data;
    renderLeaderboardModal();
  }
});

let myLastAllocation = null;
try {
  myLastAllocation = JSON.parse(localStorage.getItem('myLastAllocation') || 'null');
} catch (e) {
  console.error('Failed to parse myLastAllocation', e);
}

// ข้อมูลสถานะห้องปัจจุบัน
let currentRoomState = null;

// ฟังก์ชันเปลี่ยนไอคอนอวาตาร์เอเลี่ยน 👾 เป็น SVG สีน้ำเงินเพื่อความสวยงามโดดเด่นและมีสีสันสดใส
function replaceAvatarInText(text) {
  if (typeof text !== 'string') return text;
  // เช็คว่ามีอิโมจิเอเลี่ยน 👾 อยู่ในข้อความหรือไม่ (อิโมจิมีความยาว 2 code units)
  if (text.startsWith('👾')) {
    const svg = `<svg viewBox="0 0 8 8" style="width: 20px; height: 20px; fill: #007aff; shape-rendering: crispEdges; display: inline-block; vertical-align: middle; margin-right: 5px;">
      <rect x="2" y="0" width="1" height="1" /><rect x="5" y="0" width="1" height="1" />
      <rect x="3" y="1" width="2" height="1" />
      <rect x="1" y="2" width="6" height="1" />
      <rect x="0" y="3" width="2" height="1" /><rect x="3" y="3" width="2" height="1" /><rect x="6" y="3" width="2" height="1" />
      <rect x="0" y="4" width="8" height="1" />
      <rect x="2" y="5" width="4" height="1" />
      <rect x="1" y="6" width="1" height="1" /><rect x="6" y="6" width="1" height="1" />
      <rect x="0" y="7" width="1" height="1" /><rect x="7" y="7" width="1" height="1" />
    </svg>`;
    const remainder = text.substring(2).trim();
    // คืนค่า SVG พร้อมชื่อส่วนที่เหลือ (ถ้ามี)
    return remainder ? svg + ' ' + remainder : svg;
  }
  return text;
}

// รายชื่อธีมและไอคอนประกอบ
const THEME_ICONS = {
  bull: '🐂',
  bear: '🐻',
  pandemic: '🦠',
  inflation: '💸',
  policy: '📜',
  crypto: '₿',
  realestate: '🏢',
  gold: '🪙',
  disaster: '🌋',
  funny: '👽'
};

const THEME_NAMES = {
  bull: 'ตลาดกระทิง (Bull Market)',
  bear: 'ตลาดหมี/วิกฤตเศรษฐกิจ',
  pandemic: 'โรคระบาด/ปัญหาสุขภาพ',
  inflation: 'เงินเฟ้อ/ดอกเบี้ยขึ้น',
  policy: 'นโยบายรัฐบาล/ภาษี',
  crypto: 'บิตคอยน์ฟีเวอร์ (Crypto)',
  realestate: 'อสังหาริมทรัพย์บูม',
  gold: 'ราคาทองคำพุ่ง (Gold Rush)',
  disaster: 'ภัยพิบัติธรรมชาติ',
  funny: 'เหตุการณ์สุดเพี้ยน/ตลก'
};

// คีย์ของสินทรัพย์ทั้ง 9 ชนิด (เรียงจากความเสี่ยงต่ำไปหาความเสี่ยงสูง โดยมีประกันภัยเป็นลำดับที่ 2 ถัดจากธนาคาร)
const ASSETS = ['bank', 'insurance', 'govBonds', 'corpBonds', 'gold', 'realEstate', 'stocks', 'bitcoin', 'artToys'];

// ชื่อภาษาไทยของสินทรัพย์เพื่อแสดงผลในหน้า Cutscene
const ASSET_NAMES_TH = {
  bank: 'เงินฝากธนาคาร',
  govBonds: 'พันธบัตรรัฐบาล',
  corpBonds: 'หุ้นกู้เอกชน',
  gold: 'ทองคำ',
  realEstate: 'อสังหาฯ ให้เช่า',
  stocks: 'หุ้นสามัญ',
  bitcoin: 'บิตคอยน์',
  insurance: 'ประกันสุขภาพ',
  artToys: 'กล่องสุ่มอาร์ตทอยส์'
};

// เริ่มต้นสคริปต์
document.addEventListener('DOMContentLoaded', () => {
  setupAvatarSelector();
  setupSlidersAndInputs();
  bindButtons();
  setupSocketListeners();
});

// 1. จัดการเลือก Avatar
function setupAvatarSelector() {
  const options = document.querySelectorAll('.avatar-option');
  options.forEach(opt => {
    opt.addEventListener('click', () => {
      window.audio.playClick();
      options.forEach(o => o.classList.remove('selected'));
      opt.classList.add('selected');
      myState.avatar = opt.dataset.avatar;
    });
  });
}

// 2. ตั้งค่าการโต้ตอบของ Slider และ Input Box ให้สอดประสานกัน
function setupSlidersAndInputs() {
  ASSETS.forEach(key => {
    const slider = document.getElementById(`slide-${key}`);
    const input = document.getElementById(`input-${key}`);
    const pctInput = document.getElementById(`pct-input-${key}`);

    // เมื่อลากสไลเดอร์
    slider.addEventListener('input', () => {
      let val = parseInt(slider.value) || 0;
      
      // คำนวณเงินรวมของสินทรัพย์อื่นที่ไม่ใช่ตัวนี้
      const otherSum = getOtherAssetsSum(key);
      let maxAllowed = myState.money - otherSum;

      // ตรวจสอบวงเงินแนะนำของตัวเลือกประกันสุขภาพ
      if (key === 'insurance') {
        maxAllowed = Math.min(20000, maxAllowed);
      }

      // ป้องกันการลากเกินงบที่มีอยู่จริง (สไลเดอร์จะหยุดไม่ให้เลื่อนจนติดลบ)
      if (val > maxAllowed) {
        val = maxAllowed;
        slider.value = val;
      }

      input.value = val.toLocaleString();
      updatePercentagesAndSummary();
    });

    // เมื่อกรอกตัวเลขโดยตรง (เงินบาท)
    input.addEventListener('focus', () => {
      // เอาคอมมาออกเพื่อกรอกง่าย
      input.value = input.value.replace(/,/g, '');
      input.select();
    });

    input.addEventListener('blur', () => {
      let val = Math.max(0, parseInt(input.value) || 0);

      // คำนวณเงินรวมของสินทรัพย์อื่นที่ไม่ใช่ตัวนี้
      const otherSum = getOtherAssetsSum(key);
      let maxAllowed = myState.money - otherSum;
      if (key === 'insurance') {
        maxAllowed = Math.min(20000, maxAllowed);
      }

      // ป้องกันการกรอกเกินงบที่มีอยู่จริง
      if (val > maxAllowed) {
        val = maxAllowed;
      }

      slider.value = val;
      input.value = val.toLocaleString();
      updatePercentagesAndSummary();
    });
    
    // ป้องกันการพิมพ์ตัวอักษรอื่นๆ นอกจากตัวเลข ในช่องเงินบาท
    input.addEventListener('keypress', (e) => {
      if (e.key < '0' || e.key > '9') {
        e.preventDefault();
      }
    });

    // เมื่อกรอกเปอร์เซ็นต์โดยตรง
    pctInput.addEventListener('focus', () => {
      pctInput.select();
    });

    pctInput.addEventListener('blur', () => {
      let pctVal = Math.max(0, parseInt(pctInput.value) || 0);
      if (pctVal > 100) {
        pctVal = 100;
      }

      // แปลงเปอร์เซ็นต์เป็นยอดเงินบาทจริง
      let val = Math.round((pctVal / 100) * myState.money);

      // คำนวณเงินรวมของสินทรัพย์อื่นที่ไม่ใช่ตัวนี้
      const otherSum = getOtherAssetsSum(key);
      let maxAllowed = myState.money - otherSum;
      if (key === 'insurance') {
        maxAllowed = Math.min(20000, maxAllowed);
      }

      // ป้องกันการแปลงแล้วเกินงบที่มีอยู่จริง
      if (val > maxAllowed) {
        val = maxAllowed;
      }

      slider.value = val;
      input.value = val.toLocaleString();
      updatePercentagesAndSummary();
    });

    // ป้องกันการพิมพ์ตัวอักษรอื่นๆ นอกจากตัวเลข ในช่องเปอร์เซ็นต์
    pctInput.addEventListener('keypress', (e) => {
      if (e.key < '0' || e.key > '9') {
        e.preventDefault();
      }
    });
  });
}

// คำนวณเงินลงทุนของสินทรัพย์ตัวอื่นทั้งหมด
function getOtherAssetsSum(excludeKey) {
  let sum = 0;
  ASSETS.forEach(key => {
    if (key !== excludeKey) {
      const slider = document.getElementById(`slide-${key}`);
      sum += parseInt(slider.value) || 0;
    }
  });
  return sum;
}

// อัปเดต % และสรุปยอดเงินคงเหลือเรียลไทม์
function updatePercentagesAndSummary() {
  let totalAllocated = 0;
  
  ASSETS.forEach(key => {
    const val = parseInt(document.getElementById(`slide-${key}`).value) || 0;
    totalAllocated += val;

    // คำนวณเปอร์เซ็นต์
    let pct = 0;
    if (myState.money > 0) {
      pct = Math.round((val / myState.money) * 100);
    }
    
    // อัปเดตค่าช่องกรอกเปอร์เซ็นต์ (ถ้าผู้เล่นไม่ได้กำลังโฟกัสเพื่อพิมพ์อยู่)
    const pctInput = document.getElementById(`pct-input-${key}`);
    if (document.activeElement !== pctInput) {
      pctInput.value = pct;
    }
  });

  const remaining = myState.money - totalAllocated;

  // เอาโค้ดปรับ .max แบบไดนามิกออกทั้งหมด เพื่อป้องกันการกระตุก/สั่นไหวของตัวจับสไลเดอร์ตัวอื่นบนเบราว์เซอร์มือถือ
  
  // อัปเดตกล่องแสดงเงินกองกลางขนาดใหญ่ด้านบนสุดของการลงทุน (การันตีค่าคงเหลือไม่มีทางต่ำกว่า 0)
  const cashPoolValEl = document.getElementById('cash-pool-display-val');
  cashPoolValEl.innerText = `${remaining.toLocaleString()} ฿`;
  cashPoolValEl.style.color = 'var(--neon-green)';
  cashPoolValEl.style.textShadow = '0 0 10px var(--neon-green)';
  
  // อัปเดตข้อมูลส่วนสรุปการจัดสรรเงินด้านล่าง
  document.getElementById('summary-allocated-val').innerText = `${totalAllocated.toLocaleString()} ฿`;
  document.getElementById('summary-total-val').innerText = `${myState.money.toLocaleString()} ฿`;
  
  const remainingValEl = document.getElementById('summary-remaining-val');
  remainingValEl.innerText = `${remaining.toLocaleString()} ฿`;

  // รับรองไม่มีการเลื่อนล้นจนติดลบ และปุ่ม Submit พร้อมกดทำงานได้ตลอดเวลาอย่างราบรื่น
  const cashWrap = document.getElementById('summary-cash-wrap');
  cashWrap.classList.remove('error');

  const submitBtn = document.getElementById('btn-submit-alloc');
  submitBtn.disabled = false;
  submitBtn.style.opacity = '1';
  submitBtn.innerText = 'ส่งแผนการลงทุน (SUBMIT)';
}

// 3. ผูกปุ่มการโต้ตอบหน้าเว็บ
function bindButtons() {
  // ปุ่มสร้างห้อง
  document.getElementById('btn-create').addEventListener('click', () => {
    window.audio.playClick();
    const name = document.getElementById('player-name').value.trim();
    if (!name) {
      alert('กรุณากรอกชื่อผู้เล่นก่อนสร้างห้อง!');
      return;
    }
    myState.name = name;
    const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    socket.emit('createRoom', { playerName: `${myState.avatar} ${name}`, difficulty });
  });

  // ปุ่มเข้าร่วมห้อง
  document.getElementById('btn-join').addEventListener('click', () => {
    window.audio.playClick();
    const name = document.getElementById('player-name').value.trim();
    const roomCode = document.getElementById('room-code-input').value.trim().toUpperCase();
    if (!name) {
      alert('กรุณากรอกชื่อผู้เล่นก่อนเข้าร่วมห้อง!');
      return;
    }
    if (roomCode.length !== 4) {
      alert('กรุณากรอกรหัสห้องให้ครบ 4 หลัก!');
      return;
    }
    myState.name = name;
    socket.emit('joinRoom', { roomCode, playerName: `${myState.avatar} ${name}` });
  });

  // ปุ่มเปิดคู่มือการลงทุน
  document.getElementById('btn-open-guide').addEventListener('click', () => {
    window.audio.playClick();
    document.getElementById('guide-overlay').classList.add('show');
    setBodyScroll(false);
  });

  // ปุ่มปิดคู่มือการลงทุน
  document.getElementById('btn-close-guide').addEventListener('click', () => {
    window.audio.playClick();
    document.getElementById('guide-overlay').classList.remove('show');
    setBodyScroll(true);
  });

  // ปุ่มปิดคู่มือแบบ X
  document.getElementById('btn-close-guide-x').addEventListener('click', () => {
    window.audio.playClick();
    document.getElementById('guide-overlay').classList.remove('show');
    setBodyScroll(true);
  });

function fetchHighScores() {
  if (typeof socket !== 'undefined' && socket) {
    socket.emit('getHighScores');
  }
  fetch(`${BACKEND_URL}/api/highscores`)
    .then(res => res.json())
    .then(data => {
      if (data) {
        globalHighScores = data;
        renderLeaderboardModal();
      }
    })
    .catch(err => console.error('Error fetching highscores REST:', err));
}

  // ปุ่มเปิดกระดานผู้นำสูงสุด (Leaderboard)
  const handleOpenLeaderboard = () => {
    window.audio.playClick();
    fetchHighScores();
    
    // เลือกแท็บตามโหมดล่าสุดที่เล่น
    if (myState.lastDifficulty) {
      currentLeaderboardDiff = myState.lastDifficulty;
    }
    document.querySelectorAll('.leaderboard-tab-btn').forEach(btn => {
      if (btn.getAttribute('data-diff') === currentLeaderboardDiff) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });

    document.getElementById('leaderboard-overlay').classList.add('show');
    setBodyScroll(false);
    renderLeaderboardModal();
  };

  const btnOpenLeaderboard = document.getElementById('btn-open-leaderboard');
  if (btnOpenLeaderboard) {
    btnOpenLeaderboard.addEventListener('click', handleOpenLeaderboard);
  }

  const btnOpenLeaderboardWinner = document.getElementById('btn-open-leaderboard-winner');
  if (btnOpenLeaderboardWinner) {
    btnOpenLeaderboardWinner.addEventListener('click', handleOpenLeaderboard);
  }

  // ปุ่มปิดกระดานผู้นำสูงสุด
  const btnCloseLeaderboard = document.getElementById('btn-close-leaderboard');
  if (btnCloseLeaderboard) {
    btnCloseLeaderboard.addEventListener('click', () => {
      window.audio.playClick();
      document.getElementById('leaderboard-overlay').classList.remove('show');
      setBodyScroll(true);
    });
  }

  const btnCloseLeaderboardX = document.getElementById('btn-close-leaderboard-x');
  if (btnCloseLeaderboardX) {
    btnCloseLeaderboardX.addEventListener('click', () => {
      window.audio.playClick();
      document.getElementById('leaderboard-overlay').classList.remove('show');
      setBodyScroll(true);
    });
  }

  // แท็บเลือกหมวดความยากในหน้าต่างกระดานผู้นำ
  document.querySelectorAll('.leaderboard-tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      window.audio.playClick();
      document.querySelectorAll('.leaderboard-tab-btn').forEach(b => b.classList.remove('active'));
      e.currentTarget.classList.add('active');
      currentLeaderboardDiff = e.currentTarget.getAttribute('data-diff') || 'easy';
      renderLeaderboardModal();
    });
  });

  // ปุ่มเปิดรายงานสรุปการวางแผนการเงิน
  document.getElementById('btn-show-financial-report').addEventListener('click', () => {
    window.audio.playClick();
    renderFinancialReport();
    document.getElementById('financial-report-overlay').classList.add('show');
    setBodyScroll(false);
  });

  // ปุ่มปิดรายงานสรุปการวางแผนการเงิน
  document.getElementById('btn-close-financial-report').addEventListener('click', () => {
    window.audio.playClick();
    document.getElementById('financial-report-overlay').classList.remove('show');
    if (!document.getElementById('winner-overlay').classList.contains('show')) {
      setBodyScroll(true);
    }
  });

  // ปุ่มปิดรายงานสรุปการวางแผนการเงินแบบ X
  document.getElementById('btn-close-financial-report-x').addEventListener('click', () => {
    window.audio.playClick();
    document.getElementById('financial-report-overlay').classList.remove('show');
    if (!document.getElementById('winner-overlay').classList.contains('show')) {
      setBodyScroll(true);
    }
  });

  // ปุ่มเริ่มเกม (เฉพาะโฮสต์)
  document.getElementById('btn-start-game').addEventListener('click', () => {
    window.audio.playClick();
    socket.emit('startGame');
  });

  // ปุ่มส่งแผนการลงทุน
  document.getElementById('btn-submit-alloc').addEventListener('click', () => {
    window.audio.playCashRegister();
    submitMyAllocation();
  });

  // ปุ่มดึงเงินคืนเข้ากองกลางทั้งหมด (RESET)
  document.getElementById('btn-reset-alloc').addEventListener('click', () => {
    // ห้ามกด Reset หากกด Submit แผนการลงทุนไปแล้ว
    if (myState.hasSubmitted) return;

    window.audio.playClick();
    // รีเซ็ตการจัดสรรเงินทุกช่องเป็น 0 (เงินจะเด้งกลับเข้ากองกลางอัตโนมัติ)
    loadAllocationToSliders({
      bank: 0,
      govBonds: 0,
      corpBonds: 0,
      gold: 0,
      realEstate: 0,
      stocks: 0,
      bitcoin: 0,
      insurance: 0,
      artToys: 0
    });
  });

  // ปุ่มกดเล่นรอบใหม่กับสมาชิกเดิม (PLAY AGAIN - เฉพาะโฮสต์)
  document.getElementById('btn-play-again').addEventListener('click', () => {
    window.audio.playClick();
    socket.emit('playAgain');
  });

  // ปุ่มออกจากห้องกลับหน้าหลัก
  document.getElementById('btn-leave-game').addEventListener('click', () => {
    window.audio.playClick();
    location.reload();
  });

  // ปุ่มกลับหน้าแรกจากห้อง Lobby
  document.getElementById('btn-lobby-back').addEventListener('click', () => {
    window.audio.playClick();
    location.reload();
  });

  // ปุ่มปิดหน้าต่างเหตุการณ์
  document.getElementById('btn-close-cutscene').addEventListener('click', () => {
    window.audio.playClick();
    document.getElementById('cutscene-overlay').classList.remove('show');
    setBodyScroll(true);

    // หากเป็นรอบสุดท้ายที่เกมจบแล้ว ให้เปิดหน้าสรุปผลผู้ชนะทันทีเมื่อผู้เล่นกดรับทราบ
    if (currentRoomState && currentRoomState.status === 'finished') {
      showWinnerCeremony(currentRoomState);
    }
  });
}

// 4. ทำการส่งข้อมูลการจัดสรรเงินไปยังเซิร์ฟเวอร์
function submitMyAllocation() {
  if (myState.isBankrupt) return;

  const allocation = {};
  let totalAllocated = 0;
  ASSETS.forEach(key => {
    const val = parseInt(document.getElementById(`slide-${key}`).value) || 0;
    allocation[key] = val;
    totalAllocated += val;
  });

  // หากยอดรวมเกินเงินที่มีอยู่จริง ปรับลดลงให้พอดีทันทีโดยไม่ล็อก/บล็อกปุ่ม
  if (totalAllocated > myState.money && totalAllocated > 0) {
    const ratio = myState.money / totalAllocated;
    totalAllocated = 0;
    ASSETS.forEach(key => {
      allocation[key] = Math.floor(allocation[key] * ratio);
      totalAllocated += allocation[key];
      const slider = document.getElementById(`slide-${key}`);
      const input = document.getElementById(`input-${key}`);
      if (slider) slider.value = allocation[key];
      if (input) input.value = allocation[key].toLocaleString();
    });
  }

  // ล็อกปุ่มกดและฟิลด์อินพุตชั่วคราวเพื่อป้องกันการกดเบิ้ล
  disableAllocationForm(true);

  myLastAllocation = Object.assign({}, allocation);
  localStorage.setItem('myLastAllocation', JSON.stringify(allocation));
  socket.emit('submitAllocation', allocation);
  
  document.getElementById('my-status-val').innerText = 'ส่งการลงทุนแล้ว รอกลุ่มผู้เล่นอื่น...';
  document.getElementById('my-status-val').className = 'stat-value status';
  myState.hasSubmitted = true;
}

// ฟังก์ชันเปิด/ปิดฟอร์มอินพุตสไลเดอร์
function disableAllocationForm(disabled) {
  ASSETS.forEach(key => {
    document.getElementById(`slide-${key}`).disabled = disabled;
    document.getElementById(`input-${key}`).disabled = disabled;
    document.getElementById(`pct-input-${key}`).disabled = disabled;
  });
  document.getElementById('btn-submit-alloc').disabled = disabled;
  document.getElementById('btn-reset-alloc').disabled = disabled;
}

// 5. ตั้งค่าตัวรับส่งข้อมูล Socket.IO
function setupSocketListeners() {
  
  // ตอบสนองข้อผิดพลาดจากเซิร์ฟเวอร์
  socket.on('errorMsg', (msg) => {
    alert(`ข้อผิดพลาด: ${msg}`);
    // ปลดล็อกปุ่มเผื่อเกิดความผิดพลาดในการส่งเงิน
    if (myState.hasSubmitted) {
      disableAllocationForm(false);
      myState.hasSubmitted = false;
      document.getElementById('my-status-val').innerText = 'เกิดข้อผิดพลาดในการจัดส่งเงิน';
    }
  });

  // ยืนยันการสร้างห้องเสร็จสิ้น
  socket.on('roomCreated', ({ roomCode, player }) => {
    myState.id = player.id;
    myState.roomCode = roomCode;
    myState.isHost = true;

    showScreen('screen-lobby');
    document.getElementById('lobby-code-val').innerText = roomCode;
    document.getElementById('lobby-host-controls').style.display = 'block';
    document.getElementById('lobby-guest-waiting').style.display = 'none';
  });

  // ยืนยันการเข้าร่วมห้องสำเร็จ
  socket.on('roomJoined', ({ roomCode, player }) => {
    myState.id = player.id;
    myState.roomCode = roomCode;
    myState.isHost = false;

    showScreen('screen-lobby');
    document.getElementById('lobby-code-val').innerText = roomCode;
    document.getElementById('lobby-host-controls').style.display = 'none';
    document.getElementById('lobby-guest-waiting').style.display = 'block';
  });

  // อัปเดตข้อมูลผู้เล่นในห้องล็อบบี้
  socket.on('lobbyUpdate', (roomState) => {
    currentRoomState = roomState;
    if (roomState.difficulty) {
      myState.lastDifficulty = roomState.difficulty;
    }

    // ตรวจสอบและอัปเดตสิทธิ์ Host เรียลไทม์
    const me = roomState.players.find(p => p.id === myState.id);
    if (me) {
      myState.isHost = me.isHost;
      
      // ซิงค์สถานะการส่งเงินกับเซิร์ฟเวอร์ หากเซิร์ฟเวอร์แจ้งว่ายังไม่ได้ส่งแต่เครื่องเราคิดว่าส่งแล้ว ให้ส่งซ้ำทันที
      if (!me.hasSubmitted && myState.hasSubmitted && roomState.status === 'playing') {
        if (myLastAllocation) {
          socket.emit('submitAllocation', myLastAllocation);
        } else {
          myState.hasSubmitted = false;
          disableAllocationForm(false);
          document.getElementById('my-status-val').innerText = 'กำลังวางแผน...';
        }
      }
    }

    if (roomState.status === 'playing') {
      // หากอยู่ในบอร์ดเกม ให้แสดงผลกระดานข้างและตารางคะแนนใหม่
      updateGameBoard(roomState);
      return;
    } else if (roomState.status === 'finished') {
      // หากเกมจบแล้วและกำลังแสดงผล ให้เรนเดอร์หน้าประกาศชัยชนะใหม่ (เพื่อย้ายสิทธิ์ปุ่ม Play Again ไปยังโฮสต์ใหม่)
      showWinnerCeremony(roomState);
      return;
    }

    document.getElementById('lobby-count-val').innerText = roomState.players.length;
    
    // แสดงระดับความยากที่ตั้งค่าไว้
    const diffText = roomState.difficulty === 'easy' ? 'EASY (10 รอบ)' : 
                     roomState.difficulty === 'medium' ? 'NORMAL (20 รอบ)' : 'HARD (30 รอบ)';
    document.getElementById('lobby-diff-val').innerText = diffText;

    // แสดง/ซ่อน การควบคุมของโฮสต์แบบเรียลไทม์
    if (myState.isHost) {
      document.getElementById('lobby-host-controls').style.display = 'block';
      document.getElementById('lobby-guest-waiting').style.display = 'none';
    } else {
      document.getElementById('lobby-host-controls').style.display = 'none';
      document.getElementById('lobby-guest-waiting').style.display = 'block';
    }

    const listContainer = document.getElementById('lobby-player-list');
    listContainer.innerHTML = '';

    roomState.players.forEach(p => {
      const card = document.createElement('li');
      card.className = `lobby-player-card ${p.isHost ? 'is-host' : ''}`;
      card.innerHTML = replaceAvatarInText(p.name);
      listContainer.appendChild(card);
    });
  });

  // เริ่มต้นเกมย้ายไปกระดานบอร์ดเกม
  socket.on('gameStarted', (roomState) => {
    currentRoomState = roomState;
    myState.money = 1000000;
    myState.isBankrupt = false;
    myState.hasSubmitted = false;

    // ตั้งค่าหน้าตาผู้เล่นปัจจุบัน
    document.getElementById('my-name-display').innerText = `ผู้เล่น: ${myState.name}`;
    document.getElementById('my-avatar-display').innerHTML = replaceAvatarInText(myState.avatar);

    showScreen('screen-game');
    updateGameBoard(roomState);

    // เล่นเสียงเริ่มเกมแสนระทึก Chiptune
    window.audio.playGameStart();

    // แสดงอักษรใหญ่ START ฉลองเริ่มเล่น
    const startOverlay = document.getElementById('start-overlay');
    if (startOverlay) {
      startOverlay.style.display = 'flex';
      setTimeout(() => {
        startOverlay.style.display = 'none';
      }, 1500);
    }
    
    // ตั้งค่าสไลเดอร์เริ่มต้น: สินทรัพย์ทุกชนิดเป็น 0 และเงินทั้งหมดอยู่ที่กองกลาง
    loadAllocationToSliders({
      bank: 0,
      govBonds: 0,
      corpBonds: 0,
      gold: 0,
      realEstate: 0,
      stocks: 0,
      bitcoin: 0,
      insurance: 0,
      artToys: 0
    });
  });

  // ผู้เล่นเชื่อมต่อกลับเข้ามาในเกมกลางคัน (Reconnect)
  socket.on('gameReconnected', ({ roomState, player }) => {
    currentRoomState = roomState;
    myState.id = player.id;
    myState.roomCode = roomState.code;
    myState.isHost = player.isHost;
    
    // ดึงอวาตาร์และชื่อจากฝั่งเซิร์ฟเวอร์
    const nameParts = player.name.split(' ');
    if (nameParts.length > 1) {
      myState.avatar = nameParts[0];
      myState.name = nameParts.slice(1).join(' ');
    } else {
      myState.avatar = '🐱';
      myState.name = player.name;
    }
    
    myState.money = player.money;
    myState.isBankrupt = player.isBankrupt;
    myState.hasSubmitted = player.hasSubmitted;

    // ตั้งค่าหน้าจอและหน้าตาผู้เล่นปัจจุบัน
    document.getElementById('my-name-display').innerText = `ผู้เล่น: ${myState.name}`;
    document.getElementById('my-avatar-display').innerHTML = replaceAvatarInText(myState.avatar);

    showScreen('screen-game');
    updateGameBoard(roomState);

    // ปรับสไลเดอร์ตามพอร์ตล่าสุดที่มีอยู่จริง
    loadAllocationToSliders(player.allocation);

    // ตั้งสถานะคำแนะนำตัวอักษร
    if (myState.isBankrupt) {
      document.getElementById('my-status-val').innerText = 'ล้มละลาย (SPECTATING)';
      document.getElementById('my-status-val').className = 'stat-value bankrupt';
      disableAllocationForm(true);
    } else {
      if (myState.hasSubmitted) {
        document.getElementById('my-status-val').innerText = 'ส่งการลงทุนแล้ว รอกลุ่มผู้เล่นอื่น...';
        document.getElementById('my-status-val').className = 'stat-value status';
        disableAllocationForm(true);
      } else {
        document.getElementById('my-status-val').innerText = 'กำลังวางแผน...';
        document.getElementById('my-status-val').className = 'stat-value status';
        disableAllocationForm(false);
      }
    }

    // หากจบเกมแล้ว แสดงผลผู้ชนะท้ายเกมทันทีโดยไม่มีดีเลย์
    if (roomState.status === 'finished') {
      showWinnerCeremony(roomState);
    }
  });

  // แจ้งว่าผู้เล่นรายอื่นส่งแผนเงินลงทุนแล้ว
  socket.on('playerSubmitted', ({ playerId, name }) => {
    if (playerId !== myState.id) {
      // เล่นเสียงแคชเชียร์สั้นๆ เป็นกิมมิค
      window.audio.playClick();
    }
    // อัปเดตจุดสถานะการส่งแผนในตารางผู้เล่นด้านข้าง
    const dot = document.getElementById(`player-dot-${playerId}`);
    if (dot) {
      dot.className = 'player-status-dot submitted';
    }
  });

  // อัปเดตเมื่อมีผู้เล่นอื่นตัดการเชื่อมต่อ
  socket.on('playerDisconnected', ({ playerId, name }) => {
    const dot = document.getElementById(`player-dot-${playerId}`);
    if (dot) {
      dot.className = 'player-status-dot disconnected';
    }
  });

  // ผลสรุปการหมุนรอบคำนวณเงินประจำรอบ
  socket.on('roundResolved', ({ roomState, event }) => {
    currentRoomState = roomState;
    
    // ค้นหาสถานะผู้เล่นตัวฉันเองในข้อมูลล่าสุด
    const me = roomState.players.find(p => p.id === myState.id);
    if (me) {
      myState.money = me.money;
      myState.isBankrupt = me.isBankrupt;
      myState.hasSubmitted = false;
    }

    // แสดงภาพ Cutscene ประจำอีเวนต์ในรอบนั้นๆ
    triggerCutscene(event, me);

    // อัปเดตระบบเกมบอร์ดหลัก
    updateGameBoard(roomState);

    if (myState.isBankrupt) {
      document.getElementById('my-status-val').innerText = 'ล้มละลาย (SPECTATING)';
      document.getElementById('my-status-val').className = 'stat-value bankrupt';
      disableAllocationForm(true);
    } else {
      document.getElementById('my-status-val').innerText = 'กำลังวางแผน...';
      document.getElementById('my-status-val').className = 'stat-value status';
      disableAllocationForm(false);
      
      try {
        const lastHist = (me && me.history && me.history.length > 0) ? me.history[me.history.length - 1] : null;
        const postAlloc = lastHist ? lastHist.allocation : null;

        // พยายามดึง preAllocation จาก localStorage หรือประวัติฝั่งเซิร์ฟเวอร์
        let preAlloc = null;
        if (myLastAllocation) {
          preAlloc = myLastAllocation;
        } else if (lastHist && lastHist.preAllocation) {
          preAlloc = lastHist.preAllocation;
        }

        const BASE_RETURNS = {
          bank: 0.005,
          govBonds: 0.015,
          corpBonds: 0.02,
          gold: 0.0,
          realEstate: 0.04,
          stocks: 0.03,
          bitcoin: -0.01,
          artToys: -0.05
        };

        if (preAlloc) {
          const assetKeys = ['bank', 'govBonds', 'corpBonds', 'gold', 'realEstate', 'stocks', 'bitcoin', 'artToys'];
          assetKeys.forEach(k => {
            const inputEl = document.getElementById('slide-' + k);
            if (inputEl) {
              const nameEl = inputEl.closest('.asset-card').querySelector('.asset-name');
              let baseText = nameEl.getAttribute('data-base-name');
              if (!baseText) {
                baseText = nameEl.innerHTML;
                nameEl.setAttribute('data-base-name', baseText);
              }
              const oldVal = preAlloc[k] || 0;
              const newVal = postAlloc ? (postAlloc[k] || 0) : 0;
              if (oldVal > 0) {
                let pct = ((newVal - oldVal) / oldVal) * 100;
                let color = pct > 0 ? 'var(--neon-green)' : (pct < 0 ? 'var(--neon-red)' : '#888');
                let sign = pct > 0 ? '+' : '';
                nameEl.innerHTML = `${baseText} <span style="color: ${color}; font-size: 0.75rem; margin-left: 5px;">${sign}${pct.toFixed(1)}%</span>`;
              } else {
                nameEl.innerHTML = baseText; // ไม่ได้ลงทุนรอบที่แล้ว
              }
            }
          });
        }
      } catch (err) {
        console.error('Failed to resolve percentages', err);
      }

      // โหลดเงินลงทุนตามมูลค่าจริงหลังผ่านอีเวนต์ โดยไม่ต้องรีเซ็ตกลับหน้าแรก
      loadAllocationToSliders(me.allocation);
    }

    // หากเกมจบแล้ว แสดงผลผู้ชนะท้ายเกมหลังจากดู cutscene เสร็จสิ้น (หรือเมื่อผู้เล่นกดปุ่มรับทราบ)
    if (roomState.status === 'finished') {
      setTimeout(() => {
        if (currentRoomState && currentRoomState.status === 'finished') {
          showWinnerCeremony(currentRoomState);
        }
      }, 2500);
    }
  });

  // ระบบ Host รีเซ็ตเริ่มเล่นอีกรอบ
  socket.on('gameReset', (roomState) => {
    currentRoomState = roomState;
    
    // หยุดการโปรยกระดาษสีฉลองชัยชนะ
    stopConfetti();
    
    // ซ่อนหน้าต่างประกาศผลรางวัล
    document.getElementById('winner-overlay').classList.remove('show');
    setBodyScroll(true);
    
    // กลับหน้า Lobby
    showScreen('screen-lobby');
    
    // รีเซ็ตตัวแปรสถานะภายใน
    myState.money = 1000000;
    myState.isBankrupt = false;
    myState.hasSubmitted = false;
    disableAllocationForm(false);

    // อัปเดตหน้า Lobby
    document.getElementById('lobby-count-val').innerText = roomState.players.length;
    const listContainer = document.getElementById('lobby-player-list');
    listContainer.innerHTML = '';

    roomState.players.forEach(p => {
      const card = document.createElement('li');
      card.className = `lobby-player-card ${p.isHost ? 'is-host' : ''}`;
      card.innerHTML = replaceAvatarInText(p.name);
      listContainer.appendChild(card);
    });
  });
}

// 6. ฟังก์ชันสลับการแสดงผลหน้าจอ
function showScreen(screenId) {
  document.getElementById('screen-auth').style.display = 'none';
  document.getElementById('screen-lobby').style.display = 'none';
  document.getElementById('screen-game').style.display = 'none';

  const target = document.getElementById(screenId);
  if (screenId === 'screen-game') {
    target.style.display = 'flex';
  } else {
    target.style.display = 'block';
  }
}

// 7. โหลดข้อมูลการจัดสรรเงินไปยังสไลเดอร์และช่องข้อความ
function loadAllocationToSliders(alloc) {
  ASSETS.forEach(key => {
    const slider = document.getElementById(`slide-${key}`);
    const input = document.getElementById(`input-${key}`);

    // ตั้งค่าเพดานสไลเดอร์สูงสุดของสินทรัพย์แต่ละชิ้น
    if (key === 'insurance') {
      slider.max = 20000;
    } else {
      slider.max = myState.money;
    }
    
    // ตั้งค่ายอดจัดสรรในสินทรัพย์แต่ละชิ้น
    let val = alloc[key] || 0;
    if (key === 'insurance') {
      val = Math.min(20000, val);
    }
    slider.value = val;
    input.value = val.toLocaleString();
  });

  updatePercentagesAndSummary();
}

// 8. อัปเดตกระดานบอร์ดเกมหลักจากข้อมูลเซิร์ฟเวอร์
function updateGameBoard(roomState) {
  // รหัสห้องและจำนวนรอบ
  document.getElementById('game-room-code').innerText = `ROOM: ${roomState.code}`;
  document.getElementById('game-round-info').innerText = `รอบการเล่น: ${roomState.currentRound} / ${roomState.maxRounds}`;

  // อัปเดตเงินสะสมของตัวเราเอง
  document.getElementById('my-wealth-val').innerText = `${myState.money.toLocaleString()} ฿`;

  // อัปเดตตารางผู้เล่นและยอดทรัพย์สิน (Sidebar Scoreboard)
  const playersWrap = document.getElementById('game-players-wrap');
  playersWrap.innerHTML = '';

  // เรียงลำดับผู้เล่นตามมูลค่าเงินเพื่อความตื่นเต้น (คนเงินเยอะอยู่บนสุด)
  const sortedPlayers = [...roomState.players].sort((a, b) => b.money - a.money);

  sortedPlayers.forEach(p => {
    const row = document.createElement('div');
    row.className = 'player-item';

    // สถานะแสดง dot สีต่างๆ
    let statusClass = 'ready';
    if (p.isBankrupt) {
      statusClass = 'bankrupt';
    } else if (p.hasSubmitted) {
      statusClass = 'submitted';
    } else if (!p.isConnected) {
      statusClass = 'disconnected';
    }

    const isMeMark = p.id === myState.id ? ' <span style="color:var(--neon-yellow)">(คุณ)</span>' : '';

    row.innerHTML = `
      <div class="player-name-wrap">
        <span class="player-status-dot ${statusClass}" id="player-dot-${p.id}"></span>
        <span>${replaceAvatarInText(p.name)}${isMeMark}</span>
      </div>
      <div class="player-wealth ${p.isBankrupt ? 'bankrupt' : ''}">
        ${p.isBankrupt ? 'ล้มละลาย' : `${p.money.toLocaleString()} ฿`}
      </div>
    `;
    playersWrap.appendChild(row);
  });

  // อัปเดตประวัติเหตุการณ์ Log
  const historyWrap = document.getElementById('game-history-wrap');
  historyWrap.innerHTML = '';

  if (roomState.eventsLog.length === 0) {
    historyWrap.innerHTML = '<div style="color: #666085; text-align: center; padding-top: 20px; font-size: 0.85rem;">ยังไม่มีบันทึกเหตุการณ์</div>';
  } else {
    // โชว์เหตุการณ์ล่าสุดไว้ข้างบนสุด
    const reversedEvents = [...roomState.eventsLog].reverse();
    reversedEvents.forEach((ev, idx) => {
      const roundNum = roomState.eventsLog.length - idx;
      const item = document.createElement('div');
      item.className = 'log-item';
      
      const icon = THEME_ICONS[ev.theme] || '❓';
      item.innerHTML = `
        <span class="log-round">รอบที่ ${roundNum}:</span>
        <span>${icon} <span class="log-event-name">${ev.title.replace(/\s+/g, '<br>')}</span></span>
        <div style="font-size:0.75rem; color:#8f85bd; margin-top:2px;">${ev.description}</div>
      `;
      historyWrap.appendChild(item);
    });
  }
}

// 9. แสดงป๊อปอัพ Cutscene สื่อสารผลประกอบการและเหตุการณ์ประจำรอบ
function triggerCutscene(event, myPlayerData) {
  // เล่นเสียงเตือนภัยอีเวนต์
  window.audio.playEventAlert();

  // ใส่ชื่อธีมภาษาไทย
  document.getElementById('cutscene-theme-name').innerText = THEME_NAMES[event.theme] || 'เหตุการณ์ทั่วไป';
  document.getElementById('cutscene-icon').innerText = THEME_ICONS[event.theme] || '🌍';

  // ค้นหาพาธของรูปคัทซีน (จะอ้างอิงถึง 10 ธีมที่สร้างขึ้น)
  const cutsceneImg = document.getElementById('cutscene-img');
  cutsceneImg.style.display = 'block';
  cutsceneImg.src = `assets/theme_${event.theme}.png`;
  
  // ซ่อนกล่อง placeholder ดั้งเดิมไว้ในกรณีที่มีรูปภาพ
  document.getElementById('cutscene-placeholder-box').style.display = 'none';

  // รายละเอียดชื่อหัวข้อคำอธิบายเหตุการณ์ (แทนที่เว้นวรรคยาวๆ ด้วย <br> เพื่อให้อ่านง่ายและไม่ตกหล่นทับซ้อน)
  document.getElementById('cutscene-title-val').innerHTML = event.title.replace(/\s+/g, '<br>');
  document.getElementById('cutscene-desc-val').innerText = event.description;

  // เรนเดอร์เอฟเฟกต์ต่อสินทรัพย์ต่างๆ
  const listEl = document.getElementById('cutscene-effects-list');
  listEl.innerHTML = '';

  // รายละเอียดกรณีเกิดค่ารักษาพยาบาลจากโรคระบาด
  if (event.medicalExpense) {
    const li = document.createElement('li');
    li.style.borderBottom = '1px dashed #444';
    li.style.paddingBottom = '4px';
    li.style.marginBottom = '5px';
    
    // ค้นหารายละเอียดส่วนรักษาพยาบาลของตัวเอง
    let detailText = `หักเงินสดชดเชยค่ารักษาพยาบาลฐาน: -${event.medicalExpense.toLocaleString()} ฿`;
    
    if (myPlayerData && myPlayerData.history && myPlayerData.history.length > 0) {
      const lastHistory = myPlayerData.history[myPlayerData.history.length - 1];
      if (lastHistory.medicalExpenseDetails) {
        const details = lastHistory.medicalExpenseDetails;
        if (details.premium >= 20000) {
          detailText = `ประกันสุขภาพคุ้มครองเต็มที่! ได้เงินขวัญถุงสุทธิ: <span class="effect-up">+50,000 ฿</span> (ค่ารักษา ${event.medicalExpense.toLocaleString()} ฿)`;
        } else if (details.premium > 0) {
          const netExp = details.netExpense;
          if (netExp > 0) {
            detailText = `ประกันช่วยจ่ายบางส่วน! หักสุทธิ: <span class="effect-down">-${netExp.toLocaleString()} ฿</span> (ค่ารักษา ${event.medicalExpense.toLocaleString()} ฿)`;
          } else {
            const netGain = Math.abs(netExp);
            detailText = `ประกันช่วยจ่ายเกินค่ารักษา! สุทธิ: <span class="effect-up">+${netGain.toLocaleString()} ฿</span> (ค่ารักษา ${event.medicalExpense.toLocaleString()} ฿)`;
          }
        } else {
          detailText = `ไม่มีประกันสุขภาพ! โดนค่ารักษาเต็มๆ: <span class="effect-down">-${event.medicalExpense.toLocaleString()} ฿</span>`;
        }
      }
    }
    
    li.innerHTML = `<span>🏥 สรุปค่ารักษาสุขภาพของคุณ:</span> <span>${detailText}</span>`;
    listEl.appendChild(li);
  }

  // เรนเดอร์เปรียบเทียบสินทรัพย์ 8 รายการ
  Object.keys(event.effects).forEach(key => {
    if (key === 'medicalExpense') return;
    
    const modifier = event.effects[key];
    const li = document.createElement('li');
    
    const percentage = Math.round(modifier * 100);
    const sign = percentage >= 0 ? '+' : '';
    const classSign = percentage >= 0 ? 'effect-up' : 'effect-down';
    
    li.innerHTML = `
      <span>${ASSET_NAMES_TH[key] || key}:</span>
      <span class="${classSign}">${sign}${percentage}%</span>
    `;
    listEl.appendChild(li);
  });

  // บรรจุป้ายบอกเอฟเฟกต์เบี้ยประกันที่จ่ายไปแล้ว
  if (myPlayerData && myPlayerData.history && myPlayerData.history.length > 0) {
    const lastHistory = myPlayerData.history[myPlayerData.history.length - 1];
    // แสดงประวัติว่าได้อะไรบ้าง
    const change = lastHistory.netChange || 0;
    const sign = change >= 0 ? '+' : '';
    const classSign = change >= 0 ? 'effect-up' : 'effect-down';
    
    const summaryLi = document.createElement('li');
    summaryLi.style.borderTop = '1px solid var(--border-color)';
    summaryLi.style.marginTop = '8px';
    summaryLi.style.paddingTop = '5px';
    summaryLi.innerHTML = `
      <span style="font-weight:bold;">สรุปยอดเงินรวมรอบนี้ของคุณ:</span>
      <span class="${classSign}" style="font-weight:bold;">${sign}${change.toLocaleString()} ฿</span>
    `;
    listEl.appendChild(summaryLi);

    // เล่นเสียงตามการได้เงินเสียเงิน
    if (myPlayerData.isBankrupt) {
      window.audio.playBankruptcy();
    } else if (change > 0) {
      window.audio.playCashRegister();
    }
  }

  // หากเป็นรอบสุดท้ายที่เกมจบแล้ว ปรับเปลี่ยนข้อความปุ่มปิดให้เป็นปุ่มเข้าสู่หน้าชนะ
  const btnCloseCutscene = document.getElementById('btn-close-cutscene');
  if (btnCloseCutscene) {
    if (currentRoomState && currentRoomState.status === 'finished') {
      btnCloseCutscene.className = 'pixel-btn pixel-btn-green';
      btnCloseCutscene.innerHTML = '🏆 ดูสรุปผลผู้ชนะ! <span style="font-family: var(--font-retro); font-size: 0.55rem; display: block; margin-top: 4px; font-weight: normal; letter-spacing: 0.5px;">(SEE WINNER)</span>';
    } else {
      btnCloseCutscene.className = 'pixel-btn pixel-btn-cyan';
      btnCloseCutscene.innerHTML = 'รับทราบ <span style="font-family: var(--font-retro); font-size: 0.55rem; display: block; margin-top: 4px; font-weight: normal; letter-spacing: 0.5px;">(CLOSE)</span>';
    }
  }

  // โชว์ป๊อปอัพ
  document.getElementById('cutscene-overlay').classList.add('show');
  setBodyScroll(false);
}

// ฟังก์ชันคำนวณและประมวลผลรายงานสรุปแผนการเงินสุขภาพของผู้เล่นแต่ละคน
function renderFinancialReport() {
  if (!currentRoomState) return;

  const container = document.getElementById('financial-report-cards-container');
  container.innerHTML = '';

  // เรียงลำดับโดยให้ผู้เปิดรายงาน (ตัวละครเราเอง) อยู่บนสุดเสมอ ส่วนคนอื่นจัดอันดับเรียงตามจำนวนเงิน
  const sortedPlayers = [...currentRoomState.players].sort((a, b) => {
    if (a.id === socket.id) return -1;
    if (b.id === socket.id) return 1;
    return b.money - a.money;
  });

  sortedPlayers.forEach(p => {
    let totalRounds = p.history.length;
    let sumAlloc = {
      bank: 0, govBonds: 0, corpBonds: 0, gold: 0, realEstate: 0, stocks: 0, bitcoin: 0, insurance: 0, artToys: 0, cash: 0
    };

    p.history.forEach(h => {
      if (h.allocation) {
        Object.keys(sumAlloc).forEach(k => {
          sumAlloc[k] += h.allocation[k] || 0;
        });
      }
    });

    let totalAllottedAndCash = 0;
    Object.keys(sumAlloc).forEach(k => { totalAllottedAndCash += sumAlloc[k]; });
    
    let avgPct = {};
    if (totalAllottedAndCash > 0) {
      Object.keys(sumAlloc).forEach(k => {
        avgPct[k] = (sumAlloc[k] / totalAllottedAndCash) * 100;
      });
    } else {
      Object.keys(sumAlloc).forEach(k => { avgPct[k] = 0; });
    }

    let personality = 'นักลงทุนสายสมดุล (Balanced Planner)';
    let personalityDesc = 'คุณมีการจัดสรรเงินที่สมดุลดีเยี่ยม ระหว่างสินทรัพย์ปลอดภัยและสินทรัพย์เติบโตเพื่อกระจายความเสี่ยง';
    
    // หากไม่ลงทุนปล่อยเงินคาไว้ในกองกลาง (cash) ให้ถือว่ามีความปลอดภัยสูงเหมือนเงินฝากธนาคาร
    let safePct = (avgPct.bank || 0) + (avgPct.govBonds || 0) + (avgPct.cash || 0);
    let riskyPct = (avgPct.stocks || 0) + (avgPct.realEstate || 0);
    let specPct = (avgPct.bitcoin || 0) + (avgPct.artToys || 0);

    if (safePct > 60) {
      personality = 'ผู้รักษาเงินต้นอย่างปลอดภัย (Conservative Saver)';
      personalityDesc = 'คุณชอบความมั่นคงสูงมาก หลีกเลี่ยงความเสี่ยงเกือบ 100% แต่ระวังพอร์ตเติบโตช้ากว่าอัตราเงินเฟ้อในระยะยาว';
    } else if (specPct > 40) {
      personality = 'นักเก็งกำไรความเสี่ยงสูง (High-Risk Speculator)';
      personalityDesc = 'คุณชอบความหวือหวาและเติบโตก้าวกระโดดด้วยสินทรัพย์ความผันผวนสูงมาก ควรจัดสรรกำไรส่วนหนึ่งมาออมเพื่อลดความผันผวน';
    } else if (riskyPct > 55) {
      personality = 'นักลงทุนเน้นการเติบโตเชิงรุก (Aggressive Growth Investor)';
      personalityDesc = 'คุณเน้นการปั้นพอร์ตผ่านมูลค่าธุรกิจจริง แต่ควรระวังกระแสเงินสดตึงตัวยามเกิดวิกฤตเศรษฐกิจหรือมรสุมตลาดหมี';
    }

    let stats = p.financialStats || { 
      totalPremiumPaid: 0, 
      totalOutofPocket: 0, 
      totalClaimsPaid: 0, 
      deficitIncidents: 0,
      assetProfits: { bank: 0, govBonds: 0, corpBonds: 0, gold: 0, realEstate: 0, stocks: 0, bitcoin: 0, artToys: 0 }
    };
    let grade = 'B';
    let gradeColor = 'var(--neon-cyan)';
    let remark = '';

    if (p.isBankrupt) {
      grade = 'F';
      gradeColor = 'var(--neon-red)';
      remark = 'คุณละเลยการโอนย้ายความเสี่ยงสุขภาพอย่างสิ้นเชิง ทำให้บิลค่ารักษาโรคระบาดล้างพอร์ตจนหมดตัวและล้มละลายทันที';
    } else if (stats.deficitIncidents > 0) {
      grade = 'C';
      gradeColor = 'var(--neon-orange)';
      remark = 'กระแสเงินสดของคุณสะดุด และต้องจำยอมตัดขายสินทรัพย์หลักทรัพย์บางส่วนไปจ่ายหนี้ค่ารักษาพยาบาล ควรซื้อประกันสุขภาพสม่ำเสมอเพื่อพยุงสภาพคล่อง';
    } else if (stats.totalPremiumPaid >= 20000 * Math.max(1, totalRounds / 4) && stats.totalOutofPocket === 0) {
      grade = 'A+';
      gradeColor = 'var(--neon-green)';
      remark = 'ยอดเยี่ยมอย่างหาที่ติไม่ได้! คุณซื้อประกันสุขภาพคุ้มครองเต็มรูปแบบสม่ำเสมอ ทำให้โอนย้ายความเสี่ยงค่ารักษารวมหลักแสนไปให้บริษัทประกันพยุงแทน 100%';
    } else if (stats.totalOutofPocket === 0 && stats.totalPremiumPaid > 0) {
      grade = 'A';
      gradeColor = 'var(--neon-green)';
      remark = 'ปลอดภัยหายห่วง! การตัดสินใจทำประกันของคุณ ช่วยปกป้องให้เงินสดของพอร์ตคงระดับปลอดภัยตลอดเส้นทาง';
    } else if (stats.totalOutofPocket > 0) {
      grade = 'B';
      gradeColor = 'var(--neon-yellow)';
      remark = 'คุณมีความพยายามซื้อประกัน แต่วงเงินชดเชยไม่คุ้มค่าความคุ้มครอง (ซื้อบางส่วนต่ำกว่า 20,000 ฿) ทำให้ยังคงต้องจ่ายส่วนต่างบิลค่ารักษาพยาบาลจากส่วนเงินสด';
    } else {
      // เคสที่ไม่ซื้อประกันและไม่เจ็บป่วยเลยตลอดเกม (โชคช่วย)
      grade = 'B';
      gradeColor = 'var(--neon-yellow)';
      remark = 'คุณโชคดีมากที่ตลอดเกมไม่เจอกล่องสุ่มเจอโรคระบาดร้ายแรงเลยรอดตัวไปได้ แต่ในชีวิตจริงควรโอนย้ายความเสี่ยงด้วยประกันสุขภาพไว้เพื่อความอุ่นใจและไม่ประมาทครับ';
    }

    // กำหนดสีพื้นหลังและสีเส้นขอบของกรอบตามเกรดแผนสุขภาพ
    let boxBorderColor = gradeColor;
    let boxBgColor = '#0b2210'; // A+, A (เขียว)
    if (grade === 'B') boxBgColor = '#22220b'; // เหลือง
    else if (grade === 'C') boxBgColor = '#261608'; // ส้ม
    else if (grade === 'F') boxBgColor = '#260f1b'; // แดง

    // คำนวณสินทรัพย์ที่สร้างผลตอบแทนสูงสุด (Best Performing Asset)
    let assetProfits = stats.assetProfits || { bank: 0, govBonds: 0, corpBonds: 0, gold: 0, realEstate: 0, stocks: 0, bitcoin: 0, artToys: 0 };
    let bestAssetKey = 'bank';
    let maxProfit = -9999999999;
    Object.keys(assetProfits).forEach(k => {
      if (assetProfits[k] > maxProfit) {
        maxProfit = assetProfits[k];
        bestAssetKey = k;
      }
    });

    // คำนวณสินทรัพย์ที่ขาดทุนสูงสุด (Worst Performing Asset)
    let worstAssetKey = 'bank';
    let maxLoss = 9999999999;
    Object.keys(assetProfits).forEach(k => {
      if (assetProfits[k] < maxLoss) {
        maxLoss = assetProfits[k];
        worstAssetKey = k;
      }
    });

    const ASSET_NAMES = {
      bank: '🏦 เงินฝาก',
      govBonds: '📜 พันธบัตรรัฐ',
      corpBonds: '🏢 หุ้นกู้เอกชน',
      gold: '🪙 ทองคำ',
      realEstate: '🏠 อสังหาฯ',
      stocks: '📈 หุ้นสามัญ',
      bitcoin: '₿ บิตคอยน์',
      artToys: '🧸 อาร์ตทอยส์'
    };

    let bestAssetLabel = maxProfit > 0 
      ? `${ASSET_NAMES[bestAssetKey]} (+${maxProfit.toLocaleString()} ฿)` 
      : 'ไม่มี (ทุกสินทรัพย์ติดดอย/ไม่มีกำไร)';

    let worstAssetLabel = maxLoss < 0 
      ? `${ASSET_NAMES[worstAssetKey]} (${maxLoss.toLocaleString()} ฿)` 
      : 'ไม่มี (ไม่มีสินทรัพย์ใดขาดทุน)';

    let leakagePct = Math.min(100, Math.round((stats.totalOutofPocket / 1000000) * 100));

    const card = document.createElement('div');
    card.style.border = `3px solid ${p.id === socket.id ? 'var(--neon-yellow)' : 'var(--border-color)'}`;
    card.style.padding = '15px';
    card.style.backgroundColor = '#15113d';
    card.style.borderRadius = '4px';
    card.style.boxShadow = p.id === socket.id ? '0 0 10px rgba(255, 234, 0, 0.2)' : 'none';

    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid var(--border-color); padding-bottom: 8px; margin-bottom: 12px;">
        <span style="font-weight: bold; font-size: 1rem; color: #fff;">${replaceAvatarInText(p.name)} ${p.id === socket.id ? '<span style="color:var(--neon-yellow); font-size: 0.75rem;">(คุณ)</span>' : ''}</span>
        <div style="text-align: right;">
          <div class="retro-font" style="font-size: 0.55rem; color: #8f85bd;">การป้องกันความเสี่ยง</div>
          <div class="retro-font" style="font-size: 1.5rem; color: ${gradeColor}; font-weight: bold; text-shadow: 0 0 5px ${gradeColor};">${grade}</div>
        </div>
      </div>

      <div style="margin-bottom: 10px;">
        <div style="font-weight: bold; color: var(--neon-cyan); font-size: 0.8rem;">🧠 บุคลิกภาพพอร์ตโฟลิโอ:</div>
        <div style="font-weight: bold; color: #fff; font-size: 0.8rem; margin-top: 2px;">${personality}</div>
        <div style="font-size: 0.75rem; color: #aaa; margin-top: 2px; line-height: 1.4;">${personalityDesc}</div>
      </div>

      <div style="margin-bottom: 12px; border-top: 1px dashed var(--border-color); padding-top: 8px;">
        <div style="font-weight: bold; color: var(--neon-magenta); font-size: 0.8rem; margin-bottom: 5px;">📊 สรุปตัวเลขอัตราการรอดชีวิตและสถิติตลอดทั้งเกม:</div>
        <table style="width:100%; font-size: 0.75rem; border-collapse: collapse; text-align: left;">
          <tr>
            <td style="padding: 3px 0; color:#aaa;">สถานะความอยู่รอด:</td>
            <td style="padding: 3px 0; text-align:right; font-weight:bold; color: ${p.isBankrupt ? 'var(--neon-red)' : 'var(--neon-green)'};">
              ${p.isBankrupt ? `ล้มละลาย (ในรอบที่ ${totalRounds})` : `รอดชีวิต (สะสมมั่งคั่ง ${p.money.toLocaleString()} ฿)`}
            </td>
          </tr>
          <tr>
            <td style="padding: 3px 0; color:#aaa; width: 60%;">สินทรัพย์สร้างผลตอบแทนสูงสุด:</td>
            <td style="padding: 3px 0; text-align:right; font-weight:bold; color: var(--neon-cyan);">
              ${bestAssetLabel}
            </td>
          </tr>
          <tr>
            <td style="padding: 3px 0; color:#aaa; width: 60%;">สินทรัพย์ขาดทุนสูงสุด:</td>
            <td style="padding: 3px 0; text-align:right; font-weight:bold; color: #fff;">
              ${worstAssetLabel}
            </td>
          </tr>
          <tr>
            <td style="padding: 3px 0; color:#aaa;">สะสมค่ารักษาที่จ่ายเองสุทธิ (Leakage):</td>
            <td style="padding: 3px 0; text-align:right; font-weight:bold; color: ${stats.totalOutofPocket > 0 ? 'var(--neon-red)' : '#fff'};">
              ${stats.totalOutofPocket.toLocaleString()} ฿
            </td>
          </tr>
          <tr>
            <td style="padding: 3px 0; color:#aaa;">สะสมความมั่งคั่งที่ประกันช่วยคุ้มครอง:</td>
            <td style="padding: 3px 0; text-align:right; font-weight:bold; color: var(--neon-green);">
              ${stats.totalClaimsPaid.toLocaleString()} ฿
            </td>
          </tr>
          <tr>
            <td style="padding: 3px 0; color:#aaa;">ยอดเบี้ยประกันสุขภาพที่จ่ายไป:</td>
            <td style="padding: 3px 0; text-align:right; font-weight:bold; color: #fff;">
              ${stats.totalPremiumPaid.toLocaleString()} ฿
            </td>
          </tr>
        </table>
      </div>

      <div style="border: 2px dashed ${boxBorderColor}; padding: 10px; background-color: ${boxBgColor}; font-size: 0.75rem; border-radius: 4px; line-height: 1.45; word-break: break-word;">
        <span style="font-weight: bold; color: ${gradeColor};">📢 ความเห็นนักวางแผนสุขภาพ:</span>
        <span style="color: #eee;">
          ${remark}
          ${stats.totalOutofPocket > 0 ? `<br><span style="color:${gradeColor}; font-weight:bold;">* วิเคราะห์ความสูญเสีย:</span> คุณจ่ายเงินค่ารักษาสูงถึง <b style="color: var(--neon-red);">${stats.totalOutofPocket.toLocaleString()} ฿</b> (คิดเป็น <b style="color: var(--neon-red);">${leakagePct}%</b> ของทุนตั้งตัว) หากโอนย้ายความเสี่ยงนี้ไปด้วยประกันสุขภาพแต่แรก เงินจำนวนนี้ได้รับการป้องกัน 100% และคงเหลือไป<span style="white-space: nowrap;">ต่อยอด</span>ปันผลสร้างพอร์ตคุณให้เติบโตได้ยิ่งใหญ่กว่านี้อย่างมั่นคง!` : `<br><span style="color:${gradeColor}; font-weight:bold;">* วิเคราะห์จุดแข็ง:</span> ยอดเยี่ยมมาก! การคุ้มครองสุขภาพช่วยให้กระแสเงินสดกองกลางของคุณปลอดภัย ไม่ต้องเทขายสินทรัพย์ตัวอื่นแบบฉับพลันเพื่อล้างหนี้รักษาสุขภาพ พอร์ตจึงเติบโตอย่างมั่นคงต่อเนื่อง!`}
        </span>
      </div>
    `;

    container.appendChild(card);
  });
}

// 10. พิธีฉลองชัยชนะ แสดงลีดเดอร์บอร์ดผู้ชนะท้ายเกม
// 10. พิธีฉลองชัยชนะ แสดงลีดเดอร์บอร์ดผู้ชนะท้ายเกม
function showWinnerCeremony(roomState) {
  try {
    if (!roomState || !Array.isArray(roomState.players)) return;
    currentRoomState = roomState;
    
    // ร้องขอข้อมูล Hall of Fame ล่าสุดจากเซิร์ฟเวอร์
    try { fetchHighScores(); } catch(e) { console.error('fetchHighScores err:', e); }

    // เล่นเสียงผู้ชนะ
    try { if (window.audio && typeof window.audio.playWin === 'function') window.audio.playWin(); } catch(e) { console.error('playWin err:', e); }

    // ปิดป๊อปอัพคัทซีนที่ค้างอยู่ (ถ้ามี)
    const cutsceneOverlay = document.getElementById('cutscene-overlay');
    if (cutsceneOverlay) cutsceneOverlay.classList.remove('show');

    // จัดอันดับผู้เล่นตามยอดเงินสุดท้าย (คนไม่ได้ล้มละลาย และเงินเยอะสุด)
    const sortedPlayers = [...roomState.players].sort((a, b) => (b.money || 0) - (a.money || 0));
    const winner = sortedPlayers.length > 0 ? sortedPlayers[0] : null;

    const winnerNameEl = document.getElementById('winner-name-val');
    if (winnerNameEl) {
      winnerNameEl.innerHTML = replaceAvatarInText(winner && winner.name ? winner.name : 'ไม่มี');
    }

    const winnerWealthEl = document.getElementById('winner-wealth-val-label');
    if (winnerWealthEl) {
      const winnerMoney = winner && typeof winner.money === 'number' ? winner.money : 0;
      winnerWealthEl.innerText = `${winnerMoney.toLocaleString()} ฿`;
    }

    // ตรวจสอบสถานะการท้าดวลเล่นใหม่
    const btnPlayAgain = document.getElementById('btn-play-again');
    const guestWaitRestart = document.getElementById('guest-wait-restart');
    if (myState.isHost) {
      if (btnPlayAgain) btnPlayAgain.style.display = 'block';
      if (guestWaitRestart) guestWaitRestart.style.display = 'none';
    } else {
      if (btnPlayAgain) btnPlayAgain.style.display = 'none';
      if (guestWaitRestart) guestWaitRestart.style.display = 'block';
    }

    // สร้างรายชื่อลีดเดอร์บอร์ดแบบครองอันดับร่วมกัน (Joint Rank)
    const listEl = document.getElementById('leaderboard-list');
    if (listEl) {
      listEl.innerHTML = '';

      let currentRank = 1;
      sortedPlayers.forEach((p, idx) => {
        const pMoney = typeof p.money === 'number' ? p.money : 0;
        const prevPMoney = idx > 0 && typeof sortedPlayers[idx - 1].money === 'number' ? sortedPlayers[idx - 1].money : 0;

        if (idx > 0 && pMoney < prevPMoney) {
          currentRank = idx + 1;
        }
        
        const row = document.createElement('div');
        row.className = `leaderboard-row rank-${currentRank}`;
        
        const rankIcon = currentRank === 1 ? '🥇' : currentRank === 2 ? '🥈' : currentRank === 3 ? '🥉' : `${currentRank}.`;
        
        let statusLabel = '';
        if (p.isBankrupt) {
          statusLabel = '<span style="color:var(--neon-red)">(ล้มละลาย)</span>';
        } else if (!p.isConnected) {
          statusLabel = '<span style="color:#787299;">(ออกจากห้อง)</span>';
        }

        const safeName = p.name ? p.name : 'ผู้เล่น';
        row.innerHTML = `
          <span>${rankIcon} ${replaceAvatarInText(safeName)} ${statusLabel}</span>
          <span style="font-weight:bold;">${pMoney.toLocaleString()} ฿</span>
        `;
        listEl.appendChild(row);
      });
    }

    // โชว์หน้านี้ขึ้นมาทับจอเกมทั้งหมด
    const winnerOverlay = document.getElementById('winner-overlay');
    if (winnerOverlay) {
      winnerOverlay.classList.add('show');
    }
    setBodyScroll(false);
    
    // เรียกเอฟเฟกต์กระดาษสีฉลองชัยโปรยลงมา
    try { startConfetti(); } catch(e) { console.error('startConfetti err:', e); }
  } catch (err) {
    console.error('Error in showWinnerCeremony:', err);
    // บังคับแสดงหน้าผู้ชนะเสมอแม้องค์ประกอบบางส่วนจะขัดข้อง
    const winnerOverlay = document.getElementById('winner-overlay');
    if (winnerOverlay) winnerOverlay.classList.add('show');
  }
}

// ระบบสร้างกระดาษสีร่วงหล่นเฉลองชัยชนะ (confetti)
let confettiActive = false;
let confettiAnimationFrameId = null;

function startConfetti() {
  const canvas = document.getElementById('confetti-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  
  // กำหนดขนาดตามหน้าจอ
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;

  const colors = ['#00f3ff', '#ff007f', '#ffea00', '#39ff14', '#e040fb', '#ff9d00'];
  const particles = [];
  
  for (let i = 0; i < 120; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height - canvas.height,
      r: Math.random() * 5 + 4,
      d: Math.random() * canvas.height,
      color: colors[Math.floor(Math.random() * colors.length)],
      tilt: Math.random() * 10 - 5,
      tiltAngleIncremental: Math.random() * 0.08 + 0.02,
      tiltAngle: 0
    });
  }

  confettiActive = true;
  
  function draw() {
    if (!confettiActive) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    particles.forEach((p, idx) => {
      p.tiltAngle += p.tiltAngleIncremental;
      p.y += (Math.cos(p.d) + 3 + p.r / 2) / 2;
      p.x += Math.sin(p.tiltAngle);
      p.tilt = Math.sin(p.tiltAngle - idx / 3) * 12;

      ctx.beginPath();
      ctx.lineWidth = p.r;
      ctx.strokeStyle = p.color;
      ctx.moveTo(p.x + p.tilt + p.r / 2, p.y);
      ctx.lineTo(p.x + p.tilt, p.y + p.tilt + p.r / 2);
      ctx.stroke();

      // เมื่อหล่นพ้นจอ ให้ย้อนกลับไปด้านบนเพื่อหมุนรอบใหม่
      if (p.y > canvas.height) {
        p.x = Math.random() * canvas.width;
        p.y = -20;
      }
    });

    confettiAnimationFrameId = requestAnimationFrame(draw);
  }
  
  draw();
}

function stopConfetti() {
  confettiActive = false;
  if (confettiAnimationFrameId) {
    cancelAnimationFrame(confettiAnimationFrameId);
    confettiAnimationFrameId = null;
  }
  const canvas = document.getElementById('confetti-canvas');
  if (canvas) {
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}
