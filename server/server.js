// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const events = require('./events');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  },
  pingTimeout: 60000,
  pingInterval: 25000
});

const PORT = process.env.PORT || 3000;

app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
  next();
});

// ให้บริการไฟล์ Static จากโฟลเดอร์ public
app.use(express.static(path.join(__dirname, '../public')));

// หน้าหลักบริการ index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// API Endpoint สำหรับดึงข้อมูล Hall of Fame ผ่าน HTTP GET (เป็น Fallback ให้กับระบบหน้าบ้าน)
app.get('/api/highscores', (req, res) => {
  res.json(highScores);
});

// เก็บข้อมูลสถานะของทุกห้องเกม
// โครงสร้าง: rooms[roomCode] = { id, players, difficulty, maxRounds, currentRound, status, eventsLog }
const rooms = {};

function loadHighScores() {
  try {
    if (fs.existsSync(HIGHSCORES_FILE)) {
      const data = fs.readFileSync(HIGHSCORES_FILE, 'utf8');
      highScores = JSON.parse(data);
      if (!Array.isArray(highScores.easy)) highScores.easy = [];
      if (!Array.isArray(highScores.medium)) highScores.medium = [];
      if (!Array.isArray(highScores.hard)) highScores.hard = [];
    } else {
      highScores = { easy: [], medium: [], hard: [] };
      saveHighScores();
    }
  } catch (err) {
    console.error('Failed to load highscores:', err);
    highScores = { easy: [], medium: [], hard: [] };
  }
}

