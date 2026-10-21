/**
 * SmartFarm Agro-Alert Sound, Speech & Farmer Dispatch Service
 * Provides:
 * 1. Web Audio API synthesized alert chimes (urgent siren for CRITICAL, chime for WARNING).
 * 2. Web Speech API personalized voice alert ("tells the alert with sound").
 * 3. Farmer contact management (persisted in localStorage).
 * 4. Direct phone dialing (tel:), WhatsApp pre-filled alerts, and SMS dispatch.
 * 5. Browser desktop push notifications (Notification API).
 */
import { Capacitor } from "@capacitor/core";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Haptics, NotificationType } from "@capacitor/haptics";
import { StatusBar, Style } from "@capacitor/status-bar";

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
// Web Audio API Synthesizer & Auto-Unlock (Zero mp3 dependencies)
// -------------------------------------------------------------
let audioCtx = null;
let pendingAlertSeverity = null;

function getAudioContext() {
  if (typeof window === "undefined") return null;
  const AudioCtxClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtxClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioCtxClass();
  }
  return audioCtx;
}

/**
 * Fallback synthesizer using synthesized PCM WAV data URI in an HTML5 Audio element.
 * Guarantees audible alert even if the Web Audio oscillator nodes are blocked.
 */
function playFallbackBeep(severity = "CRITICAL") {
  if (typeof window === "undefined" || !isSoundEnabled()) return;
  try {
    const sampleRate = 8000;
    const isCritical = severity === "CRITICAL";
    const duration = isCritical ? 0.35 : 0.22;
    const numSamples = Math.floor(sampleRate * duration);
    const freq = isCritical ? 920 : 640;
    const buffer = new Uint8Array(44 + numSamples);

    const writeString = (offset, str) => {
      for (let i = 0; i < str.length; i++) buffer[offset + i] = str.charCodeAt(i);
    };

    writeString(0, "RIFF");
    const dataSize = numSamples;
    const fileSize = 36 + dataSize;
    buffer[4] = fileSize & 0xff;
    buffer[5] = (fileSize >> 8) & 0xff;
    buffer[6] = (fileSize >> 16) & 0xff;
    buffer[7] = (fileSize >> 24) & 0xff;
    writeString(8, "WAVE");
    writeString(12, "fmt ");
    buffer[16] = 16;
    buffer[20] = 1;
    buffer[22] = 1;
    buffer[24] = sampleRate & 0xff;
    buffer[25] = (sampleRate >> 8) & 0xff;
    buffer[28] = sampleRate & 0xff;
    buffer[29] = (sampleRate >> 8) & 0xff;
    buffer[32] = 1;
    buffer[34] = 8;
    writeString(36, "data");
    buffer[40] = dataSize & 0xff;
    buffer[41] = (dataSize >> 8) & 0xff;

    for (let i = 0; i < numSamples; i++) {
      const t = i / sampleRate;
      const sample = Math.sin(2 * Math.PI * freq * t);
      buffer[44 + i] = Math.floor((sample + 1) * 127.5);
    }

    let binary = "";
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    const audio = new Audio("data:audio/wav;base64," + btoa(binary));
    audio.volume = isCritical ? 0.8 : 0.5;
    audio.play().catch(() => {});
  } catch (err) {
    console.debug("[Audio] Fallback beep error:", err);
  }
}

/**
 * Resumes AudioContext and Web Speech synthesis on user gesture.
 * Plays any pending alert sound that was blocked by autoplay policies.
 */
export function unlockAudio() {
  if (typeof window === "undefined") return;
  try {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().then(() => {
        if (pendingAlertSeverity && isSoundEnabled()) {
          const sev = pendingAlertSeverity;
          pendingAlertSeverity = null;
          playAlertSound(sev);
        }
      }).catch(() => {});
    } else if (ctx && ctx.state === "running" && pendingAlertSeverity && isSoundEnabled()) {
      const sev = pendingAlertSeverity;
      pendingAlertSeverity = null;
      playAlertSound(sev);
    }

    if ("speechSynthesis" in window && window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }
  } catch {}
}

// Auto-register user interaction listeners to satisfy browser Autoplay Policy
if (typeof window !== "undefined") {
  const unlockEvents = ["click", "touchstart", "touchend", "pointerdown", "keydown"];
  const handleFirstInteraction = () => {
    unlockAudio();
    // Also ask for Notification permission on legitimate user click if not determined yet
    if ("Notification" in window && Notification.permission === "default") {
      try {
        Notification.requestPermission().catch(() => {});
      } catch {}
    }
  };
  unlockEvents.forEach((evt) => {
    window.addEventListener(evt, handleFirstInteraction, { passive: true });
  });
}

/**
 * Plays an alert chime based on severity:
 * - CRITICAL: High-attention 3-pulse emergency siren (880Hz -> 1320Hz -> 880Hz).
 * - WARNING: Friendly triple-chord attention chime (587Hz -> 784Hz -> 880Hz).
 * - INFO / TEST: Gentle confirmation ping.
 */
