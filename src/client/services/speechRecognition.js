
export function createSpeechRecognition({
  onResult,
  onError,
  onStart,
  onEnd
}) {
  const SpeechRecognition =
    window.SpeechRecognition ||
    window.webkitSpeechRecognition;

  if (!SpeechRecognition) {
    onError?.(
      "Voice recognition is not supported in this browser. Please use text input."
    );

    return null;
  }

  const recognition = new SpeechRecognition();

  recognition.lang = "hi-IN";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  recognition.onstart = () => {
    onStart?.();
  };

  recognition.onresult = (event) => {
    let transcript = "";

    for (
      let i = event.resultIndex;
      i < event.results.length;
      i++
    ) {
      transcript += event.results[i][0].transcript;
    }

    onResult?.(transcript.trim());
  };

  recognition.onerror = (event) => {
    onError?.(event.error);
  };

  recognition.onend = () => {
    onEnd?.();
  };

  return {
    start() {
      recognition.start();
    },

    stop() {
      recognition.stop();
    },

    abort() {
      recognition.abort();
    }
  };
}
