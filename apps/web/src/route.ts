// Which screen the address bar asks for. The app has no router dependency; a
// screen is a hash such as `#/teammates/<id>`, so links work with the browser's
// back button and the Vite dev server needs no fallback route. The board is
// the empty hash and anything this module does not recognise.
import { useEffect, useState } from "react";

export type Route = { view: "board" } | { view: "teammate"; teammateId: string };

/** The route for a `location.hash`. */
export function parseRoute(hash: string): Route {
  const match = /^#\/teammates\/([^/]+)\/?$/.exec(hash);
  if (match?.[1]) {
    try {
      return { view: "teammate", teammateId: decodeURIComponent(match[1]) };
    } catch {
      return { view: "board" };
    }
  }
  return { view: "board" };
}

/** The link to a teammate's profile. */
export function teammateHref(teammateId: string): string {
  return `#/teammates/${encodeURIComponent(teammateId)}`;
}

/** The link back to the board. */
export const boardHref = "#/";

/** The current route, following `hashchange`. */
export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const onChange = () => setRoute(parseRoute(window.location.hash));
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  return route;
}