function saveHighScores() {
  try {
    fs.writeFileSync(HIGHSCORES_FILE, JSON.stringify(highScores, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to save highscores:', err);
  }
}

loadHighScores();

function updateHighScoresForFinishedRoom(room) {
  const diffKey = room.difficulty || 'easy';
  if (!highScores[diffKey]) {
    highScores[diffKey] = [];
  }

  let updated = false;
  room.players.forEach(p => {
    if (!p.isBankrupt && p.money > 0) {
      const trimmed = (p.name || '').trim();
      const firstSpaceIdx = trimmed.indexOf(' ');
      let avatar = '👾';
      let name = trimmed;
      if (firstSpaceIdx !== -1) {
        avatar = trimmed.substring(0, firstSpaceIdx);
        name = trimmed.substring(firstSpaceIdx + 1).trim();
      }

      const existingIdx = highScores[diffKey].findIndex(h => h.name.toLowerCase() === name.toLowerCase());
      if (existingIdx !== -1) {
        if (p.money > highScores[diffKey][existingIdx].money) {
          highScores[diffKey][existingIdx] = { avatar, name, money: p.money };
          updated = true;
        }
      } else {
        highScores[diffKey].push({ avatar, name, money: p.money });
        updated = true;
      }
    }
  });

  highScores[diffKey].sort((a, b) => b.money - a.money);
  highScores[diffKey] = highScores[diffKey].slice(0, 5);

  if (updated) {
    saveHighScores();
  }

  io.emit('highScoresUpdate', highScores);
}

// ฟังก์ชันสร้าง Room Code แบบสุ่ม 4 ตัวอักษรภาษาอังกฤษพิมพ์ใหญ่
function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  let code;
  do {
    code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
  } while (rooms[code]); // ป้องกันรหัสซ้ำ
  return code;
}

// อัตราผลตอบแทนพื้นฐานของสินทรัพย์ต่างๆ (ใช้เมื่ออีเวนต์ไม่ได้กำหนดค่า)
const BASE_RETURNS = {
  bank: 0.005,       // ดอกเบี้ยธนาคาร 0.5% ต่อรอบ
  govBonds: 0.015,   // พันธบัตรรัฐบาลโตเฉลี่ย 1.5% ต่อรอบ
  corpBonds: 0.02,   // หุ้นกู้โตเฉลี่ย 2% ต่อรอบ
  gold: 0,           // ทองคำ โต 0% ต่อรอบ (เน้นคงมูลค่าเวลามีวิกฤต)
  realEstate: 0.04,  // อสังหาฯ ปล่อยเช่า ได้ผลตอบแทน 4% ต่อรอบ
  stocks: 0.03,      // หุ้นโตเฉลี่ย 3% ต่อรอบ
  bitcoin: -0.01,    // บิตคอยน์ ลดลง 1% ต่อรอบ (ไม่มีข่าวก็ซึมลง)
  insurance: 0,      // ประกันสุขภาพ เบี้ยทิ้งเสมอ
  artToys: -0.05     // กล่องสุ่มอาร์ตทอยส์ ดีฟอลต์ลดลงเฉลี่ยรอบละ -5% (มีเสื่อมความนิยม)
};

io.on('connection', (socket) => {
  console.log(`User connected: ${socket.id}`);

  // 1. สร้างห้องใหม่
  socket.on('createRoom', ({ playerName, difficulty }) => {
    const roomCode = generateRoomCode();
    let maxRounds = 10;
    if (difficulty === 'medium') maxRounds = 20;
    if (difficulty === 'hard') maxRounds = 30;

    rooms[roomCode] = {
      code: roomCode,
      difficulty,
      maxRounds,
      currentRound: 0,
      status: 'lobby', // lobby -> playing -> finished
      players: [],
      eventsLog: []
    };

    joinPlayerToRoom(socket, roomCode, playerName, true);
  });

  // 2. เข้าร่วมห้องที่มีอยู่
  socket.on('joinRoom', ({ roomCode, playerName }) => {
    const code = roomCode.toUpperCase();
    const room = rooms[code];

    if (!room) {
      socket.emit('errorMsg', 'ไม่พบห้องเล่นเกมรหัสนี้ กรุณาตรวจสอบรหัสห้องอีกครั้ง');
      return;
    }

    const targetBaseName = getBaseName(playerName).toLowerCase();

    // ตรวจสอบว่าผู้เล่นเคยเข้าร่วมห้องนี้แล้วหลุดไป (Reconnect)
    const existingPlayer = room.players.find(p => getBaseName(p.name).toLowerCase() === targetBaseName);

    if (existingPlayer) {
      if (existingPlayer.isConnected) {
        socket.emit('errorMsg', 'ชื่อผู้เล่นนี้กำลังเชื่อมต่อและเล่นอยู่ในห้องนี้');
        return;
      }

      // ล้างไทม์เมอร์ตัดการเชื่อมต่อชั่วคราวออก
      if (existingPlayer.disconnectTimer) {
        clearTimeout(existingPlayer.disconnectTimer);
        existingPlayer.disconnectTimer = null;
      }

      // เปลี่ยนข้อมูล Socket ID และสถานะการเชื่อมต่อใหม่
      existingPlayer.id = socket.id;
      existingPlayer.isConnected = true;
      socket.join(code);

      console.log(`Player ${existingPlayer.name} reconnected to room ${code}`);

      // ส่งข้อความยืนยันเข้าร่วมห้องสำเร็จ
      socket.emit('roomJoined', { roomCode: code, player: existingPlayer });

      // ดึงสถานะห้องปัจจุบันส่งไปประมวลผลต่อ
      if (room.status === 'playing' || room.status === 'finished') {
        socket.emit('gameReconnected', {
          roomState: getCleanRoomState(room),
          player: existingPlayer
        });
      }

      // อัปเดตข้อมูลห้องพักให้ทุกคนทราบ
      io.to(code).emit('lobbyUpdate', getCleanRoomState(room));
      return;
    }

    // กรณีปกติสำหรับผู้เล่นใหม่
    if (room.status !== 'lobby') {
      socket.emit('errorMsg', 'ห้องนี้เริ่มเกมไปแล้ว หรือจบเกมไปแล้ว');
      return;
    }

    if (room.players.length >= 8) {
      socket.emit('errorMsg', 'ห้องเต็มแล้ว! (รับได้สูงสุด 8 คน)');
      return;
    }

    // ตรวจสอบชื่อซ้ำ (สำหรับผู้เล่นใหม่)
    const isNameTaken = room.players.some(p => getBaseName(p.name).toLowerCase() === targetBaseName);
    if (isNameTaken) {
      socket.emit('errorMsg', 'ชื่อนี้ถูกใช้ไปแล้วในห้องนี้ กรุณาใช้ชื่ออื่น');
      return;
    }

    joinPlayerToRoom(socket, code, playerName, false);
  });

  // 3. โฮสต์สั่งเริ่มเกม
  socket.on('startGame', () => {
    const playerRoom = getPlayerRoom(socket);
    if (!playerRoom) return;

    const { room, player } = playerRoom;
    if (!player.isHost) {
      socket.emit('errorMsg', 'คุณไม่ใช่เจ้าของห้อง ไม่สามารถเริ่มเกมได้');
      return;
    }

    if (room.players.length < 1) {
      socket.emit('errorMsg', 'ต้องมีผู้เล่นอย่างน้อย 1 คนเพื่อเริ่มเกม');
      return;
    }

    room.status = 'playing';
    room.currentRound = 0;
    room.eventsLog = [];

    // สุ่มรอบการันตีเกิดเหตุการณ์ตลกสุดปั่น (Funny Event) และโรคระบาด (Pandemic Event) แบบห้ามรอบซ้ำกัน
    const funnyRound = Math.floor(Math.random() * Math.min(5, room.maxRounds)) + 1;
    let pandemicRound;
    do {
      pandemicRound = Math.floor(Math.random() * room.maxRounds) + 1;
    } while (pandemicRound === funnyRound && room.maxRounds > 1);

    room.guaranteedFunnyRound = funnyRound;
    room.guaranteedPandemicRound = pandemicRound;

    // รีเซ็ตสถานะผู้เล่นทุกคนก่อนเริ่ม
    room.players.forEach(p => {
      p.money = 1000000;
      p.isBankrupt = false;
      p.hasSubmitted = false;
      p.allocation = {
        bank: 0,
        govBonds: 0,
        corpBonds: 0,
        gold: 0,
        realEstate: 0,
        stocks: 0,
        bitcoin: 0,
        insurance: 0,
        artToys: 0,
        cash: 1000000 // เริ่มต้นเงินอยู่ที่กองกลาง 1M บาท
      };
      p.history = [{
        round: 0,
        total: 1000000,
        eventTitle: 'เริ่มเกม',
        allocation: { ...p.allocation }
      }];
    });

    io.to(room.code).emit('gameStarted', getCleanRoomState(room));
  });

  // 4. ผู้เล่นส่งการจัดสรรเงินทุน (Submit Allocation)
  socket.on('submitAllocation', (alloc) => {
    const playerRoom = getPlayerRoom(socket);
    if (!playerRoom) return;

    const { room, player } = playerRoom;
    if (room.status !== 'playing') {
      socket.emit('errorMsg', 'เกมไม่ได้อยู่ในช่วงเล่น');
      return;
    }

    if (player.isBankrupt) {
      socket.emit('errorMsg', 'คุณล้มละลายแล้ว ทำได้เพียงดูเพื่อนๆ เล่นเท่านั้น');
      return;
    }

    // ตรวจสอบและคลีนข้อมูล Allocation (เรียงจากเสี่ยงต่ำไปสูง)
    const sanitizedAlloc = {
      bank: Math.max(0, parseInt(alloc.bank) || 0),
      govBonds: Math.max(0, parseInt(alloc.govBonds) || 0),
      corpBonds: Math.max(0, parseInt(alloc.corpBonds) || 0),
      gold: Math.max(0, parseInt(alloc.gold) || 0),
      realEstate: Math.max(0, parseInt(alloc.realEstate) || 0),
      stocks: Math.max(0, parseInt(alloc.stocks) || 0),
      bitcoin: Math.max(0, parseInt(alloc.bitcoin) || 0),
      insurance: Math.max(0, parseInt(alloc.insurance) || 0),
      artToys: Math.max(0, parseInt(alloc.artToys) || 0)
    };

    // ตรวจสอบว่าจำนวนเงินรวมในการลงทุนไม่เกินเงินที่มีอยู่จริง
    const totalAllocated = Object.values(sanitizedAlloc).reduce((sum, val) => sum + val, 0);
    if (totalAllocated > player.money) {
      socket.emit('errorMsg', `จำนวนเงินลงทุนรวม (${totalAllocated.toLocaleString()} บาท) เกินกว่าเงินที่คุณมี (${player.money.toLocaleString()} บาท)`);
      return;
    }

    // เงินส่วนต่างที่เหลือทั้งหมดจะถูกนำไปเก็บไว้ในกองกลาง (Cash) ห้ามเด้งเข้าธนาคารโดยอัตโนมัติ
    sanitizedAlloc.cash = player.money - totalAllocated;

    player.allocation = sanitizedAlloc;
    player.hasSubmitted = true;

    // ส่งข้อความบอกผู้เล่นคนอื่นว่าคนนี้ส่งเงินแล้ว
    io.to(room.code).emit('playerSubmitted', { playerId: player.id, name: player.name });

    // ตรวจสอบว่าผู้เล่นทุกคน (ที่ยังไม่ล้มละลาย และยังเชื่อมต่ออยู่) ส่งครบหรือยัง
    checkAndResolveRound(room);
  });

  // 4.5 โฮสต์ต้องการกดเริ่มเล่นรอบใหม่กับผู้เล่นชุดเดิม (Play Again)
  socket.on('playAgain', () => {
    const playerRoom = getPlayerRoom(socket);
    if (!playerRoom) return;

    const { room, player } = playerRoom;
    if (!player.isHost) {
      socket.emit('errorMsg', 'คุณไม่ใช่เจ้าของห้อง ไม่สามารถสั่งเริ่มเล่นใหม่ได้');
      return;
    }

    // กรองเอาเฉพาะผู้เล่นที่ยังคงเชื่อมต่อออนไลน์อยู่ (isConnected === true) เพื่อเตรียมลุยต่อในรอบถัดไป
    room.players = room.players.filter(p => p.isConnected);

    room.status = 'lobby';
    room.currentRound = 0;
    room.eventsLog = [];

    // รีเซ็ตเงินผู้เล่นทุกคนกลับเป็นเริ่มต้น 1M กองกลาง
    room.players.forEach(p => {
      p.money = 1000000;
      p.isBankrupt = false;
      p.hasSubmitted = false;
      p.allocation = {
        bank: 0,
        govBonds: 0,
        corpBonds: 0,
        gold: 0,
        realEstate: 0,
        stocks: 0,
        bitcoin: 0,
        insurance: 0,
        artToys: 0,
        cash: 1000000
      };
      p.financialStats = {
        totalPremiumPaid: 0,
        totalOutofPocket: 0,
        totalClaimsPaid: 0,
        deficitIncidents: 0,
        assetProfits: {
          bank: 0,
          govBonds: 0,
          corpBonds: 0,
          gold: 0,
          realEstate: 0,
          stocks: 0,
          bitcoin: 0,
          artToys: 0
        }
      };
      p.history = [{
        round: 0,
        total: 1000000,
        eventTitle: 'เริ่มเกมใหม่',
        allocation: { ...p.allocation }
      }];
    });

    io.to(room.code).emit('gameReset', getCleanRoomState(room));
  });

  // 5. จัดการเมื่อตัดการเชื่อมต่อ (Disconnect)
  socket.on('disconnect', () => {
    console.log(`User disconnected: ${socket.id}`);
    
    // ค้นหาห้องที่ผู้เล่นนี้อยู่
    for (const code in rooms) {
      const room = rooms[code];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        console.log(`Removing/Marking disconnected player ${player.name} from room ${code}`);
        
        if (room.status === 'lobby') {
          // หากอยู่ในหน้า Lobby สามารถลบผู้เล่นออกได้เลย
          room.players.splice(playerIndex, 1);
          
          // ถ้าโฮสต์หลุดและยังมีผู้เล่นเหลืออยู่ ให้คนแรกเป็นโฮสต์แทน
          if (player.isHost && room.players.length > 0) {
            room.players[0].isHost = true;
          }
          
          io.to(code).emit('lobbyUpdate', getCleanRoomState(room));
        } else {
          // หากกำลังเล่นเกมหรือจบเกมอยู่ ให้ทำเครื่องหมายว่า Disconnected
          player.isConnected = false;
          
          // ถ้าหลุดออกจากห้องระหว่างที่เกมยังไม่จบ (status === 'playing') ให้ตั้งเวลาปรับล้มละลายหลัง 60 วินาที (เพื่อให้มีโอกาส Reconnect)
          if (room.status === 'playing') {
            if (player.disconnectTimer) {
              clearTimeout(player.disconnectTimer);
            }
            player.disconnectTimer = setTimeout(() => {
              if (!player.isConnected && room.status === 'playing') {
                player.isBankrupt = true;
                player.money = 0;
                player.allocation = {
                  bank: 0, govBonds: 0, corpBonds: 0, gold: 0, realEstate: 0,
                  stocks: 0, bitcoin: 0, insurance: 0, artToys: 0, cash: 0
                };
                console.log(`Grace period expired. Player ${player.name} is now bankrupt.`);
                checkAndResolveRound(room);
                io.to(code).emit('lobbyUpdate', getCleanRoomState(room));
              }
            }, 60000); // รอ 60 วินาที
          }
          
          // ถ้าโฮสต์หลุดและยังมีผู้เล่นที่เชื่อมต่อเหลืออยู่ ให้แต่งตั้งโฮสต์คนใหม่จากผู้ที่ยังเชื่อมต่ออยู่
          if (player.isHost) {
            const nextHost = room.players.find(p => p.isConnected);
            if (nextHost) {
              room.players.forEach(p => {
                p.isHost = (p.id === nextHost.id);
              });
              console.log(`Host disconnected. Promoted player ${nextHost.name} to new Host.`);
            }
          }

          // ตรวจสอบการผ่านรอบทันที เผื่อคนสุดท้ายที่รอส่งดันหลุดไป
          checkAndResolveRound(room);
          io.to(code).emit('playerDisconnected', { playerId: player.id, name: player.name });
          io.to(code).emit('lobbyUpdate', getCleanRoomState(room)); // อัปเดตห้องเพื่อให้ทุกคนรับรู้สถานะการหลุดชั่วคราว
        }
        
        // ลบห้องทิ้งหากไม่เหลือผู้เล่นเชื่อมต่ออยู่เลย
        const activePlayers = room.players.filter(p => room.status === 'lobby' ? true : p.isConnected);
        if (activePlayers.length === 0) {
          console.log(`Room ${code} is empty, deleting room`);
          delete rooms[code];
        }
        break;
      }
    }
  });
});

