// The app's routes, kept in the URL hash so the static build needs no server
// rewrites: `#/` is the board and `#/cards/<id>` is one card's detail. Any
// other hash falls back to the board.
import { useEffect, useState } from "react";

export type Route = { view: "board" } | { view: "card"; cardId: string };

export function parseRoute(hash: string): Route {
  const match = /^#\/cards\/([^/?#]+)\/?$/.exec(hash);
  if (match) {
    try {
      return { view: "card", cardId: decodeURIComponent(match[1]!) };
    } catch {
      return { view: "board" };
    }
  }
  return { view: "board" };
}

export const boardHref = "#/";

export function cardHref(cardId: string): string {
  return `#/cards/${encodeURIComponent(cardId)}`;
}

/** The route for the current hash, following back, forward and link clicks. */
export function useRoute(): Route {
  const [hash, setHash] = useState(() => window.location.hash);
  useEffect(() => {
    const onChange = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return parseRoute(hash);
}
