import React, { useState, useEffect } from "react";
import QRCode from "qrcode";
import {
  Activity,
  Leaf,
  BarChart3,
  Bell,
  Sun,
  Moon,
  Download,
  Phone,
  FileDown,
  X,
  Smartphone,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  Laptop,
  HelpCircle,
} from "lucide-react";
import { getDialLink, triggerHapticFeedback, isNativeMobile } from "./alertNotificationService";

/**
 * Mobile Top Bar:
 * Displays SmartFarm brand, Live pulse badge, Phone hotline, Theme toggle, and Notifications
 */
export function MobileTopBar({
  activePage,
  setActivePage,
  hardwareStatus,
  theme,
  toggleTheme,
  farmerContact,
  activeAlertsCount,
  onOpenNotifications,
  onOpenPdfModal,
  onTriggerInstall,
}) {
  const isLive = hardwareStatus === "LIVE";
  const isStale = hardwareStatus === "STALE";

  return (
    <header className="mobile-topbar" role="banner">
      <div className="mobile-topbar-left">
        <div className="mobile-brand" onClick={() => setActivePage("live")}>
          <div className="mobile-brand-icon">
            <Leaf size={16} />
          </div>
          <div>
            <div className="mobile-brand-title">SMARTFARM</div>
            <div className="mobile-brand-status">
              <span
                className="mobile-status-dot"
                style={{
                  background: isLive ? "#62c87b" : isStale ? "#d4a84b" : "#777",
                  boxShadow: isLive ? "0 0 8px rgba(98, 200, 123, 0.7)" : "none",
                }}
              />
              <span className="mobile-status-text">
                {isLive ? "LIVE IoT" : isStale ? "STALE" : "OFFLINE"}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="mobile-topbar-actions">
        {/* Install Button — Always visible if not already a native app */}
        {!isNativeMobile() && (
          <button
            className="mobile-icon-btn install-pill-btn"
            onClick={onTriggerInstall}
            title="Install SmartFarm App"
          >
            <Download size={14} />
            <span>Install</span>
          </button>
        )}

        {/* Farmer Emergency Call Button */}
        {farmerContact?.phone && (
          <a
            href={getDialLink(farmerContact.phone)}
            className="mobile-icon-btn call-hotline-btn"
            title={`Call Farmer: ${farmerContact.phone}`}
            onClick={() => triggerHapticFeedback("WARNING")}
          >
            <Phone size={14} />
          </a>
        )}

        {/* PDF Export Button */}
        <button
          className="mobile-icon-btn"
          onClick={onOpenPdfModal}
          title="PDF Report"
        >
          <FileDown size={14} />
        </button>

        {/* Theme Toggle Button */}
        <button
          className="mobile-icon-btn"
          onClick={toggleTheme}
          title={`Switch to ${theme === "dark" ? "Light" : "Dark"} Mode`}
        >
          {theme === "dark" ? <Sun size={15} /> : <Moon size={15} />}
        </button>

        {/* Notification Drawer Toggle */}
        <button
          className="mobile-icon-btn notification-bell-btn"
          onClick={onOpenNotifications}
          title="Notifications History"
        >
          <Bell size={15} />
          {activeAlertsCount > 0 && (
            <span className="mobile-bell-badge">{activeAlertsCount}</span>
          )}
        </button>
      </div>
    </header>
  );
}

/**
 * Mobile Bottom Navigation:
 * Ergonomic thumb-friendly navigation bar fixed to screen bottom
 */
export function MobileBottomNav({ activePage, setActivePage, activeAlertsCount }) {
  const tabs = [
    { id: "live", label: "Live", icon: Activity },
    { id: "field", label: "Field", icon: Leaf },
    { id: "analysis", label: "Analysis", icon: BarChart3 },
    {
      id: "alerts",
      label: "Alerts",
      icon: Bell,
      badge: activeAlertsCount > 0 ? activeAlertsCount : null,
    },
  ];

  const handleTabClick = (tabId) => {
    triggerHapticFeedback("INFO");
    setActivePage(tabId);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <nav className="mobile-bottom-nav" aria-label="Mobile Navigation">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const isActive = activePage === tab.id;

        return (
          <button
            key={tab.id}
            id={`mobile-nav-${tab.id}`}
            className={`mobile-nav-tab ${isActive ? "active" : ""}`}
            onClick={() => handleTabClick(tab.id)}
            aria-selected={isActive}
            role="tab"
          >
            <div className="mobile-tab-icon-wrapper">
              <Icon size={20} className="mobile-tab-icon" />
              {tab.badge && (
                <span className="mobile-tab-badge pulse-badge">{tab.badge}</span>
              )}
            </div>
            <span className="mobile-tab-label">{tab.label}</span>
            {isActive && <div className="mobile-tab-active-indicator" />}
          </button>
        );
      })}
    </nav>
  );
}

