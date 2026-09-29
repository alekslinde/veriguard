"use client";

import { useCallback, useEffect, useState } from "react";
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
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    function resolve(hasPrompt: boolean) {
      setState(
        resolveInstallState({
          hasPrompt,
          installed: isInstalled(navigator, window),
          userAgent: navigator.userAgent,
        }),
      );
    }

    function onBeforeInstallPrompt(e: Event) {
      // Suppresses Chromium's own mini-infobar so the offer appears where the
      // page puts it, in the reader's language, next to an explanation — rather
      // than as browser chrome that interrupts whatever they were doing.
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      resolve(true);
    }

    // Fired by the browser once the app has actually been added, including when
    // that happened through the browser's own menu rather than our button. The
    // offer must disappear either way.
    function onInstalled() {
      setDeferred(null);
      setState({ route: "none" });
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // The manual/none answer, settled immediately. If a prompt event arrives
    // later it overrides this — the handler above calls resolve(true) — but on
    // iOS Safari none ever will, and waiting for one that cannot come would
    // leave that reader with nothing.
    resolve(false);

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;

    // Spent either way, whichever they chose: Chromium allows a deferred event
    // to be prompted once, so the held reference is now inert.
    //
    // The offer is therefore withdrawn on BOTH outcomes, which looks wrong for
    // "dismissed" and is not. There is nothing left to fire — a button still
    // sitting there would do nothing when pressed, which is the one behaviour
    // worse than not offering. Chromium fires a fresh event on a later visit if
    // it still considers the app installable, and the listener above is still
    // mounted to catch it, so a reader who says no now is asked again then
    // rather than never.
    //
    // `appinstalled` is not relied on for the accepted path: it is fired after
    // the install completes, which can be seconds later, and the button must
    // stop offering the moment the dialog closes.
    setDeferred(null);
    setState({ route: "none" });
  }, [deferred]);

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
 * `variant` places it. "sheet" is a row in the mobile tab bar's More sheet,
 * which is where someone goes looking for app-level actions; "card" is the
 * standalone block on the home page.
 */
export default function AddToHomeScreen({
  variant,
  onDone,
}: {
  variant: "sheet" | "card";
  onDone?: () => void;
}) {
  const { t } = useLang();
  const { state, promptInstall } = useInstallState();
  const [showSteps, setShowSteps] = useState(false);

  if (state.route === "none") return null;

  const isPrompt = state.route === "prompt";

  async function activate() {
    if (isPrompt) {
      await promptInstall();
      onDone?.();
    } else {
      // No API to call. The steps are the deliverable.
      setShowSteps((v) => !v);
    }
  }

  if (variant === "sheet") {
    return (
      <>
        <button
          type="button"
          onClick={activate}
          aria-expanded={isPrompt ? undefined : showSteps}
          className="flex items-center gap-2 min-h-[46px] px-3 rounded-lg text-[15.5px] text-[var(--text-dim)] transition-colors text-left"
        >
          <InstallIcon />
          {t("install.action")}
        </button>
        {showSteps && state.platform && (
          <div className="px-3 pb-1">
            <ManualSteps platform={state.platform} />
          </div>
        )}
      </>
    );
  }

  return (
    <section className="rounded-xl border border-[var(--rule)] bg-[var(--ink-2)] p-4">
      <div className="flex items-start gap-3">
        <span className="mt-[2px] text-[var(--clear)]">
          <InstallIcon />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-[15px] font-semibold text-[var(--foreground)]">
            {t("install.title")}
          </h2>
          <p className="mt-1 text-[13.5px] text-[var(--text-dim)] leading-relaxed">
            {t("install.blurb")}
          </p>

          <button
            type="button"
            onClick={activate}
            aria-expanded={isPrompt ? undefined : showSteps}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-[var(--clear)]/50 bg-[var(--clear)]/10 px-3 py-1.5 text-[13px] font-semibold text-[var(--clear)] transition-colors hover:bg-[var(--clear)]/15"
          >
            {isPrompt ? t("install.action") : t("install.how")}
          </button>

          {showSteps && state.platform && (
            <ManualSteps platform={state.platform} />
          )}
        </div>
      </div>
    </section>
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
    <ol className="mt-3 space-y-2 text-[13.5px] text-[var(--text-dim)]">
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
