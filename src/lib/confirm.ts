"use client";
// Conferme "sei sicuro?" con il dialogo di shadcn, chiamabili come una funzione: await confirm({...})
import { create } from "zustand";

export interface ConfirmRequest { title: string; description?: string; action?: string; destructive?: boolean }
interface ConfirmState { req: (ConfirmRequest & { resolve: (ok: boolean) => void }) | null }

export const useConfirmStore = create<ConfirmState>(() => ({ req: null }));

export function confirm(req: ConfirmRequest): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.setState({ req: { ...req, resolve } }));
}
