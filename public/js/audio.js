// public/js/audio.js

class RetroAudio {
  constructor() {
    this.ctx = null;
  }

  // เรียกใช้งาน Audio Context เมื่อผู้ใช้กดปุ่มเพื่อเลี่ยงนโยบายเบราว์เซอร์
  init() {
    if (!this.ctx) {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // เสียงคลิกปุ่มทั่วไป (Short high beep)
  playClick() {
    this.init();
    if (!this.ctx) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square'; // 8-bit sound type
    osc.frequency.setValueAtTime(800, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(1200, this.ctx.currentTime + 0.08);

    gain.gain.setValueAtTime(0.05, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.08);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.08);
  }

  // เสียงเหรียญร่วง/แคชเชียร์ (Chime arpeggio)
  playCashRegister() {
    this.init();
    if (!this.ctx) return;

    const playNote = (freq, start, duration) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);

      gain.gain.setValueAtTime(0.05, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(start);
      osc.stop(start + duration);
    };

    const now = this.ctx.currentTime;
    playNote(987.77, now, 0.08); // B5
    playNote(1318.51, now + 0.08, 0.25); // E6
  }

  // เสียงสัญญาณเตือนภัยอีเวนต์แบบอลังการเรโทร (Epic Event Alert Chime)
  playEventAlert() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    
    // ฟังก์ชันเล่นโน้ตเดี่ยวสไตล์คลื่นสี่เหลี่ยม (Chiptune Square Wave)
    const playNote = (freq, start, duration, vol = 0.05, type = 'square') => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    // 1. เสียงเปิดตัวแบบเฟดความถี่สวิปอย่างรวดเร็ว (Frequency Sweep)
    const sweepOsc = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(100, now);
    sweepOsc.frequency.linearRampToValueAtTime(800, now + 0.2);
    sweepGain.gain.setValueAtTime(0.03, now);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    sweepOsc.connect(sweepGain);
    sweepGain.connect(this.ctx.destination);
    sweepOsc.start(now);
    sweepOsc.stop(now + 0.2);

    // 2. รันอาร์เปจจิโอ (Arpeggio) คอร์ดแรก C Major ขึ้นสูงแบบเร็วปานจรวด
    const chord1 = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
    chord1.forEach((freq, idx) => {
      playNote(freq, now + 0.15 + (idx * 0.05), 0.2, 0.04);
    });

    // 3. รันอาร์เปจจิโอ คอร์ดสอง G Major ขึ้นสูง
    const chord2 = [392.00, 493.88, 587.33, 783.99]; // G4, B4, D5, G5
    chord2.forEach((freq, idx) => {
      playNote(freq, now + 0.35 + (idx * 0.05), 0.2, 0.04);
    });

    // 4. คอร์ดใหญ่ปิดท้าย C Major ประสานเสียงอลังการ 4 โน้ตพร้อมกัน
    const finalChord = [523.25, 659.25, 783.99, 1046.50]; // C5, E5, G5, C6
    finalChord.forEach((freq) => {
      playNote(freq, now + 0.6, 0.6, 0.03, 'square');
      // เพิ่มคลื่นสามเหลี่ยมประสานให้นุ่มขึ้น
      playNote(freq / 2, now + 0.6, 0.6, 0.04, 'triangle');
    });
  }

  // เสียงล้มละลาย (Sad descending buzzer)
  playBankruptcy() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.linearRampToValueAtTime(60, now + 0.6);

    gain.gain.setValueAtTime(0.08, now);
    gain.gain.linearRampToValueAtTime(0.001, now + 0.6);

    osc.connect(gain);
    gain.connect(this.ctx.destination);

