
import { useRef, useState } from "react";
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

export default function App() {
  const recognitionRef = useRef(null);

  const [phase, setPhase] = useState("ready");
  const [commandText, setCommandText] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [commandResult, setCommandResult] = useState(null);
  const [transactionResult, setTransactionResult] = useState(null);
  const [requestId, setRequestId] = useState("");
  const [error, setError] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  function speak(message) {
    if (!message || !window.speechSynthesis) return;

    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = "hi-IN";
    utterance.rate = 0.95;

    window.speechSynthesis.speak(utterance);
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
        "Maine aapka command samajh liya hai."
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

    if (phase === "listening") {
      recognitionRef.current?.stop();
      return;
    }

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
      onStart: () => {
        setPhase("listening");
      },

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
      !Number.isSafeInteger(commandResult.amount) ||
      commandResult.amount <= 0 ||
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
        amount: commandResult.amount,
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

  const isListening = phase === "listening";

  const actionLabel =
    commandResult?.intent === "add_credit"
      ? "Udhaar add karna"
      : commandResult?.intent === "record_payment"
        ? "Payment receive karna"
        : "Action";

  return (
    <main className="assistant-app">
      <header className="assistant-header">
        <div className="brand">
          <span className="brand-icon">D</span>
          <span>Dukaan AI</span>
        </div>

        <span className="header-status">
          <span className="status-dot"></span>
          Assistant
        </span>
      </header>

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
          {phase === "ready" &&
            "Bataiye, aaj aapki dukaan mein kya hua?"}

          {phase === "listening" &&
            "Apni baat poori karein. Main dhyan se sun raha hoon."}

          {phase === "thinking" &&
            "Aapki baat samajhne ki koshish kar raha hoon."}

          {phase === "review" &&
            "Maine aapki baat ko is tarah samjha hai."}

          {phase === "saving" &&
            "Aapka transaction database mein save kar raha hoon."}

          {phase === "saved" &&
            "Aapka transaction successfully record ho gaya hai."}
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
                  Send command
                  <span>→</span>
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
                <span>🎙️</span>
                Bolkar batayein
              </button>
            </>
          )}

          {phase === "listening" && (
            <div className="listening-panel">
              <div className="sound-bars">
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
                <span></span>
              </div>

              <strong>
                {correctionText
                  ? "Correction sun raha hoon"
                  : "Aapki baat sun raha hoon"}
              </strong>

              <p>
                {correctionText || commandText || "Boliye..."}
              </p>

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
              <div className="popup-heading">
                Maine ye samjha hai
              </div>

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
                    Kya maine sahi samjha?
                  </p>

                  <div className="popup-actions">
                    <button
                      className="popup-primary"
                      type="button"
                      onClick={handleConfirm}
                      disabled={isProcessing}
                    >
                      <span>✓</span> Haan, record karo
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
              <div className="popup-heading">
                Kya correct karna hai?
              </div>

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
                  Send correction
                  <span>→</span>
                </button>
              </form>

              <button
                className="popup-mic"
                type="button"
                onClick={() => startListening("correction")}
              >
                <span>🎙️</span>
                Bolkar correct karein
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

              <p>
                {transactionResult.customer}
              </p>

              <p>
                Transaction: ₹{transactionResult.amount}
              </p>

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

        <p className="privacy-note">
          Dukaan AI · Your voice-first business assistant
        </p>
      </section>
    </main>
  );
}
