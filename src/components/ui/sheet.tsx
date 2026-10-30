"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { ArrowLeft, X } from "lucide-react";
import { useRef, type ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  onBack?: () => void;
  children: ReactNode;
  className?: string;
}

export function Sheet({
  open,
  onOpenChange,
  title,
  description,
  onBack,
  children,
  className,
}: SheetProps) {
  const contentRef = useRef<HTMLDivElement>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="sheet-overlay" />
        <Dialog.Content
          ref={contentRef}
          tabIndex={-1}
          className={cn("sheet", className)}
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            contentRef.current?.focus();
          }}
        >
          <div className="sheet-handle" aria-hidden="true" />
          <header className="sheet-header">
            <div className="sheet-title-wrap">
              {onBack && (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onBack}
                  aria-label="Back"
                >
                  <ArrowLeft size={20} />
                </Button>
              )}
              <div>
                <Dialog.Title className="sheet-title">{title}</Dialog.Title>
                <Dialog.Description
                  className={description ? "sheet-description" : "sr-only"}
                >
                  {description || title}
                </Dialog.Description>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onOpenChange(false)}
              aria-label="Close"
            >
              <X size={20} />
            </Button>
          </header>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
