import { create } from "zustand";
import { saveRailOpen } from "@/lib/rail";

type UiState = {
  paletteOpen: boolean;
  railOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  setRailOpen: (open: boolean) => void;
};

export const useUiStore = create<UiState>((set) => ({
  paletteOpen: false,
  railOpen: true,
  setPaletteOpen: (paletteOpen) => set({ paletteOpen }),
  setRailOpen: (railOpen) => {
    saveRailOpen(railOpen);
    set({ railOpen });
  },
}));