// ฟังก์ชันแกะชื่อผู้เล่นตัดส่วนไอคอนอวาตาร์ออกเพื่อใช้ในการ Reconnect
function getBaseName(fullName) {
  if (!fullName) return '';
  const parts = fullName.trim().split(' ');
  if (parts.length > 1) {
    return parts.slice(1).join(' ');
  }
  return fullName;
}

// ฟังก์ชันนำผู้เล่นเข้าห้อง
function joinPlayerToRoom(socket, roomCode, playerName, isHost) {
  const room = rooms[roomCode];
  const newPlayer = {
    id: socket.id,
    name: playerName,
    isHost,
    isConnected: true,
    money: 1000000,
    isBankrupt: false,
    hasSubmitted: false,
    allocation: {
      bank: 1000000,
      govBonds: 0,
      corpBonds: 0,
      gold: 0,
      realEstate: 0,
      stocks: 0,
      bitcoin: 0,
      insurance: 0,
      artToys: 0
    },
    financialStats: {
      totalPremiumPaid: 0,
      totalOutofPocket: 0,
      totalClaimsPaid: 0,
      deficitIncidents: 0,
      assetProfits: {
        bank: 0,
        govBonds: 0,
        corpBonds: 0,
        gold: 0,
        realEstate: 0,
        stocks: 0,
        bitcoin: 0,
        artToys: 0
      }
    },
    history: []
  };

  room.players.push(newPlayer);
  socket.join(roomCode);

  if (isHost) {
    socket.emit('roomCreated', { roomCode, player: newPlayer });
  } else {
    socket.emit('roomJoined', { roomCode, player: newPlayer });
  }

  io.to(roomCode).emit('lobbyUpdate', getCleanRoomState(room));
}

