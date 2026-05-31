import { useEffect, useMemo, useRef, type ReactNode } from "react";

import {
  createFlowParticleRegistry,
  runFlowParticleFrame,
  type FlowParticleRegistry,
} from "@/features/map/flowParticleLoop";
import {
  FlowParticleRegistryContext,
  type FlowParticleRegistryContextValue,
} from "@/features/map/flowParticleRegistryContext";

type FlowParticleRegistryProviderProps = {
  animationEnabled: boolean;
  children: ReactNode;
};

export function FlowParticleRegistryProvider({
  animationEnabled,
  children,
}: FlowParticleRegistryProviderProps) {
  const registryRef = useRef<FlowParticleRegistry>(createFlowParticleRegistry());

  const value = useMemo(
    (): FlowParticleRegistryContextValue => ({
      register: (id, entry) => registryRef.current.register(id, entry),
      unregister: (id) => registryRef.current.unregister(id),
    }),
    [],
  );

  useEffect(() => {
    const registry = registryRef.current;
    return () => registry.clear();
  }, []);

  useEffect(() => {
    if (!animationEnabled) return;

    let frameId = 0;
    const startTime = performance.now();

    function tick(now: number) {
      runFlowParticleFrame(registryRef.current, now, startTime);
      frameId = requestAnimationFrame(tick);
    }

    frameId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frameId);
  }, [animationEnabled]);

  return (
    <FlowParticleRegistryContext.Provider value={value}>
      {children}
    </FlowParticleRegistryContext.Provider>
  );
}
