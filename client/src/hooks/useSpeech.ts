import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Browser speech (Web Speech API): talk instead of type, and hear replies
 * instead of reading them. Recognition exists in Chrome/Edge (Android too) and
 * Safari 14.5+, not Firefox; callers hide the mic where it's unsupported.
 * Chrome sends the audio to Google for transcription.
 */
const SPEECH_LANG = "en-GH";

// Not in TypeScript's DOM lib yet; just the parts used here.
interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
}
interface Recognition {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
type RecognitionCtor = new () => Recognition;

function recognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const MIC_ERRORS: Record<string, string> = {
  "not-allowed": "Allow the microphone to talk to the assistant.",
  "service-not-allowed": "Allow the microphone to talk to the assistant.",
  "no-speech": "I didn't hear anything. Tap the mic and speak.",
  "audio-capture": "No microphone was found.",
  network: "Talking needs an internet connection.",
};

/**
 * `onFinal` gets the whole utterance once the speaker stops; `transcript` is
 * the live text while they talk.
 */
export function useSpeechInput(onFinal: (text: string) => void) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const recognition = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  const supported = recognitionCtor() !== null;

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  useEffect(() => () => recognition.current?.abort(), []);

  const start = useCallback(() => {
    const Ctor = recognitionCtor();
    if (!Ctor || recognition.current) return;
    window.speechSynthesis?.cancel(); // don't transcribe our own read-aloud
    const r = new Ctor();
    r.lang = SPEECH_LANG;
    r.interimResults = true;
    r.continuous = false;
    let finalText = "";
    r.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const result = e.results[i];
        if (result.isFinal) finalText += result[0].transcript;
        else interim += result[0].transcript;
      }
      setTranscript((finalText + interim).trim());
    };
    r.onerror = (e) => {
      if (e.error !== "aborted") setError(MIC_ERRORS[e.error] ?? "The microphone stopped. Try again.");
    };
    r.onend = () => {
      recognition.current = null;
      setListening(false);
      setTranscript("");
      if (finalText.trim()) onFinalRef.current(finalText.trim());
    };
    recognition.current = r;
    setError("");
    setTranscript("");
    setListening(true);
    r.start();
  }, []);

  const stop = useCallback(() => recognition.current?.stop(), []);

  return { supported, listening, transcript, error, start, stop };
}

/** Markdown-ish symbols read aloud as "asterisk" etc.; drop them. */
function speakable(text: string): string {
  return text.replace(/[*_#`>|~]/g, "").replace(/GH₵\s?/g, "Ghana cedis ");
}

export function useSpeechOutput() {
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;

  useEffect(() => () => window.speechSynthesis?.cancel(), []);

  const stop = useCallback(() => {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
  }, []);

  const speak = useCallback(
    (id: string, text: string) => {
      if (!supported) return;
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(speakable(text));
      u.lang = SPEECH_LANG;
      const voices = window.speechSynthesis.getVoices();
      const voice =
        voices.find((v) => v.lang === SPEECH_LANG) ?? voices.find((v) => v.lang.startsWith("en"));
      if (voice) u.voice = voice;
      u.rate = 0.95;
      u.onend = () => setSpeakingId((cur) => (cur === id ? null : cur));
      u.onerror = u.onend;
      setSpeakingId(id);
      window.speechSynthesis.speak(u);
    },
    [supported]
  );

  return { supported, speakingId, speak, stop };
}
