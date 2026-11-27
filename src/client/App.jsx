
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

function formatAmount(value) {
  return Number(value || 0).toLocaleString("en-IN", {
    maximumFractionDigits: 2
  });
}

export default function App() {
  const recognitionRef = useRef(null);
  const conversationEndRef = useRef(null);
  const composerRef = useRef(null);

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
  const [view, setView] = useState("assistant");
  const [phase, setPhase] = useState("ready");
  const [composerText, setComposerText] = useState("");
  const [correctionMode, setCorrectionMode] = useState(false);
  const [conversation, setConversation] = useState([]);
  const [commandText, setCommandText] = useState("");
  const [commandResult, setCommandResult] = useState(null);
  const [transactionResult, setTransactionResult] = useState(null);
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // Ledger
  const [customers, setCustomers] = useState([]);
  const [selectedLedger, setSelectedLedger] = useState(null);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [ledgerError, setLedgerError] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");

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

  useEffect(() => {
    conversationEndRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end"
    });
  }, [conversation, phase]);

  function addMessage(role, content) {
    setConversation((previous) => [
      ...previous,
      {
        id: createRequestId(),
        role,
        content
      }
    ]);
  }

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
        throw new Error(result.message || "Authentication nahi ho paaya.");
      }

      setUser(result.user);
      setAuthStatus("user");
      setAuthPassword("");
      setConfirmPassword("");
      setAuthError("");
      setView("assistant");
      setPhase("ready");
    } catch (err) {
      setAuthError(err.message || "Server se connect nahi ho paaya.");
    } finally {
      setAuthLoading(false);
    }
  }

  function openAuth(mode) {
    setAuthMode(mode);
    setAuthEmail("");
    setAuthPassword("");
    setConfirmPassword("");
    setAuthError("");
    setAuthStatus("form");
  }

  function continueAsGuest() {
    setUser(null);
    setAuthStatus("guest");
    setView("assistant");
    setPhase("ready");
    setConversation([]);
  }

  async function handleLogout() {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();

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
    setConversation([]);
    setCommandResult(null);
    setTransactionResult(null);
    setRequestId("");
    setCustomers([]);
    setSelectedLedger(null);
    setError("");
  }

  // Customer ledger
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
    window.speechSynthesis?.cancel();

    setView("customers");
    setCustomerSearch("");
    loadCustomers();
  }

  function backToCustomers() {
    setSelectedLedger(null);
    loadCustomers();
  }

  function backToAssistant() {
    setView("assistant");
    setSelectedLedger(null);
    setLedgerError("");
  }

  // AI command processing
  async function processCommand(text) {
    const cleanText = text.trim();

    if (!cleanText) return;

    setCommandText(cleanText);
    setComposerText("");
    setError("");
    setIsProcessing(true);
    setPhase("thinking");
    setCommandResult(null);
    setTransactionResult(null);
    setRequestId("");

    addMessage("user", cleanText);

    try {
      const result = await understandShopkeeperCommand(cleanText);

      setCommandResult(result);

      setRequestId(
        result.status === "ready_for_review"
          ? createRequestId()
          : ""
      );

      setPhase("review");

      const reply =
        result.message ||
        result.understanding ||
        result.clarification ||
        "Maine aapki baat samajh li hai.";

      addMessage("assistant", reply);
      speak(reply);
    } catch (err) {
      setError(err.message || "AI se connect nahi ho paaya.");
      setPhase("ready");
      addMessage("assistant", "Maaf kijiye, abhi command process nahi ho paayi. Dobara try karein.");
    } finally {
      setIsProcessing(false);
      setCorrectionMode(false);
    }
  }

  async function processCorrection(text) {
    const cleanText = text.trim();

    if (!cleanText) return;

    const correctedCommand = `
The shopkeeper originally said:
${commandText}

The shopkeeper now corrects the information:
${cleanText}

Understand the complete command again.
Apply the correction to the original command.
Do not keep information that the shopkeeper has corrected.
Do not invent missing information.
Return the same required JSON structure.
`;

    setComposerText("");
    setError("");
    setIsProcessing(true);
    setPhase("thinking");
    setRequestId("");

    addMessage("user", cleanText);

    try {
      const result = await understandShopkeeperCommand(correctedCommand);

      setCommandResult(result);
      setRequestId(
        result.status === "ready_for_review"
          ? createRequestId()
          : ""
      );

      setPhase("review");
      setCorrectionMode(false);

      const reply =
        result.message ||
        result.understanding ||
        result.clarification ||
        "Maine aapki correction samajh li hai.";

      addMessage("assistant", reply);
      speak(reply);
    } catch (err) {
      setError(err.message || "Correction process nahi ho paayi.");
      setPhase("review");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleComposerSubmit(event) {
    event.preventDefault();

    if (isProcessing) return;

    if (correctionMode) {
      processCorrection(composerText);
    } else {
      processCommand(composerText);
    }
  }

  // Voice input
  function startListening() {
    setError("");

    const recognition = createSpeechRecognition({
      onStart: () => {
        setPhase("listening");
      },

      onResult: (text) => {
        setComposerText(text);
      },

      onError: (message) => {
        setError(`Voice error: ${message}`);
        setPhase(commandResult ? "review" : "ready");
      },

      onEnd: () => {
        setPhase(commandResult ? "review" : "ready");
      }
    });

    if (!recognition) {
      setError("Is browser mein voice recognition available nahi hai.");
      setPhase(commandResult ? "review" : "ready");
      return;
    }

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setError("Microphone start nahi ho paaya. Dobara try karein.");
      setPhase(commandResult ? "review" : "ready");
    }
  }

  function stopListening() {
    recognitionRef.current?.stop();
    setPhase(commandResult ? "review" : "ready");
  }

  // Explicit transaction confirmation
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

      const reply =
        `${result.customer} ka transaction save ho gaya hai. ` +
        `Ab unka baaki balance ${result.balance} rupaye hai.`;

      addMessage("assistant", reply);
      speak(reply);
    } catch (err) {
      setError(err.message || "Transaction save nahi ho paayi.");
      setPhase("review");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleNewChat() {
    recognitionRef.current?.abort();
    window.speechSynthesis?.cancel();

    setConversation([]);
    setPhase("ready");
    setComposerText("");
    setCommandText("");
    setCommandResult(null);
    setTransactionResult(null);
    setRequestId("");
    setCorrectionMode(false);
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

  // Initial loading
  if (authStatus === "checking") {
    return (
      <main className="app-shell">
        <div className="loading-screen">
          <div className="brand-mark">D</div>
          <div className="thinking-loader"></div>
          <p>Dukaan AI load ho raha hai...</p>
        </div>
      </main>
    );
  }

  // Login and signup
  if (authStatus === "choice" || authStatus === "form") {
    return (
      <main className="app-shell">
        <header className="topbar">
          <div className="brand">
            <span className="brand-mark">D</span>
            <span>Dukaan AI</span>
          </div>
        </header>

        <section className="auth-screen">
          <div className="auth-card">
            <div className="auth-symbol">✦</div>

            {authStatus === "choice" ? (
              <>
                <h1>Namaste! 👋</h1>
                <p>Apni dukaan ko awaaz se manage karein.</p>

                <button
                  className="primary-button full-button"
                  onClick={() => openAuth("login")}
                  type="button"
                >
                  Login
                </button>

                <button
                  className="secondary-button full-button"
                  onClick={() => openAuth("signup")}
                  type="button"
                >
                  Create account
                </button>

                <div className="auth-divider">
                  <span>or</span>
                </div>

                <button
                  className="guest-button"
                  onClick={continueAsGuest}
                  type="button"
                >
                  Continue as Guest
                </button>

                <small>
                  Guest mode mein commands database mein save nahi honge.
                </small>
              </>
            ) : (
              <>
                <h1>
                  {authMode === "signup"
                    ? "Create your account"
                    : "Welcome back"}
                </h1>

                <p>
                  {authMode === "signup"
                    ? "Dukaan AI ke saath shuruaat karein."
                    : "Apne account mein login karein."}
                </p>

                <form onSubmit={handleAuthSubmit} className="auth-form">
                  <input
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    placeholder="Email address"
                    autoComplete="email"
                    required
                  />

                  <input
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
                    <p className="error-message" role="alert">
                      {authError}
                    </p>
                  )}

                  <button
                    className="primary-button full-button"
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

                <button
                  className="guest-button"
                  type="button"
                  onClick={() => openAuth(
                    authMode === "signup" ? "login" : "signup"
                  )}
                >
                  {authMode === "signup"
                    ? "Already have an account? Login"
                    : "New here? Create account"}
                </button>

                <button
                  className="back-link"
                  type="button"
                  onClick={() => {
                    setAuthStatus("choice");
                    setAuthError("");
                  }}
                >
                  ← Back
                </button>
              </>
            )}
          </div>
        </section>
      </main>
    );
  }

  const isGuest = authStatus === "guest";

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">D</span>
          <span>Dukaan AI</span>
        </div>

        <div className="topbar-actions">
          {authStatus === "user" && (
            <>
              <button
                className={`nav-button ${view === "customers" ? "active" : ""}`}
                type="button"
                onClick={view === "assistant" ? openKhata : backToAssistant}
              >
                {view === "assistant" ? "Khata" : "Assistant"}
              </button>

              <button
                className="nav-button"
                type="button"
                onClick={handleLogout}
              >
                Logout
              </button>
            </>
          )}

          {isGuest && (
            <button
              className="nav-button"
              type="button"
              onClick={() => setAuthStatus("choice")}
            >
              Login
            </button>
          )}

          <span className="account-label">
            <span className="online-dot"></span>
            {isGuest ? "Guest" : user?.email}
          </span>
        </div>
      </header>

      {view === "customers" && authStatus === "user" ? (
        <section className="ledger-screen">
          <div className="ledger-heading">
            <div>
              <span className="eyebrow">YOUR BUSINESS</span>
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

            {selectedLedger && (
              <button
                className="back-button"
                type="button"
                onClick={backToCustomers}
              >
                ← Customers
              </button>
            )}
          </div>

          {ledgerError && (
            <p className="error-message" role="alert">{ledgerError}</p>
          )}

          {ledgerLoading && (
            <div className="ledger-loading">
              <div className="thinking-loader"></div>
              <span>Khata load ho raha hai...</span>
            </div>
          )}

          {!ledgerLoading && !selectedLedger && (
            <>
              <input
                className="search-input"
                value={customerSearch}
                onChange={(event) => setCustomerSearch(event.target.value)}
                placeholder="Search customers..."
              />

              <div className="customer-list">
                {filteredCustomers.map((customer) => (
                  <button
                    className="customer-row"
                    key={customer.id}
                    type="button"
                    onClick={() => openLedger(customer.id)}
                  >
                    <span className="customer-avatar">
                      {customer.name.charAt(0).toUpperCase()}
                    </span>

                    <span className="customer-info">
                      <strong>{customer.name}</strong>
                      <small>Customer #{customer.id}</small>
                    </span>

                    <span className="customer-total">
                      <strong>₹{formatAmount(customer.balance)}</strong>
                      <small>Baaki</small>
                    </span>
                  </button>
                ))}

                {filteredCustomers.length === 0 && (
                  <div className="empty-state">
                    {customers.length === 0
                      ? "Abhi koi customer record nahi hai."
                      : "Is naam ka customer nahi mila."}
                  </div>
                )}
              </div>
            </>
          )}

          {!ledgerLoading && selectedLedger && (
            <div className="ledger-detail">
              <div className="balance-card">
                <span>Current outstanding balance</span>
                <strong>₹{formatAmount(selectedLedger.customer.balance)}</strong>
              </div>

              <h2>Transaction history</h2>

              <div className="ledger-transactions">
                {selectedLedger.transactions.map((transaction) => {
                  const isCredit = transaction.type === "add_credit";

                  return (
                    <article className="ledger-transaction" key={transaction.id}>
                      <span className={`ledger-icon ${isCredit ? "credit" : "payment"}`}>
                        {isCredit ? "↑" : "↓"}
                      </span>

                      <div className="ledger-transaction-info">
                        <strong>
                          {isCredit ? "Naya udhaar" : "Payment received"}
                        </strong>
                        <small>{formatDate(transaction.createdAt)}</small>
                        {transaction.originalCommand && (
                          <p>{transaction.originalCommand}</p>
                        )}
                      </div>

                      <strong className={isCredit ? "credit-text" : "payment-text"}>
                        {isCredit ? "+" : "−"}₹{formatAmount(transaction.amount)}
                      </strong>
                    </article>
                  );
                })}

                {selectedLedger.transactions.length === 0 && (
                  <div className="empty-state">
                    Is customer ki transaction history abhi khaali hai.
                  </div>
                )}
              </div>
            </div>
          )}
        </section>
      ) : (
        <section className="chat-screen">
          <div className="chat-content">
            {conversation.length === 0 ? (
              <div className="welcome-screen">
                <div className="welcome-orb">
                  <span>✦</span>
                </div>

                <span className="eyebrow">YOUR BUSINESS ASSISTANT</span>
                <h1>
                  Namaste! <span>👋</span>
                  <br />
                  Aaj kya hua dukaan mein?
                </h1>
                <p>
                  Aap bolkar ya likhkar apne customers ka udhaar
                  aur payment record kar sakte hain.
                </p>

                <div className="suggestion-list">
                  <button
                    type="button"
                    onClick={() => setComposerText("Ramesh ne ₹500 ka samaan udhaar liya.")}
                  >
                    <span>＋</span>
                    Naya udhaar record karein
                  </button>

                  <button
                    type="button"
                    onClick={() => setComposerText("Ramesh ne apne udhaar ke ₹500 chuka diye.")}
                  >
                    <span>↓</span>
                    Payment record karein
                  </button>
                </div>
              </div>
            ) : (
              <div className="conversation">
                {conversation.map((message) => (
                  <article
                    className={`chat-message ${message.role}`}
                    key={message.id}
                  >
                    {message.role === "assistant" && (
                      <span className="message-avatar">D</span>
                    )}

                    <div className="message-content">
                      {message.role === "assistant" && (
                        <span className="message-author">Dukaan AI</span>
                      )}
                      <p>{message.content}</p>
                    </div>
                  </article>
                ))}

                {phase === "thinking" && (
                  <div className="chat-message assistant">
                    <span className="message-avatar">D</span>
                    <div className="message-content">
                      <span className="message-author">Dukaan AI</span>
                      <div className="typing-indicator">
                        <span></span>
                        <span></span>
                        <span></span>
                      </div>
                    </div>
                  </div>
                )}

                {phase === "listening" && (
                  <div className="listening-indicator">
                    <span className="listening-dot"></span>
                    Main sun raha hoon...
                  </div>
                )}

                {phase === "review" && commandResult && (
                  <div className="transaction-card">
                    <div className="transaction-card-heading">
                      <span className="card-check">✓</span>
                      <div>
                        <strong>Transaction details</strong>
                        <small>Ek baar details check kar lijiye</small>
                      </div>
                    </div>

                    {commandResult.customer && (
                      <div className="transaction-detail-row">
                        <span>Customer</span>
                        <strong>{commandResult.customer}</strong>
                      </div>
                    )}

                    {commandResult.amount != null && (
                      <div className="transaction-detail-row">
                        <span>Amount</span>
                        <strong>₹{formatAmount(commandResult.amount)}</strong>
                      </div>
                    )}

                    {commandResult.intent && (
                      <div className="transaction-detail-row">
                        <span>Action</span>
                        <strong>{actionLabel}</strong>
                      </div>
                    )}

                    {commandResult.status === "ready_for_review" ? (
                      isGuest ? (
                        <>
                          <p className="guest-warning">
                            Guest mode mein transaction save nahi hoga.
                          </p>
                          <button
                            className="primary-button full-button"
                            type="button"
                            onClick={() => setAuthStatus("choice")}
                          >
                            Create account to save
                          </button>
                        </>
                      ) : (
                        <>
                          <p className="confirm-question">
                            Kya maine sahi samjha?
                          </p>

                          <div className="confirmation-actions">
                            <button
                              className="primary-button"
                              type="button"
                              onClick={handleConfirm}
                              disabled={isProcessing}
                            >
                              ✓ Confirm & save
                            </button>

                            <button
                              className="secondary-button"
                              type="button"
                              onClick={() => {
                                setCorrectionMode(true);
                                setComposerText("");
                                composerRef.current?.focus();
                              }}
                            >
                              Correct details
                            </button>
                          </div>
                        </>
                      )
                    ) : (
                      <p className="guest-warning">
                        Kripya neeche jawab dein taaki main details samajh sakoon.
                      </p>
                    )}
                  </div>
                )}

                {phase === "saving" && (
                  <div className="saving-indicator">
                    <div className="thinking-loader"></div>
                    Transaction securely save ho raha hai...
                  </div>
                )}

                {phase === "saved" && transactionResult && (
                  <div className="saved-card">
                    <span className="saved-check">✓</span>
                    <div>
                      <strong>Transaction saved successfully</strong>
                      <p>
                        {transactionResult.customer} · ₹
                        {formatAmount(transactionResult.amount)}
                      </p>
                      <small>
                        Updated balance: ₹{formatAmount(transactionResult.balance)}
                      </small>
                    </div>
                  </div>
                )}

                <div ref={conversationEndRef} />
              </div>
            )}
          </div>

          <div className="composer-area">
            {error && (
              <p className="error-message" role="alert">{error}</p>
            )}

            {correctionMode && (
              <div className="correction-label">
                Correction mode
                <button
                  type="button"
                  onClick={() => setCorrectionMode(false)}
                >
                  Cancel
                </button>
              </div>
            )}

            <form className="chat-composer" onSubmit={handleComposerSubmit}>
              <textarea
                ref={composerRef}
                value={composerText}
                onChange={(event) => setComposerText(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === "Enter" &&
                    !event.shiftKey &&
                    !isProcessing
                  ) {
                    event.preventDefault();
                    if (composerText.trim()) {
                      correctionMode
                        ? processCorrection(composerText)
                        : processCommand(composerText);
                    }
                  }
                }}
                placeholder={
                  correctionMode
                    ? "Apni correction batayein..."
                    : "Dukaan mein kya hua, batayein..."
                }
                rows={1}
                disabled={isProcessing}
              />

              <div className="composer-controls">
                <span className="composer-hint">
                  {isGuest ? "Guest mode · Not saved" : "AI can make mistakes. Please verify."}
                </span>

                <div className="composer-buttons">
                  {phase === "listening" ? (
                    <button
                      className="mic-button listening"
                      type="button"
                      onClick={stopListening}
                      aria-label="Stop listening"
                    >
                      ■
                    </button>
                  ) : (
                    <button
                      className="mic-button"
                      type="button"
                      onClick={startListening}
                      disabled={isProcessing}
                      aria-label="Start voice input"
                    >
                      🎙
                    </button>
                  )}

                  <button
                    className="send-button"
                    type="submit"
                    disabled={!composerText.trim() || isProcessing}
                    aria-label="Send message"
                  >
                    ↑
                  </button>
                </div>
              </div>
            </form>

            <div className="bottom-caption">
              Dukaan AI · Your voice-first business assistant
            </div>
          </div>
        </section>
      )}

      {view === "assistant" && conversation.length > 0 && (
        <button
          className="new-chat-button"
          type="button"
          onClick={handleNewChat}
        >
          + New chat
        </button>
      )}
    </main>
  );
}
