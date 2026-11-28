
import { useEffect, useRef, useState } from "react";
import "./styles/main.css";
import { createSpeechRecognition } from "./services/speechRecognition.js";
import {
  understandShopkeeperCommand,
  createConnectedDebt,
  createRepayment
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
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {})
    }
  });

  const rawText = await response.text();
  let result;

  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`Server response invalid hai. HTTP ${response.status}`);
  }

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
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });
}

function toPaise(amount) {
  const value = Number(amount);

  if (!Number.isFinite(value) || value <= 0) {
    throw new Error("Valid amount enter karein.");
  }

  const paise = Math.round(value * 100);

  if (!Number.isSafeInteger(paise) || paise <= 0) {
    throw new Error("Amount valid range mein nahi hai.");
  }

  return paise;
}

function normalizePerson(value) {
  return String(value || "").trim().toLowerCase();
}

function personMatches(counterparty, email) {
  const name = normalizePerson(counterparty);
  const address = normalizePerson(email);

  if (!name || !address) return false;

  const emailName = address.split("@")[0];

  return (
    name === address ||
    name === emailName ||
    emailName === name.replace(/\s+/g, "") ||
    address.startsWith(`${name.replace(/\s+/g, "")}@`)
  );
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

  // Universal debt system
  const [debts, setDebts] = useState([]);
  const [debtLoading, setDebtLoading] = useState(false);
  const [debtError, setDebtError] = useState("");
  const [debtMessage, setDebtMessage] = useState("");
  const [debtActionId, setDebtActionId] = useState("");
  const [selectedConnectionId, setSelectedConnectionId] = useState("");
  const [selectedDebtId, setSelectedDebtId] = useState("");
  const [repaymentsByDebt, setRepaymentsByDebt] = useState({});
  const [repaymentLoadingId, setRepaymentLoadingId] = useState("");

  // Old customer ledger
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

  // Check existing login session
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

  // Load data for current page
  useEffect(() => {
    if (authStatus !== "user") return;

    if (["home", "borrowed", "lent"].includes(view)) {
      loadDebts();
    }

    if (["connections", "assistant"].includes(view)) {
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
    setDebts([]);
    setRepaymentsByDebt({});

    setConnectionEmail("");
    setConnectionError("");
    setConnectionMessage("");
    setDebtError("");
    setDebtMessage("");
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
    setDebtError("");
    setDebtMessage("");
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

  const incomingConnections = connections.filter(
    (item) => item.direction === "incoming" && item.status === "pending"
  );

  const outgoingConnections = connections.filter(
    (item) => item.direction === "outgoing" && item.status === "pending"
  );

  const acceptedConnections = connections.filter(
    (item) => item.status === "accepted"
  );

  // Universal debt loading
  async function loadDebts() {
    setDebtLoading(true);
    setDebtError("");

    try {
      const result = await fetchApi("/api/debts");
      setDebts(result.debts || []);
    } catch (err) {
      setDebtError(err.message || "Udhaar records load nahi ho paaye.");
    } finally {
      setDebtLoading(false);
    }
  }

  async function respondToDebt(debtId, decision) {
    setDebtActionId(debtId);
    setDebtError("");
    setDebtMessage("");

    try {
      const result = await fetchApi(
        `/api/debts/${encodeURIComponent(debtId)}/respond`,
        {
          method: "POST",
          body: JSON.stringify({ decision })
        }
      );

      setDebtMessage(result.message || "Udhaar request update ho gayi.");
      await loadDebts();
    } catch (err) {
      setDebtError(err.message || "Udhaar request update nahi ho paayi.");
    } finally {
      setDebtActionId("");
    }
  }

  async function loadRepayments(debtId) {
    setRepaymentLoadingId(debtId);

    try {
      const result = await fetchApi(
        `/api/debts/${encodeURIComponent(debtId)}/repayments`
      );

      setRepaymentsByDebt((previous) => ({
        ...previous,
        [debtId]: result.repayments || []
      }));
    } catch (err) {
      setDebtError(err.message || "Repayment history load nahi ho paayi.");
    } finally {
      setRepaymentLoadingId("");
    }
  }

  async function respondToRepayment(repaymentId, decision, debtId) {
    setDebtActionId(repaymentId);
    setDebtError("");
    setDebtMessage("");

    try {
      const result = await fetchApi(
        `/api/repayments/${encodeURIComponent(repaymentId)}/respond`,
        {
          method: "POST",
          body: JSON.stringify({ decision })
        }
      );

      setDebtMessage(result.message || "Repayment request update ho gayi.");

      await Promise.all([
        loadDebts(),
        loadRepayments(debtId)
      ]);
    } catch (err) {
      setDebtError(err.message || "Repayment response save nahi ho paaya.");
    } finally {
      setDebtActionId("");
    }
  }

  // AI command understanding
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
    setSelectedConnectionId("");
    setSelectedDebtId("");

    try {
      const result = await understandShopkeeperCommand(text);

      setCommandResult(result);

      setRequestId(
        result.status === "ready_for_review"
          ? createRequestId()
          : ""
      );

      // Clarification and review are separate states
      setPhase(
        result.status === "ready_for_review"
          ? "review"
          : "clarification"
      );

      speak(
        result.status === "ready_for_review"
          ? result.understanding || result.message || "Details check karein."
          : result.clarification ||
              result.message ||
              "Mujhe thodi aur information chahiye."
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
    setSelectedConnectionId("");
    setSelectedDebtId("");

    try {
      const result = await understandShopkeeperCommand(correctedCommand);

      setCommandResult(result);
      setCorrectionText("");

      setRequestId(
        result.status === "ready_for_review"
          ? createRequestId()
          : ""
      );

      setPhase(
        result.status === "ready_for_review"
          ? "review"
          : "clarification"
      );

      speak(
        result.status === "ready_for_review"
          ? result.understanding || result.message || "Correction samajh li."
          : result.clarification ||
              result.message ||
              "Mujhe thodi aur information chahiye."
      );
    } catch (err) {
      setError(err.message || "Correction process nahi ho paayi.");
      setPhase("correction");
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
        setPhase(target === "correction" ? "correction" : "ready");
      },

      onEnd: () => {
        if (spokenText.trim()) {
          if (target === "correction") {
            processCorrection(spokenText);
          } else {
            processCommand(spokenText);
          }
        } else {
          setPhase(target === "correction" ? "correction" : "ready");
        }
      }
    });

    if (!recognition) {
      setPhase(target === "correction" ? "correction" : "ready");
      return;
    }

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setPhase(target === "correction" ? "correction" : "ready");
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

  // Match AI counterparty with accepted connections
  const matchedConnections = acceptedConnections.filter((connection) =>
    personMatches(commandResult?.counterparty, connection.otherUser)
  );

  const matchingDebts = debts.filter((debt) => {
    if (debt.status !== "confirmed" || debt.outstandingPaise <= 0) {
      return false;
    }

    if (
      commandResult?.operation === "record_repayment" &&
      commandResult.paid_by === "me"
    ) {
      return (
        debt.direction === "borrowed" &&
        personMatches(commandResult.counterparty, debt.otherUser)
      );
    }

    if (
      commandResult?.operation === "record_repayment" &&
      commandResult.paid_by === "other"
    ) {
      return (
        debt.direction === "lent" &&
        personMatches(commandResult.counterparty, debt.otherUser)
      );
    }

    return false;
  });

  // Save only after explicit confirmation
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

    const operation = commandResult.operation;
    const amount = Number(commandResult.amount);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      !commandResult.counterparty
    ) {
      setError("Naam ya amount valid nahi hai. Dobara check karein.");
      return;
    }

    if (operation === "create_debt") {
      if (!["borrowed", "lent"].includes(commandResult.direction)) {
        setError("Udhaar ki direction clear nahi hai.");
        return;
      }

      let connection = null;

      if (selectedConnectionId) {
        connection = acceptedConnections.find(
          (item) => item.id === selectedConnectionId
        );
      } else if (matchedConnections.length === 1) {
        connection = matchedConnections[0];
      }

      if (!connection) {
        setError(
          acceptedConnections.length === 0
            ? "Pehle doosre user ke saath connection banayein."
            : "Sahi connected user select karein."
        );
        return;
      }

      setSelectedConnectionId(connection.id);
    } else if (operation === "record_repayment") {
      if (!["me", "other"].includes(commandResult.paid_by)) {
        setError("Kisne payment ki, ye clear nahi hai.");
        return;
      }

      if (matchingDebts.length === 0) {
        setError(
          "Is person ke naam se matching confirmed udhaar nahi mila. Pehle correct udhaar record check karein."
        );
        return;
      }

      if (
        matchingDebts.length > 1 &&
        !matchingDebts.some((debt) => debt.id === selectedDebtId)
      ) {
        setError("Repayment ke liye specific udhaar record select karein.");
        return;
      }
    } else {
      setError("Ye command abhi supported nahi hai.");
      return;
    }

    setIsProcessing(true);
    setError("");
    setPhase("saving");

    try {
      const amountPaise = toPaise(amount);
      let result;

      if (operation === "create_debt") {
        const connection = acceptedConnections.find(
          (item) => item.id === selectedConnectionId
        );

        result = await createConnectedDebt({
          connectionId: connection.id,
          direction: commandResult.direction,
          amountPaise,
          originalCommand: commandText
        });
      } else {
        const selectedDebt =
          matchingDebts.find((debt) => debt.id === selectedDebtId) ||
          (matchingDebts.length === 1 ? matchingDebts[0] : null);

        if (!selectedDebt) {
          throw new Error("Specific udhaar record select karein.");
        }

        result = await createRepayment({
          debtId: selectedDebt.id,
          amountPaise,
          requestId,
          paidBy: commandResult.paid_by,
          originalCommand: commandText
        });
      }

      setTransactionResult({
        ...result,
        operation,
        amount,
        counterparty: commandResult.counterparty
      });

      setPhase("saved");
      await loadDebts();

      speak(
        operation === "create_debt"
          ? "Udhaar confirmation request bhej di gayi hai."
          : "Repayment confirmation request bhej di gayi hai."
      );
    } catch (err) {
      setError(err.message || "Request save nahi ho paayi.");
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
    setSelectedConnectionId("");
    setSelectedDebtId("");
    setError("");
    setIsProcessing(false);
  }

  const filteredCustomers = customers.filter((customer) =>
    customer.name.toLowerCase().includes(customerSearch.toLowerCase())
  );

  const confirmedDebts = debts.filter(
    (debt) => debt.status === "confirmed"
  );

  const totalBorrowed = confirmedDebts
    .filter((debt) => debt.direction === "borrowed")
    .reduce((sum, debt) => sum + debt.outstandingPaise, 0);

  const totalLent = confirmedDebts
    .filter((debt) => debt.direction === "lent")
    .reduce((sum, debt) => sum + debt.outstandingPaise, 0);

  const pendingIncomingDebts = debts.filter(
    (debt) =>
      debt.status === "pending" &&
      debt.createdByUserId !== user?.id
  );

  // Header
  function TopBar({ showMenu = false }) {
    return (
      <header className="assistant-header">
        {showMenu ? (
          <button
            className="brand-menu-button"
            type="button"
            onClick={() => setMenuOpen((previous) => !previous)}
            aria-label="Open navigation menu"
            aria-expanded={menuOpen}
          >
            <span className={`menu-toggle ${menuOpen ? "menu-active" : ""}`}>
              <span></span>
              <span></span>
            </span>

            <span className="brand-name">Dukaan AI</span>
          </button>
        ) : (
          <div className="brand">
            <span className="brand-name">Dukaan AI</span>
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
        key={page}
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

          {authStatus === "user" &&
            link("connections", "Connections", "⇄")}

          {link("assistant", "Voice Assistant", "🎙")}

          {authStatus === "user" && (
            <>
              <p className="sidebar-label">OLD RECORDS</p>

              <button
                className={`sidebar-link ${
                  view === "customers" ? "active" : ""
                }`}
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

        <section className="assistant-main auth-main">
          <div className="ai-orb orb-ready">
            <div className="orb-inner">
              <span className="orb-icon">✦</span>
            </div>
          </div>

          {authStatus === "choice" ? (
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
                Guest mode mein commands database mein save nahi honge.
              </p>
            </section>
          ) : (
            <section className="assistant-popup">
              <div className="popup-heading">
                {authMode === "signup" ? "Create your account" : "Welcome back"}
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
          )}
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

        {debtError && (
          <p className="assistant-error" role="alert">{debtError}</p>
        )}

        <div className="dashboard-summary">
          <button
            className="summary-card borrowed-card"
            type="button"
            onClick={() => navigateTo("borrowed")}
          >
            <span className="summary-icon">↓</span>
            <span className="summary-label">Udhaar Liya</span>
            <strong>
              {debtLoading ? "..." : `₹${formatMoney(totalBorrowed / 100)}`}
            </strong>
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
            <strong>
              {debtLoading ? "..." : `₹${formatMoney(totalLent / 100)}`}
            </strong>
            <small>Jo aapko wapas milna hai</small>
            <span className="summary-link">View details →</span>
          </button>
        </div>

        {pendingIncomingDebts.length > 0 && (
          <section className="dashboard-section">
            <div className="dashboard-section-heading">
              <div>
                <h2>Pending udhaar requests</h2>
                <p>In requests par aapka response zaroori hai.</p>
              </div>
              <strong>{pendingIncomingDebts.length}</strong>
            </div>

            {pendingIncomingDebts.map((debt) => (
              <article className="connection-card" key={debt.id}>
                <div className="connection-person">
                  <strong>{debt.otherUser}</strong>
                  <span>
                    {debt.direction === "borrowed"
                      ? "Aapse udhaar liya bataya gaya hai"
                      : "Aapko udhaar diya bataya gaya hai"}
                  </span>
                  <small>₹{formatMoney(debt.principalPaise / 100)}</small>
                </div>

                <div className="connection-buttons">
                  <button
                    className="connection-accept"
                    type="button"
                    disabled={debtActionId === debt.id}
                    onClick={() => respondToDebt(debt.id, "confirmed")}
                  >
                    Accept
                  </button>

                  <button
                    className="connection-reject"
                    type="button"
                    disabled={debtActionId === debt.id}
                    onClick={() => respondToDebt(debt.id, "rejected")}
                  >
                    Reject
                  </button>
                </div>
              </article>
            ))}
          </section>
        )}

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

        <p className="privacy-note">Logged in as {user?.email}</p>
      </section>
    );
  }

  // Universal debt pages
  function DebtPage({ type }) {
    const isBorrowed = type === "borrowed";

    const pageDebts = confirmedDebts.filter(
      (debt) => debt.direction === type
    );

    const pendingDebts = debts.filter(
      (debt) => debt.direction === type && debt.status === "pending"
    );

    const total = isBorrowed ? totalBorrowed : totalLent;

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

        <div
          className={`debt-overview-card ${
            isBorrowed ? "debt-borrowed" : "debt-lent"
          }`}
        >
          <span>
            {isBorrowed
              ? "Total amount you owe"
              : "Total amount owed to you"}
          </span>
          <strong>₹{formatMoney(total / 100)}</strong>
          <small>Confirmed outstanding balance</small>
        </div>

        {debtError && (
          <p className="assistant-error" role="alert">{debtError}</p>
        )}

        {debtMessage && (
          <p className="connection-success" role="status">{debtMessage}</p>
        )}

        {debtLoading ? (
          <div className="thinking-panel">
            <div className="thinking-loader"></div>
            <strong>Udhaar records load ho rahe hain...</strong>
          </div>
        ) : (
          <>
            {pendingDebts.length > 0 && (
              <div className="connection-section">
                <h2>Pending requests</h2>

                {pendingDebts.map((debt) => {
                  const isIncoming = debt.createdByUserId !== user?.id;

                  return (
                    <article className="connection-card" key={debt.id}>
                      <div className="connection-person">
                        <strong>{debt.otherUser}</strong>
                        <span>₹{formatMoney(debt.principalPaise / 100)}</span>
                        <small>
                          {isIncoming
                            ? "Aapki confirmation ka intezaar"
                            : "Doosre user ki confirmation ka intezaar"}
                        </small>
                      </div>

                      {isIncoming ? (
                        <div className="connection-buttons">
                          <button
                            className="connection-accept"
                            type="button"
                            disabled={debtActionId === debt.id}
                            onClick={() => respondToDebt(debt.id, "confirmed")}
                          >
                            Accept
                          </button>

                          <button
                            className="connection-reject"
                            type="button"
                            disabled={debtActionId === debt.id}
                            onClick={() => respondToDebt(debt.id, "rejected")}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className="connection-status pending">
                          Pending
                        </span>
                      )}
                    </article>
                  );
                })}
              </div>
            )}

            <div className="connection-section">
              <div className="connection-section-heading">
                <h2>Confirmed records</h2>
                <span>{pageDebts.length}</span>
              </div>

              {pageDebts.length === 0 ? (
                <div className="debt-empty-state">
                  <div className="debt-empty-icon">
                    {isBorrowed ? "↓" : "↑"}
                  </div>

                  <h2>
                    {isBorrowed
                      ? "Koi udhaar nahi liya"
                      : "Koi udhaar nahi diya"}
                  </h2>

                  <p>
                    Confirmed udhaar records yahan dikhai denge.
                    Naya record banane ke liye Voice Assistant use karein.
                  </p>

                  <button
                    className="popup-primary"
                    type="button"
                    onClick={() => navigateTo("assistant")}
                  >
                    🎙️ Voice Assistant kholein
                  </button>
                </div>
              ) : (
                pageDebts.map((debt) => {
                  const repayments = repaymentsByDebt[debt.id] || [];

                  return (
                    <article
                      className="connection-card debt-record-card"
                      key={debt.id}
                    >
                      <div className="connection-person">
                        <strong>{debt.otherUser}</strong>
                        <span>
                          Original: ₹{formatMoney(debt.principalPaise / 100)}
                        </span>
                        <span>
                          Repaid: ₹{formatMoney(debt.repaidPaise / 100)}
                        </span>
                        <strong>
                          Baaki: ₹{formatMoney(debt.outstandingPaise / 100)}
                        </strong>
                        <small>{formatDate(debt.createdAt)}</small>
                      </div>

                      <div className="debt-record-actions">
                        <button
                          className="popup-secondary"
                          type="button"
                          onClick={() => loadRepayments(debt.id)}
                          disabled={repaymentLoadingId === debt.id}
                        >
                          {repaymentLoadingId === debt.id
                            ? "Loading..."
                            : "Repayment history"}
                        </button>

                        {debt.outstandingPaise > 0 && (
                          <button
                            className="popup-primary"
                            type="button"
                            onClick={() => {
                              setCommandText(
                                debt.direction === "borrowed"
                                  ? `Maine ${debt.otherUser} ko payment ki`
                                  : `${debt.otherUser} ne mujhe payment ki`
                              );
                              setCommandResult(null);
                              setSelectedDebtId(debt.id);
                              navigateTo("assistant");
                            }}
                          >
                            Record repayment
                          </button>
                        )}
                      </div>

                      {repaymentsByDebt[debt.id] && (
                        <div className="repayment-history">
                          <strong>Repayment requests</strong>

                          {repayments.length === 0 ? (
                            <p>Abhi koi repayment record nahi hai.</p>
                          ) : (
                            repayments.map((repayment) => (
                              <div
                                className="ledger-transaction"
                                key={repayment.id}
                              >
                                <div className="transaction-info">
                                  <strong>
                                    ₹{formatMoney(repayment.amountPaise / 100)}
                                  </strong>
                                  <span>
                                    {repayment.payerEmail ||
                                      repayment.payerSide ||
                                      "Repayment"}
                                  </span>
                                  <small>
                                    {repayment.status} ·{" "}
                                    {formatDate(repayment.createdAt)}
                                  </small>
                                </div>

                                {repayment.status === "pending" &&
                                  repayment.createdByUserId !== user?.id && (
                                    <div className="connection-buttons">
                                      <button
                                        className="connection-accept"
                                        type="button"
                                        disabled={debtActionId === repayment.id}
                                        onClick={() =>
                                          respondToRepayment(
                                            repayment.id,
                                            "confirmed",
                                            debt.id
                                          )
                                        }
                                      >
                                        Accept
                                      </button>

                                      <button
                                        className="connection-reject"
                                        type="button"
                                        disabled={debtActionId === repayment.id}
                                        onClick={() =>
                                          respondToRepayment(
                                            repayment.id,
                                            "rejected",
                                            debt.id
                                          )
                                        }
                                      >
                                        Reject
                                      </button>
                                    </div>
                                  )}
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </article>
                  );
                })
              )}
            </div>
          </>
        )}

        <button
          className="popup-primary"
          type="button"
          onClick={() => navigateTo("assistant")}
        >
          🎙️ Naya udhaar / repayment
        </button>

        <button
          className="popup-secondary"
          type="button"
          onClick={loadDebts}
          disabled={debtLoading}
        >
          ↻ Refresh records
        </button>
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
              {connectionLoading
                ? "Please wait..."
                : "Send connection request"}
            </button>
          </form>
        </section>

        {connectionError && (
          <p className="assistant-error" role="alert">{connectionError}</p>
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

                <span className="connection-status pending">Pending</span>
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

                <span className="connection-status accepted">Connected</span>
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
          <p className="assistant-error" role="alert">{ledgerError}</p>
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
                    <div
                      className={`transaction-icon ${
                        isCredit ? "credit" : "payment"
                      }`}
                    >
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

                    <strong
                      className={`transaction-amount ${
                        isCredit ? "credit-text" : "payment-text"
                      }`}
                    >
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

  // Minimal Voice Assistant
  function AssistantPage() {
    const operation = commandResult?.operation;
    const isDebtCommand = operation === "create_debt";
    const isRepaymentCommand = operation === "record_repayment";

    const needsMoreInfo =
      phase === "clarification" ||
      (phase === "review" &&
        commandResult?.status !== "ready_for_review");

    const showReview =
      (phase === "review" || phase === "clarification") &&
      commandResult;

    return (
      <section className="assistant-main assistant-minimal">
        <div className="assistant-center">
          <button
            className="assistant-orb-button"
            type="button"
            onClick={() => {
              if (phase === "ready") {
                startListening("command");
              } else if (phase === "listening") {
                recognitionRef.current?.stop();
              }
            }}
            disabled={
              !["ready", "listening"].includes(phase)
            }
            aria-label="Tap to speak"
          >
            <div className={`ai-orb orb-${phase}`}>
              <div className="orb-inner">
                <span className="orb-icon">
                  {phase === "listening"
                    ? "Ⅱ"
                    : phase === "thinking" || phase === "saving"
                      ? "✦"
                      : phase === "saved"
                        ? "✓"
                        : "✦"}
                </span>
              </div>
            </div>
          </button>

          {phase === "ready" && (
            <>
              <p className="tap-to-speak">Tap to speak</p>

              <form
                className="minimal-command-form"
                onSubmit={handleTextCommand}
              >
                <input
                  className="minimal-command-input"
                  value={commandText}
                  onChange={(event) => setCommandText(event.target.value)}
                  placeholder="Apni baat likhein..."
                  aria-label="Apni baat likhein"
                />

                <button
                  className="minimal-send-button"
                  type="submit"
                  disabled={!commandText.trim() || isProcessing}
                  aria-label="Send command"
                >
                  ↑
                </button>
              </form>
            </>
          )}

          {phase === "listening" && (
            <div className="assistant-state-message">
              <strong>Main sun raha hoon...</strong>
              <p>{commandText || "Boliye..."}</p>

              <button
                className="minimal-secondary-button"
                type="button"
                onClick={() => recognitionRef.current?.stop()}
              >
                Stop
              </button>
            </div>
          )}

          {phase === "thinking" && (
            <div className="assistant-state-message">
              <div className="thinking-loader"></div>
              <strong>Samajh raha hoon...</strong>
            </div>
          )}

          {showReview && (
            <section className="minimal-review-card">
              <div className="minimal-card-top">
                <span className="minimal-card-label">
                  {needsMoreInfo ? "Need more information" : "Review details"}
                </span>

                <button
                  className="minimal-close-button"
                  type="button"
                  onClick={handleNewCommand}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <p className="minimal-understanding">
                {needsMoreInfo
                  ? commandResult.clarification ||
                    commandResult.message ||
                    "Mujhe thodi aur information chahiye."
                  : commandResult.understanding ||
                    commandResult.message ||
                    "Ye details check karein."}
              </p>

              {!needsMoreInfo && (
                <>
                  <div className="minimal-review-details">
                    {commandResult.counterparty && (
                      <div>
                        <span>Person</span>
                        <strong>{commandResult.counterparty}</strong>
                      </div>
                    )}

                    {commandResult.amount != null && (
                      <div>
                        <span>Amount</span>
                        <strong>₹{formatMoney(commandResult.amount)}</strong>
                      </div>
                    )}

                    {isDebtCommand && (
                      <div>
                        <span>Type</span>
                        <strong>
                          {commandResult.direction === "borrowed"
                            ? "Udhaar Liya"
                            : commandResult.direction === "lent"
                              ? "Udhaar Diya"
                              : "Clear nahi hai"}
                        </strong>
                      </div>
                    )}

                    {isRepaymentCommand && (
                      <div>
                        <span>Payment kisne ki?</span>
                        <strong>
                          {commandResult.paid_by === "me"
                            ? "Maine"
                            : commandResult.paid_by === "other"
                              ? "Doosre person ne"
                              : "Clear nahi hai"}
                        </strong>
                      </div>
                    )}
                  </div>

                  {isDebtCommand && (
                    <div className="review-selection">
                      <label htmlFor="connection-select">
                        Connected user
                      </label>

                      {matchedConnections.length === 1 ? (
                        <p>
                          <strong>{matchedConnections[0].otherUser}</strong>
                        </p>
                      ) : acceptedConnections.length > 0 ? (
                        <select
                          id="connection-select"
                          className="compact-input"
                          value={selectedConnectionId}
                          onChange={(event) =>
                            setSelectedConnectionId(event.target.value)
                          }
                        >
                          <option value="">Select connected user</option>
                          {acceptedConnections.map((connection) => (
                            <option
                              value={connection.id}
                              key={connection.id}
                            >
                              {connection.otherUser}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p>
                          Abhi koi connected user nahi hai. Pehle Connections
                          page par connect karein.
                        </p>
                      )}
                    </div>
                  )}

                  {isRepaymentCommand && (
                    <div className="review-selection">
                      <label htmlFor="debt-select">
                        Kis udhaar ki repayment hai?
                      </label>

                      {matchingDebts.length === 1 ? (
                        <p>
                          <strong>
                            {matchingDebts[0].otherUser} · ₹
                            {formatMoney(
                              matchingDebts[0].outstandingPaise / 100
                            )}{" "}
                            baaki
                          </strong>
                        </p>
                      ) : matchingDebts.length > 1 ? (
                        <select
                          id="debt-select"
                          className="compact-input"
                          value={selectedDebtId}
                          onChange={(event) =>
                            setSelectedDebtId(event.target.value)
                          }
                        >
                          <option value="">Select specific udhaar</option>
                          {matchingDebts.map((debt) => (
                            <option value={debt.id} key={debt.id}>
                              {debt.otherUser} · ₹
                              {formatMoney(debt.outstandingPaise / 100)} baaki
                            </option>
                          ))}
                        </select>
                      ) : (
                        <p>
                          Is person ka matching confirmed udhaar record nahi
                          mila.
                        </p>
                      )}
                    </div>
                  )}
                </>
              )}

              {needsMoreInfo ? (
                <>
                  <form
                    className="minimal-correction-form"
                    onSubmit={handleTextCorrection}
                  >
                    <input
                      className="minimal-command-input"
                      value={correctionText}
                      onChange={(event) =>
                        setCorrectionText(event.target.value)
                      }
                      placeholder="Apna jawab likhein..."
                      aria-label="Apna jawab likhein"
                    />

                    <button
                      className="minimal-send-button"
                      type="submit"
                      disabled={!correctionText.trim() || isProcessing}
                    >
                      ↑
                    </button>
                  </form>

                  <button
                    className="minimal-secondary-button"
                    type="button"
                    onClick={() => startListening("correction")}
                  >
                    🎙️ Bolkar jawab dein
                  </button>
                </>
              ) : (
                <>
                  <p className="popup-question">
                    {authStatus === "guest"
                      ? "Guest mode mein transaction save nahi hoga."
                      : "Kya ye details sahi hain?"}
                  </p>

                  {authStatus === "user" ? (
                    <div className="minimal-review-actions">
                      <button
                        className="popup-primary"
                        type="button"
                        onClick={handleConfirm}
                        disabled={
                          isProcessing ||
                          (isDebtCommand &&
                            acceptedConnections.length === 0) ||
                          (isRepaymentCommand &&
                            matchingDebts.length === 0)
                        }
                      >
                        Confirm
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
                        Edit
                      </button>
                    </div>
                  ) : (
                    <div className="minimal-review-actions">
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
              )}
            </section>
          )}

          {phase === "correction" && (
            <section className="minimal-review-card">
              <div className="minimal-card-top">
                <span className="minimal-card-label">Edit details</span>

                <button
                  className="minimal-close-button"
                  type="button"
                  onClick={() => setPhase("review")}
                  aria-label="Close"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleTextCorrection}>
                <input
                  className="minimal-command-input"
                  value={correctionText}
                  onChange={(event) => setCorrectionText(event.target.value)}
                  placeholder="Kya badalna hai?"
                />

                <button
                  className="popup-primary"
                  type="submit"
                  disabled={!correctionText.trim() || isProcessing}
                >
                  Apply correction
                </button>
              </form>

              <button
                className="minimal-secondary-button"
                type="button"
                onClick={() => startListening("correction")}
              >
                🎙️ Bolkar correct karein
              </button>
            </section>
          )}

          {phase === "saving" && (
            <div className="assistant-state-message">
              <div className="thinking-loader"></div>
              <strong>Request send ho rahi hai...</strong>
            </div>
          )}

          {phase === "saved" && transactionResult && (
            <section className="minimal-review-card confirmed-panel">
              <div className="confirmed-icon">✓</div>
              <strong>Request sent</strong>

              <p>{transactionResult.counterparty}</p>
              <p>Amount: ₹{formatMoney(transactionResult.amount)}</p>

              <p>
                {transactionResult.operation === "create_debt"
                  ? "Udhaar confirmation request doosre user ko bhej di gayi hai."
                  : "Repayment confirmation request doosre user ko bhej di gayi hai."}
              </p>

              <p className="privacy-note">
                Doosre user ke confirm karne ke baad hi ye confirmed balance
                mein dikhega.
              </p>

              <button
                className="popup-primary"
                type="button"
                onClick={handleNewCommand}
              >
                New command
              </button>
            </section>
          )}
        </div>

        {error && (
          <p className="assistant-error minimal-error" role="alert">
            {error}
          </p>
        )}
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
      {view === "connections" && authStatus === "user" && (
        <ConnectionsPage />
      )}
      {view === "customers" && authStatus === "user" && (
        <CustomersPage />
      )}
      {view === "assistant" && <AssistantPage />}
    </main>
  );
}
