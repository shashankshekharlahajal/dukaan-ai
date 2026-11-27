
import { useRef, useState } from "react";
import "./styles/main.css";
import { createSpeechRecognition } from "./services/speechRecognition.js";
import { understandShopkeeperCommand } from "./services/api.js";

export default function App() {
  const recognitionRef = useRef(null);

  const [phase, setPhase] = useState("ready");
  const [commandText, setCommandText] = useState("");
  const [correctionText, setCorrectionText] = useState("");
  const [commandResult, setCommandResult] = useState(null);
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

    try {
      const result = await understandShopkeeperCommand(text);

      setCommandResult(result);
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

    try {
      const result = await understandShopkeeperCommand(correctedCommand);

      setCommandResult(result);
      setCorrectionText("");
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

  function handleConfirm() {
    setPhase("confirmed");

    speak(
      "Aapne details confirm kar di hain. Transaction saving abhi available nahi hai."
    );
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
    setError("");
    setIsProcessing(false);
  }

  const isListening = phase === "listening";

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
            ) : phase === "thinking" ? (
              <span className="orb-icon">✦</span>
            ) : phase === "confirmed" ? (
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
          {phase === "confirmed" && "Details confirmed"}
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

          {phase === "confirmed" &&
            "Aapki details confirm ho gayi hain."}
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
                  disabled={!commandText.trim()}
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
                    <strong>{commandResult.intent.replaceAll("_", " ")}</strong>
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
                    >
                      <span>✓</span> Correct
                    </button>

                    <button
                      className="popup-secondary"
                      type="button"
                      onClick={() => {
                        setCorrectionText("");
                        setError("");
                        setPhase("correction");
                      }}
                    >
                      Change
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
                  disabled={!correctionText.trim()}
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

          {phase === "confirmed" && (
            <div className="confirmed-panel">
              <div className="confirmed-icon">✓</div>
              <strong>Details confirm ho gayi hain!</strong>

              <p>
                {commandResult?.customer || "Customer"} ·{" "}
                {commandResult?.amount != null
                  ? `₹${commandResult.amount}`
                  : "Amount pending"}
              </p>

              <p className="saving-warning">
                Transaction abhi database mein save nahi hui hai.
                Saving functionality agle backend step mein banegi.
              </p>

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
