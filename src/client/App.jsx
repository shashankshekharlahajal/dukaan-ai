
import { useRef, useState } from "react";
import "./styles/main.css";
import { createSpeechRecognition } from "./services/speechRecognition.js";
import { understandShopkeeperCommand } from "./services/api.js";

export default function App() {
  const recognitionRef = useRef(null);

  const [isListening, setIsListening] = useState(false);
  const [listeningFor, setListeningFor] = useState("command");

  const [transcript, setTranscript] = useState("");
  const [correction, setCorrection] = useState("");

  const [isProcessing, setIsProcessing] = useState(false);
  const [commandResult, setCommandResult] = useState(null);
  const [isConfirmed, setIsConfirmed] = useState(false);

  const [error, setError] = useState("");

  function speakResponse(message) {
    if (
      !message ||
      typeof window === "undefined" ||
      !window.speechSynthesis
    ) {
      return;
    }

    window.speechSynthesis.cancel();

    const speech = new SpeechSynthesisUtterance(message);
    speech.lang = "hi-IN";
    speech.rate = 0.95;
    speech.pitch = 1;

    window.speechSynthesis.speak(speech);
  }

  function startListening(target = "command") {
    setError("");

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    if (target === "command") {
      setTranscript("");
      setCommandResult(null);
      setCorrection("");
      setIsConfirmed(false);
    }

    if (target === "correction") {
      setCorrection("");
    }

    setListeningFor(target);

    const recognition = createSpeechRecognition({
      onStart: () => {
        setIsListening(true);
      },

      onResult: (text) => {
        if (target === "correction") {
          setCorrection(text);
        } else {
          setTranscript(text);
        }
      },

      onError: (message) => {
        setError(`Voice error: ${message}`);
      },

      onEnd: () => {
        setIsListening(false);
      }
    });

    if (!recognition) return;

    recognitionRef.current = recognition;

    try {
      recognition.start();
    } catch {
      setIsListening(false);
      setError("Microphone could not start. Please try again.");
    }
  }

  async function processCommand(text) {
    if (!text.trim()) {
      setError("Please speak or enter a command first.");
      return;
    }

    setIsProcessing(true);
    setError("");
    setIsConfirmed(false);

    try {
      const result = await understandShopkeeperCommand(text);

      setCommandResult(result);

      const responseMessage =
        result.message ||
        result.clarification ||
        result.understanding ||
        "Maine aapka command process kar liya hai. Kripya details check karein.";

      speakResponse(responseMessage);
    } catch (err) {
      setError(err.message || "Unable to process your command.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function handleUnderstandCommand() {
    setCommandResult(null);
    setCorrection("");
    setIsConfirmed(false);

    await processCommand(transcript);
  }

  async function handleCorrection() {
    if (!correction.trim()) {
      setError("Please tell me what needs to be corrected.");
      return;
    }

    const correctedCommand = `
Original shopkeeper command:
${transcript}

Shopkeeper's correction:
${correction}

Please understand the original command again using the correction.
Use the corrected information instead of the incorrect information.
Do not invent any details.
Return the updated understanding in the required JSON format.
`;

    const previousTranscript = transcript;

    await processCommand(correctedCommand);

    setTranscript(previousTranscript);
    setCorrection("");
  }

  function handleNewCommand() {
    setTranscript("");
    setCorrection("");
    setCommandResult(null);
    setError("");
    setIsConfirmed(false);

    if (window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }
  }

  function handleConfirm() {
    setIsConfirmed(true);

    const message =
      "Aapki details confirm ho gayi hain. Transaction saving abhi available nahi hai.";

    speakResponse(message);
  }

  return (
    <main className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand-icon">D</span>
          <span>Dukaan AI</span>
        </div>

        <span className="language-label">
          हिंदी / English
        </span>
      </header>

      <section className="welcome-section">
        <p className="eyebrow">VOICE-FIRST BUSINESS ASSISTANT</p>

        <h1>
          Namaste! 👋
          <br />
          Bataiye, aaj dukaan mein kya hua?
        </h1>

        <p className="welcome-description">
          Aap bolkar ya likhkar apni dukaan ka hisaab
          manage kar sakte hain. Main aapki baat samajhne
          aur details check karne mein madad karunga.
        </p>
      </section>

      <section className="voice-section">
        <div className={`voice-circle ${isListening ? "listening" : ""}`}>
          <span>{isListening ? "🔊" : "🎙️"}</span>
        </div>

        <h2>
          {isListening
            ? listeningFor === "correction"
              ? "Aapki correction sun raha hoon..."
              : "Aapki baat sun raha hoon..."
            : "Talk to Dukaan AI"}
        </h2>

        <p>
          {isListening
            ? "Apni baat poori karein. Main sun raha hoon."
            : "Mic dabakar boliye ya neeche apna command likhiye."}
        </p>

        <button
          className="voice-button"
          type="button"
          onClick={() => startListening("command")}
          disabled={isProcessing}
        >
          {isListening && listeningFor === "command"
            ? "Stop Listening"
            : "🎙️ Speak Command"}
        </button>

        <div className="transcript-box">
          <div className="review-heading">
            <strong>Your command</strong>
            <span className="review-tag">Voice / Text</span>
          </div>

          <textarea
            className="transcript-input"
            value={transcript}
            onChange={(event) => {
              setTranscript(event.target.value);
              setCommandResult(null);
              setIsConfirmed(false);
              setError("");
            }}
            placeholder="Example: रमेश ने ₹500 का सामान उधार लिया।"
            rows={3}
            disabled={isListening || isProcessing}
          />

          <button
            className="understand-button"
            type="button"
            onClick={handleUnderstandCommand}
            disabled={isProcessing || isListening || !transcript.trim()}
          >
            {isProcessing ? "AI is thinking..." : "Understand Command"}
          </button>
        </div>

        {commandResult && (
          <div className="command-result">
            <div className="review-heading">
              <strong>Dukaan AI understood</strong>
              <span className="review-tag">
                {commandResult.status === "ready_for_review"
                  ? "Review details"
                  : "Needs attention"}
              </span>
            </div>

            <p className="ai-message">
              {commandResult.message ||
                commandResult.clarification ||
                commandResult.understanding ||
                "Please review the information below."}
            </p>

            {commandResult.intent && (
              <div className="detail-row">
                <span>Action</span>
                <strong>{commandResult.intent}</strong>
              </div>
            )}

            {commandResult.customer && (
              <div className="detail-row">
                <span>Customer</span>
                <strong>{commandResult.customer}</strong>
              </div>
            )}

            {commandResult.amount != null && (
              <div className="detail-row">
                <span>Amount</span>
                <strong>₹{commandResult.amount}</strong>
              </div>
            )}

            {commandResult.product && (
              <div className="detail-row">
                <span>Product</span>
                <strong>{commandResult.product}</strong>
              </div>
            )}

            {commandResult.quantity != null && (
              <div className="detail-row">
                <span>Quantity</span>
                <strong>{commandResult.quantity}</strong>
              </div>
            )}

            <div className="detail-row">
              <span>Status</span>
              <strong>{commandResult.status}</strong>
            </div>

            {commandResult.status === "ready_for_review" && (
              <>
                <p className="review-notice">
                  Kya maine aapki baat sahi samjhi hai?
                  Agar koi detail galat hai toh neeche correction karein.
                </p>

                <div className="correction-box">
                  <strong>Correct something?</strong>

                  <textarea
                    className="transcript-input"
                    value={correction}
                    onChange={(event) => setCorrection(event.target.value)}
                    placeholder="Example: Customer ka naam Ramesh nahi, Suresh hai."
                    rows={3}
                    disabled={isListening || isProcessing || isConfirmed}
                  />

                  <button
                    className="correction-voice-button"
                    type="button"
                    onClick={() => startListening("correction")}
                    disabled={isProcessing || isConfirmed}
                  >
                    🎙️ Speak Correction
                  </button>

                  <button
                    className="understand-button"
                    type="button"
                    onClick={handleCorrection}
                    disabled={
                      isProcessing ||
                      isListening ||
                      !correction.trim() ||
                      isConfirmed
                    }
                  >
                    {isProcessing ? "Checking correction..." : "Send Correction"}
                  </button>
                </div>

                <button
                  className="confirm-button"
                  type="button"
                  onClick={handleConfirm}
                  disabled={isProcessing || isConfirmed}
                >
                  {isConfirmed ? "Details Confirmed" : "Yes, Confirm Details"}
                </button>
              </>
            )}

            {commandResult.status === "needs_clarification" && (
              <p className="review-notice">
                Kripya missing information apne agle command mein batayein.
                Abhi transaction save nahi hui hai.
              </p>
            )}

            {isConfirmed && (
              <p className="confirmation-notice">
                Details confirmed. Database saving abhi implement nahi hui hai.
                Koi transaction save nahi hui.
              </p>
            )}

            <button
              className="secondary-button"
              type="button"
              onClick={handleNewCommand}
            >
              Start New Command
            </button>
          </div>
        )}

        {error && (
          <p className="voice-error" role="alert">
            {error}
          </p>
        )}
      </section>

      <section className="features-section">
        <h2>Manage your business</h2>

        <div className="feature-list">
          <article className="feature-card">
            <span>💰</span>
            <div>
              <h3>Udhaar Management</h3>
              <p>Customer credit aur payments manage karein.</p>
            </div>
          </article>

          <article className="feature-card">
            <span>📊</span>
            <div>
              <h3>Sales Tracking</h3>
              <p>Daily sales aur business records dekhein.</p>
            </div>
          </article>

          <article className="feature-card">
            <span>📦</span>
            <div>
              <h3>Inventory</h3>
              <p>Products aur stock par nazar rakhein.</p>
            </div>
          </article>
        </div>
      </section>
    </main>
  );
}
