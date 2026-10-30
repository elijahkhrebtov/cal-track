"use client";

import { ArrowLeft } from "lucide-react";
import { useEffect, useRef, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

function currentUrl() {
  return window.location.pathname + window.location.search;
}

// Native history integrates with Next's pathname/search hooks and preserves the
// shared layout, including unsaved meal drafts, during nested navigation.
export function navigate(href: string, replace = false) {
  const trail: string[] = window.history.state?.intakeTrail ?? [currentUrl()];
  const nextTrail = replace ? [...trail.slice(0, -1), href] : [...trail, href];
  if (href === currentUrl()) return;
  window.history[replace ? "replaceState" : "pushState"](
    { intakeTrail: nextTrail },
    "",
    href,
  );
  window.scrollTo(0, 0);
}

export function goBack(fallback: string) {
  if ((window.history.state?.intakeTrail?.length ?? 0) > 1)
    window.history.back();
  else navigate(fallback, true);
}

export function returnTo(href: string) {
  const trail: string[] = window.history.state?.intakeTrail ?? [];
  const index = trail.lastIndexOf(href);
  if (index >= 0 && index < trail.length - 1)
    window.history.go(index - trail.length + 1);
  else navigate(href, true);
}

export function datedPath(path: string, date: string) {
  return `${path}?date=${encodeURIComponent(date)}`;
}

export function WorkflowPage({
  title,
  description,
  onBack,
  search = false,
  children,
}: {
  title: string;
  description?: string;
  onBack: () => void;
  search?: boolean;
  children: ReactNode;
}) {
  const page = useRef<HTMLElement>(null);
  useEffect(() => {
    const viewport = window.visualViewport;
    let baseline = window.innerHeight;
    let keyboardOpen = false;
    const update = () => {
      const height = viewport?.height ?? window.innerHeight;
      const focused = document.activeElement?.matches(
        "input, textarea, select, [contenteditable=true]",
      );
      if (!focused && !keyboardOpen)
        baseline = Math.max(window.innerHeight, height);
      // Blur precedes the keyboard closing. Keep the scroll container stable
      // until the viewport recovers, including while the user taps Save.
      keyboardOpen = (!!focused || keyboardOpen) && baseline - height > 120;
      page.current?.style.setProperty(
        "--visual-viewport-height",
        `${height}px`,
      );
      page.current?.style.setProperty(
        "--visual-viewport-top",
        `${viewport?.offsetTop ?? 0}px`,
      );
      if (page.current)
        page.current.dataset.keyboardOpen = String(keyboardOpen);
    };
    const rotate = () => {
      baseline = window.innerHeight;
      keyboardOpen = false;
      update();
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", rotate);
    document.addEventListener("focusin", update);
    document.addEventListener("focusout", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", rotate);
      document.removeEventListener("focusin", update);
      document.removeEventListener("focusout", update);
    };
  }, []);

  useEffect(() => {
    if (page.current?.closest("[hidden]")) return;
    document.title = `${title} · Intake`;
    page.current?.scrollTo(0, 0);
    // Focus the page heading without opening the keyboard after navigation.
    page.current
      ?.querySelector<HTMLElement>("h1")
      ?.focus({ preventScroll: true });
  }, [title]);

  return (
    <main
      ref={page}
      className={cn("workflow-page", search && "food-search-page")}
    >
      <header className="workflow-header">
        <Button variant="ghost" size="icon" onClick={onBack} aria-label="Back">
          <ArrowLeft size={22} />
        </Button>
        <div>
          <h1 tabIndex={-1}>{title}</h1>
          {description && <p>{description}</p>}
        </div>
      </header>
      <div className="workflow-content">{children}</div>
    </main>
  );
}
