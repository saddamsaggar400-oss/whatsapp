"use client";
import { useCallback, useEffect, useRef, useState } from "react";

export function useMessageSound() {
  const [enabled, setEnabled] = useState(false),
    [unlocked, setUnlocked] = useState(false);
  const enabledRef = useRef(false),
    context = useRef<AudioContext | null>(null);
  const unlock = useCallback(async () => {
    const Audio = window.AudioContext || (window as any).webkitAudioContext;
    if (!Audio) throw new Error("هذا المتصفح لا يدعم صوت التنبيهات.");
    context.current ||= new Audio();
    await context.current!.resume();
    setUnlocked(context.current!.state === "running");
  }, []);
  const play = useCallback(() => {
    const audio = context.current;
    if (!enabledRef.current || !audio || audio.state !== "running") return;
    const start = audio.currentTime;
    for (const [offset, frequency] of [
      [0, 784],
      [0.085, 1046],
    ]) {
      const tone = audio.createOscillator(),
        gain = audio.createGain();
      tone.type = "sine";
      tone.frequency.value = frequency;
      gain.gain.setValueAtTime(0, start + offset);
      gain.gain.linearRampToValueAtTime(0.045, start + offset + 0.008);
      gain.gain.exponentialRampToValueAtTime(0.001, start + offset + 0.17);
      tone.connect(gain);
      gain.connect(audio.destination);
      tone.start(start + offset);
      tone.stop(start + offset + 0.18);
      tone.onended = () => {
        tone.disconnect();
        gain.disconnect();
      };
    }
  }, []);
  useEffect(() => {
    const saved = localStorage.getItem("wisal.message-sound") === "1";
    setEnabled(saved);
    enabledRef.current = saved;
  }, []);
  useEffect(() => {
    if (!enabled) return;
    const arm = () => {
      void unlock().catch(() => {});
    };
    document.addEventListener("pointerdown", arm, { once: true });
    document.addEventListener("keydown", arm, { once: true });
    return () => {
      document.removeEventListener("pointerdown", arm);
      document.removeEventListener("keydown", arm);
    };
  }, [enabled, unlock]);
  useEffect(
    () => () => {
      void context.current?.close();
    },
    [],
  );
  const toggle = async () => {
    if (enabled && unlocked) {
      enabledRef.current = false;
      setEnabled(false);
      localStorage.setItem("wisal.message-sound", "0");
      return;
    }
    await unlock();
    enabledRef.current = true;
    setEnabled(true);
    localStorage.setItem("wisal.message-sound", "1");
    play();
  };
  return { enabled, unlocked, toggle, play };
}
