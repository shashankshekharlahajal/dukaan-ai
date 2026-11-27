
import { useRef, useState } from "react";
import "./styles/main.css";
import { createSpeechRecognition } from "./services/speechRecognition.js";
import { understandShopkeeperCommand } from "./services/api.js";

export default function App() {
  const recognitionRef = useRef(null);

  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [commandResult, setCommandResult] = useState(null);
  const [error, setError] = useState("");

  function handleVoiceInput() {
    setError("");
    setCommandResult(null);

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    setTranscript("");

    const recognition = createSpeechRecognition({
      onStart: () => {
        setIsListening(true);
      },

      onResult: (text) => {
        setTranscript(text);
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

  async function handleUnderstandCommand() {
    if (!transcript.trim()) {
      setError("Please speak or enter a command first.");
      return;
    }

    setIsProcessing(true);
    setError("");
    setCommandResult(null);

    try {
      const result = await understandShopkeeperCommand(transcript);
      setCommandResult(result);
    } catch (err) {
      setError(err.message || "Unable to process your command.");
    } finally {
      setIsProcessing(false);
    }
  }

  function handleTranscriptChange(event) {
    setTranscript(event.target.value);
    setCommandResult(null);
    setError("");
  }

  function handleNewCommand() {
    setTranscript("");
    setCommandResult(null);
    setError("");
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
        <p className="eyebrow">YOUR BUSINESS ASSISTANT</p>

        <h1>
          Namaste! 👋
          <br />
          Aaj dukaan kaise chal rahi hai?
        </h1>

        <p className="welcome-description">
          Apni dukaan ka hisaab-kitab bas bolkar manage karein.
        </p>
      </section>

      <section className="voice-section">
        <div className="voice-circle">
          <span>🎙️</span>
        </div>

        <h2>
          {isListening ? "Sun raha hoon..." : "Talk to Dukaan AI"}
        </h2>

        <p>
          {isListening
            ? "Apni baat boliye. Main sun raha hoon."
            : "Apni baat boliye. Main aapki madad karunga."}
        </p>

        <button
          className="voice-button"
          type="button"
          onClick={handleVoiceInput}
          disabled={isProcessing}
        >
          {isListening ? "Stop Listening" : "Start Speaking"}
        </button>

        {transcript !== "" && (
          <div className="transcript-box">
            <div className="review-heading">
              <strong>Your spoken command</strong>
              <span className="review-tag">Editable</span>
            </div>

            <textarea
              className="transcript-input"
              value={transcript}
              onChange={handleTranscriptChange}
              placeholder="Your spoken words will appear here..."
              rows={3}
              disabled={isListening || isProcessing}
            />

            <p className="edit-hint">
              Spelling ya words galat hain toh yahan correct karein.
            </p>

            <button
              className="understand-button"
              type="button"
              onClick={handleUnderstandCommand}
              disabled={isProcessing || isListening || !transcript.trim()}
            >
              {isProcessing
                ? "Understanding..."
                : commandResult
                  ? "Understand Again"
                  : "Understand Command"}
            </button>
          </div>
        )}

        {commandResult && (
          <div className="command-result">
            <div className="review-heading">
              <strong>I understood this</strong>
              <span className="review-tag">Review required</span>
            </div>

            <p className="ai-message">
              {commandResult.message}
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

            <div className="detail-row">
              <span>Status</span>
              <strong>{commandResult.status}</strong>
            </div>

            <p className="review-notice">
              Please check these details. No transaction has been saved.
            </p>

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
