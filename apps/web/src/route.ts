// Which screen the address bar asks for. The app has no router dependency; a
// screen is a hash such as `#/cards/<id>` or `#/teammates/<id>`, so links work
// with the browser's back button and the static build needs no server rewrites.
// The board is the empty hash and anything this module does not recognise.
import { useEffect, useState } from "react";

export type Route =
  | { view: "board" }
  | { view: "card"; cardId: string }
  | { view: "teammate"; teammateId: string };

/** The route for a `location.hash`. */
export function parseRoute(hash: string): Route {
  const match = /^#\/(cards|teammates)\/([^/?#]+)\/?$/.exec(hash);
  if (match?.[1] && match[2]) {
    let id: string;
    try {
      id = decodeURIComponent(match[2]);
    } catch {
      return { view: "board" };
    }
    return match[1] === "cards" ? { view: "card", cardId: id } : { view: "teammate", teammateId: id };
  }
  return { view: "board" };
}

/** The link back to the board. */
export const boardHref = "#/";

/** The link to a card's detail. */
export function cardHref(cardId: string): string {
  return `#/cards/${encodeURIComponent(cardId)}`;
}

/** The link to a teammate's profile. */
export function teammateHref(teammateId: string): string {
  return `#/teammates/${encodeURIComponent(teammateId)}`;
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
