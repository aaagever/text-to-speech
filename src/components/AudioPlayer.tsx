import { useEffect, useRef, useState } from "react";
import { SPEEDS } from "../lib/prefs";

interface Props {
  src: string;
  filename: string;
  label: string;
  speed: number;
  onSpeedChange: (s: number) => void;
  durationHint: number | null;
}

function formatTime(sec: number): string {
  const t = isFinite(sec) && sec > 0 ? sec : 0;
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}

const SkipButton = ({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    className="w-10 h-10 flex items-center justify-center rounded-full border border-gray-300 text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors"
  >
    {label}
  </button>
);

export function AudioPlayer({
  src,
  filename,
  label,
  speed,
  onSpeedChange,
  durationHint,
}: Props) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(durationHint ?? 0);

  // Wire element events (re-attach when the source changes).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onLoaded = () =>
      setDuration(isFinite(audio.duration) ? audio.duration : durationHint ?? 0);
    const onTime = () => setCurrentTime(audio.currentTime);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnded = () => setIsPlaying(false);
    audio.addEventListener("loadedmetadata", onLoaded);
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoaded);
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [src, durationHint]);

  // Apply playback speed to the element.
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed, src]);

  // Autoplay each new result (a blocked autoplay just leaves it paused).
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    setCurrentTime(0);
    audio.playbackRate = speed;
    audio.play().catch(() => {});
    // speed intentionally omitted: we only want this on a new source.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src]);

  function togglePlay() {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  }

  function skip(delta: number) {
    const audio = audioRef.current;
    if (!audio) return;
    const max = duration || audio.duration || 0;
    audio.currentTime = Math.max(0, Math.min(max, audio.currentTime + delta));
  }

  function seek(value: number) {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = value;
    setCurrentTime(value);
  }

  return (
    <div>
      <audio ref={audioRef} src={src} preload="metadata" />

      <div className="flex items-center justify-between mb-4">
        <span className="text-xs text-gray-500">{label}</span>
        <span className="text-xs text-gray-400 truncate ml-3">{filename}</span>
      </div>

      <div className="flex items-center justify-center gap-2.5 mb-4">
        <SkipButton label="-30" onClick={() => skip(-30)} />
        <SkipButton label="-15" onClick={() => skip(-15)} />
        <button
          type="button"
          onClick={togglePlay}
          aria-label={isPlaying ? "Pause" : "Play"}
          className="w-13 h-13 flex items-center justify-center rounded-full bg-blue-600 text-white hover:bg-blue-700 transition-colors"
          style={{ width: "3.25rem", height: "3.25rem" }}
        >
          {isPlaying ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <rect x="6" y="5" width="4" height="14" rx="1" />
              <rect x="14" y="5" width="4" height="14" rx="1" />
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z" />
            </svg>
          )}
        </button>
        <SkipButton label="+15" onClick={() => skip(15)} />
        <SkipButton label="+30" onClick={() => skip(30)} />
      </div>

      <input
        type="range"
        min={0}
        max={duration || 0}
        step={0.1}
        value={Math.min(currentTime, duration || 0)}
        onChange={(e) => seek(Number(e.target.value))}
        className="w-full accent-blue-600"
        aria-label="Seek"
      />
      <div className="flex items-center justify-between mt-1">
        <span className="text-xs text-gray-400">{formatTime(currentTime)}</span>
        <span className="text-xs text-gray-400">{formatTime(duration)}</span>
      </div>

      <div className="flex items-center justify-between mt-3">
        <label className="flex items-center gap-2 text-xs text-gray-500">
          Speed
          <select
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="px-2 py-1 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
          >
            {SPEEDS.map((s) => (
              <option key={s} value={s}>
                {s}x
              </option>
            ))}
          </select>
        </label>
        <a
          href={src}
          download={filename}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 3v12m0 0l-4-4m4 4l4-4M5 21h14" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Download {filename.split(".").pop()?.toUpperCase()}
        </a>
      </div>
    </div>
  );
}
