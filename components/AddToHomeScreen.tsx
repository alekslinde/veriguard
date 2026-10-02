"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLang } from "@/lib/lang";
import {
  isInstalled,
  resolveInstallState,
  type InstallState,
  type ManualPlatform,
} from "@/lib/installPrompt";

/**
 * The `beforeinstallprompt` event, which TypeScript's DOM lib does not declare
 * because it is not in any standard — it is a Chromium extension to the
 * platform. Typed here to the two members we use rather than cast to `any` at
 * each call site.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Resolves whether and how this reader can add the app to their home screen.
 *
 * The event is the awkward part: Chromium fires `beforeinstallprompt` once,
 * early, and if nothing calls `preventDefault()` on it the browser may show its
 * own mini-infobar and the event is spent. So it is captured and held, and the
 * button fires it later. That capture has to be registered as soon as this
 * mounts — an event that fired before the listener existed is simply gone, and
 * the reader falls back to the manual route on a platform that had a one-tap
 * one.
 *
 * Unlike the browser sniffing in WaysGrid, this cannot be resolved by
 * useSyncExternalStore alone: `hasPrompt` is not a value to be read on demand
 * but a thing that ARRIVES, asynchronously, after mount. So state is set from
 * the event handler — a callback, not an effect body, which is what React 19
 * and the strict react-hooks rule actually object to.
 */
function useInstallState(): {
  state: InstallState;
  promptInstall: () => Promise<void>;
} {
  // Starts as "none" so the server and the first client render agree: nothing
  // is offered until the client has established that something can be. The
  // button appearing a moment after load is correct — before that, the honest
  // answer is that we do not yet know.
  const [state, setState] = useState<InstallState>({ route: "none" });

  // The captured event lives in a ref, not state: it is not rendered, and what
  // the UI actually needs to know about it — whether a one-tap route exists —
  // is already carried by `state.route`. Holding it in state would make the
  // resize effect depend on it and re-register the capture listener on every
  // change, which is how a real event gets missed.
  const deferredRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function resolve(hasPrompt: boolean) {
      setState(
        resolveInstallState({
          hasPrompt,
          installed: isInstalled(navigator, window),
          userAgent: navigator.userAgent,
          // Matches the md breakpoint the tab bar and header use, so the offer
          // appears on exactly the widths that get the app shell. Desktop
          // Chromium fires the same prompt event and would otherwise show a
          // phone-worded card whose button installs a desktop window.
          isHandheldViewport: window.innerWidth < 768,
          touchPoints: navigator.maxTouchPoints ?? 0,
        }),
      );
    }

    function onBeforeInstallPrompt(e: Event) {
      // Suppresses Chromium's own mini-infobar so the offer appears where the
      // page puts it, in the reader's language, next to an explanation — rather
      // than as browser chrome that interrupts whatever they were doing.
      e.preventDefault();
      deferredRef.current = e as BeforeInstallPromptEvent;
      resolve(true);
    }

    // Fired by the browser once the app has actually been added, including when
    // that happened through the browser's own menu rather than our button. The
    // offer must disappear either way.
    function onInstalled() {
      deferredRef.current = null;
      setState({ route: "none" });
    }

    // Rotating a phone or resizing a window crosses the breakpoint, and the
    // offer has to follow. The held event is read from a ref rather than from
    // state, so this effect does not re-run — and re-registering the
    // beforeinstallprompt listener is precisely what would lose an event that
    // fired in between.
    function onResize() {
      resolve(deferredRef.current !== null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);
    window.addEventListener("resize", onResize);

    // The manual/none answer, settled immediately. If a prompt event arrives
    // later it overrides this — the handler above calls resolve(true) — but on
    // iOS Safari none ever will, and waiting for one that cannot come would
    // leave that reader with nothing.
    resolve(false);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
      window.removeEventListener("resize", onResize);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    const deferred = deferredRef.current;
    if (!deferred) return;

    // Cleared BEFORE awaiting, not after. `prompt()` can reject — a
    // double-tap, or an event Chromium has already consumed — and clearing
    // afterwards means a throw skips the reset, leaving a button that is
    // permanently inert and, in the sheet, a sheet that never closes. Clearing
    // first makes the failure path identical to the success path: the offer is
    // withdrawn, and the browser re-offers on a later visit if it still
    // considers the app installable.
    deferredRef.current = null;

    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      // The dialog did not open, or the event was already spent. Nothing to
      // report to the reader: the outcome they see — the offer going away — is
      // the same one a dismissal produces, and it returns on the next visit.
    }

    // Withdrawn on BOTH outcomes, which looks wrong for "dismissed" and is
    // not: a deferred event may be prompted once, so there is nothing left to
    // fire and a button still sitting there would do nothing when pressed.
    // Chromium fires a fresh event on a later visit if it still considers the
    // app installable, and the capture listener is still mounted to catch it,
    // so a reader who says no now is asked again then rather than never.
    //
    // Not left to `appinstalled` on the accepted path: that fires once the
    // install completes, which can be seconds later, and the button must stop
    // offering the moment the dialog closes.
    setState({ route: "none" });
  }, []);

  return { state, promptInstall };
}