export async function playAlertSound(severity = "CRITICAL") {
  if (!isSoundEnabled()) return;

  try {
    const ctx = getAudioContext();
    if (!ctx) {
      playFallbackBeep(severity);
      return;
    }

    if (ctx.state === "suspended") {
      try {
        await ctx.resume();
      } catch {
        pendingAlertSeverity = severity;
      }
    }

    if (ctx.state !== "running") {
      pendingAlertSeverity = severity;
      playFallbackBeep(severity);
      return;
    }

    const now = ctx.currentTime;
    const baseTime = now + 0.05; // 50ms buffer prevents scheduling in the past

    if (severity === "CRITICAL") {
      // 3 rapid emergency alert siren pulses with frequency sweeps
      const pulses = [0, 0.22, 0.44];
      pulses.forEach((offset) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(880, baseTime + offset); // A5
        osc.frequency.exponentialRampToValueAtTime(1318.5, baseTime + offset + 0.1); // E6
        osc.frequency.exponentialRampToValueAtTime(783.99, baseTime + offset + 0.19); // G5

        gain.gain.setValueAtTime(0.38, baseTime + offset);
        gain.gain.exponentialRampToValueAtTime(0.01, baseTime + offset + 0.2);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(baseTime + offset);
        osc.stop(baseTime + offset + 0.21);
      });
    } else if (severity === "WARNING") {
      // 3 warm attention chime tones
      const tones = [
        { freq: 587.33, time: 0 },    // D5
        { freq: 783.99, time: 0.16 }, // G5
        { freq: 880.00, time: 0.32 }, // A5
      ];
      tones.forEach(({ freq, time }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, baseTime + time);

        gain.gain.setValueAtTime(0.3, baseTime + time);
        gain.gain.exponentialRampToValueAtTime(0.005, baseTime + time + 0.28);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(baseTime + time);
        osc.stop(baseTime + time + 0.3);
      });
    } else {
      // Soft ping
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(659.25, baseTime);
      gain.gain.setValueAtTime(0.22, baseTime);
      gain.gain.exponentialRampToValueAtTime(0.005, baseTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(baseTime);
      osc.stop(baseTime + 0.26);
    }
  } catch (err) {
    console.warn("Audio playback error, trying fallback beep:", err);
    playFallbackBeep(severity);
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
    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
    }

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
// Native Mobile (Capacitor) & Browser Push Notifications
export const isNativeMobile = () => Capacitor.isNativePlatform();

/**
 * Initializes native mobile channels and status bar styling on Android / iOS
 */
export async function initNativeMobileFeatures() {
  if (!isNativeMobile()) return;

  try {
    // Style status bar
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: "#0b0f0d" });
  } catch (err) {
    console.debug("[Mobile] StatusBar init:", err);
  }

  try {
    // Create Android High-Priority Notification Channels
    await LocalNotifications.createChannel({
      id: "smartfarm_critical",
      name: "🚨 Critical Farm Alerts",
      description: "Emergency alarms for extreme environmental & sensor conditions",
      importance: 5, // MAX importance (heads-up notification & sound)
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: "#EF4444",
      sound: undefined
    });

    await LocalNotifications.createChannel({
      id: "smartfarm_warning",
      name: "⚠️ Farm Warnings",
      description: "Warning alerts for abnormal moisture, temperature or nutrient levels",
      importance: 4,
      visibility: 1,
      vibration: true,
      lights: true,
      lightColor: "#F59E0B"
    });
  } catch (err) {
    console.debug("[Mobile] Channel creation:", err);
  }
}

/**
 * Native + Web Haptic Feedback / Device Vibration
 */
export async function triggerHapticFeedback(severity = "CRITICAL") {
  const isCrit = severity === "CRITICAL";

  // Native mobile device
  if (isNativeMobile()) {
    try {
      if (isCrit) {
        await Haptics.vibrate({ duration: 600 });
        await Haptics.notification({ type: NotificationType.Error });
      } else {
        await Haptics.notification({ type: NotificationType.Warning });
      }
      return;
    } catch {}
  }

  // Web / PWA vibration API fallback
  if (typeof navigator !== "undefined" && "vibrate" in navigator) {
    try {
      if (isCrit) {
        navigator.vibrate([300, 100, 300, 100, 500]);
      } else {
        navigator.vibrate([200, 100, 200]);
      }
    } catch {}
  }
}

export async function requestNotificationPermission() {
  // If running as native Android/iOS mobile app
  if (isNativeMobile()) {
    try {
      const res = await LocalNotifications.requestPermissions();
      console.log("[Mobile] Native notification permission:", res.display);
      return;
    } catch (err) {
      console.warn("[Mobile] Native permission request failed:", err);
    }
  }

  // Web / PWA browser notification permission
  if (typeof window !== "undefined" && "Notification" in window) {
    if (Notification.permission === "default") {
      try {
        await Notification.requestPermission();
      } catch {}
    }
  }
}

