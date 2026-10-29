import { create } from "zustand";

type UiState = {
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  paletteOpen: false,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
}));
