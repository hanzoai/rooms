"use client";

/**
 * ⌘K, in the workspace.
 *
 * The estate's palette — `OrgCommandPalette`, the same frame the marketing
 * pages open — so the chord means one thing wherever a reader presses it. Here
 * it used to focus the column's filter box, which left the shortcut that finds
 * anything on every other page of this site narrowing one list in the app: a
 * conversation in the room next door was unreachable from a control offering to
 * search the workspace.
 *
 * MOUNTED ONLY WHILE OPEN. Its rows are read from the platform, and a palette
 * that stayed mounted would fetch every conversation and every project on each
 * load of a room that draws neither.
 */

import { dev } from "./lib/host";
import { useEffect, useState } from "react";
import { OrgCommandPalette, type OrgCommandItem } from "@hanzogui/shell";
import { useThreads } from "@hanzo/ai/react";
import { useAi } from "./lib/ai";
import { useOpen } from "./open";

export function Find({
  doors,
  onClose,
  navigate,
}: {
  /** Where the shell can go without asking anyone: its rooms and its panes. */
  doors: OrgCommandItem[];
  onClose: () => void;
  navigate?: (route: string) => void;
}) {
  const { threads } = useThreads();
  const { client } = useAi();
  const { open } = useOpen();
  const [projects, setProjects] = useState<{ id: string; name: string }[]>([]);

  useEffect(() => {
    if (!client) return;
    let live = true;
    client.http
      .json<{ id: string; name: string }[]>({ path: "/v1/projects" })
      .then((found) => live && setProjects(found))
      .catch(() => {
        // A palette that cannot read the projects still finds the rooms.
      });
    return () => {
      live = false;
    };
  }, [client]);

  const rows: OrgCommandItem[] = [
    ...doors,
    // A conversation and a project are OPENED, not navigated to: the address is
    // the room, and which one is open belongs to the store — so a href would
    // land the reader in /chat with whatever they had before still on screen.
    ...threads.map((t) => ({
      id: `thread-${t.id}`,
      title: t.title || "Untitled",
      category: "Conversations",
      action: () => {
        open(t.id);
        navigate?.("/chat");
      },
    })),
    ...projects.map((p) => ({
      id: `project-${p.id}`,
      title: p.name,
      category: "Projects",
      action: () => {
        navigate?.(dev(p.name));
      },
    })),
  ];

  return (
    <OrgCommandPalette
      open
      currentAppId="chat"
      commands={rows}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
      onNavigate={(href, external) => {
        if (external) window.open(href, "_blank", "noopener");
        else navigate?.(href);
        onClose();
      }}
      // THIS ROOM IS THE AI. A question nobody indexed opens a conversation
      // here, rather than a second copy of the product the reader is in.
      onAsk={(question) => {
        open(null);
        navigate?.(`/chat?q=${encodeURIComponent(question)}`);
        onClose();
      }}
    />
  );
}