export async function sendDesktopNotification(alert) {
  const isCritical = alert.severity === "CRITICAL";
  const isWarning  = alert.severity === "WARNING";
  const emoji = isCritical ? "🚨" : isWarning ? "⚠️" : "ℹ️";
  const tag   = alert.id || alert.title;

  // Trigger device haptics / vibration immediately
  triggerHapticFeedback(alert.severity);

  // 1. Native Mobile Platform (Capacitor Android / iOS)
  if (isNativeMobile()) {
    try {
      const notifId = Math.floor(Math.random() * 1000000);
      await LocalNotifications.schedule({
        notifications: [
          {
            id: notifId,
            title: `${emoji} SmartFarm ${alert.severity}: ${alert.title}`,
            body: `${alert.reason}\nAction: ${alert.recommendation || "Inspect farm zone"}`,
            channelId: isCritical ? "smartfarm_critical" : "smartfarm_warning",
            schedule: { at: new Date(Date.now() + 100) },
            extra: { alertId: alert.id, severity: alert.severity }
          }
        ]
      });
      return;
    } catch (err) {
      console.warn("[Mobile] Native notification schedule failed:", err);
    }
  }

  // 2. Web / PWA Browser Push Notification
  if (typeof window === "undefined" || !("Notification" in window)) return;
  if (Notification.permission !== "granted") return;

  try {
    const notifOptions = {
      body: `${alert.reason}\n\n⚡ Action: ${alert.recommendation || "Check telemetry immediately."}`,
      icon: "/icon-192.png",
      badge: "/smartfarm-icon.svg",
      tag,
      // CRITICAL alerts persist until the farmer manually dismisses them
      requireInteraction: isCritical,
      // Vibration pattern: urgent for CRITICAL, gentle for WARNING
      vibrate: isCritical ? [300, 100, 300, 100, 600] : isWarning ? [200, 100, 200] : [100],
      silent: !isCritical && !isWarning,
      data: { alertId: alert.id, severity: alert.severity, url: window.location.href },
    };

    // ServiceWorker notification (required on Android Chrome / PWA)
    if ("serviceWorker" in navigator) {
      try {
        const reg = await navigator.serviceWorker.ready;
        if (reg && reg.showNotification) {
          await reg.showNotification(`${emoji} SmartFarm ${alert.severity}: ${alert.title}`, notifOptions);
          return;
        }
      } catch (err) {
        console.debug("[SW] showNotification fallback:", err);
      }
    }

    // Fallback to desktop Notification constructor
    const notif = new Notification(`${emoji} SmartFarm ${alert.severity}: ${alert.title}`, notifOptions);

    notif.onclick = () => {
      window.focus();
      notif.close();
    };

    // Auto-close non-critical after 12 seconds
    if (!isCritical) {
      setTimeout(() => notif.close(), 12000);
    }
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

// -------------------------------------------------------------
// Farmer Alert Acknowledgment & 5-Minute Snooze Engine
// -------------------------------------------------------------
export const SNOOZE_DURATION_MS = 5 * 60 * 1000; // 5 minutes
const ACK_STORAGE_KEY = "smartfarm_acknowledged_alerts";

export function getAlertKey(alertOrKey) {
  if (!alertOrKey) return "";
  if (typeof alertOrKey === "string") return alertOrKey;
  return alertOrKey.id || `${alertOrKey.title}_${alertOrKey.severity}`;
}

export function getAcknowledgedAlerts() {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(ACK_STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return {};
}

export function saveAcknowledgedAlerts(map) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(ACK_STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

export function acknowledgeAlert(alertOrKey) {
  const alertKey = getAlertKey(alertOrKey);
  if (!alertKey) return getAcknowledgedAlerts();
  const map = getAcknowledgedAlerts();
  map[alertKey] = Date.now();
  saveAcknowledgedAlerts(map);
  return map;
}

export function unacknowledgeAlert(alertOrKey) {
  const alertKey = getAlertKey(alertOrKey);
  if (!alertKey) return getAcknowledgedAlerts();
  const map = getAcknowledgedAlerts();
  if (alertKey in map) {
    delete map[alertKey];
    saveAcknowledgedAlerts(map);
  }
  return map;
}

export function isAlertAcknowledged(alertOrKey) {
  const alertKey = getAlertKey(alertOrKey);
  if (!alertKey) return false;
  const map = getAcknowledgedAlerts();
  const ackTime = map[alertKey];
  if (!ackTime) return false;
  const elapsed = Date.now() - ackTime;
  if (elapsed < SNOOZE_DURATION_MS) {
    return true; // Acknowledged and still within 5-minute snooze
  }
  // 5 minutes have elapsed without resolution -> snooze expires, trigger next alert
  delete map[alertKey];
  saveAcknowledgedAlerts(map);
  return false;
}

export function getAlertRemainingSnoozeSeconds(alertOrKey) {
  const alertKey = getAlertKey(alertOrKey);
  if (!alertKey) return 0;
  const map = getAcknowledgedAlerts();
  const ackTime = map[alertKey];
  if (!ackTime) return 0;
  const elapsed = Date.now() - ackTime;
  const remaining = SNOOZE_DURATION_MS - elapsed;
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
}