/**
 * PWA Install Prompt Banner:
 * Listens for `beforeinstallprompt` event or opens the install guide modal
 */
export function InstallAppPrompt({ onOpenModal }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem("smartfarm_install_dismissed") === "true";
    } catch {
      return false;
    }
  });

  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    const isRunningStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true ||
      isNativeMobile();
    setIsStandalone(isRunningStandalone);
  }, []);

  if (isStandalone || dismissed) {
    return null;
  }

  const handleDismiss = (e) => {
    e.stopPropagation();
    setDismissed(true);
    try {
      localStorage.setItem("smartfarm_install_dismissed", "true");
    } catch {}
  };

  return (
    <div className="mobile-install-banner" onClick={onOpenModal}>
      <div className="install-banner-content">
        <div className="install-banner-icon">
          <Smartphone size={22} />
        </div>
        <div className="install-banner-text">
          <div className="install-banner-title">Install SmartFarm App</div>
          <div className="install-banner-sub">
            Add to home screen for instant alerts &amp; fullscreen monitoring
          </div>
        </div>
      </div>

      <div className="install-banner-actions">
        <button
          className="install-confirm-btn"
          onClick={(e) => {
            e.stopPropagation();
            onOpenModal();
          }}
        >
          Install App
        </button>
        <button
          className="install-close-btn"
          onClick={handleDismiss}
          title="Dismiss"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}

/**
 * Comprehensive Install App Modal:
 * Direct 1-click install button + Phone QR Code + Step-by-step instructions for Android, iOS & Desktop
 */
