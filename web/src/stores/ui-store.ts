import { create } from "zustand";

type UiState = {
  sidebarCollapsed: boolean;
  paletteOpen: boolean;
  toggleSidebar: () => void;
  setPaletteOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  sidebarCollapsed: false,
  paletteOpen: false,
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
