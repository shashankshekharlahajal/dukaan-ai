
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

async function fetchApi(url) {
  const response = await fetch(url, {
    credentials: "same-origin"
  });

  const result = await response.json();

  if (!response.ok || result.success === false) {
    throw new Error(result.message || "Data load nahi ho paaya.");
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

  // Assistant
  const [phase, setPhase] = useState("ready");
  const [view, setView] = useState("assistant");

  const [commandText, setCommandText] = useState("");
  const [correctionText, setCorrectionText] = useState("");

  const [commandResult, setCommandResult] = useState(null);
  const [transactionResult, setTransactionResult] = useState(null);

  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Customer ledger
  const [customers, setCustomers] = useState([]);
  const [selectedLedger, setSelectedLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

  // Check existing login session.
  useEffect(() => {
    async function checkSession() {
      try {
        const result = await fetchApi("/api/auth/me");

        if (result.user) {
          setUser(result.user);
          setAuthStatus("user");
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

  function speak(message) {
    if (!message || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "hi-IN";
    utterance.rate = 0.95;

    window.speechSynthesis.speak(utterance);
  }

  // Signup and login
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
      const response = await fetch(`/api/auth/${authMode}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email: authEmail.trim(),
          password: authPassword
        })
      });

      const result = await response.json();

      if (!response.ok || result.success === false) {
        throw new Error(
          result.message || "Authentication nahi ho paaya."
        );
      }

      setUser(result.user);
      setAuthStatus("user");

      setAuthPassword("");
      setConfirmPassword("");
      setAuthError("");
      setView("assistant");
      setPhase("ready");
    } catch (err) {
      setAuthError(
        err.message || "Server se connect nahi ho paaya."
      );
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
  }

  function openAuth(mode) {
    setAuthMode(mode);
    setAuthEmail("");
    setAuthPassword("");
    setConfirmPassword("");
    setAuthError("");
    setAuthStatus("form");
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

    setCommandText("");
    setCorrectionText("");
    setCommandResult(null);
    setTransactionResult(null);
    setRequestId("");
    setCustomers([]);
    setSelectedLedger(null);
    setError("");
  }

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

  function openKhata() {
    if (authStatus !== "user") return;

    recognitionRef.current?.abort();

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    setView("customers");
    setCustomerSearch("");
    setLedgerError("");
    loadCustomers();
  }

  function backToCustomers() {
    setSelectedLedger(null);
    setLedgerError("");
    loadCustomers();
  }

  function backToAssistant() {
    setView("assistant");
    setSelectedLedger(null);
    setLedgerError("");
  }

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
The shopkeeper originally said:
${commandText}

The shopkeeper now corrects the information:
${text}

Understand the complete command again.
Apply the correction to the original command.
Do not keep information that the shopkeeper has corrected.
Do not invent missing information.
Return the same required JSON structure.
`;

    setIsProcessing(true);
    setError("");
    setPhase("thinking");
    setRequestId("");

    try {
      const result = await understandShopkeeperCommand(
        correctedCommand
      );

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
      setError("Transaction save karne ke liye account banana ya login karna zaroori hai.");
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
      setError(
        err.message || "Transaction save nahi ho paayi. Dobara try karein."
      );
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

  // Initial session check.
  if (authStatus === "checking") {
    return (
      <main className="assistant-app">
        <section className="assistant-main">
          <div className="thinking-panel">
            <div className="thinking-loader"></div>
            <strong>Dukaan AI load ho raha hai...</strong>
          </div>
        </section>
      </main>
    );
  }

  // Welcome, login and signup screens.
  if (authStatus === "choice" || authStatus === "form") {
    return (
      <main className="assistant-app">
        <header className="assistant-header">
          <div className="brand">
            <span className="brand-icon">D</span>
            <span>Dukaan AI</span>
          </div>

          <span className="header-status">
            <span className="status-dot"></span>
            Welcome
          </span>
        </header>

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
                Aapki dukaan ka smart business assistant.
              </p>

              <section className="assistant-popup">
                <div className="popup-heading">
                  Dukaan AI mein aapka swagat hai
                </div>

                <p className="understanding-text">
                  Apne account se login karein ya naya account banayein.
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
                  Guest mode mein aap AI try kar sakte hain.
                  Aapke commands database mein save nahi honge.
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
                      authMode === "signup"
                        ? "new-password"
                        : "current-password"
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
                      onChange={(event) =>
                        setConfirmPassword(event.target.value)
                      }
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
                  onClick={() => openAuth(
                    authMode === "signup" ? "login" : "signup"
                  )}
                >
                  {authMode === "signup"
                    ? "Already have an account? Login"
                    : "New to Dukaan AI? Create account"}
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
            Dukaan AI · Your Voice-First Business Assistant
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="assistant-app">
      <header className="assistant-header">
        <div className="brand">
          <span className="brand-icon">D</span>
          <span>Dukaan AI</span>
        </div>

        <div className="header-actions">
          {authStatus === "user" && (
            <>
              <button
                className="khata-nav-button"
                type="button"
                onClick={view === "assistant" ? openKhata : backToAssistant}
              >
                {view === "assistant" ? "Khata" : "Assistant"}
              </button>

              <button
                className="khata-nav-button"
                type="button"
                onClick={handleLogout}
              >
                Logout
              </button>
            </>
          )}

          {authStatus === "guest" && (
            <button
              className="khata-nav-button"
              type="button"
              onClick={() => setAuthStatus("choice")}
            >
              Login
            </button>
          )}

          <span className="header-status">
            <span className="status-dot"></span>
            {authStatus === "guest"
              ? "Guest"
              : view === "assistant"
                ? "Assistant"
                : "Khata"}
          </span>
        </div>
      </header>

      {view === "customers" && authStatus === "user" ? (
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
              {selectedLedger
                ? selectedLedger.customer.name
                : "Customer Khata"}
            </h1>

            <p>
              {selectedLedger
                ? "Customer ka udhaar aur payment history."
                : "Apne customers aur unka baaki balance dekhein."}
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
                      <strong>
                        ₹{Number(customer.balance).toLocaleString("en-IN")}
                      </strong>
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
                <strong>
                  ₹{Number(selectedLedger.customer.balance).toLocaleString("en-IN")}
                </strong>
              </div>

              <h2>Transaction History</h2>

              <div className="ledger-transactions">
                {selectedLedger.transactions.map((transaction) => {
                  const isCredit = transaction.type === "add_credit";

                  return (
                    <article
                      className="ledger-transaction"
                      key={transaction.id}
                    >
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
                        {isCredit ? "+" : "−"}₹
                        {Number(transaction.amount).toLocaleString("en-IN")}
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

          <p className="privacy-note">
            Dukaan AI · Customer Khata
          </p>
        </section>
      ) : (
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
            {phase === "saving" && "Record save ho raha hai..."}
            {phase === "saved" && "Transaction saved!"}
          </h1>

          <p className="assistant-subtitle">
            {phase === "ready" && "Bataiye, aaj aapki dukaan mein kya hua?"}
            {phase === "listening" && "Apni baat poori karein. Main dhyan se sun raha hoon."}
            {phase === "thinking" && "Aapki baat samajhne ki koshish kar raha hoon."}
            {phase === "review" && "Maine aapki baat ko is tarah samjha hai."}
            {phase === "saving" && "Aapka transaction database mein save kar raha hoon."}
            {phase === "saved" && "Aapka transaction successfully record ho gaya hai."}
          </p>

          <section className="assistant-popup" key={phase}>
            {phase === "ready" && (
              <>
                <div className="popup-heading">
                  Aapse sunna chahta hoon
                </div>

                <form onSubmit={handleTextCommand}>
                  <textarea
                    className="compact-input"
                    value={commandText}
                    onChange={(event) => setCommandText(event.target.value)}
                    placeholder="Yahan command likhiye..."
                    rows={2}
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
                  {correctionText
                    ? "Correction sun raha hoon"
                    : "Aapki baat sun raha hoon"}
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
                          onClick={() => {
                            setCommandResult(null);
                            setPhase("ready");
                            setCommandText("");
                            setRequestId("");
                            setAuthStatus("choice");
                          }}
                        >
                          Create account to save
                        </button>

                        <button
                          className="popup-secondary"
                          type="button"
                          onClick={() => {
                            setPhase("ready");
                            setCommandText("");
                            setCommandResult(null);
                            setRequestId("");
                          }}
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
                    rows={2}
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
                    <strong>
                      ₹{Number(transactionResult.balance).toLocaleString("en-IN")}
                    </strong>
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

          {authStatus === "guest" && (
            <p className="privacy-note">
              Guest mode · Commands are not saved
            </p>
          )}

          {authStatus === "user" && (
            <p className="privacy-note">
              Logged in as {user?.email}
            </p>
          )}

          {authStatus !== "guest" && authStatus !== "user" && (
            <p className="privacy-note">
              Dukaan AI · Your Voice-First Business Assistant
            </p>
          )}
        </section>
      )}
    </main>
  );
}