/**
 * Offers to add the app to the home screen, where that is genuinely possible.
 *
 * Renders nothing at all when there is no route — already installed, or a
 * platform with no way to do it. That silence is the point: a button offering
 * something the device cannot do is worse than no button, and this is a tool
 * about not being misled.
 *
 * IN THE HEADER'S TOP-RIGHT CORNER, which is where app chrome belongs and
 * where a phone has room: the main nav is `hidden md:flex`, so that corner is
 * empty below the md breakpoint — exactly the width this offer applies to,
 * since a desktop gets no route at all (see resolveInstallState).
 *
 * It has been a card under the check flow and, before that, a row in a
 * navigation sheet. The card was the better of those, but it was still a
 * bordered panel with a heading and a blurb sitting in the page's content,
 * competing with the thing the page is for. An offer to keep the app around is
 * chrome, not content.
 *
 * The steps still need somewhere to go — on iOS Safari, which has no install
 * API, the steps ARE the feature — so they open as a popover anchored under the
 * button. That works here and would not have worked inside the check card,
 * which clips its own overflow.
 */
export default function AddToHomeScreen() {
  const { t } = useLang();
  const { state, promptInstall } = useInstallState();
  const [showSteps, setShowSteps] = useState(false);

  // Escape closes the steps, which a popover in the page's chrome has to
  // honour: there is no dialog here to do it for us, and a reader who opened
  // this from the header expects the key that closes everything else to work.
  //
  // Declared before the route's early return, because hooks cannot sit after a
  // conditional return — it simply does nothing while the popover is shut.
  useEffect(() => {
    if (!showSteps) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowSteps(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showSteps]);

  if (state.route === "none") return null;

  const isPrompt = state.route === "prompt";

  async function activate() {
    if (isPrompt) {
      // `onDone` went with the sheet, for the same reason `variant` did: its
      // only job was closing the sheet after a successful install prompt, and
      // there is no sheet to close. The card stays where it is and the browser
      // shows its own confirmation.
      await promptInstall();
    } else {
      // No API to call. The steps are the deliverable.
      setShowSteps((v) => !v);
    }
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={activate}
        aria-expanded={isPrompt ? undefined : showSteps}
        className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--rule)] px-2.5 py-1.5 text-[12.5px] font-medium text-[var(--text-dim)] transition-colors hover:border-[var(--ink-3)] hover:text-[var(--foreground)]"
      >
        <span className="shrink-0 text-[var(--clear)]">
          <InstallIcon />
        </span>
        {/* The word "Add" alone in the header, with the full label from sm.
            A header control is read in place — the glyph and the corner say
            what kind of thing it is — and at 390px a four-word button next to
            the wordmark is the widest thing in the row.

            One label for both routes. They used to differ ("Add to Home
            Screen" where the browser has an install API, "Show me how" where
            the reader does it by hand) and that distinction was worth making
            under a heading that set the subject; alone it names no subject at
            all. Whether the offer is delivered by a prompt or by three steps
            is ours to worry about, not something to put in the label. */}
        <span className="xs:hidden">{t("install.short")}</span>
        <span className="hidden xs:inline">{t("install.action")}</span>
      </button>

      {showSteps && state.platform && (
        <>
          {/* Closes on a tap anywhere else. A header popover has no scrim to
              dismiss it and nothing else on the page knows it is open, so
              without this the only way out is the button it came from. */}
          <button
            type="button"
            aria-label={t("install.close")}
            onClick={() => setShowSteps(false)}
            className="fixed inset-0 z-40 cursor-default"
          />
          <div className="absolute right-0 top-full z-50 mt-2 w-[270px] rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-3 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.7)]">
            <ManualSteps platform={state.platform} />
          </div>
        </>
      )}
    </div>
  );
}

/**
 * The hand-performed route, as numbered steps.
 *
 * Every step names something the reader can see on their own screen, because
 * this is the case where the page cannot do the thing and the reader must. The
 * iOS share glyph is drawn inline rather than named: "the share button" is the
 * step people miss, and on iOS it is a square with an arrow, not a word.
 */
function ManualSteps({ platform }: { platform: ManualPlatform }) {
  const { t } = useLang();

  const steps: string[] =
    platform === "ios-safari"
      ? [t("install.ios.step1"), t("install.ios.step2"), t("install.ios.step3")]
      : [t("install.menu.step1"), t("install.menu.step2"), t("install.menu.step3")];

  return (
    // No top margin: the popover holding this supplies its own padding, and the
    // margin was for the card where this sat beneath a button.
    <ol className="space-y-2 text-[13px] text-[var(--text-dim)]">
      {steps.map((step, i) => (
        <li key={i} className="flex gap-2.5 leading-relaxed">
          <span
            aria-hidden="true"
            className="mt-[3px] flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-[var(--ink-3)] font-[family-name:var(--font-mono-ui)] text-[10.5px] font-medium text-[var(--foreground)]"
          >
            {i + 1}
          </span>
          <span>
            {step}
            {/* Step 1 on iOS is "tap Share", and the glyph is the part people
                actually look for. */}
            {platform === "ios-safari" && i === 0 && <ShareGlyph />}
          </span>
        </li>
      ))}
    </ol>
  );
}

function InstallIcon() {
  return (
    <svg
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="shrink-0"
    >
      {/* A phone with an arrow into it — the app arriving on the device. */}
      <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
      <path d="M12 8v6m0 0l-2.4-2.4M12 14l2.4-2.4" />
    </svg>
  );
}

/** iOS's share mark, inline in the step that tells you to tap it. */
function ShareGlyph() {
  return (
    <svg
      width="15"
      height="15"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.9"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="mx-[3px] inline-block align-[-2px] text-[var(--foreground)]"
    >
      <path d="M12 15.5V3.5m0 0L8.4 7.1M12 3.5l3.6 3.6" />
      <path d="M7 11H5.5v9.5h13V11H17" />
    </svg>
  );
}
