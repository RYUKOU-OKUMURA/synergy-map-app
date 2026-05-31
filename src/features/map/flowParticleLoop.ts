import {
  fadeParticleOpacity,
  FLOW_SELECTED_OPACITY_BOOST,
  FLOW_SELECTED_PARTICLE_SCALE,
  type FlowAnimationParams,
} from "@/features/map/flowAnimationConfig";

export type FlowParticleEntry = {
  path: SVGPathElement;
  circles: SVGCircleElement[];
  animation: FlowAnimationParams;
  getSelected: () => boolean;
};

export type FlowParticleRegistry = {
  register: (id: string, entry: FlowParticleEntry) => void;
  unregister: (id: string) => void;
  clear: () => void;
  entries: Map<string, FlowParticleEntry>;
};

export function createFlowParticleRegistry(): FlowParticleRegistry {
  const entries = new Map<string, FlowParticleEntry>();

  return {
    entries,
    register(id, entry) {
      entries.set(id, entry);
    },
    unregister(id) {
      entries.delete(id);
    },
    clear() {
      entries.clear();
    },
  };
}

export function runFlowParticleFrame(
  registry: FlowParticleRegistry,
  now: number,
  startTime: number,
) {
  for (const entry of registry.entries.values()) {
    const { path, circles, animation, getSelected } = entry;
    const { particleCount, durationMs, staggerMs, fadeEnds, particleRadius } =
      animation;

    const length = path.getTotalLength();
    if (length <= 0) continue;

    const selected = getSelected();
    const radius = particleRadius * (selected ? FLOW_SELECTED_PARTICLE_SCALE : 1);

    for (let index = 0; index < particleCount; index += 1) {
      const circle = circles[index];
      if (!circle) continue;

      const progress =
        ((now - startTime + index * staggerMs) % durationMs) / durationMs;
      const point = path.getPointAtLength(progress * length);
      const baseOpacity = fadeEnds ? fadeParticleOpacity(progress) : 1;
      const opacity = Math.min(
        1,
        baseOpacity * (selected ? FLOW_SELECTED_OPACITY_BOOST : 1),
      );
      circle.setAttribute("cx", String(point.x));
      circle.setAttribute("cy", String(point.y));
      circle.setAttribute("r", String(radius));
      circle.setAttribute("opacity", String(opacity));
    }
  }
}
