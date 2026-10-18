/**
 * SmartFarm Agro-Alert Sound, Speech & Farmer Dispatch Service
 * Provides:
 * 1. Web Audio API synthesized alert chimes (urgent siren for CRITICAL, chime for WARNING).
 * 2. Web Speech API personalized voice alert ("tells the alert with sound").
 * 3. Farmer contact management (persisted in localStorage).
 * 4. Direct phone dialing (tel:), WhatsApp pre-filled alerts, and SMS dispatch.
 * 5. Browser desktop push notifications (Notification API).
 */

const FARMER_STORAGE_KEY = "smartfarm_farmer_contact";
const SOUND_ENABLED_KEY = "smartfarm_alert_sound_enabled";
const VOICE_ENABLED_KEY = "smartfarm_alert_voice_enabled";

// Default farmer contact details
const DEFAULT_CONTACT = {
  name: "Farm Manager",
  phone: "+94771234567",
};

export function getFarmerContact() {
  try {
    const raw = localStorage.getItem(FARMER_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && parsed.phone) return parsed;
    }
  } catch {}
  return DEFAULT_CONTACT;
}

export function saveFarmerContact(contact) {
  try {
    localStorage.setItem(
      FARMER_STORAGE_KEY,
      JSON.stringify({
        name: contact.name || "Farm Manager",
        phone: contact.phone || "+94771234567",
      })
    );
  } catch {}
}

export function isSoundEnabled() {
  try {
    const val = localStorage.getItem(SOUND_ENABLED_KEY);
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

export function setSoundEnabled(enabled) {
  try {
    localStorage.setItem(SOUND_ENABLED_KEY, String(enabled));
  } catch {}
}

export function isVoiceEnabled() {
  try {
    const val = localStorage.getItem(VOICE_ENABLED_KEY);
    return val === null ? true : val === "true";
  } catch {
    return true;
  }
}

export function setVoiceEnabled(enabled) {
  try {
    localStorage.setItem(VOICE_ENABLED_KEY, String(enabled));
  } catch {}
}

// -------------------------------------------------------------
// Web Audio API Synthesizer (Works offline, zero mp3 dependencies)
// -------------------------------------------------------------
let audioCtx = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtxClass();
  }
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch(() => {});
  }
  return audioCtx;
}

/**
 * Plays an alert chime based on severity:
 * - CRITICAL: High-attention double-tone pulsing siren (880Hz -> 1175Hz -> 880Hz).
 * - WARNING: Friendly dual-chord attention chime (587Hz -> 784Hz).
 * - INFO / TEST: Gentle confirmation ping.
 */
export function playAlertSound(severity = "CRITICAL") {
  if (!isSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    if (severity === "CRITICAL") {
      // 3 rapid emergency alert siren pulses
      const pulses = [0, 0.18, 0.36];
      pulses.forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, now + offset); // A5
        osc.frequency.exponentialRampToValueAtTime(1174.66, now + offset + 0.08); // D6
        osc.frequency.exponentialRampToValueAtTime(880, now + offset + 0.15);

        gain.gain.setValueAtTime(0.25, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, now + offset + 0.16);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + offset);
        osc.stop(now + offset + 0.17);
      });
    } else if (severity === "WARNING") {
      // 2 gentle attention chime tones
      const tones = [
        { freq: 587.33, time: 0 },    // D5
        { freq: 783.99, time: 0.16 }, // G5
        { freq: 880.00, time: 0.32 }, // A5
      ];
      tones.forEach(({ freq, time }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0.22, now + time);
        gain.gain.exponentialRampToValueAtTime(0.005, now + time + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + 0.3);
      });
    } else {
      // Soft ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, now);
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.005, now + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + 0.26);
    }
  } catch (err) {
    console.warn("Audio playback error:", err);
  }
}

// -------------------------------------------------------------
// Web Speech API: Tells the alert with spoken audio
// -------------------------------------------------------------
export function speakAlertVoice(alert, farmerName = null) {
  if (!isVoiceEnabled() && !farmerName) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel(); // Stop any pending speech

    const contact = getFarmerContact();
    const name = farmerName || contact.name || "Farmer";

    let text = `Attention ${name}. Smart Farm ${alert.severity === "CRITICAL" ? "Critical Alert" : "Warning"}: ${alert.title}. ${alert.reason}.`;
    if (alert.recommendation) {
      text += ` Action required: ${alert.recommendation}.`;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = 0.96;
    utterance.pitch = 1.02;
    utterance.volume = 1.0;

    // Pick a natural English voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(
      (v) => (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha")) && v.lang.startsWith("en")
    ) || voices.find((v) => v.lang.startsWith("en"));
    if (naturalVoice) {
      utterance.voice = naturalVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis error:", err);
  }
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {}
  }
}

// -------------------------------------------------------------
// Desktop / Browser Native Push Notifications
// -------------------------------------------------------------
export function requestNotificationPermission() {
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      Notification.requestPermission();
    }
  }
}

export function sendDesktopNotification(alert) {
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notif = new Notification(`?? SmartFarm ${alert.severity}: ${alert.title}`, {
      body: `${alert.reason}\nAction: ${alert.recommendation || "Check telemetry immediately."}`,
      icon: "/smartfarm-icon.svg",
      tag: alert.id || alert.title,
    });
    notif.onclick = () => {
      window.focus();
    };
  } catch {}
}

// -------------------------------------------------------------
// Farmer Dispatch Hotline Links: Call, WhatsApp, SMS
// -------------------------------------------------------------
export function formatPhoneNumber(phone) {
  return String(phone || "").replace(/[^\d+]/g, "");
}

export function getDialLink(phone) {
  const clean = formatPhoneNumber(phone);
  return `tel:${clean}`;
}

export function buildPersonalizedAlertText(alert, farmerName = null) {
  const contact = getFarmerContact();
  const name = farmerName || contact.name || "Farmer";
  const nowStr = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  return [
    `?? *SMARTFARM AGRO-ALERT* ??`,
    `To: ${name}`,
    `Time: ${nowStr}`,
    `Alert: ${alert.title}`,
    `Severity: ${alert.severity}`,
    `Reason: ${alert.reason}`,
    alert.reading ? `Reading: ${alert.reading}` : null,
    alert.recommendation ? `Action Required: ${alert.recommendation}` : null,
    `Dashboard: https://adaptive-smartfarm.netlify.app/`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getWhatsAppLink(alert, phone = null) {
  const contact = getFarmerContact();
  const targetPhone = formatPhoneNumber(phone || contact.phone).replace(/\+/g, "");
  const text = buildPersonalizedAlertText(alert, contact.name);
  return `https://wa.me/${targetPhone}?text=${encodeURIComponent(text)}`;
}

export function getSmsLink(alert, phone = null) {
  const contact = getFarmerContact();
  const targetPhone = formatPhoneNumber(phone || contact.phone);
  const text = buildPersonalizedAlertText(alert, contact.name);
  return `sms:${targetPhone}?body=${encodeURIComponent(text)}`;
}