// ค้นหาห้องและผู้เล่นจาก socket.id
function getPlayerRoom(socket) {
  for (const code in rooms) {
    const room = rooms[code];
    const player = room.players.find(p => p.id === socket.id);
    if (player) {
      return { room, player };
    }
  }
  return null;
}

// ตรวจสอบการส่งเงินของทุกคน และประมวลผลรอบเล่น
function checkAndResolveRound(room) {
  // กรองเฉพาะผู้เล่นที่ยังออนไลน์ และยังไม่ล้มละลาย
  const activePlayers = room.players.filter(p => p.isConnected && !p.isBankrupt);
  
  // ตรวจสอบว่าทุกคนส่งหรือยัง
  const allSubmitted = activePlayers.every(p => p.hasSubmitted);
  
  if (allSubmitted && activePlayers.length > 0) {
    resolveRound(room);
  }
}

// ประมวลผลรอบและขึ้นรอบถัดไป
function resolveRound(room) {
  room.currentRound += 1;

  // กำหนดตัวคูณความรุนแรงตามระดับความยาก (ยากขึ้น = โดนหักเงินเยอะขึ้น และรักษาสุขภาพแพงขึ้น)
  let diffMultiplier = 1.5; // Easy
  if (room.difficulty === 'medium') diffMultiplier = 1.7; // Medium (Normal)
  if (room.difficulty === 'hard') diffMultiplier = 1.9; // Hard

  // 1. สุ่มเหตุการณ์ 1 แบบจาก 100 เหตุการณ์
  let chosenEvent;
  const usedIds = room.eventsLog.map(e => e.id);
  
  // ตรวจสอบและดึงเหตุการณ์การันตีตลกสุดปั่น (Funny) หรือโรคระบาด (Pandemic)
  const targetFunnyRound = room.guaranteedFunnyRound || 3;
  const targetPandemicRound = room.guaranteedPandemicRound || 7;

  if (room.currentRound === targetFunnyRound) {
    const availableFunny = events.filter(e => e.theme === 'funny' && !usedIds.includes(e.id));
    if (availableFunny.length > 0) {
      chosenEvent = availableFunny[Math.floor(Math.random() * availableFunny.length)];
    }
  } else if (room.currentRound === targetPandemicRound) {
    const availablePandemic = events.filter(e => e.theme === 'pandemic' && !usedIds.includes(e.id));
    if (availablePandemic.length > 0) {
      chosenEvent = availablePandemic[Math.floor(Math.random() * availablePandemic.length)];
    }
  }

  // หากไม่ได้จังหวะล็อกการันตี หรือสุ่มเหตุการณ์ในธีมที่กำหนดไม่ได้ ให้ทำการสุ่มเหตุการณ์ตามปกติ
  if (!chosenEvent) {
    const availableEvents = events.filter(e => !usedIds.includes(e.id));
    if (availableEvents.length > 0) {
      chosenEvent = availableEvents[Math.floor(Math.random() * availableEvents.length)];
    } else {
      chosenEvent = events[Math.floor(Math.random() * events.length)];
    }
  }
  
  room.eventsLog.push(chosenEvent);

  // 2. คำนวณเงินใหม่ของแต่ละคน
  room.players.forEach(player => {
    // คนที่ล้มละลายไปแล้วจะไม่ถูกคำนวณเงินเพิ่ม/ลดอีก
    if (player.isBankrupt) {
      player.history.push({
        round: room.currentRound,
        total: 0,
        eventTitle: chosenEvent.title,
        allocation: {
          bank: 0,
          govBonds: 0,
          corpBonds: 0,
          gold: 0,
          realEstate: 0,
          stocks: 0,
          bitcoin: 0,
          insurance: 0,
          artToys: 0,
          cash: 0
        }
      });
      return;
    }

    const alloc = player.allocation;
    let oldMoney = player.money;

    // สะสมสถิติ
    if (!player.financialStats) {
      player.financialStats = {
        totalPremiumPaid: 0,
        totalOutofPocket: 0,
        totalClaimsPaid: 0,
        deficitIncidents: 0
      };
    }
    const premiumPaid = alloc.insurance || 0;
    player.financialStats.totalPremiumPaid += premiumPaid;

    // คำนวณค่าธรรมเนียมประกันสุขภาพ และการเคลมประกันกรณีเกิดโรคระบาด
    let netMedicalExpense = 0;
    if (chosenEvent.medicalExpense) {
      // ปรับค่ารักษาพยาบาลตามตัวคูณความยากของโหมด
      const baseExpense = Math.round(chosenEvent.medicalExpense * diffMultiplier);
      let payout = 0;

      if (premiumPaid >= 20000) {
        // ประกันครอบคลุมเต็มจำนวน + เงินทำขวัญ 50,000 บาท
        payout = baseExpense + 50000;
      } else if (premiumPaid > 0) {
        // ประกันจ่ายชดเชยตามจำนวนเบี้ย x 10 เท่า แต่ไม่เกินยอดค่าใช้จ่าย + เงินทำขวัญ
        payout = Math.min(premiumPaid * 10, baseExpense + 50000);
      }
      
      netMedicalExpense = baseExpense - payout;

      // สะสมสถิติสุขภาพ
      if (netMedicalExpense > 0) {
        player.financialStats.totalOutofPocket += netMedicalExpense;
      }
      player.financialStats.totalClaimsPaid += Math.max(0, payout);
    }

    // คำนวณยอดเงินปลายทางของแต่ละสินทรัพย์ตามผลของ Event
    const calculateAssetValue = (assetKey, val) => {
      let modifier = chosenEvent.effects[assetKey] !== undefined 
        ? chosenEvent.effects[assetKey] 
        : BASE_RETURNS[assetKey];
      
      // เพิ่มความตึงเครียดตามระดับความยาก: หากผลตอบแทนติดลบ (โดนหักเงิน) ให้รุนแรงขึ้นตามระดับความยาก!
      if (modifier < 0) {
        modifier = modifier * diffMultiplier;
      }
      return Math.round(val * (1 + modifier));
    };

    let newBank = calculateAssetValue('bank', alloc.bank || 0);
    let newGovBonds = calculateAssetValue('govBonds', alloc.govBonds || 0);
    let newCorpBonds = calculateAssetValue('corpBonds', alloc.corpBonds || 0);
    let newGold = calculateAssetValue('gold', alloc.gold || 0);
    let newRealEstate = calculateAssetValue('realEstate', alloc.realEstate || 0);
    let newStocks = calculateAssetValue('stocks', alloc.stocks || 0);
    let newBitcoin = calculateAssetValue('bitcoin', alloc.bitcoin || 0);

    // ประกันสุขภาพ กลายเป็น 0 ทุกรอบเพราะเป็นเบี้ยจ่ายทิ้ง
    const newInsurance = 0; 

    // คำนวณสินทรัพย์ที่ 9 (กล่องสุ่มอาร์ตทอยส์ดอยสะท้านฟ้า)
    // หากอีเวนต์ไม่มีการระบุ ให้สุ่มกระแสขึ้น/ลงอย่างรุนแรงตลกๆ ตามธีมรอบนั้น
    let artToysMod = chosenEvent.effects.artToys;
    if (artToysMod === undefined) {
      if (chosenEvent.theme === 'funny' || chosenEvent.theme === 'bull' || chosenEvent.theme === 'crypto') {
        // ระบบแจ็กพอต: มีโอกาส 10% ที่จะเกิดกระแสไวรัล ได้กำไร +500% รวยเละ
        if (Math.random() < 0.10) {
          artToysMod = 5.0; // แจ็กพอตแตก! กำไร 5 เท่า
        } else {
          // ถ้าไม่แตกแจ็กพอต จะเป็นการทำกำไร/ขาดทุนแบบปกติ (-30% ถึง +120%)
          artToysMod = (Math.random() * 1.5) - 0.3;
        }
      } else if (chosenEvent.theme === 'bear' || chosenEvent.theme === 'disaster' || chosenEvent.theme === 'pandemic') {
        artToysMod = -(Math.random() * 0.9) - 0.05; // ขาดทุนหนัก (-5% ถึง -95%)
      } else {
        artToysMod = (Math.random() * 0.6) - 0.3; // ผันผวนปกติ (-30% ถึง +30%)
      }
    }
    let newArtToys = Math.round((alloc.artToys || 0) * (1 + artToysMod));

    // เงินกองกลางคงเหลือเดิมหักค่ารักษาพยาบาลสุทธิ
    let newCash = (alloc.cash || 0) - netMedicalExpense;

    // ระบบเฉลี่ยยอดติดลบ (เมื่อเงินกองกลางติดลบ)
    // จะเฉลี่ยยอดหนี้ไปลดเงินของทุกสินทรัพย์ที่ผู้เล่นถืออยู่ (ยอดเงิน > 0) อย่างเท่าๆ กัน
    let newAssets = {
      bank: newBank,
      govBonds: newGovBonds,
      corpBonds: newCorpBonds,
      gold: newGold,
      realEstate: newRealEstate,
      stocks: newStocks,
      bitcoin: newBitcoin,
      artToys: newArtToys
    };

    if (newCash < 0) {
      if (player.financialStats) {
        player.financialStats.deficitIncidents += 1;
      }
      let deficit = -newCash;
      newCash = 0;

      while (deficit > 0) {
        // ค้นหาสินทรัพย์ที่ยังมีเงินคงเหลืออยู่จริง
        const activeKeys = Object.keys(newAssets).filter(k => newAssets[k] > 0);
        if (activeKeys.length === 0) {
          // หากสินทรัพย์ทั้งหมดหมดตัวแล้ว ผู้เล่นหมดตัว
          break;
        }

        // แบ่งยอดหนี้เฉลี่ยให้เท่ากันในบรรดาสินทรัพย์ที่เหลืออยู่
        let share = Math.ceil(deficit / activeKeys.length);
        let totalDeductedThisPass = 0;

        for (const key of activeKeys) {
          const deductAmount = Math.min(newAssets[key], share);
          newAssets[key] -= deductAmount;
          deficit -= deductAmount;
          totalDeductedThisPass += deductAmount;
          if (deficit <= 0) break;
        }

        // ป้องกันลูปไม่สิ้นสุด
        if (totalDeductedThisPass === 0) break;
      }

      // ดึงค่าสินทรัพย์ที่หักชดใช้หนี้เฉลี่ยเท่ากันแล้วกลับมา
      newBank = newAssets.bank;
      newGovBonds = newAssets.govBonds;
      newCorpBonds = newAssets.corpBonds;
      newGold = newAssets.gold;
      newRealEstate = newAssets.realEstate;
      newStocks = newAssets.stocks;
      newBitcoin = newAssets.bitcoin;
      newArtToys = newAssets.artToys;
    }

    // สะสมกำไรของแต่ละสินทรัพย์ในรอบนี้
    if (player.financialStats && player.financialStats.assetProfits) {
      player.financialStats.assetProfits.bank += (newBank - (alloc.bank || 0));
      player.financialStats.assetProfits.govBonds += (newGovBonds - (alloc.govBonds || 0));
      player.financialStats.assetProfits.corpBonds += (newCorpBonds - (alloc.corpBonds || 0));
      player.financialStats.assetProfits.gold += (newGold - (alloc.gold || 0));
      player.financialStats.assetProfits.realEstate += (newRealEstate - (alloc.realEstate || 0));
      player.financialStats.assetProfits.stocks += (newStocks - (alloc.stocks || 0));
      player.financialStats.assetProfits.bitcoin += (newBitcoin - (alloc.bitcoin || 0));
      player.financialStats.assetProfits.artToys += (newArtToys - (alloc.artToys || 0));
    }

    // คำนวณเงินรวมหลังปรับพอร์ตและหักหนี้เฉลี่ย
    let newTotal = newBank + newGovBonds + newCorpBonds + newGold + newRealEstate + newStocks + newBitcoin + newArtToys + newCash;

    // ตรวจสอบการล้มละลาย
    if (newTotal <= 0) {
      newTotal = 0;
      player.isBankrupt = true;
    }

    player.money = newTotal;

    // ตั้งค่าพอร์ตสำหรับรอบต่อไป: ให้สินทรัพย์เติบโต/หดตัวตามผลลัพธ์รอบก่อน และเงินที่เหลือค้างในกองกลาง (ห้ามรีเซ็ตเป็น 0)
    player.allocation = {
      bank: player.isBankrupt ? 0 : newBank,
      govBonds: player.isBankrupt ? 0 : newGovBonds,
      corpBonds: player.isBankrupt ? 0 : newCorpBonds,
      gold: player.isBankrupt ? 0 : newGold,
      realEstate: player.isBankrupt ? 0 : newRealEstate,
      stocks: player.isBankrupt ? 0 : newStocks,
      bitcoin: player.isBankrupt ? 0 : newBitcoin,
      insurance: 0,
      artToys: player.isBankrupt ? 0 : newArtToys,
      cash: player.isBankrupt ? 0 : newCash
    };
    player.hasSubmitted = false;

    // บันทึกประวัติรอบการเล่น
    player.history.push({
      round: room.currentRound,
      total: newTotal,
      eventTitle: chosenEvent.title,
      allocation: {
        bank: newBank,
        govBonds: newGovBonds,
        corpBonds: newCorpBonds,
        gold: newGold,
        realEstate: newRealEstate,
        stocks: newStocks,
        bitcoin: newBitcoin,
        insurance: 0,
        artToys: newArtToys,
        cash: newCash
      },
      preAllocation: Object.assign({}, alloc),
      netChange: newTotal - oldMoney,
      medicalExpenseDetails: chosenEvent.medicalExpense ? {
        baseExpense: chosenEvent.medicalExpense,
        premium: alloc.insurance || 0,
        netExpense: (alloc.cash || 0) - (alloc.cash - netMedicalExpense)
      } : null
    });
  });

  // 3. ตรวจสอบการจบเกม (หากเล่นหลายคนแล้วเหลือผู้รอดชีวิตคนเดียว ชนะและจบเกมทันทีสไตล์ Battle Royale)
  const activeCount = room.players.filter(p => !p.isBankrupt).length;
  
  if (room.currentRound >= room.maxRounds || activeCount === 0 || (room.players.length > 1 && activeCount === 1)) {
    room.status = 'finished';
    updateHighScoresForFinishedRoom(room);
  }

  // ส่งผลการประมวลผลรอบเล่นไปให้ทุกคนในห้อง
  io.to(room.code).emit('roundResolved', {
    roomState: getCleanRoomState(room),
    event: chosenEvent
  });
}

// ช่วยฟิลเตอร์ข้อมูลห้องเพื่อส่งกลับหา Client (ลบข้อมูลเปราะบางของ Socket ออก)
function getCleanRoomState(room) {
  return {
    code: room.code,
    difficulty: room.difficulty,
    maxRounds: room.maxRounds,
    currentRound: room.currentRound,
    status: room.status,
    eventsLog: room.eventsLog,
    players: room.players.map(p => ({
      id: p.id,
      name: p.name,
      isHost: p.isHost,
      isConnected: p.isConnected,
      money: p.money,
      isBankrupt: p.isBankrupt,
      hasSubmitted: p.hasSubmitted,
      allocation: p.allocation,
      history: p.history,
      financialStats: p.financialStats
    }))
  };
}

// รันเว็บเซิร์ฟเวอร์
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
