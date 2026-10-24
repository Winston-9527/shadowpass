import { useEffect, useRef, useState } from "react";
import type { BillAlert } from "../flows/alert-rules";
import { mergeActiveAlerts, newlyDisplayedAlerts } from "../flows/alert-rules";
import { getWalletState, saveWalletState } from "../keystore/db";

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const candidate = window as Window & { webkitAudioContext?: AudioContextConstructor };
  return window.AudioContext ?? candidate.webkitAudioContext ?? null;
}

async function playAlertTone(): Promise<void> {
  const Constructor = audioContextConstructor();
  if (!Constructor) return;
  const context = new Constructor();
  try {
    await context.resume();
    const gain = context.createGain();
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.12, context.currentTime + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.28);
    gain.connect(context.destination);
    const oscillator = context.createOscillator();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, context.currentTime);
    oscillator.frequency.setValueAtTime(660, context.currentTime + 0.15);
    oscillator.connect(gain);
    oscillator.start();
    oscillator.stop(context.currentTime + 0.3);
  } finally {
    window.setTimeout(() => void context.close().catch(() => undefined), 400);
  }
}

function alertHistory(value: unknown): string[] {
  if (!value || typeof value !== "object") return [];
  const ids = (value as { ids?: unknown }).ids;
  return Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : [];
}

export function useBillAlerts(alerts: readonly BillAlert[], storageKey?: string) {
  const seen = useRef(new Set<string>());
  const [active, setActive] = useState<BillAlert[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const flashKey = active.map((alert) => alert.id).join("|");

  useEffect(() => {
    let current = true;
    seen.current = new Set();
    setActive([]);
    setHydrated(false);
    void (async () => {
      const stored = storageKey ? await getWalletState<unknown>(storageKey).catch(() => undefined) : undefined;
      if (!current) return;
      seen.current = new Set(alertHistory(stored));
      setHydrated(true);
    })();
    return () => { current = false; };
  }, [storageKey]);

  useEffect(() => {
    if (!hydrated) return;
    setActive((previous) => mergeActiveAlerts(previous, alerts, seen.current));
  }, [alerts, hydrated, storageKey]);

  useEffect(() => {
    if (!hydrated || active.length === 0) return;
    const newlyDisplayed = newlyDisplayedAlerts(active, seen.current);
    if (newlyDisplayed.length === 0) return;
    for (const alert of newlyDisplayed) seen.current.add(alert.id);
    if (storageKey) {
      void saveWalletState(storageKey, { ids: [...seen.current].slice(-500) }).catch(() => undefined);
    }
    void playAlertTone().catch(() => undefined);
  }, [active, hydrated, storageKey]);

  useEffect(() => {
    if (!flashKey || typeof document === "undefined") return;
    const original = document.title;
    let alternate = false;
    let ticks = 0;
    const interval = window.setInterval(() => {
      alternate = !alternate;
      document.title = alternate ? `ShadowPass: ${active.length} alert${active.length === 1 ? "" : "s"}` : original;
      ticks += 1;
      if (ticks >= 20) {
        window.clearInterval(interval);
        document.title = original;
      }
    }, 700);
    return () => {
      window.clearInterval(interval);
      document.title = original;
    };
  }, [active, flashKey]);

  return {
    active,
    dismiss: () => setActive([]),
  };
}
