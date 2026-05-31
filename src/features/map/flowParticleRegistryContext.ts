import { createContext, useContext } from "react";

import type { FlowParticleEntry } from "@/features/map/flowParticleLoop";

export type FlowParticleRegistryContextValue = {
  register: (id: string, entry: FlowParticleEntry) => void;
  unregister: (id: string) => void;
};

export const FlowParticleRegistryContext =
  createContext<FlowParticleRegistryContextValue | null>(null);

export function useFlowParticleRegistry() {
  return useContext(FlowParticleRegistryContext);
}
