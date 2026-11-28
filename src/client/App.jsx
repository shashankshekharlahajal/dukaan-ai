
import { useEffect, useRef, useState } from "react";
import "./styles/main.css";
import { createSpeechRecognition } from "./services/speechRecognition.js";
import {
  understandShopkeeperCommand,
  confirmTransaction
} from "./services/api.js";

function createRequestId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `dukaan-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function fetchApi(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  const result = await response.json();

  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Request complete nahi ho paayi.");
  }

  return result;
}

function formatDate(date) {
  if (!date) return "";

  const parsed = new Date(date.replace(" ", "T") + "Z");

  if (Number.isNaN(parsed.getTime())) return date;

  return parsed.toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString("en-IN");
}

export default function App() {
  const recognitionRef = useRef(null);

  // Authentication
  const [authStatus, setAuthStatus] = useState("checking");
  const [authMode, setAuthMode] = useState("login");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [user, setUser] = useState(null);

  // Navigation
  const [menuOpen, setMenuOpen] = useState(false);
  const [view, setView] = useState("home");

  // Voice assistant
  const [phase, setPhase] = useState("ready");
  const [commandText, setCommandText] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [commandResult, setCommandResult] = useState(null);
  const [transactionResult, setTransactionResult] = useState(null);
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Old customer ledger (preserved)
  const [customers, setCustomers] = useState([]);
  const [selectedLedger, setSelectedLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  // Connections
  const [connections, setConnections] = useState([]);
  const [connectionEmail, setConnectionEmail] = useState("");
  const [connectionLoading, setConnectionLoading] = useState(false);
  const [connectionActionId, setConnectionActionId] = useState("");
  const [connectionError, setConnectionError] = useState("");
  const [connectionMessage, setConnectionMessage] = useState("");

  // Check existing login session.
  useEffect(() => {
    async function checkSession() {
      try {
        const result = await fetchApi("/api/auth/me");

        if (result.user) {
          setUser(result.user);
          setAuthStatus("user");
          setView("home");
        } else {
          setAuthStatus("choice");
        }
      } catch {
        setUser(null);
        setAuthStatus("choice");
      }
    }

    checkSession();
  }, []);

  // Load connections whenever the Connections page is opened.
  useEffect(() => {
    if (view === "connections" && authStatus === "user") {
      loadConnections();
    }
  }, [view, authStatus]);

  function speak(message) {
    if (!message || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "hi-IN";
    utterance.rate = 0.95;

    window.speechSynthesis.speak(utterance);
  }

  // Authentication
  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError("");

    if (!authEmail.trim() || !authPassword) {
      setAuthError("Email aur password enter karein.");
      return;
    }

    if (authMode === "signup") {
      if (authPassword !== confirmPassword) {
        setAuthError("Dono passwords match nahi karte.");
        return;
      }

      if (authPassword.length < 8) {
        setAuthError("Password kam se kam 8 characters ka hona chahiye.");
        return;
      }
    }

    setAuthLoading(true);

    try {
      const result = await fetchApi(`/api/auth/${authMode}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword
        })
      });

      setUser(result.user);
      setAuthStatus("user");
      setAuthPassword("");
      setConfirmPassword("");
      setAuthError("");
      setView("home");
      setPhase("ready");
      setMenuOpen(false);
    } catch (err) {
      setAuthError(err.message || "Authentication nahi ho paaya.");
    } finally {
      setAuthLoading(false);
    }
  }

  function continueAsGuest() {
    setUser(null);
    setAuthStatus("guest");
    setView("assistant");
    setPhase("ready");
    setAuthError("");
    setMenuOpen(false);
  }

  function openAuth(mode) {
    setAuthMode(mode);
    setAuthEmail("");
    setAuthPassword("");
    setConfirmPassword("");
    setAuthError("");
    setAuthStatus("form");
    setMenuOpen(false);
  }

  async function handleLogout() {
    recognitionRef.current?.abort();

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin"
      });
    } catch (err) {
      console.error("LOGOUT ERROR:", err);
    }

    setUser(null);
    setAuthStatus("choice");
    setView("assistant");
    setPhase("ready");
    setMenuOpen(false);

    setCommandText("");
    setCorrectionText("");
    setCommandResult(null);
    setTransactionResult(null);
    setRequestId("");
    setCustomers([]);
    setSelectedLedger(null);
    setConnections([]);
    setConnectionEmail("");
    setConnectionError("");
    setConnectionMessage("");
    setError("");
  }

  // Navigation
  function navigateTo(page) {
    recognitionRef.current?.abort();

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setView(page);
    setMenuOpen(false);
    setLedgerError("");
    setConnectionError("");
    setConnectionMessage("");
  }

  // Old customer ledger
  async function loadCustomers() {
    setLedgerLoading(true);
    setLedgerError("");
    setSelectedLedger(null);

    try {
      const result = await fetchApi("/api/customers");
      setCustomers(result.customers || []);
    } catch (err) {
      setLedgerError(err.message || "Customers load nahi ho paaye.");
    } finally {
      setLedgerLoading(false);
    }
  }

  async function openLedger(customerId) {
    setLedgerLoading(true);
    setLedgerError("");
    setSelectedLedger(null);

    try {
      const result = await fetchApi(
        `/api/customers/${encodeURIComponent(customerId)}/ledger`
      );

      setSelectedLedger(result);
    } catch (err) {
      setLedgerError(err.message || "Customer ledger load nahi ho paaya.");
    } finally {
      setLedgerLoading(false);
    }
  }

  function openOldKhata() {
    navigateTo("customers");
    setCustomerSearch("");
    loadCustomers();
  }

  function backToCustomers() {
    setSelectedLedger(null);
    setLedgerError("");
    loadCustomers();
  }

  // Connections
  async function loadConnections() {
    setConnectionLoading(true);
    setConnectionError("");

    try {
      const result = await fetchApi("/api/connections");
      setConnections(result.connections || []);
    } catch (err) {
      setConnectionError(err.message || "Connections load nahi ho paaye.");
    } finally {
      setConnectionLoading(false);
    }
  }

  async function sendConnectionRequest(event) {
    event.preventDefault();

    const email = connectionEmail.trim();

    if (!email) {
      setConnectionError("Doosre user ka registered email enter karein.");
      return;
    }

    setConnectionLoading(true);
    setConnectionError("");
    setConnectionMessage("");

    try {
      const result = await fetchApi("/api/connections/request", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ email })
      });

      setConnectionMessage(
        result.message || "Connection request send ho gayi."
      );
      setConnectionEmail("");
      await loadConnections();
    } catch (err) {
      setConnectionError(err.message || "Request send nahi ho paayi.");
    } finally {
      setConnectionLoading(false);
    }
  }

  async function respondToConnection(connectionId, decision) {
    setConnectionActionId(connectionId);
    setConnectionError("");
    setConnectionMessage("");

    try {
      const result = await fetchApi(
        `/api/connections/${encodeURIComponent(connectionId)}/respond`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify({ decision })
        }
      );

      setConnectionMessage(
        result.message ||
        (decision === "accepted"
          ? "Connection accept ho gaya."
          : "Connection reject ho gaya.")
      );

      await loadConnections();
    } catch (err) {
      setConnectionError(err.message || "Request update nahi ho paayi.");
    } finally {
      setConnectionActionId("");
    }
  }

  // Voice assistant
  async function processCommand(text) {
    if (!text.trim()) {
      setError("Pehle apna command boliye ya likhiye.");
      setPhase("ready");
      return;
    }

    setIsProcessing(true);
    setError("");
    setPhase("thinking");
    setCommandResult(null);
    setTransactionResult(null);
    setRequestId("");

    try {
      const result = await understandShopkeeperCommand(text);

      setCommandResult(result);
      setRequestId(
        result.status === "ready_for_review"
          ? createRequestId()
          : ""
      );
      setPhase("review");

      speak(
        result.message ||
        result.understanding ||
        result.clarification ||
        "Maine aapki baat samajh li hai."
      );
    } catch (err) {
      setError(err.message || "AI se connect nahi ho paaya.");
      setPhase("ready");
    } finally {
      setIsProcessing(false);
    }
  }

  async function processCorrection(text) {
    if (!text.trim()) {
      setError("Kripya apni correction batayein.");
      setPhase("review");
      return;
    }

    const correctedCommand = `
The user originally said:
${commandText}

The user now corrects the information:
${text}

Understand the complete command again.
Apply the correction to the original command.
Do not keep information that the user has corrected.
Do not invent missing information.
Return the same required JSON structure.
`;

    setIsProcessing(true);
    setError("");
    setPhase("thinking");
    setRequestId("");

    try {
      const result = await understandShopkeeperCommand(correctedCommand);

      setCommandResult(result);
      setCorrectionText("");
      setRequestId(
        result.status === "ready_for_review"
          ? createRequestId()
          : ""
      );
      setPhase("review");

      speak(
        result.message ||
        result.understanding ||
        result.clarification ||
        "Maine aapki correction samajh li hai."
      );
    } catch (err) {
      setError(err.message || "Correction process nahi ho paayi.");
      setPhase("review");
    } finally {
      setIsProcessing(false);
    }
  }

  function startListening(target) {
    setError("");

    let spokenText = "";

    if (target === "command") {
      setCommandText("");
      setCommandResult(null);
      setPhase("listening");
    } else {
      setCorrectionText("");
      setPhase("listening");
    }

    const recognition = createSpeechRecognition({
      onStart: () => setPhase("listening"),

      onResult: (text) => {
        spokenText = text;

        if (target === "correction") {
          setCorrectionText(text);
        } else {
          setCommandText(text);
        }
      },

      onError: (message) => {
        setError(`Voice error: ${message}`);
        setPhase(target === "correction" ? "review" : "ready");
      },

      onEnd: () => {
        if (spokenText.trim()) {
          if (target === "correction") {
            processCorrection(spokenText);
          } else {
            processCommand(spokenText);
          }
        } else {
          setPhase(target === "correction" ? "review" : "ready");
        }
      }
    });

    if (!recognition) {
      setPhase(target === "correction" ? "review" : "ready");
      return;
    }

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setPhase(target === "correction" ? "review" : "ready");
      setError("Microphone start nahi ho paaya. Dobara try karein.");
    }
  }

  function handleTextCommand(event) {
    event.preventDefault();
    processCommand(commandText);
  }

  function handleTextCorrection(event) {
    event.preventDefault();
    processCorrection(correctionText);
  }

  async function handleConfirm() {
    if (authStatus !== "user") {
      setError("Transaction save karne ke liye login zaroori hai.");
      return;
    }

    if (
      isProcessing ||
      phase !== "review" ||
      commandResult?.status !== "ready_for_review" ||
      !requestId
    ) {
      return;
    }

    if (
      !commandResult.customer ||
      !Number.isFinite(Number(commandResult.amount)) ||
      Number(commandResult.amount) <= 0 ||
      !["add_credit", "record_payment"].includes(commandResult.intent)
    ) {
      setError("Transaction details valid nahi hain. Dobara check karein.");
      return;
    }

    setIsProcessing(true);
    setError("");
    setPhase("saving");

    try {
      const result = await confirmTransaction({
        confirmed: true,
        customer: commandResult.customer,
        amount: Number(commandResult.amount),
        intent: commandResult.intent,
        originalCommand: commandText,
        requestId
      });

      setTransactionResult(result);
      setPhase("saved");

      speak(
        `${result.customer} ka transaction save ho gaya hai. Ab unka baaki balance ${result.balance} rupaye hai.`
      );
    } catch (err) {
      setError(err.message || "Transaction save nahi ho paayi.");
      setPhase("review");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleNewCommand() {
    recognitionRef.current?.abort();

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setPhase("ready");
    setCommandText("");
    setCorrectionText("");
    setCommandResult(null);
    setTransactionResult(null);
    setRequestId("");
    setError("");
    setIsProcessing(false);
  }

  const actionLabel =
    commandResult?.intent === "add_credit"
      ? "Naya udhaar"
      : commandResult?.intent === "record_payment"
        ? "Udhaar payment"
        : "Action";

  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const incomingConnections = connections.filter(
    (item) => item.direction === "incoming" && item.status === "pending"
  );

  const outgoingConnections = connections.filter(
    (item) => item.direction === "outgoing" && item.status === "pending"
  );

  const acceptedConnections = connections.filter(
    (item) => item.status === "accepted"
  );

  // Header
  function TopBar({ showMenu = false }) {
    return (
      <header className="assistant-header">
        <div className="brand">
          <span className="brand-name">Dukaan AI</span>
        </div>

        {showMenu && (
          <div className="header-actions">
            <span className="header-status">
              <span className="status-dot"></span>
              {authStatus === "guest" ? "Guest" : "Online"}
            </span>

            <button
              className={`menu-toggle ${menuOpen ? "menu-active" : ""}`}
              type="button"
              onClick={() => setMenuOpen((previous) => !previous)}
              aria-label="Toggle navigation menu"
              aria-expanded={menuOpen}
            >
              <span></span>
              <span></span>
              <span></span>
            </button>
          </div>
        )}
      </header>
    );
  }

  // Sidebar navigation
  function NavigationMenu() {
    if (!menuOpen) return null;

    const link = (page, label, symbol) => (
      <button
        className={`sidebar-link ${view === page ? "active" : ""}`}
        type="button"
        onClick={() => navigateTo(page)}
      >
        <span className="sidebar-icon">{symbol}</span>
        {label}
      </button>
    );

    return (
      <>
        <div
          className="sidebar-backdrop"
          onClick={() => setMenuOpen(false)}
        />

        <aside className="assistant-sidebar">
          <div className="sidebar-heading">
            <span className="brand-name">Dukaan AI</span>

            <button
              className="sidebar-close"
              type="button"
              onClick={() => setMenuOpen(false)}
              aria-label="Close menu"
            >
              ×
            </button>
          </div>

          <p className="sidebar-label">MAIN MENU</p>

          {link("home", "Home", "⌂")}
          {link("borrowed", "Udhaar Liya", "↓")}
          {link("lent", "Udhaar Diya", "↑")}
          {authStatus === "user" && link("connections", "Connections", "⇄")}
          {link("assistant", "Voice Assistant", "🎙")}

          {authStatus === "user" && (
            <>
              <p className="sidebar-label">OLD RECORDS</p>
              <button
                className={`sidebar-link ${view === "customers" ? "active" : ""}`}
                type="button"
                onClick={openOldKhata}
              >
                <span className="sidebar-icon">▤</span>
                Customer Khata
              </button>
            </>
          )}

          <div className="sidebar-bottom">
            {authStatus === "user" && (
              <>
                <div className="sidebar-account">
                  <span className="account-avatar">
                    {user?.email?.charAt(0).toUpperCase() || "U"}
                  </span>
                  <span className="account-email">
                    {user?.email || "Your account"}
                  </span>
                </div>

                <button
                  className="sidebar-link logout-link"
                  type="button"
                  onClick={handleLogout}
                >
                  <span className="sidebar-icon">↪</span>
                  Logout
                </button>
              </>
            )}

            {authStatus === "guest" && (
              <button
                className="sidebar-link"
                type="button"
                onClick={() => openAuth("login")}
              >
                <span className="sidebar-icon">↪</span>
                Login
              </button>
            )}
          </div>
        </aside>
      </>
    );
  }

  // Authentication loading
  if (authStatus === "checking") {
    return (
      <main className="assistant-app">
        <TopBar />
        <section className="assistant-main">
          <div className="thinking-panel">
            <div className="thinking-loader"></div>
            <strong>Dukaan load ho raha hai...</strong>
          </div>
        </section>
      </main>
    );
  }

  // Welcome, login and signup
  if (authStatus === "choice" || authStatus === "form") {
    return (
      <main className="assistant-app">
        <TopBar />

        <section className="assistant-main">
          <div className="ai-orb orb-ready">
            <div className="orb-inner">
              <span className="orb-icon">✦</span>
            </div>
          </div>

          {authStatus === "choice" ? (
            <>
              <h1>Namaste! 👋</h1>
              <p className="assistant-subtitle">
                Aapka personal udhaar aur hisaab assistant.
              </p>

              <section className="assistant-popup">
                <div className="popup-heading">
                  Dukaan AI mein aapka swagat hai
                </div>

                <p className="understanding-text">
                  Apna khata manage karein, udhaar record karein aur
                  doosre users se connect karein.
                </p>

                <div className="popup-actions">
                  <button
                    className="popup-primary"
                    type="button"
                    onClick={() => openAuth("login")}
                  >
                    Login
                  </button>

                  <button
                    className="popup-secondary"
                    type="button"
                    onClick={() => openAuth("signup")}
                  >
                    Create account
                  </button>
                </div>

                <div className="popup-divider">
                  <span>ya</span>
                </div>

                <button
                  className="popup-mic"
                  type="button"
                  onClick={continueAsGuest}
                >
                  Continue as Guest
                </button>

                <p className="privacy-note">
                  Guest mode mein AI try kar sakte hain.
                  Commands database mein save nahi honge.
                </p>
              </section>
            </>
          ) : (
            <>
              <h1>
                {authMode === "signup"
                  ? "Create your account"
                  : "Welcome back"}
              </h1>

              <p className="assistant-subtitle">
                {authMode === "signup"
                  ? "Apna Dukaan AI account banayein."
                  : "Apne account mein login karein."}
              </p>

              <section className="assistant-popup">
                <div className="popup-heading">
                  {authMode === "signup" ? "Sign up" : "Login"}
                </div>

                <form onSubmit={handleAuthSubmit}>
                  <input
                    className="compact-input"
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="Email address"
                    autoComplete="email"
                    required
                  />

                  <input
                    className="compact-input"
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    placeholder="Password"
                    autoComplete={
                      authMode === "signup" ? "new-password" : "current-password"
                    }
                    minLength={8}
                    maxLength={128}
                    required
                  />

                  {authMode === "signup" && (
                    <input
                      className="compact-input"
                      type="password"
                      value={confirmPassword}
                      onChange={(event) => setConfirmPassword(event.target.value)}
                      placeholder="Confirm password"
                      autoComplete="new-password"
                      minLength={8}
                      maxLength={128}
                      required
                    />
                  )}

                  {authError && (
                    <p className="assistant-error" role="alert">
                      {authError}
                    </p>
                  )}

                  <button
                    className="popup-primary"
                    type="submit"
                    disabled={authLoading}
                  >
                    {authLoading
                      ? "Please wait..."
                      : authMode === "signup"
                        ? "Create account"
                        : "Login"}
                  </button>
                </form>

                <div className="popup-divider">
                  <span>or</span>
                </div>

                <button
                  className="text-button"
                  type="button"
                  onClick={() =>
                    openAuth(authMode === "signup" ? "login" : "signup")
                  }
                >
                  {authMode === "signup"
                    ? "Already have an account? Login"
                    : "New to Dukaan? Create account"}
                </button>

                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    setAuthStatus("choice");
                    setAuthError("");
                  }}
                >
                  ← Back
                </button>
              </section>
            </>
          )}

          <p className="privacy-note">
            Dukaan AI · Your Personal Khata Assistant
          </p>
        </section>
      </main>
    );
  }

  // Home dashboard
  function HomePage() {
    return (
      <section className="dashboard-main">
        <div className="dashboard-welcome">
          <div>
            <p className="dashboard-eyebrow">YOUR PERSONAL KHATA</p>
            <h1>Namaste! 👋</h1>
            <p>Apna udhaar aur hisaab ek jagah manage karein.</p>
          </div>
          <div className="dashboard-avatar">
            {user?.email?.charAt(0).toUpperCase() || "G"}
          </div>
        </div>

        <div className="dashboard-summary">
          <button
            className="summary-card borrowed-card"
            type="button"
            onClick={() => navigateTo("borrowed")}
          >
            <span className="summary-icon">↓</span>
            <span className="summary-label">Udhaar Liya</span>
            <strong>—</strong>
            <small>Jo aapko chukana hai</small>
            <span className="summary-link">View details →</span>
          </button>

          <button
            className="summary-card lent-card"
            type="button"
            onClick={() => navigateTo("lent")}
          >
            <span className="summary-icon">↑</span>
            <span className="summary-label">Udhaar Diya</span>
            <strong>—</strong>
            <small>Jo aapko wapas milna hai</small>
            <span className="summary-link">View details →</span>
          </button>
        </div>

        <section className="dashboard-section">
          <div className="dashboard-section-heading">
            <div>
              <h2>Quick actions</h2>
              <p>Apne hisaab ko aasani se manage karein.</p>
            </div>
          </div>

          <div className="quick-actions">
            <button
              className="quick-action-card"
              type="button"
              onClick={() => navigateTo("assistant")}
            >
              <span className="quick-action-icon">🎙️</span>
              <strong>Voice Assistant</strong>
              <small>Bolkar entry karein</small>
            </button>

            <button
              className="quick-action-card"
              type="button"
              onClick={() => navigateTo("connections")}
            >
              <span className="quick-action-icon">⇄</span>
              <strong>Connections</strong>
              <small>Users se connect karein</small>
            </button>
          </div>
        </section>

        <section className="dashboard-assistant-banner">
          <div className="banner-orb">✦</div>
          <div className="banner-copy">
            <span>DUKAAN AI</span>
            <h2>Aaj ka hisaab bolkar batayein</h2>
            <p>Apni natural language mein baat karein.</p>
          </div>
          <button
            className="banner-button"
            type="button"
            onClick={() => navigateTo("assistant")}
          >
            Start talking →
          </button>
        </section>

        <p className="privacy-note">
          Logged in as {user?.email}
        </p>
      </section>
    );
  }

  // Debt sections: UI is ready, backend endpoints are not implemented yet.
  function DebtPage({ type }) {
    const isBorrowed = type === "borrowed";

    return (
      <section className="ledger-main">
        <div className="ledger-top">
          <button
            className="text-button"
            type="button"
            onClick={() => navigateTo("home")}
          >
            ← Back to Home
          </button>

          <h1>{isBorrowed ? "Udhaar Liya" : "Udhaar Diya"}</h1>

          <p>
            {isBorrowed
              ? "Yahan woh paisa dikhega jo aapko doosron ko chukana hai."
              : "Yahan woh paisa dikhega jo doosron se aapko wapas milna hai."}
          </p>
        </div>

        <div className={`debt-overview-card ${isBorrowed ? "debt-borrowed" : "debt-lent"}`}>
          <span>{isBorrowed ? "Total amount you owe" : "Total amount owed to you"}</span>
          <strong>—</strong>
          <small>Balance data abhi connect nahi hua hai</small>
        </div>

        <div className="debt-empty-state">
          <div className="debt-empty-icon">
            {isBorrowed ? "↓" : "↑"}
          </div>

          <h2>
            {isBorrowed
              ? "Aapka Udhaar Liya"
              : "Aapka Udhaar Diya"}
          </h2>

          <p>
            Is section ko real database records dikhane ke liye
            debt aur repayment APIs implement karni hongi.
            Abhi koi balance ya transaction yahan load nahi ho raha.
          </p>

          <button
            className="popup-primary"
            type="button"
            onClick={() => navigateTo("assistant")}
          >
            🎙️ Voice Assistant kholein
          </button>
        </div>
      </section>
    );
  }

  // Connections page
  function ConnectionsPage() {
    return (
      <section className="ledger-main connections-main">
        <div className="ledger-top">
          <button
            className="text-button"
            type="button"
            onClick={() => navigateTo("home")}
          >
            ← Back to Home
          </button>

          <h1>Connections</h1>
          <p>
            Doosre Dukaan AI users se connect karein.
            Dono taraf acceptance ke baad connection active hoga.
          </p>
        </div>

        <section className="connection-invite-card">
          <div className="popup-heading">Connect with a user</div>
          <p className="understanding-text">
            Jis user se connect karna hai, uska registered email enter karein.
          </p>

          <form onSubmit={sendConnectionRequest}>
            <input
              className="compact-input"
              type="email"
              value={connectionEmail}
              onChange={(event) => setConnectionEmail(event.target.value)}
              placeholder="Enter registered email"
              required
            />

            <button
              className="popup-primary"
              type="submit"
              disabled={connectionLoading}
            >
              {connectionLoading ? "Please wait..." : "Send connection request"}
            </button>
          </form>
        </section>

        {connectionError && (
          <p className="assistant-error" role="alert">
            {connectionError}
          </p>
        )}

        {connectionMessage && (
          <p className="connection-success" role="status">
            {connectionMessage}
          </p>
        )}

        <div className="connection-section">
          <div className="connection-section-heading">
            <h2>Incoming requests</h2>
            <span>{incomingConnections.length}</span>
          </div>

          {connectionLoading && connections.length === 0 ? (
            <div className="thinking-panel">
              <div className="thinking-loader"></div>
              <strong>Connections load ho rahe hain...</strong>
            </div>
          ) : incomingConnections.length === 0 ? (
            <div className="connection-empty">
              Abhi koi incoming request nahi hai.
            </div>
          ) : (
            incomingConnections.map((item) => (
              <article className="connection-card" key={item.id}>
                <div className="connection-avatar">
                  {item.otherUser?.charAt(0).toUpperCase() || "U"}
                </div>

                <div className="connection-person">
                  <strong>{item.otherUser}</strong>
                  <span>Sent {formatDate(item.createdAt)}</span>
                  <small>Incoming request</small>
                </div>

                <div className="connection-buttons">
                  <button
                    className="connection-accept"
                    type="button"
                    disabled={connectionActionId === item.id}
                    onClick={() => respondToConnection(item.id, "accepted")}
                  >
                    {connectionActionId === item.id ? "..." : "Accept"}
                  </button>

                  <button
                    className="connection-reject"
                    type="button"
                    disabled={connectionActionId === item.id}
                    onClick={() => respondToConnection(item.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))
          )}
        </div>

        <div className="connection-section">
          <div className="connection-section-heading">
            <h2>Sent requests</h2>
            <span>{outgoingConnections.length}</span>
          </div>

          {outgoingConnections.length === 0 ? (
            <div className="connection-empty">
              Aapki taraf se koi pending request nahi hai.
            </div>
          ) : (
            outgoingConnections.map((item) => (
              <article className="connection-card" key={item.id}>
                <div className="connection-avatar">
                  {item.otherUser?.charAt(0).toUpperCase() || "U"}
                </div>

                <div className="connection-person">
                  <strong>{item.otherUser}</strong>
                  <span>Sent {formatDate(item.createdAt)}</span>
                  <small>Waiting for acceptance</small>
                </div>

                <span className="connection-status pending">
                  Pending
                </span>
              </article>
            ))
          )}
        </div>

        <div className="connection-section">
          <div className="connection-section-heading">
            <h2>Connected users</h2>
            <span>{acceptedConnections.length}</span>
          </div>

          {acceptedConnections.length === 0 ? (
            <div className="connection-empty">
              Abhi koi accepted connection nahi hai.
            </div>
          ) : (
            acceptedConnections.map((item) => (
              <article className="connection-card" key={item.id}>
                <div className="connection-avatar">
                  {item.otherUser?.charAt(0).toUpperCase() || "U"}
                </div>

                <div className="connection-person">
                  <strong>{item.otherUser}</strong>
                  <span>Connected {formatDate(item.respondedAt)}</span>
                </div>

                <span className="connection-status accepted">
                  Connected
                </span>
              </article>
            ))
          )}
        </div>

        <button
          className="popup-secondary refresh-connections"
          type="button"
          onClick={loadConnections}
          disabled={connectionLoading}
        >
          {connectionLoading ? "Refreshing..." : "↻ Refresh connections"}
        </button>
      </section>
    );
  }

  // Old Customer Khata
  function CustomersPage() {
    return (
      <section className="ledger-main">
        <div className="ledger-top">
          {selectedLedger && (
            <button
              className="text-button"
              type="button"
              onClick={backToCustomers}
            >
              ← Back to customers
            </button>
          )}

          <h1>
            {selectedLedger ? selectedLedger.customer.name : "Customer Khata"}
          </h1>

          <p>
            {selectedLedger
              ? "Customer ka purana udhaar aur payment history."
              : "Purane customer records dekhein."}
          </p>
        </div>

        {ledgerError && (
          <p className="assistant-error" role="alert">
            {ledgerError}
          </p>
        )}

        {ledgerLoading && (
          <div className="thinking-panel">
            <div className="thinking-loader"></div>
            <strong>Khata load ho raha hai...</strong>
          </div>
        )}

        {!ledgerLoading && !selectedLedger && (
          <>
            <input
              className="compact-input customer-search"
              value={customerSearch}
              onChange={(event) => setCustomerSearch(event.target.value)}
              placeholder="Customer search karein..."
            />

            <div className="customer-list">
              {filteredCustomers.map((customer) => (
                <button
                  className="customer-card"
                  key={customer.id}
                  type="button"
                  onClick={() => openLedger(customer.id)}
                >
                  <div className="customer-avatar">
                    {customer.name.charAt(0).toUpperCase()}
                  </div>

                  <div className="customer-info">
                    <strong>{customer.name}</strong>
                    <span>Customer #{customer.id}</span>
                  </div>

                  <div className="customer-balance">
                    <strong>₹{formatMoney(customer.balance)}</strong>
                    <span>Baaki</span>
                  </div>
                </button>
              ))}

              {filteredCustomers.length === 0 && (
                <div className="empty-ledger">
                  {customers.length === 0
                    ? "Abhi koi customer record nahi hai."
                    : "Is naam ka customer nahi mila."}
                </div>
              )}
            </div>
          </>
        )}

        {!ledgerLoading && selectedLedger && (
          <div className="ledger-content">
            <div className="ledger-balance-card">
              <span>Current outstanding balance</span>
              <strong>₹{formatMoney(selectedLedger.customer.balance)}</strong>
            </div>

            <h2>Transaction History</h2>

            <div className="ledger-transactions">
              {selectedLedger.transactions.map((transaction) => {
                const isCredit = transaction.type === "add_credit";

                return (
                  <article className="ledger-transaction" key={transaction.id}>
                    <div className={`transaction-icon ${isCredit ? "credit" : "payment"}`}>
                      {isCredit ? "↑" : "↓"}
                    </div>

                    <div className="transaction-info">
                      <strong>
                        {isCredit ? "Naya udhaar" : "Payment received"}
                      </strong>
                      <span>{formatDate(transaction.createdAt)}</span>

                      {transaction.originalCommand && (
                        <small>{transaction.originalCommand}</small>
                      )}
                    </div>

                    <strong className={`transaction-amount ${isCredit ? "credit-text" : "payment-text"}`}>
                      {isCredit ? "+" : "−"}₹{formatMoney(transaction.amount)}
                    </strong>
                  </article>
                );
              })}

              {selectedLedger.transactions.length === 0 && (
                <div className="empty-ledger">
                  Is customer ki transaction history abhi khaali hai.
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    );
  }

  // Voice assistant screen
  function AssistantPage() {
    return (
      <section className="assistant-main">
        <div className={`ai-orb orb-${phase}`}>
          <div className="orb-inner">
            {phase === "listening" ? (
              <span className="orb-icon">🎙️</span>
            ) : phase === "thinking" || phase === "saving" ? (
              <span className="orb-icon">✦</span>
            ) : phase === "saved" ? (
              <span className="orb-icon">✓</span>
            ) : (
              <span className="orb-icon">✦</span>
            )}
          </div>
        </div>

        <h1>
          {phase === "ready" && "Namaste! 👋"}
          {phase === "listening" && "Main sun raha hoon..."}
          {phase === "thinking" && "Samajh raha hoon..."}
          {phase === "review" && "Ek baar check kijiye"}
          {phase === "correction" && "Correction"}
          {phase === "saving" && "Record save ho raha hai..."}
          {phase === "saved" && "Transaction saved!"}
        </h1>

        <p className="assistant-subtitle">
          {phase === "ready" && "Bataiye, aaj kya udhaar liya ya diya?"}
          {phase === "listening" && "Apni baat poori karein. Main sun raha hoon."}
          {phase === "thinking" && "Aapki baat samajhne ki koshish kar raha hoon."}
          {phase === "review" && "Maine aapki baat ko is tarah samjha hai."}
          {phase === "correction" && "Batayein, kya badalna hai."}
          {phase === "saving" && "Aapka transaction save kar raha hoon."}
          {phase === "saved" && "Aapka transaction record ho gaya hai."}
        </p>

        <section className="assistant-popup" key={phase}>
          {phase === "ready" && (
            <>
              <div className="popup-heading">Aapse sunna chahta hoon</div>

              <form onSubmit={handleTextCommand}>
                <textarea
                  className="compact-input"
                  value={commandText}
                  onChange={(event) => setCommandText(event.target.value)}
                  placeholder="Jaise: Maine Ramesh se ₹500 udhaar liya..."
                  rows={3}
                />

                <button
                  className="popup-primary"
                  type="submit"
                  disabled={!commandText.trim() || isProcessing}
                >
                  Send command <span>→</span>
                </button>
              </form>

              <div className="popup-divider">
                <span>ya</span>
              </div>

              <button
                className="popup-mic"
                type="button"
                onClick={() => startListening("command")}
              >
                <span>🎙️</span> Bolkar batayein
              </button>
            </>
          )}

          {phase === "listening" && (
            <div className="listening-panel">
              <div className="sound-bars">
                {Array.from({ length: 7 }).map((_, index) => (
                  <span key={index}></span>
                ))}
              </div>

              <strong>
                {correctionText ? "Correction sun raha hoon" : "Aapki baat sun raha hoon"}
              </strong>

              <p>{correctionText || commandText || "Boliye..."}</p>

              <button
                className="popup-secondary"
                type="button"
                onClick={() => recognitionRef.current?.stop()}
              >
                Stop
              </button>
            </div>
          )}

          {phase === "thinking" && (
            <div className="thinking-panel">
              <div className="thinking-loader"></div>
              <strong>Dukaan AI soch raha hai</strong>
              <p>Command aur details check ho rahi hain.</p>
            </div>
          )}

          {phase === "review" && commandResult && (
            <>
              <div className="popup-heading">Maine ye samjha hai</div>

              <p className="understanding-text">
                {commandResult.message ||
                  commandResult.understanding ||
                  commandResult.clarification}
              </p>

              <div className="review-details">
                {commandResult.customer && (
                  <div>
                    <span>Customer</span>
                    <strong>{commandResult.customer}</strong>
                  </div>
                )}

                {commandResult.amount != null && (
                  <div>
                    <span>Amount</span>
                    <strong>₹{commandResult.amount}</strong>
                  </div>
                )}

                {commandResult.intent && (
                  <div>
                    <span>Action</span>
                    <strong>{actionLabel}</strong>
                  </div>
                )}
              </div>

              {commandResult.status === "ready_for_review" ? (
                <>
                  <p className="popup-question">
                    {authStatus === "guest"
                      ? "Guest mode mein transaction save nahi hoga."
                      : "Kya maine sahi samjha?"}
                  </p>

                  {authStatus === "user" ? (
                    <div className="popup-actions">
                      <button
                        className="popup-primary"
                        type="button"
                        onClick={handleConfirm}
                        disabled={isProcessing}
                      >
                        ✓ Haan, record karo
                      </button>

                      <button
                        className="popup-secondary"
                        type="button"
                        onClick={() => {
                          setCorrectionText("");
                          setError("");
                          setPhase("correction");
                        }}
                        disabled={isProcessing}
                      >
                        Nahi, badalna hai
                      </button>
                    </div>
                  ) : (
                    <div className="popup-actions">
                      <button
                        className="popup-primary"
                        type="button"
                        onClick={() => openAuth("signup")}
                      >
                        Create account to save
                      </button>

                      <button
                        className="popup-secondary"
                        type="button"
                        onClick={handleNewCommand}
                      >
                        Try another command
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <p className="popup-question">
                    Mujhe thodi aur information chahiye.
                  </p>

                  <button
                    className="popup-secondary"
                    type="button"
                    onClick={() => setPhase("correction")}
                  >
                    Jawab dein
                  </button>
                </>
              )}
            </>
          )}

          {phase === "correction" && (
            <>
              <div className="popup-heading">Kya correct karna hai?</div>

              <form onSubmit={handleTextCorrection}>
                <textarea
                  className="compact-input"
                  value={correctionText}
                  onChange={(event) => setCorrectionText(event.target.value)}
                  placeholder="Jaise: Naam Ramesh nahi, Suresh hai."
                  rows={3}
                />

                <button
                  className="popup-primary"
                  type="submit"
                  disabled={!correctionText.trim() || isProcessing}
                >
                  Send correction <span>→</span>
                </button>
              </form>

              <button
                className="popup-mic"
                type="button"
                onClick={() => startListening("correction")}
              >
                <span>🎙️</span> Bolkar correct karein
              </button>

              <button
                className="text-button"
                type="button"
                onClick={() => setPhase("review")}
              >
                Wapas jayein
              </button>
            </>
          )}

          {phase === "saving" && (
            <div className="thinking-panel">
              <div className="thinking-loader"></div>
              <strong>Transaction save ho raha hai</strong>
              <p>Kripya is process ko interrupt na karein.</p>
            </div>
          )}

          {phase === "saved" && transactionResult && (
            <div className="confirmed-panel">
              <div className="confirmed-icon">✓</div>
              <strong>Transaction successfully saved!</strong>
              <p>{transactionResult.customer}</p>
              <p>Transaction: ₹{transactionResult.amount}</p>

              <p>
                {transactionResult.transactionType === "add_credit"
                  ? "Naya udhaar add hua."
                  : "Payment receive hua."}
              </p>

              <div className="review-details">
                <div>
                  <span>Updated outstanding balance</span>
                  <strong>₹{formatMoney(transactionResult.balance)}</strong>
                </div>
              </div>

              <button
                className="popup-primary"
                type="button"
                onClick={handleNewCommand}
              >
                New command
              </button>
            </div>
          )}
        </section>

        {error && (
          <p className="assistant-error" role="alert">
            {error}
          </p>
        )}

        <p className="privacy-note">
          {authStatus === "guest"
            ? "Guest mode · Commands are not saved"
            : `Logged in as ${user?.email || ""}`}
        </p>
      </section>
    );
  }

  return (
    <main className="assistant-app">
      <TopBar showMenu />
      <NavigationMenu />

      {view === "home" && <HomePage />}
      {view === "borrowed" && <DebtPage type="borrowed" />}
      {view === "lent" && <DebtPage type="lent" />}
      {view === "connections" && authStatus === "user" && <ConnectionsPage />}
      {view === "customers" && authStatus === "user" && <CustomersPage />}
      {view === "assistant" && <AssistantPage />}
    </main>
  );
}
