import { createContext, useContext } from "react";

export const PaletteContext = createContext<{
  open: boolean;
  setOpen: (v: boolean) => void;
}>({ open: false, setOpen: () => {} });

export const usePalette = () => useContext(PaletteContext);
