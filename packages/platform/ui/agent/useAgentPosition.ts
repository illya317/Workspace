"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import type { Position } from "./types";

const STORAGE_KEY = "agentPosition";
const DEFAULT_OFFSET: Position = { x: 24, y: 24 };
const BUTTON_SIZE = 56;

function loadPosition(): Position | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw) as Position;
  } catch { /* ignore */ }
  return null;
}

function savePosition(pos: Position) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pos));
  } catch { /* ignore */ }
}

function clamp(val: number, min: number, max: number) {
  return Math.min(Math.max(val, min), max);
}

function defaultPosition(): Position {
  return {
    x: window.innerWidth - BUTTON_SIZE - DEFAULT_OFFSET.x,
    y: window.innerHeight - BUTTON_SIZE - DEFAULT_OFFSET.y,
  };
}

export function useAgentPosition() {
  // SSR-safe：初始值不依赖 window
  const [position, setPosition] = useState<Position>({ x: 0, y: 0 });
  const [mounted, setMounted] = useState(false);

  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startX: number; startY: number; posX: number; posY: number } | null>(null);
  const movedRef = useRef(false);

  // 客户端首次挂载时计算真实位置
  useEffect(() => {
    setPosition(loadPosition() || defaultPosition());
    setMounted(true);
  }, []);

  // 窗口 resize 时保持在可视范围内
  useEffect(() => {
    function handleResize() {
      setPosition((prev) => ({
        x: clamp(prev.x, 0, window.innerWidth - BUTTON_SIZE),
        y: clamp(prev.y, 0, window.innerHeight - BUTTON_SIZE),
      }));
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    movedRef.current = false;
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      posX: position.x,
      posY: position.y,
    };
    setIsDragging(true);
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }, [position]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      movedRef.current = true;
    }
    setPosition({
      x: clamp(dragRef.current.posX + dx, 0, window.innerWidth - BUTTON_SIZE),
      y: clamp(dragRef.current.posY + dy, 0, window.innerHeight - BUTTON_SIZE),
    });
  }, []);

  const onPointerUp = useCallback((e: React.PointerEvent) => {
    setIsDragging(false);
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    setPosition((prev) => {
      savePosition(prev);
      return prev;
    });
  }, []);

  const wasClick = useCallback(() => !movedRef.current, []);

  return { position, mounted, isDragging, onPointerDown, onPointerMove, onPointerUp, wasClick };
}
