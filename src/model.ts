"use client";

import { useEffect, useState } from "react";
import { ENSO } from "./lib/ai";

const KEY = "hanzo.chat.model";
const CHANGE = "hanzo:model";

function read(): string {
  if (typeof window === "undefined") return ENSO;
  try {
    return window.localStorage.getItem(KEY) || ENSO;
  } catch {
    return ENSO;
  }
}

/** Make `model` the chat default, in this browser, for every open chat. */
export function remember(model: string) {
  try {
    window.localStorage.setItem(KEY, model);
  } catch {
    // A private browser may refuse persistence; this tab still keeps the choice.
  }
  window.dispatchEvent(new Event(CHANGE));
}

/** The signed-in chat default, shared by Settings and every new conversation. */
export function useModel(): readonly [string, (model: string) => void] {
  const [model, setModel] = useState(ENSO);

  useEffect(() => {
    setModel(read());

    const sync = () => setModel(read());
    window.addEventListener("storage", sync);
    window.addEventListener(CHANGE, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(CHANGE, sync);
    };
  }, []);

  const choose = (next: string) => {
    setModel(next);
    remember(next);
  };

  return [model, choose] as const;
}