export function InstallAppModal({ isOpen, onClose, installPromptEvent, onInstalled }) {
  const [activeTab, setActiveTab] = useState("qr");
  const [qrCodeUrl, setQrCodeUrl] = useState("");
  const [copied, setCopied] = useState(false);

  // Fallback IP and live Netlify URL
  const localUrl = "http://10.172.100.230:5173";
  const targetUrl = typeof window !== "undefined" && window.location.hostname !== "localhost"
    ? window.location.href
    : localUrl;

  useEffect(() => {
    if (isOpen) {
      QRCode.toDataURL(targetUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: "#0b1610",
          light: "#ffffff",
        },
      })
        .then((url) => setQrCodeUrl(url))
        .catch((err) => console.warn("QR code generation error:", err));
    }
  }, [isOpen, targetUrl]);

  if (!isOpen) return null;

  const handleTriggerNativePrompt = async () => {
    if (installPromptEvent) {
      try {
        installPromptEvent.prompt();
        const choice = await installPromptEvent.userChoice;
        if (choice.outcome === "accepted") {
          onInstalled && onInstalled();
          onClose();
        }
      } catch (err) {
        console.warn("Prompt error:", err);
      }
    } else {
      setActiveTab("android");
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(targetUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="install-modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="install-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="install-modal-header">
          <div className="install-modal-header-left">
            <div className="install-modal-icon">
              <Smartphone size={24} />
            </div>
            <div>
              <h2 className="install-modal-title">Install SmartFarm App</h2>
              <div className="install-modal-subtitle">
                Install on your phone or computer for instant push alerts
              </div>
            </div>
          </div>
          <button className="install-modal-close" onClick={onClose} title="Close">
            <X size={18} />
          </button>
        </div>

        {/* 1-Click Native Install Prompt if available in current browser */}
        {installPromptEvent && (
          <div className="install-quick-action-box">
            <button className="install-quick-btn" onClick={handleTriggerNativePrompt}>
              <Download size={18} />
              <span>Install Directly On This Device</span>
            </button>
          </div>
        )}

        {/* Instruction Tabs */}
        <div className="install-tabs-nav">
          <button
            className={`install-tab-btn ${activeTab === "qr" ? "active" : ""}`}
            onClick={() => setActiveTab("qr")}
          >
            <Smartphone size={14} />
            <span>Scan to Phone</span>
          </button>
          <button
            className={`install-tab-btn ${activeTab === "android" ? "active" : ""}`}
            onClick={() => setActiveTab("android")}
          >
            <span>🤖 Android</span>
          </button>
          <button
            className={`install-tab-btn ${activeTab === "ios" ? "active" : ""}`}
            onClick={() => setActiveTab("ios")}
          >
            <span>🍎 iPhone / iPad</span>
          </button>
          <button
            className={`install-tab-btn ${activeTab === "desktop" ? "active" : ""}`}
            onClick={() => setActiveTab("desktop")}
          >
            <Laptop size={14} />
            <span>PC / Mac</span>
          </button>
        </div>

        {/* Tab 1: QR Code Scanner for Mobile */}
        {activeTab === "qr" && (
          <div className="install-tab-pane qr-pane">
            <div className="qr-wrapper">
              {qrCodeUrl ? (
                <img src={qrCodeUrl} alt="SmartFarm QR Code" className="qr-image" />
              ) : (
                <div className="qr-placeholder">Generating QR...</div>
              )}
            </div>
            <div className="qr-instructions">
              <strong>Scan with your phone's camera</strong> to open SmartFarm directly on your mobile device.
            </div>

            <div className="install-link-row">
              <input
                type="text"
                readOnly
                value={targetUrl}
                className="install-link-input"
              />
              <button className="install-copy-btn" onClick={handleCopyLink}>
                {copied ? <Check size={14} /> : <Copy size={14} />}
                <span>{copied ? "Copied!" : "Copy"}</span>
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Android Instructions */}
        {activeTab === "android" && (
          <div className="install-tab-pane">
            <div className="install-step">
              <span className="step-num">1</span>
              <div>
                Open <strong>Chrome</strong> on your Android phone and navigate to:
                <div className="code-pill">{targetUrl}</div>
              </div>
            </div>
            <div className="install-step">
              <span className="step-num">2</span>
              <div>
                Tap the <strong>three dots (⋮)</strong> in the top-right corner of Chrome.
              </div>
            </div>
            <div className="install-step">
              <span className="step-num">3</span>
              <div>
                Tap <strong>"Install app"</strong> or <strong>"Add to Home screen"</strong>.
              </div>
            </div>
            <div className="install-step">
              <span className="step-num">4</span>
              <div>
                Tap <strong>"Install"</strong>. SmartFarm will now appear as an app icon on your phone!
              </div>
            </div>
          </div>
        )}

        {/* Tab 3: iPhone Instructions */}
        {activeTab === "ios" && (
          <div className="install-tab-pane">
            <div className="install-step">
              <span className="step-num">1</span>
              <div>
                Open <strong>Safari</strong> on your iPhone or iPad and navigate to:
                <div className="code-pill">{targetUrl}</div>
              </div>
            </div>
            <div className="install-step">
              <span className="step-num">2</span>
              <div>
                Tap the <strong>Share button</strong> (the square with an arrow pointing up) at the bottom.
              </div>
            </div>
            <div className="install-step">
              <span className="step-num">3</span>
              <div>
                Scroll down and tap <strong>"Add to Home Screen"</strong>.
              </div>
            </div>
            <div className="install-step">
              <span className="step-num">4</span>
              <div>
                Tap <strong>"Add"</strong> in the top-right corner.
              </div>
            </div>
          </div>
        )}

        {/* Tab 4: Desktop PC / Mac */}
        {activeTab === "desktop" && (
          <div className="install-tab-pane">
            <div className="install-step">
              <span className="step-num">1</span>
              <div>
                Look at the <strong>right side of your browser address bar</strong> (URL bar at top).
              </div>
            </div>
            <div className="install-step">
              <span className="step-num">2</span>
              <div>
                Click the <strong>Install SmartFarm icon</strong> (a small monitor with a down arrow, or ⊕).
              </div>
            </div>
            <div className="install-step">
              <span className="step-num">3</span>
              <div>
                Click <strong>"Install"</strong> to launch SmartFarm as a desktop app in its own dedicated window!
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="install-modal-footer">
          <div className="install-footer-note">
            💡 Installed app works offline and delivers attention-grabbing emergency alerts.
          </div>
          <button className="install-modal-done-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