    osc.start(now);
    osc.stop(now + 0.6);
  }

  // เสียงฉลองชัยชนะ (Happy retro win arpeggio)
  playWin() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;

    // ฟังก์ชันเล่นโน้ตตัวหลัก
    const playTriumphantNote = (freq, start, duration, vol = 0.05, type = 'square') => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, start);
      
      // เพิ่มเอฟเฟกต์ Vibrato เล็กๆ ให้เสียงมีมิติมีชีวิตชีวา
      if (duration > 0.4) {
        const lfo = this.ctx.createOscillator();
        const lfoGain = this.ctx.createGain();
        lfo.frequency.value = 8; // ความถี่ในการสั่น 8Hz
        lfoGain.gain.value = 10; // ความกว้างในการสั่นของตัวโน้ต
        lfo.connect(lfoGain);
        lfoGain.connect(osc.frequency);
        lfo.start(start);
        lfo.stop(start + duration);
      }

      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    // 1. เมโลดี้หลักแบบแตรฉลองชัย (Square wave Lead)
    // C Major Arpeggio -> G Major Arpeggio -> F Major -> Triumphant C Major Chord
    const melody = [
      { f: 523.25, s: 0.0, d: 0.15 }, // C5
      { f: 659.25, s: 0.15, d: 0.15 }, // E5
      { f: 783.99, s: 0.3, d: 0.15 }, // G5
      { f: 1046.50, s: 0.45, d: 0.3 }, // C6

      { f: 880.00, s: 0.75, d: 0.15 }, // A5
      { f: 1046.50, s: 0.9, d: 0.15 }, // C6
      { f: 1174.66, s: 1.05, d: 0.3 }, // D6

      { f: 987.77, s: 1.35, d: 0.15 }, // B5
      { f: 1174.66, s: 1.5, d: 0.15 }, // D6
      { f: 1318.51, s: 1.65, d: 0.3 }, // E6

      { f: 1046.50, s: 1.95, d: 1.5 }  // C6 (Triumphant Sustained Note)
    ];

    melody.forEach(n => {
      playTriumphantNote(n.f, now + n.s, n.d, 0.04, 'square');
      // เสียงคู่ประสานระดับ 3
      playTriumphantNote(n.f * 1.25, now + n.s, n.d, 0.02, 'square'); 
    });

    // 2. เสียงเบสหนุนหลังเพิ่มความยิ่งใหญ่ (Triangle wave Bassline)
    const bassline = [
      { f: 261.63, s: 0.0, d: 0.7 },  // C4
      { f: 349.23, s: 0.75, d: 0.5 }, // F4
      { f: 392.00, s: 1.35, d: 0.5 }, // G4
      { f: 523.25, s: 1.95, d: 1.5 }  // C5
    ];
    bassline.forEach(b => {
      playTriumphantNote(b.f / 2, now + b.s, b.d, 0.08, 'triangle');
    });

    // 3. เสียงปิดท้ายสุดอลังการ C Major ประสานเสียงคอร์ดใหญ่
    const finalChord = [261.63, 329.63, 392.00, 523.25, 659.25, 783.99, 1046.50];
    finalChord.forEach(f => {
      playTriumphantNote(f, now + 1.95, 1.8, 0.025, 'square');
    });
  }

  // เสียงดนตรีสั้นตอนกดเริ่มเกม (Game Start startup chime)
  playGameStart() {
    this.init();
    if (!this.ctx) return;

    const now = this.ctx.currentTime;
    const playNote = (freq, start, duration, vol = 0.05) => {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'square';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(vol, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + duration);
      osc.connect(gain);
      gain.connect(this.ctx.destination);
      osc.start(start);
      osc.stop(start + duration);
    };

    // เล่นอาร์เปจจิโอสปีดสูงปรี๊ดเพื่อเร่งอะดรีนาลีน (C5 -> E5 -> G5 -> C6 -> E6 -> G6 -> C7)
    const arpeggio = [523.25, 659.25, 783.99, 1046.50, 1318.51, 1567.98, 2093.00];
    arpeggio.forEach((freq, idx) => {
      playNote(freq, now + idx * 0.06, 0.25, 0.035);
    });

    // คอร์ดปิดประสานความสดใสสไตล์ย้อนยุคดังกังวาน C Major
    const chordTime = now + 0.45;
    playNote(523.25, chordTime, 0.8, 0.025);
    playNote(659.25, chordTime, 0.8, 0.025);
    playNote(783.99, chordTime, 0.8, 0.025);
    playNote(1046.50, chordTime, 0.8, 0.025);
  }
}

// สร้าง Instance และเปิดเผยตัวแปร
window.audio = new RetroAudio();
