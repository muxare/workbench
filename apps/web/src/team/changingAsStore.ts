// Who this browser makes team changes as, remembered across visits. There is
// no sign-in, so the choice is a convenience for one browser, not an identity:
// it lives in localStorage, and a browser that cannot keep it (a private
// window, blocked storage) falls back to `changingAs`'s default each visit.

const KEY = "workbench.team.changingAs";

/** The person this browser chose last, or undefined when none is stored or storage is unavailable. */
export function readChangingAs(storage: Pick<Storage, "getItem"> | undefined = browserStorage()): string | undefined {
  try {
    return storage?.getItem(KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

/** Remember the choice; silently does nothing when storage is unavailable. */
export function rememberChangingAs(id: string, storage: Pick<Storage, "setItem"> | undefined = browserStorage()): void {
  try {
    storage?.setItem(KEY, id);
  } catch {
    // The choice then lasts only as long as the screen is open.
  }
}

function browserStorage(): Storage | undefined {
  try {
    return typeof window === "undefined" ? undefined : window.localStorage;
  } catch {
    return undefined;
  }
}
